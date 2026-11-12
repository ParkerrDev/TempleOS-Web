import assert from "node:assert/strict";
import {compileHemu} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";

// TempleOS maps the low 4GB uncached at dev.uncached_alias (0x100000000 in the
// stock machines) and draws the VGA planes through it, so every frame's pixel
// stores land past RAM at alias+0xA0000. Only the LAPIC and HPET pages are
// devices. A pixel at page offset 0x300 once sent an IPI whose vector was the
// pixel data; an exception vector crashed an AP and left the BSP in
// single-user mode, so a game froze while the window manager kept drawing.
const size=65536,c=compileHemu({exports:["InitMem","AliasAddr","AliasCores"],extraSource:`
U64 AliasAddr(I64 n)
{
  switch (n) {
    case 0:return g_icr_high;case 1:return g_ipi_pending;case 2:return &hpet_ctr;
  }
  return 0;
}
U0 AliasCores(I64 n)
{
  g_ncore=n;
  MemSet(g_ipi_pending,0,sizeof(g_ipi_pending));
  MemSet(g_icr_high,0,sizeof(g_icr_high));
}`}),host=createHemuHost(),{instance}=await WebAssembly.instantiate(c.bytes,{env:host.env});
assert.deepEqual(c.warnings,[]);
host.attach(instance);
const ex=instance.exports;
ex.__rt_init();ex.InitMem(BigInt(size));
const view=()=>new DataView(ex.memory.buffer),
  [icr,ipi,hpet]=[0,1,2].map(n=>Number(ex.AliasAddr(BigInt(n)))),
  Get=p=>view().getBigUint64(p,true),Put=(p,v)=>view().setBigUint64(p,BigInt.asUintN(64,v),true),
  Pending=()=>[0,1,2,3].map(i=>Get(ipi+i*8));
let checks=0;
for (const alias of [0n,0x100000000n,0x10000000000n]) {
  ex.AliasCores(4n);
  for (const pixel of [0xFFFFFFFFn,0x03000000n,0x01000005n]) {
    ex.WrMem(alias+0xA0310n,4n,pixel);ex.WrMem(alias+0xA0300n,4n,pixel);
    ex.WrMem(alias+0xA0300n,8n,0x03000000FFFFFFFFn);
  }
  assert.equal(Get(icr),0n,"VGA stores do not latch an IPI destination");
  assert.deepEqual(Pending(),[0n,0n,0n,0n],"VGA stores send no IPI");
  assert.equal(ex.RdMem(alias+0xA0030n,4n),0n,"the VGA window has no LAPIC version register");
  ex.WrMem(alias+0xFEE00310n,4n,1n<<24n);ex.WrMem(alias+0xFEE00300n,4n,0x45n);
  assert.equal(Get(icr),1n<<24n);
  assert.deepEqual(Pending(),[0n,0x145n,0n,0n],"the LAPIC ICR still sends a fixed IPI");
  assert.equal(ex.RdMem(alias+0xFEE00030n,4n),0x50014n);
  assert.equal(ex.RdMem(alias+0xFEE00020n,4n),0n,"core 0's LAPIC ID");
  Put(hpet,0x123456789ABn);
  assert.equal(ex.RdMem(alias+0xFED000F0n,8n),0x123456789ABn);
  assert.equal(ex.RdMem(alias+0xFED000F4n,4n),0x123n);
  assert.equal(ex.RdMem(alias+0xA00F0n,8n),0n,"the VGA window has no HPET counter");
  checks++;
}
console.log(`${checks} device windows: VGA stores through the uncached alias send no IPI; `+
  "the LAPIC ICR, LAPIC version and HPET counter still decode on their own pages.");
