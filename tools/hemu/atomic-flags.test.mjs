import assert from "node:assert/strict";
import {OpcodeOracle} from "./OpcodeOracle.mjs";
import {compileHemu} from "../../engine/compile.js";
import * as jit from "../../engine/jit.js";
import {createHemuHost} from "../../engine/host.js";
const cases=OpcodeOracle("atomic");
const compiled=compileHemu({exports:["InitMem","AtomBegin","AtomProbe","AtomCores"],extraSource:`
U0 AtomCores(I64 n) {g_ncore=n;}
U0 AtomBegin(U64 value,U64 arg,U64 acc,U64 flags,U64 addr=0x3000)
{
  rip=4096;halted=0;g_badop=0;
  WrMem(0x3000,8,value);
  reg[0]=acc;reg[2]=arg;reg[3]=addr;rfl=flags;
}
U64 AtomProbe(I64 n)
{
  switch (n) {
    case 0:return RdMem(0x3000,8);
    case 1:return reg[2];case 2:return reg[0];case 3:return rfl;
    case 4:return halted;case 5:return g_badop;
    case 6:return &reg[0];case 7:return &rfl;case 8:return &rip;
  }
  return 0;
}`});
assert.deepEqual(compiled.warnings,[]);
const host=createHemuHost(),{instance}=await WebAssembly.instantiate(compiled.bytes,{env:host.env}),ex=instance.exports;
host.attach(instance);ex.__rt_init();ex.InitMem(65536n);
const base=Number(ex.RamBase()),mem=new Uint8Array(ex.memory.buffer),Probe=n=>BigInt.asUintN(64,ex.AtomProbe(BigInt(n)));
jit.jitState(Probe(6),Probe(7),Probe(8),base,ex.memory,ex.RdMem,ex.WrMem);
let checks=0,compiledCount=0,unaligned=0;
for(const row of cases) {
  const [size,op,...words]=row.split(" "),s=Number(size),o=Number(op),
    [value,arg,acc,flags,...expected]=words.map(w=>BigInt("0x"+w)),prefix=s===2?[0x66]:s===8?[0x48]:[],
    body=o<7?[o*8+(s===1?0:1),0x13]:
      o<=10?[o<=8?(s===1?0xFE:0xFF):(s===1?0xF6:0xF7),0x03+(o-7)*8]:
      o===11?[s===1?0x86:0x87,0x13]:[0x0F,(o===12?0xC0:0xB0)+(s===1?0:1),0x13],
    variants=[{locked:true},{locked:false},{locked:false,jit:true}];
  if(o<7 && (s<8 || BigInt.asIntN(32,arg)===BigInt.asIntN(64,arg))) {
    const length=s===1?1:s===2?2:4,imm=Array.from({length},(_,i)=>Number(arg>>BigInt(i*8)&255n)),
      code=[s===1?0x80:0x81,0x03+o*8,...imm];
    variants.push({locked:true,code},{locked:false,code},{locked:false,code,jit:true});
  }
  if(s===2 || s===4)for(const offset of s===2?[1,3,5]:[1,2,3])variants.push({locked:true,offset});
  for(const variant of variants) {
    const {locked}=variant;
    const addr=0x3000+(variant.offset||0);
    mem.fill(0xA5,base+0x2FF8,base+0x3020);
    ex.AtomBegin(value,arg,acc,flags,BigInt(addr));
    new DataView(ex.memory.buffer).setBigUint64(base+addr,value,true);
    const before=mem.slice(base+0x2FF8,base+0x3020);
    mem.set([...(locked?[0xF0]:[]),...prefix,...(variant.code||body),0xF4],base+4096);
    if(variant.jit) {
      jit.jitReset();
      if(jit.jitCompile(4096)){assert.equal(jit.jitRun(4096),1);compiledCount++;}
      else ex.Step();
    } else ex.Step();
    assert.equal(Probe(4),0n,row+" unexpectedly faulted");
    for(let n=0;n<4;n++) {
      //AF is architecturally undefined for OR/AND/XOR. Other flags are defined.
      const mask=n===3?([1,4,6].includes(o)?0xEC5n:0xED5n):0xFFFFFFFFFFFFFFFFn;
      assert.equal((n===0?BigInt.asUintN(64,ex.RdMem(BigInt(addr),8n)):Probe(n))&mask,expected[n]&mask,`${locked?"LOCK ":""}${row}, result ${n}`);
    }
    if(variant.offset) {
      for(let i=0;i<before.length;i++)if(i+0x2FF8<addr || i+0x2FF8>=addr+s)
        assert.equal(mem[base+0x2FF8+i],before[i],"unaligned RMW preserves adjacent bytes");
      unaligned++;
    }
    checks++;
  }
}
assert.ok(compiledCount>5000,"arithmetic/unary instructions must use the JIT");
console.log(`${checks} memory RMW comparisons match x86-64 hardware (${compiledCount} compiled, ${unaligned} contained unaligned), including immediate operands, all defined flags and register writeback.`);

const bad=[
  [0xF0,0x48,0x01,0xD0], //ADD register destination.
  [0xF0,0x48,0x03,0x13], //ADD register from memory.
  [0xF0,0x48,0x39,0x13], //CMP.
  [0xF0,0x48,0x83,0x3B,1],
  [0xF0,0x90],[0xF0,0x48,0x89,0x13],
  [0xF0,0x48,0xF7,0x03,1,0,0,0], //TEST.
  [0xF0,0x48,0xF7,0x23], //MUL.
  [0xF0,0x48,0xFF,0x13], //CALL.
  [0xF0,0x48,0x0F,0xA3,0x13], //BT.
  [0xF0,0x48,0x0F,0xBA,0x23,1],
  [0xF0,0x48,0x0F,0xB1,0xD0],
  [0xF0,0x48,0x0F,0xC1,0xD0],
  [0xF0,0x48,0x87,0xD0]
];
for(const code of bad) {
  ex.AtomBegin(0x1234n,0x5678n,0x9ABCn,0xAD7n,0x3000n);
  mem.set(code,base+4096);ex.Step();
  assert.equal(Probe(4),2n,code.toString());
  assert.deepEqual([0,1,2,3].map(Probe),[0x1234n,0x5678n,0x9ABCn,0xAD7n]);
}
ex.AtomCores(4n);
for(const addr of [0x3001n,65532n,0xFED00000n]) {
  ex.AtomBegin(0x1234n,0x5678n,0x9ABCn,0xAD7n,addr);
  mem.set([0xF0,0x48,0x01,0x13],base+4096);ex.Step();
  assert.equal(Probe(4),2n,"unsupported atomic address "+addr);
  assert.deepEqual([0,1,2,3].map(Probe),[0x1234n,0x5678n,0x9ABCn,0xAD7n]);
}
ex.AtomCores(1n);
ex.AtomBegin(10n,20n,0n,0n,0x10000003000n);
mem.set([0xF0,0x48,0x01,0x13],base+4096);ex.Step();
assert.equal(Probe(4),0n);assert.equal(Probe(0),30n,"RAM alias shares atomic storage");
console.log("Invalid LOCK forms and unsupported SMP/MMIO atomic addresses retain a fault without writes; the TempleOS RAM alias remains atomic.");

for(const initial of [0n,1n,0xAD7n])for(const [op,expected]of [[0xF8,initial&~1n],[0xF9,initial|1n],[0xF5,initial^1n]]) {
  ex.AtomBegin(10n,20n,30n,initial,0x3000n);
  mem.set([op],base+4096);ex.Step();
  assert.equal(Probe(4),0n);assert.equal(Probe(3),expected);
  assert.deepEqual([0,1,2].map(Probe),[10n,20n,30n]);
}
