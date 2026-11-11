import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {compileHemu} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";
import * as jit from "../../engine/jit.js";

const extra=`
U0 CompareBegin(I64 op,I64 sub,I64 slot,I64 top,U64 arg1,U64 arg2,U64 cw,U64 flags)
{
  fsp=top;FStset(0,arg1(F64));FStset(slot,arg2(F64));
  x87_sw=0x4700;x87_cw=cw;rfl=flags;rip=4096;halted=0;
  mem[4096]=op;mem[4097]=0xC0+sub*8+slot;mem[4098]=0xF4;
}
U64 CompareState(I64 n)
{
  switch (n) {
    case 0:return mem;case 1:return &reg[0];case 2:return &rfl;
    case 3:return &rip;case 4:return &fpr[0];case 5:return &fsp;
    case 6:return &x87_sw;case 7:return &x87_cw;
    case 8:return rfl;case 9:return fsp;case 10:return x87_sw;
  }
  return 0;
}`;
const c=compileHemu({exports:["InitMem","CompareBegin","CompareState"],extraSource:extra});
assert.deepEqual(c.warnings,[]);
const host=createHemuHost(),{instance}=await WebAssembly.instantiate(c.bytes,{env:host.env}),ex=instance.exports;
host.attach(instance);ex.__rt_init();ex.InitMem(8192n);
const Get=i=>ex.CompareState(BigInt(i));
jit.jitState(Get(1),Get(2),Get(3),Get(0),ex.memory,ex.RdMem,ex.WrMem);
jit.jitX87(Get(4),Get(5),Get(6));jit.jitSeg(0,0,0,Get(7));
let cases=0,compiled=0,fallbacks=0,architectureRows=0,hardwareDifferences=0;
for(const row of readFileSync(new URL("./fpu-compare-oracle.txt",import.meta.url),"utf8").trim().split("\n").filter(row=>!row.startsWith("#"))) {
  const [a,b,kind,cw,seed,flags,invalid,pop]=row.split(" "),mode=Number(kind),
    left=BigInt("0x"+a),right=BigInt("0x"+b),before=BigInt("0x"+seed),
    hardware=BigInt("0x"+flags),unmasked=Boolean(BigInt("0x"+invalid)&0x80n),
    expected=(unmasked?before&0x45n:hardware)|0x202n;
  //Intel SDM preserves ZF/PF/CF on unmasked invalid. The recorded Intel CPU
  //and QEMU TCG set unordered instead; keep their evidence unchanged.
  if(unmasked)architectureRows++;
  if((expected&0x8D5n)!==hardware)hardwareDifferences++;
  for(const top of [0,3,7])for(const slot of [1,3])for(const useJit of [false,true]) {
    ex.CompareBegin(mode<2?0xDBn:0xDFn,mode%2?5n:6n,BigInt(slot),BigInt(top),left,right,BigInt("0x"+cw),BigInt("0x"+seed));
    if(useJit) {
      jit.jitReset();assert.equal(jit.jitCompile(4096),1);
      if(jit.jitRun(4096))compiled++;
      else {fallbacks++;ex.Step();}
    } else ex.Step();
    const label=`${useJit?"JIT":"interpreter"} ${row} TOP${top} ST${slot}`;
    assert.equal(Get(8),expected,label+" EFLAGS");
    assert.equal(Get(9),BigInt((top+Number(pop))&7),label+" top");
    assert.equal(Get(10),BigInt("0x"+invalid)|0x4500n,label+" x87 status: preserve C0/C2/C3 and clear C1");
    cases++;
  }
}
assert.ok(compiled>0);
assert.equal(architectureRows,52);
assert.equal(hardwareDifferences,26);
for(const engine of ["kvm","tcg"]) {
  const data=JSON.parse(readFileSync(new URL(`./fpu-flags-${engine}.json`,import.meta.url))),
    rows=data.results[0].out.trim().split("\n");
  assert.equal(data.probeHash,createHash("sha256").update(readFileSync(new URL("./FpuFlags.HC",import.meta.url))).digest("hex"));
  assert.equal(data.results[0].except,"");assert.equal(rows.length,16);
  for(const row of rows) {
    const [,op,cw,seed,flags,status,top]=row.split(" ");
    assert.equal(flags,"45",`${engine}: ${row}`);
    assert.equal(status,Number(op)%2?"0":cw==="37E"?"8081":"1");
    assert.equal(Number(top),Number(op)<2||op==="2"&&cw==="37E"&&engine==="kvm"?6:7);
  }
}
console.log(`${cases} x87 compare checks (${compiled} compiled, ${fallbacks} NaN fallbacks): opcode order, integer flags, invalid status and pops. ${architectureRows} unmasked-invalid fixture rows use Intel SDM semantics; ${hardwareDifferences} recorded Intel flag results differ. KVM/TCG evidence retained.`);
