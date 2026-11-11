import assert from "node:assert/strict";
import {compileHemu} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";
import * as jit from "../../engine/jit.js";

const c=compileHemu({exports:["InitMem","LoopAddr"],extraSource:`
U64 LoopAddr(I64 n)
{
  switch (n) {
    case 0:return mem;case 1:return &reg[0];case 2:return &rfl;
    case 3:return &rip;case 4:return &halted;
  }
  return 0;
}`});
assert.deepEqual(c.warnings,[]);
const host=createHemuHost(),{instance}=await WebAssembly.instantiate(c.bytes,{env:host.env}),ex=instance.exports;
host.attach(instance);ex.__rt_init();ex.InitMem(8192n);
const a=Array.from({length:5},(_,n)=>Number(ex.LoopAddr(BigInt(n)))),
      u8=new Uint8Array(ex.memory.buffer),dv=new DataView(u8.buffer),
      put=(at,n)=>dv.setBigUint64(at,BigInt.asUintN(64,BigInt(n)),true);
jit.jitState(a[1],a[2],a[3],a[0],ex.memory,ex.RdMem,ex.WrMem);
jit.jitX87(0,0,0);jit.jitSeg(0,0,0,0,0,0);
const start=4096,data=6144;
function Loop(body,{wide=false,cc=0xD,head=[0x48,0x39,0xD1]}={})
{
  const code=[...head,...(wide?[0x0F,0x80+cc,0,0,0,0]:[0x70+cc,0]),...body];
  const jump=code.length,back=-(jump+(wide?5:2));
  code.push(...(wide?[0xE9,...Bytes32(back)]:[0xEB,back&255]));
  const displacement=code.length-head.length-(wide?6:2);
  code.splice(head.length+(wide?2:1),wide?4:1,...(wide?Bytes32(displacement):[displacement]));
  return code;
}
function Bytes32(n){return [n&255,n>>>8&255,n>>>16&255,n>>>24&255];}
function Start(code,limit=0,regs={})
{
  u8.fill(0,a[0]+start,a[0]+8192);u8.set([...code,0xF4],a[0]+start);
  for(let i=0;i<16;i++)put(a[1]+i*8,0xFEDCBA9876543200n+BigInt(i));
  put(a[1]+8,0);put(a[1]+16,limit);put(a[1]+24,data);
  for(const [reg,value]of Object.entries(regs))put(a[1]+Number(reg)*8,value);
  put(a[2],0xAD7);put(a[3],start);put(a[4],0);
}
function State(){return {regs:u8.slice(a[1],a[1]+128),flags:dv.getBigUint64(a[2],true),
  rip:dv.getBigUint64(a[3],true),halt:dv.getBigUint64(a[4],true),ram:u8.slice(a[0]+start,a[0]+8192)};}
let count=0;
function Compare(code,limit,bodyCount,{regs={},expected,compiled=bodyCount+3}={})
{
  Start(code,limit,regs);jit.jitReset();
  assert.equal(jit.jitCompile(start),compiled,"compiled instruction count");
  const ran=jit.jitRun(start),got=State();
  const want=expected??(limit<1024?Math.max(0,limit)*(bodyCount+3)+2:1024*(bodyCount+3));
  assert.equal(ran,want,"executed instruction count");
  Start(code,limit,regs);for(let i=0;i<ran;i++)ex.Step();
  assert.deepEqual(got,State(),"loop exit state at "+ran+" instructions");count++;
}
const body=[0x48,0xFF,0xC0,0x48,0x83,0xC1,1]; // inc rax; add rcx,1
for(const wide of [false,true])for(const limit of [-3,0,1,2,17,1023,1024,1025,2000])
  Compare(Loop(body,{wide}),limit,2);
// Preserve all widths, memory side effects, and dirty registers across the
// header's exit, including registers first written later in the loop body.
for(const limit of [0,1,31,1025]) {
  Compare(Loop([0xC6,0x03,0xAA,0x66,0xFF,0xC0,0x48,0xFF,0xC1]),limit,3);
  Compare(Loop([0x48,0x01,0x03,0x48,0x83,0xC1,1]),limit,2);
}
// The loop writes a new immediate into its header. The next iteration must
// invalidate the old trace with the completed body and RIP visible to Step.
const self=Loop([0xC6,0x03,3,0x48,0xFF,0xC0,0x48,0xFF,0xC1],{head:[0x48,0x83,0xF9,7]});
Compare(self,7,3,{regs:{3:start+3},expected:6});
assert.equal(jit.jitInspect(start).cached,false,"self-modification invalidates trace");
// An external rewrite before entry must leave the entire CPU untouched.
Start(Loop(body),20);jit.jitReset();jit.jitCompile(start);
u8[a[0]+start+6]^=1;const before=State();
assert.equal(jit.jitRun(start),0);assert.deepEqual(State(),before);count++;
// Unsupported bodies keep the original compare/branch basic block. They must
// never hide a divide fault or a floating-point stack/IRQ transition in a loop.
for(const unsafe of [[0x48,0xF7,0xF3],[0xD9,0xE8],[0xFB],[0xF0,0x48,0xFF,0x03]])
  Compare(Loop([...unsafe,...body]),1,0,{expected:2,compiled:2});
console.log(`${count} top-tested loop checks: exits, counts, iteration limit, memory, code rewriting, and fallback.`);
