import assert from "node:assert/strict";
import {compileHemu} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";
import * as jit from "../../engine/jit.js";

const compiled=compileHemu({exports:["InitMem","MemoryAddr"],extraSource:`
U64 MemoryAddr(I64 n)
{
  switch (n) {
    case 0:return mem;case 1:return reg;case 2:return &rfl;
    case 3:return &rip;case 4:return g_icr_high;case 5:return &msr_fsbase;
  }
  return 0;
}`}),host=createHemuHost(),{instance}=await WebAssembly.instantiate(compiled.bytes,{env:host.env});
assert.deepEqual(compiled.warnings,[]);
host.attach(instance);const ex=instance.exports;ex.__rt_init();ex.InitMem(8192n);
const addr=Array.from({length:6},(_,i)=>Number(ex.MemoryAddr(BigInt(i)))),
  bytes=new Uint8Array(ex.memory.buffer),view=new DataView(bytes.buffer),start=4096,data=6144,
  put=(p,n)=>view.setBigUint64(p,BigInt.asUintN(64,BigInt(n)),true),
  get=p=>view.getBigUint64(p,true),word=n=>{
    const b=new Uint8Array(4);new DataView(b.buffer).setInt32(0,Number(n),true);return [...b];
  };
let reads=[],writes=[];
jit.jitState(addr[1],addr[2],addr[3],addr[0],ex.memory,
  (a,s)=>{reads.push([a,s]);return ex.RdMem(a,s);},
  (a,s,v)=>{writes.push([a,s,v]);ex.WrMem(a,s,v);});
jit.jitX87(0,0,0);jit.jitSeg(addr[5],0,0,0,0,0);
function Reset(code,base,baseReg,segment=0n) {
  bytes.fill(0,addr[0]+start,addr[0]+8192);bytes.set([...code,0xF4],addr[0]+start);
  for(let i=0;i<16;i++)put(addr[1]+i*8,0x1234567800000000n+BigInt(i));
  put(addr[1],0xFEDCBA9876543210n);put(addr[1]+baseReg*8,base);
  put(addr[2],0xAD7);put(addr[3],start);put(addr[4],0);put(addr[5],segment);
  put(addr[0]+data,0xFEDCBA9876543210n);reads=[];writes=[];
}
function State() {
  return {regs:bytes.slice(addr[1],addr[1]+128),flags:get(addr[2]),rip:get(addr[3]),
    icr:get(addr[4]),ram:bytes.slice(addr[0]+data-16,addr[0]+data+32)};
}
let count=0;
function Compare(code,base,baseReg,{segment=0n,read,write,rax,icr}={}) {
  Reset(code,base,baseReg,segment);ex.Step();const expected=State();
  if(rax!==undefined)assert.equal(get(addr[1]),rax);
  if(icr!==undefined)assert.equal(get(addr[4]),icr);
  Reset(code,base,baseReg,segment);jit.jitReset();
  assert.equal(jit.jitCompile(start),1,"compile memory operand "+code);
  assert.equal(jit.jitRun(start),1);
  assert.deepEqual(State(),expected,"RSP/RBP/RIP routing "+code+" base "+base);
  if(read!==undefined)assert.equal(reads.length,read,"device/alias reads occur exactly once");
  if(write!==undefined)assert.equal(writes.length,write,"device/alias writes occur exactly once");
  count++;
}
const operations=[
  [[],[0x8A],0],[[0x66],[0x8B],0],[[],[0x8B],0],[[0x48],[0x8B],0],
  [[],[0x88],0],[[0x66],[0x89],0],[[],[0x89],0],[[0x48],[0x89],0],
  [[0x48],[0x0F,0xB6],0],[[0x48],[0x0F,0xB7],0],
  [[0x48],[0x0F,0xBE],0],[[0x48],[0x0F,0xBF],0],[[0x48],[0x63],0],
  [[0x48],[0x03],0],[[0x48],[0x01],0],[[0x48],[0x83],4,[7]],
  [[0x48],[0x0F,0x44],0],[[],[0x0F,0x94],0]
];
for(const baseReg of [4,5])for(const displacement of [0,7,-11])
  for(const target of [BigInt(data),0x10000001800n,0xFEE00030n,0x100FEE00310n,-0x1FFFFD0n])
    for(const [prefix,op,reg,imm=[]] of operations) {
      const operand=baseReg===4?[0x44|reg<<3,0x24,displacement&255]:[0x45|reg<<3,displacement&255];
      Compare([...prefix,...op,...operand,...imm],target-BigInt(displacement),baseReg);
    }
// RIP-relative displacements may name a device or wrap below zero, despite
// the instruction itself being ordinary guest RAM.
for(const target of [BigInt(data),0x18000030n,0x18000310n,-0x1FFFFD0n])
  for(const [prefix,op,reg,imm=[]] of operations) {
    const length=prefix.length+op.length+1+4+imm.length;
    Compare([...prefix,...op,0x05|reg<<3,...word(target-BigInt(start+length)),...imm],0,3);
  }
for(const baseReg of [4,5]) {
  const operand=baseReg===4?[0x04,0x24]:[0x45,0];
  Compare([0x48,0x8B,...operand],0xFEE00030n,baseReg,{read:1,write:0,rax:0x50014n});
  Compare([0x48,0x89,...operand],0xFEE00310n,baseReg,{read:0,write:1,icr:0xFEDCBA9876543210n});
  Compare([0x64,0x48,0x8B,...operand],0x30n,baseReg,{segment:0xFEE00000n,read:1,write:0,rax:0x50014n});
}
console.log(`${count} JIT memory operands match Step: RSP/RBP/RIP, RAM/aliases/MMIO, displacement wrap, flags, neighboring bytes and single device side effects.`);
