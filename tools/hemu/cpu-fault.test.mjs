import assert from "node:assert/strict";
import {compileHemu} from "../../engine/compile.js";
import {createHemuHost,CpuFaultText} from "../../engine/host.js";
const c=compileHemu({exports:["InitMem","RunCore","FaultBegin","FaultState"],extraSource:`
U0 FaultBegin(I64 reason)
{
  halted=reason;icount=0;rip=4096;rfl=0;mem[4096]=0xD9;mem[4097]=0xD1;
}
U64 FaultState(I64 n)
{
  if (n) return icount;
  return rip;
}`});
assert.deepEqual(c.warnings,[]);
const host=createHemuHost({onText:()=>{}}),{instance}=await WebAssembly.instantiate(c.bytes,{env:host.env}),ex=instance.exports;
host.attach(instance);ex.__rt_init();ex.InitMem(8192n);
for(const initial of [0n,2n,3n]) {
  ex.FaultBegin(initial);
  const code=initial||2n;
  assert.equal(ex.RunCore(100n),-code);
  const pc=ex.FaultState(0n),count=ex.FaultState(1n);
  assert.equal(ex.CpuFault(0n),code);assert.equal(ex.CpuFault(1n),pc);
  for(let i=0;i<3;i++) {
    assert.equal(ex.RunCore(100n),-code,"a fault must never be silently cleared");
    assert.equal(ex.FaultState(0n),pc);assert.equal(ex.FaultState(1n),count);
  }
  assert.match(CpuFaultText(ex),/CPU 0 stopped.*Restore a working snapshot or restart TempleOS/);
}
ex.FaultBegin(1n);assert.equal(ex.RunCore(100n),0n);
assert.equal(CpuFaultText(ex),"","ordinary HLT is not a fault");
assert.equal(CpuFaultText({GuestInfo:n=>n===7n?0n:4096n}),"","old engines retain no-fault compatibility");
assert.match(CpuFaultText({GuestInfo:n=>n===7n?2n:4096n}),/CPU 0 stopped.*0x1000/);
console.log("CPU faults remain stopped across repeated AP budgets; HLT and older embedded-engine reporting remain supported.");
