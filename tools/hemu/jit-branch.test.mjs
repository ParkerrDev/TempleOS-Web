import assert from "node:assert/strict";
import {compileHemu} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";
import * as jit from "../../engine/jit.js";

const c=compileHemu({exports:["InitMem","BranchAddr"],extraSource:`
U64 BranchAddr(I64 n)
{
  switch (n) {
    case 0:return mem;case 1:return reg;case 2:return &rfl;
    case 3:return &rip;case 4:return fpr;case 5:return &fsp;
    case 6:return &x87_sw;case 7:return &x87_cw;
    case 8:return &halted;case 9:return g_jit_rip;case 10:return g_jit_n;
  }
  return 0;
}`});
assert.deepEqual(c.warnings,[]);
const host=createHemuHost(),{instance}=await WebAssembly.instantiate(c.bytes,{env:host.env}),ex=instance.exports;
host.attach(instance);ex.__rt_init();ex.InitMem(16384n);
const a=Array.from({length:11},(_,n)=>Number(ex.BranchAddr(BigInt(n)))),
  bytes=new Uint8Array(ex.memory.buffer),view=new DataView(bytes.buffer),start=4096,data=8192,
  Put=(at,n)=>view.setBigUint64(at,BigInt.asUintN(64,BigInt(n)),true),
  Get=at=>view.getBigUint64(at,true);
jit.jitState(a[1],a[2],a[3],a[0],ex.memory,ex.RdMem,ex.WrMem);
jit.jitX87(a[4],a[5],a[6]);jit.jitSeg(0,0,0,a[7],0,0);
function Start(code,{left=0,right=0,top=0,cw=0x37F,reg={}}={}) {
  bytes.fill(0,a[0]+start,a[0]+16384);bytes.set([...code,0xF4],a[0]+start);
  for(let i=0;i<16;i++)Put(a[1]+i*8,0xFEDCBA9876543200n+BigInt(i));
  Put(a[1],left);Put(a[1]+8,right);Put(a[1]+16,7);Put(a[1]+24,data);Put(a[1]+32,16000);
  for(const [index,value]of Object.entries(reg))Put(a[1]+Number(index)*8,value);
  Put(a[2],0xAD7);Put(a[3],start);Put(a[5],top);Put(a[6],0);Put(a[7],cw);Put(a[8],0);
  for(let i=0;i<8;i++)view.setFloat64(a[4]+i*8,i+0.25,true);
}
function State() {
  return {regs:bytes.slice(a[1],a[1]+128),flags:Get(a[2]),rip:Get(a[3]),
    top:Get(a[5]),sw:Get(a[6]),cw:Get(a[7]),halted:Get(a[8]),
    fpr:bytes.slice(a[4],a[4]+64),ram:bytes.slice(a[0]+start,a[0]+16384)};
}
let cases=0;
function Compare(code,options={},run=()=>jit.jitRun(start)) {
  Start(code,options);jit.jitReset();const compiled=jit.jitCompile(start);
  assert.ok(compiled,"compiled prefix exists");
  const ran=run(compiled),got=State();
  assert.ok(ran>=0&&ran<=compiled,"branch returns its executed prefix count");
  Start(code,options);for(let i=0;i<ran;i++)ex.Step();
  assert.deepEqual(got,State(),`branch prefix ${Buffer.from(code).toString("hex")} after ${ran} instructions`);
  cases++;return ran;
}
const suffix=[0x48,0x83,0xC2,3,0x48,0x89,0x13,0x48,0x83,0xC1,1];
for(const size of [1,2,4,8])for(const wide of [false,true])for(let cc=0;cc<16;cc++)
  for(const [left,right]of [[0,0],[0,1],[1,0],[-1,0],[0,-1],
    ["0x7FFFFFFFFFFFFFFF","0x8000000000000000"],["0x8000000000000000",1]])
    for(const op of [0x38,0x28,0x00,0x30]) {
      const prefix=size===2?[0x66]:size===8?[0x48]:[],
        alu=[...prefix,op+(size!==1?1:0),0xC8],
        jump=wide?[0x0F,0x80+cc,suffix.length,0,0,0]:[0x70+cc,suffix.length];
      Compare([...alu,...jump,...suffix],{left,right});
    }
// Partial flags, wrapped x87 stack values, multiple boundaries, and a later
// full flag writer must preserve each taken branch's own prefix state.
for(let top=0;top<8;top++)for(const left of [-1,0,1])for(const right of [-1,0,1]) {
  Compare([0xD9,0xE8,0x48,0xFF,0xC0,0x74,6,0xD9,0xE0,0x48,0x31,0xC9,0x90,
    0x48,0x39,0xC8,0x7C,4,0xDD,0x1B,0xD9,0xE8],{top,left,right});
  Compare([0xD9,0xE8,0x48,0x39,0xC8,0x74,7,0x48,0xFF,0xC2,0xDF,0x3B,0xD9,0xE8],
    {top,left,right,cw:0x35E});
}
// A store before a branch rewrites a later segment. Its original bytes must
// never execute, including when the altered instruction is two guards ahead.
for(const offset of [10,17]) {
  const code=[0xC6,0x03,0x90,0x48,0x39,0xC8,0x74,12,
    0x48,0xFF,0xC2,0x48,0x39,0xC8,0x74,4,0x48,0xFF,0xC2,0x90];
  const ran=Compare(code,{left:1,right:0,reg:{3:start+offset}});
  assert.equal(ran,offset===10?3:6,"self-modification stops at the next affected segment");
  assert.equal(jit.jitInspect(start).cached,false,"trace invalidated after modified segment");
}
const branch=[0x48,0x39,0xC8,0x74,suffix.length,...suffix];
for(const chain of [false,true]) {
  if(chain)jit.jitChain(a[9],a[10]);
  for(const budget of [0,1,2,3,4,5,6,10])for(const left of [0,1])
    Compare(branch,{left},compiled=>{
      const slot=(start^(start>>>16))&65535;
      Put(a[9]+slot*8,start);Put(a[10]+slot*8,compiled);
      const ran=jit.jitDispatch(budget);assert.ok(ran<=budget,"branch cannot pass device deadline");return ran;
    });
}
console.log(`${cases} branch-prefix differentials: every condition and width, lazy flags, x87, self-modification and budgets.`);
