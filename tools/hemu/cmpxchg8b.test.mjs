import assert from "node:assert/strict";
import {OpcodeOracle} from "./OpcodeOracle.mjs";
import {compileHemu} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";
const compiled=compileHemu({exports:["InitMem","CmpBegin","CmpProbe"],extraSource:`
U0 CmpBegin(U64 value,U64 ax,U64 dx,U64 bx,U64 cx,U64 flags,U64 addr)
{
  rip=4096;halted=0;g_badop=0;
  reg[0]=ax;reg[2]=dx;reg[3]=bx;reg[1]=cx;reg[7]=addr;rfl=flags;
  WrMem(addr,8,value);
}
U64 CmpProbe(I64 n)
{
  switch (n) {
    case 0:return RdMem(reg[7],8);case 1:return reg[0];case 2:return reg[2];
    case 3:return reg[3];case 4:return reg[1];case 5:return rfl;case 6:return halted;
  }
  return 0;
}`});
assert.deepEqual(compiled.warnings,[]);
const host=createHemuHost(),{instance}=await WebAssembly.instantiate(compiled.bytes,{env:host.env}),ex=instance.exports;
host.attach(instance);ex.__rt_init();ex.InitMem(65536n);
const base=Number(ex.RamBase()),mem=new Uint8Array(ex.memory.buffer),Probe=n=>BigInt.asUintN(64,ex.CmpProbe(BigInt(n)));
let checks=0;
for(const row of OpcodeOracle("cmpxchg8b")) {
  const [lock,...words]=row.split(" "),values=words.map(w=>BigInt("0x"+w)),args=values.slice(0,6),expected=values.slice(6);
  for(const addr of lock==="1"?[0x3000n]:[0x3000n,0x3001n]) {
    ex.CmpBegin(...args,addr);
    mem.set([...(lock==="1"?[0xF0]:[]),0x0F,0xC7,0x0F],base+4096);ex.Step();
    assert.equal(Probe(6),0n,row);
    for(let n=0;n<6;n++) {
      const mask=n===5?0xED5n:0xFFFFFFFFFFFFFFFFn;
      assert.equal(Probe(n)&mask,expected[n]&mask,row+", result "+n);
    }
    checks++;
  }
}
for(const code of [[0x0F,0xC7,0xC8],[0x0F,0xC7,0x17],[0x48,0x0F,0xC7,0x0F]]) {
  ex.CmpBegin(11n,1n,2n,3n,4n,0xAD7n,0x3000n);
  mem.set(code,base+4096);ex.Step();
  assert.equal(Probe(6),2n,code.toString());
  assert.deepEqual([0,1,2,3,4,5].map(Probe),[11n,1n,2n,3n,4n,0xAD7n]);
}
console.log(`${checks} CMPXCHG8B cases match x86-64 memory/register/flag results; reserved, register and unsupported 128-bit forms retain faults.`);
