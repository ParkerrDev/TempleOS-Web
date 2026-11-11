import assert from "node:assert/strict";
import {compileHemu} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";
import * as jit from "../../engine/jit.js";

const c=compileHemu({exports:["InitMem","FloatAddr"],extraSource:`
U64 FloatAddr(I64 n)
{
  switch (n) {
    case 0:return mem;case 1:return &reg[0];case 2:return &rfl;
    case 3:return &rip;case 4:return &fpr[0];case 5:return &fsp;
    case 6:return &x87_sw;case 7:return &x87_cw;
    case 8:return &xmm_lo[0];case 9:return &xmm_hi[0];
    case 10:return &halted;
  }
  return 0;
}`});
assert.deepEqual(c.warnings,[]);
const host=createHemuHost(),{instance}=await WebAssembly.instantiate(c.bytes,{env:host.env}),ex=instance.exports;
host.attach(instance);ex.__rt_init();ex.InitMem(16384n);
const a=Array.from({length:11},(_,i)=>Number(ex.FloatAddr(BigInt(i)))),
  bytes=new Uint8Array(ex.memory.buffer),view=new DataView(bytes.buffer),
  Put=(p,n)=>view.setBigUint64(p,BigInt.asUintN(64,BigInt(n)),true),
  Get=p=>view.getBigUint64(p,true),
  values=[0x8000000000000000n,0x3FF4000000000000n,0x7FF8000000000021n,0x7FF0000000000000n,
    0xC021000000000000n,1n,0x46293E5939A08CEAn,0n];
jit.jitState(a[1],a[2],a[3],a[0],ex.memory,ex.RdMem,ex.WrMem);
jit.jitX87(a[4],a[5],a[6]);jit.jitSeg(0,0,0,a[7],a[8],a[9]);
function Start(code,top,cw) {
  bytes.fill(0,a[0]+4096,a[0]+16384);bytes.set([...code,0xF4],a[0]+4096);
  for(let i=0;i<16;i++)Put(a[1]+i*8,0);
  Put(a[1],8192);Put(a[1]+8,9);Put(a[1]+24,12288);Put(a[1]+32,16000);
  Put(a[2],0xAD7);Put(a[3],4096);Put(a[5],top);Put(a[6],0);Put(a[7],cw);Put(a[10],0);
  for(let i=0;i<8;i++)Put(a[4]+i*8,values[i]);
  for(let i=0;i<16;i++){Put(a[8]+i*8,i+1);Put(a[9]+i*8,1000+i);}
  view.setFloat64(a[0]+8192,1.5,true);
}
function State() {
  return {regs:bytes.slice(a[1],a[1]+128),flags:Get(a[2]),pc:Get(a[3]),top:Get(a[5]),
    sw:Get(a[6]),cw:Get(a[7]),halted:Get(a[10]),fp:bytes.slice(a[4],a[4]+64),
    memory:bytes.slice(a[0]+8192,a[0]+16384)};
}
let cases=0,blocks=0;
function Run(code,top,cw,useJit) {
  Start(code,top,cw);jit.jitReset();let turns=0;
  while(Number(Get(a[3]))<4096+code.length && !Get(a[10])) {
    assert.ok(turns++<10000,"instruction stream must finish");
    const pc=Number(Get(a[3]));
    if(useJit && jit.jitCompile(pc,process.env.NO_FPR_CACHE==="1") && jit.jitRun(pc))blocks++;
    else ex.Step();
  }
  return State();
}
function NaNs(state) {
  //WASM arithmetic allows either NaN sign/payload. Pure moves are checked exactly.
  function Canon(buf,offset) {
    const dv=new DataView(buf.buffer,buf.byteOffset,buf.byteLength),n=dv.getBigUint64(offset,true);
    if((n&0x7FF0000000000000n)===0x7FF0000000000000n && (n&0xFFFFFFFFFFFFFn))
      dv.setBigUint64(offset,0x7FF8000000000000n,true);
  }
  for(let i=0;i<8;i++)Canon(state.fp,i*8);
  Canon(state.memory,0);
  for(let i=0;i<8;i++)Canon(state.memory,4096+32+i*16);
  return state;
}
function Compare(code,top,cw=0x37F,arithmetic=true) {
  const expected=Run(code,top,cw,false),actual=Run(code,top,cw,true);
  if(arithmetic){NaNs(expected);NaNs(actual);}
  assert.deepEqual(actual,expected,"x87 block state: "+Buffer.from(code).toString("hex")+" top "+top+" cw "+cw);
  cases++;
}
for(let top=0;top<8;top++)for(const abs of [false,true])for(const useJit of [false,true]) {
  const state=Run([0xD9,abs?0xE1:0xE0],top,0x37F,useJit),
    expected=abs?values[top]&0x7FFFFFFFFFFFFFFFn:values[top]^0x8000000000000000n;
  assert.equal(new DataView(state.fp.buffer).getBigUint64(top*8,true),expected,
    `${useJit?"JIT":"interpreter"} ${abs?"FABS":"FCHS"} top ${top}`);
  cases++;
}
let seed=0x6A5C117;
function Rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;}
for(let n=0;n<80;n++) {
  const code=[];
  for(let i=0;i<32;i++) {
    const slot=Rand()>>>16&7,ops=[[0xD9,0xE8],[0xD9,0xEE],[0xD9,0xC0+slot],
      [0xD9,0xC8+slot],[0xD8,0xC0+slot],[0xD8,0xC8+slot],[0xD8,0xE0+slot],
      [0xD8,0xF0+slot],[0xD9,0xE0],[0xD9,0xE1],[0xDD,0xD8+slot],
      [0xDE,0xC0+slot],[0xDD,0x00],[0xDC,0x08],[0xDD,0x18]];
    code.push(...ops[(Rand()>>>16)%ops.length]);
  }
  for(let top=0;top<8;top++)Compare(code,top);
}
for(let top=0;top<8;top++)for(const cw of [0x37F,0x35E]) {
  Compare([0xD9,0xE8,0xD9,0xE0,0xDF,0x38,0xD9,0xE8],top,cw);
  Compare([0xD9,0xE8,0x48,0xF7,0xF2],top,cw);
}
for(let top=0;top<8;top++)for(const cw of [0x37F,0x37E])for(let mode=0;mode<4;mode++) {
  //A dirty x87 prefix and lazy integer flags must survive the NaN side exit.
  const slot=(2-top)&7;
  Compare([0xD9,0xC0+slot,0xD9,0xE8,0x48,0x83,0xC1,1,
    mode<2?0xDB:0xDF,mode%2?0xE9:0xF1,0xD9,0xE0],top,cw,false);
}
for(let top=0;top<8;top++) {
  Compare([0xD9,0xC2,0xD9,0xE0,0xDD,0x18,0xD9,0xE1,0xD9,0xC9],top,0x37F,false);
  Compare([0xD9,0xE8,0x0F,0xAE,0x03,0xD9,0xE0,0x0F,0xAE,0x0B,0xD9,0xE8],top);
  Compare([0x0F,0xAE,0x03,0xD9,0xE8,0x0F,0xAE,0x0B,0xD9,0xE8],top);
  //Balanced and moving stack tops across native self-loops.
  Compare([0xD9,0xE8,0xDD,0xD9,0xFF,0xC9,0x75,0xF8],top);
  Compare([0xD9,0xE8,0xFF,0xC9,0x75,0xFA],top);
}
console.log(`${cases} x87 state comparisons (${blocks} compiled blocks): wrapped tops, values/NaNs/zeros, early exits, save/restore and balanced/moving loops.`);
