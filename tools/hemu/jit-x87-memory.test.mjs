import assert from "node:assert/strict";
import {compileHemu} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";
import * as jit from "../../engine/jit.js";

const size=402653184,start=4096,data=6144,compiled=compileHemu({exports:["InitMem","OperandAddr"],extraSource:`
U64 OperandAddr(I64 n)
{
  switch (n) {
    case 0:return mem;case 1:return reg;case 2:return &rfl;
    case 3:return &rip;case 4:return fpr;case 5:return &fsp;
    case 6:return &x87_sw;case 7:return &x87_cw;
    case 8:return xmm_lo;case 9:return xmm_hi;case 10:return g_icr_high;
  }
  return 0;
}`}),host=createHemuHost(),{instance}=await WebAssembly.instantiate(compiled.bytes,{env:host.env});
assert.deepEqual(compiled.warnings,[]);
host.attach(instance);const ex=instance.exports;ex.__rt_init();ex.InitMem(BigInt(size));
const a=Array.from({length:11},(_,i)=>Number(ex.OperandAddr(BigInt(i)))),
  bytes=new Uint8Array(ex.memory.buffer),view=new DataView(bytes.buffer),
  put=(p,n)=>view.setBigUint64(p,BigInt.asUintN(64,BigInt(n)),true),
  get=p=>view.getBigUint64(p,true);
let callbacks=0;
jit.jitState(a[1],a[2],a[3],a[0],ex.memory,
  (address,width)=>{callbacks++;return ex.RdMem(address,width);},
  (address,width,value)=>{callbacks++;ex.WrMem(address,width,value);});
jit.jitX87(a[4],a[5],a[6]);jit.jitSeg(0,0,0,a[7],a[8],a[9]);
function Reset(code,address,top,value) {
  bytes.fill(0,a[0]+start,a[0]+start+128);bytes.set([...code,0xF4],a[0]+start);
  bytes.fill(0xA5,a[0]+data-16,a[0]+data+528);
  bytes.fill(0xA5,a[0]+size-32,a[0]+size+16);
  view.setFloat64(a[0]+data,2.5,true);
  for(let i=0;i<16;i++) {
    put(a[1]+i*8,0x1234567800000000n+BigInt(i));
    put(a[8]+i*8,0xFEDCBA9876543210n+BigInt(i));
    put(a[9]+i*8,0x1020304050607080n+BigInt(i));
  }
  put(a[1]+24,address);put(a[2],0xAD7);put(a[3],start);
  put(a[5],top);put(a[6],0x41);put(a[7],0x37F);put(a[10],0);
  for(let i=0;i<8;i++)view.setFloat64(a[4]+i*8,i===top?value:i+0.25,true);
  callbacks=0;
}
function State() {
  return {regs:bytes.slice(a[1],a[1]+128),flags:get(a[2]),rip:get(a[3]),
    fp:bytes.slice(a[4],a[4]+64),top:get(a[5]),sw:get(a[6]),cw:get(a[7]),
    xmm:bytes.slice(a[8],a[8]+128),xhi:bytes.slice(a[9],a[9]+128),icr:get(a[10]),
    ram:bytes.slice(a[0]+data-16,a[0]+data+528),tail:bytes.slice(a[0]+size-32,a[0]+size+16)};
}
const operations=[
  [0xDD,0x03],[0xDD,0x0B],[0xDD,0x13],[0xDD,0x1B],
  [0xD9,0x2B],[0xD9,0x3B],
  [0xDF,0x0B],[0xDF,0x2B],[0xDF,0x3B],
  [0xDB,0x03],[0xDB,0x0B],[0xDB,0x1B],
  [0xDC,0x03],[0xDC,0x0B],[0xDC,0x23],[0xDC,0x2B],[0xDC,0x33],[0xDC,0x3B],
  [0x0F,0xAE,0x03],[0x0F,0xAE,0x0B]
],prefixes=[[],[0x48,0x83,0xC0,1],[0xD9,0xE8],[0xD9,0xC1,0xDD,0xD8]],
  addresses=[BigInt(data),0xFEE00030n,0x10000001800n,0xFEE00310n,-0x1FFFFD0n,
    BigInt(size-1),BigInt(size-2),BigInt(size-4)];
let count=0,fallbacks=0;
for(const op of operations)for(const prefix of prefixes) {
  const code=[...prefix,...op],before=prefix.length===4&&prefix[0]===0xD9?2:prefix.length?1:0,
    extended=op[0]===0x0F;
  Reset(code,BigInt(data),0,2.5);jit.jitReset();
  assert.equal(jit.jitCompile(start),before+1,"the normal RAM instruction still compiles");
  for(const address of addresses)for(const top of [0,7])for(const value of [-2.5,-0,1e30,NaN]) {
    Reset(code,address,top,value);for(let i=0;i<before;i++)ex.Step();const prefixState=State();
    ex.Step();const expected=State();
    Reset(code,address,top,value);const ran=jit.jitRun(start);
    if(address<0n||address>=BigInt(size)||extended&&address>BigInt(size-512)) {
      assert.equal(ran,before,"non-RAM operand returns before the instruction");
      assert.deepEqual(State(),prefixState,"fallback exposes the exact dirty integer/FPU prefix");
      assert.equal(callbacks,0,"no speculative device read/write before Step");
      ex.Step();fallbacks++;
    } else assert.equal(ran,before+1);
    assert.deepEqual(State(),expected,"x87 memory routing "+code+" @ "+address+" top "+top+" value "+value);
    count++;
  }
}
console.log(`${count} x87/FX memory states match Step (${fallbacks} exact-prefix fallbacks): RAM, aliases, devices, padded boundary spans, dirty cached stacks and zero speculative callbacks.`);
