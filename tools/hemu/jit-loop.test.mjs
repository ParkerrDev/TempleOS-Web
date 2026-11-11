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
    case 5:return g_jit_rip;case 6:return g_jit_n;
  }
  return 0;
}`});
assert.deepEqual(c.warnings,[]);
const host=createHemuHost(),{instance}=await WebAssembly.instantiate(c.bytes,{env:host.env}),ex=instance.exports;
host.attach(instance);ex.__rt_init();ex.InitMem(8192n);
const a=Array.from({length:7},(_,n)=>Number(ex.LoopAddr(BigInt(n)))),
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
function Compare(code,limit,bodyCount,{regs={},expected,compiled=bodyCount+3,auto=false}={})
{
  if(auto) {
    Start(code,limit,regs);expected=0;
    while(dv.getBigUint64(a[3],true)!==BigInt(start+code.length)&&expected<(bodyCount+3)*1024) {
      ex.Step();expected++;
    }
  }
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
for(const size of [1,2,4,8])for(let cc=0;cc<16;cc++)
  for(const [left,right]of [[0,0],[0,1],[1,0],[-1,0],[0,-1],
    ["0x7FFFFFFFFFFFFFFF","0x8000000000000000"],["0x8000000000000000",1]]) {
    const prefix=size===2?[0x66]:size===8?[0x48]:[];
    const head=[...prefix,size===1?0x38:0x39,0xD1];
    Compare(Loop([0x48,0xFF,0xC1],{head,cc}),0,1,{regs:{1:left,2:right},auto:true});
  }
// A body may consume the header's deferred CF before its next full writer.
for(const limit of [0,1,17,1025])
  Compare(Loop([0x48,0xFF,0xC0,0x48,0x11,0xC3,0x48,0xFF,0xC1]),limit,3);
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
for(const chain of [false,true]) {
  if(chain)jit.jitChain(a[5],a[6]);
  for(const code of [Loop(body),[0x48,0xFF,0xC9,0x75,0xFB],
    [0x48,0xFF,0xC0,0x48,0xFF,0xC0,0x48,0xFF,0xC0]])
    for(const budget of [1,2,3,4,5,7,31,1023,1024,2048,5000,12000]) {
      const regs={1:20000};Start(code,40000,regs);jit.jitReset();
      const n=jit.jitCompile(start),slot=(start^(start>>>16))&65535;
      assert.ok(n);put(a[5]+slot*8,start);put(a[6]+slot*8,n);
      const ran=jit.jitDispatch(budget),got=State();
      assert.ok(ran<=budget,`dispatch exceeded device deadline: ${ran}>${budget}, chain=${chain}`);
      assert.ok(ran>=n||budget<n,"a whole compiled iteration runs when it fits");
      Start(code,40000,regs);for(let i=0;i<ran;i++)ex.Step();
      assert.deepEqual(got,State(),"budget-limited exit state");count++;
    }
}
// A bottom-tested branch that becomes false exactly at the 1024-iteration
// cap must exit to its fallthrough, not incorrectly return to its header.
const bottom=[0x48,0xFF,0xC9,0x75,0xFB];
Start(bottom,0,{1:1024});jit.jitReset();assert.equal(jit.jitCompile(start),2);
assert.equal(jit.jitRun(start),2048);const bottomState=State();
Start(bottom,0,{1:1024});for(let i=0;i<2048;i++)ex.Step();
assert.deepEqual(bottomState,State());count++;
const faultLoop=[0x48,0xFF,0xC0,0x48,0xF7,0xF3,0x48,0xFF,0xCB,
  0x48,0xFF,0xC9,0x75,0xF2];
Start(faultLoop,0,{0:17,1:2,2:0,3:1});jit.jitReset();
assert.equal(jit.jitCompile(start),5);
put(a[5]+start*8,start);put(a[6]+start*8,5);
assert.equal(jit.jitDispatch(100),6,"second-iteration DIV fallback counts the preceding full iteration");
const faultState=State();Start(faultLoop,0,{0:17,1:2,2:0,3:1});
for(let i=0;i<6;i++)ex.Step();assert.deepEqual(faultState,State());count++;
for(const left of [1,2]) {
  const changed=[0xC6,0x03,0x90,0x48,0xFF,0xC9,0x75,0xF8];
  Start(changed,0,{1:left,3:start});jit.jitReset();assert.equal(jit.jitCompile(start),3);
  assert.equal(jit.jitRun(start),3);assert.equal(jit.jitInspect(start).cached,false);
  const state=State();Start(changed,0,{1:left,3:start});
  for(let i=0;i<3;i++)ex.Step();assert.deepEqual(state,State());count++;
}
console.log(`${count} loop checks: exact exits, device dispatch budgets, iteration caps, memory, code rewriting, and fallback.`);
