import assert from "node:assert/strict";
import {OpcodeOracle} from "./OpcodeOracle.mjs";
import {compileHemu} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";
import * as jit from "../../engine/jit.js";
const compiled=compileHemu({exports:["InitMem","BitBegin","BitProbe"],extraSource:`
U0 BitBegin(I64 bit,U64 flags)
{
  rip=4096;halted=0;g_badop=0;reg[2]=bit;reg[3]=0x3040;rfl=flags;
}
U64 BitProbe(I64 n)
{
  switch (n) {
    case 0:return rfl;case 1:return halted;
    case 2:return &reg[0];case 3:return &rfl;case 4:return &rip;
  }
  return 0;
}`});
assert.deepEqual(compiled.warnings,[]);
const host=createHemuHost(),{instance}=await WebAssembly.instantiate(compiled.bytes,{env:host.env}),ex=instance.exports;
host.attach(instance);ex.__rt_init();ex.InitMem(65536n);
const base=Number(ex.RamBase()),mem=new Uint8Array(ex.memory.buffer),Probe=n=>ex.BitProbe(BigInt(n));
jit.jitState(Probe(2),Probe(3),Probe(4),base,ex.memory,ex.RdMem,ex.WrMem);
let count=0,compiledCount=0;
for(const row of OpcodeOracle("bit")) {
  const [size,op,mode,bit,seed,flags,hex]=row.split(" "),s=Number(size),o=Number(op),
    prefix=s===2?[0x66]:s===8?[0x48]:[],
    code=[...prefix,0x0F,...(mode==="1"?[0xBA,0x23+o*8,Number(bit)]:[[0xA3,0xAB,0xB3,0xBB][o],0x13])],
    expected=Buffer.from(hex,"hex");
  for(const execution of o?["interpreter","locked","jit"]:["interpreter","jit"]) {
    ex.BitBegin(BigInt(bit),seed==="1"?0xAD7n:0x202n);
    for(let i=0;i<128;i++)mem[base+0x3000+i]=(i*29+Number(seed)*137)&255;
    mem.set([...(execution==="locked"?[0xF0]:[]),...code,0xF4],base+4096);
    if(execution==="jit") {
      jit.jitReset();
      if(jit.jitCompile(4096)){assert.equal(jit.jitRun(4096),1);compiledCount++;}
      else ex.Step();
    } else ex.Step();
    assert.equal(Probe(1),0n,execution+" "+row);
    assert.equal(Probe(0)&0x41n,BigInt("0x"+flags),execution+" flags "+row);
    assert.deepEqual(Buffer.from(mem.subarray(base+0x3000,base+0x3080)),expected,execution+" memory "+row);
    count++;
  }
}
console.log(`${count} bit-string cases match x86-64 hardware (${compiledCount} compiled): signed register offsets, encoded immediate masking, adjacent bytes and defined flags.`);
