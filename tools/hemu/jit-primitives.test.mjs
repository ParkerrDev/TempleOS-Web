import assert from "node:assert/strict";
import {compileHemu} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";
import * as jit from "../../engine/jit.js";

const c=compileHemu({exports:["InitMem","RigAddr"],extraSource:`
U64 RigAddr(I64 n)
{
  switch (n) {
    case 0:return mem;case 1:return &reg[0];case 2:return &rfl;
    case 3:return &rip;case 4:return &fpr[0];case 5:return &fsp;
    case 6:return &x87_sw;case 7:return &x87_cw;
  }
  return 0;
}`});
assert.deepEqual(c.warnings,[]);
const host=createHemuHost(),{instance}=await WebAssembly.instantiate(c.bytes,{env:host.env}),ex=instance.exports;
host.attach(instance);ex.__rt_init();ex.InitMem(8192n);
const a=Array.from({length:8},(_,n)=>Number(ex.RigAddr(BigInt(n)))),
      u8=new Uint8Array(ex.memory.buffer),dv=new DataView(u8.buffer),
      put=(at,n)=>dv.setBigUint64(at,BigInt.asUintN(64,BigInt(n)),true),
      get=at=>dv.getBigUint64(at,true);
jit.jitState(a[1],a[2],a[3],a[0],ex.memory,ex.RdMem,ex.WrMem);
jit.jitX87(a[4],a[5],a[6]);jit.jitSeg(0,0,0,a[7],0,0);
function Start(code,{flags=0xAD7,rc=0,value=-2.5,top=3,regs={}}={})
{
  u8.fill(0,a[0]+4096,a[0]+8192);u8.set([...code,0xF4],a[0]+4096);
  for (let i=0;i<16;i++) put(a[1]+i*8,0xFEDCBA9876543210n+BigInt(i));
  put(a[1]+8,0x123456789ABCDEFAn);put(a[1]+24,6144);
  for(const [r,v]of Object.entries(regs))put(a[1]+Number(r)*8,v);
  put(a[2],flags);put(a[3],4096);put(a[5],top);put(a[6],0);put(a[7],0x37F|(rc<<10));
  for(let i=0;i<8;i++)dv.setFloat64(a[4]+i*8,i==top?value:i+0.25,true);
  put(a[0]+6144,0xB7F);
}
function State()
{
  return {regs:u8.slice(a[1],a[1]+128),flags:get(a[2]),rip:get(a[3]),cw:get(a[7]),
    sw:get(a[6]),top:get(a[5]),fp:u8.slice(a[4],a[4]+64),mem:u8.slice(a[0]+6144,a[0]+6208)};
}
let count=0;
function Compare(code,steps,opt,check,executed=steps)
{
  Start(code,opt);for(let i=0;i<executed;i++)ex.Step();const expected=State();
  check?.();Start(code,opt);jit.jitReset();
  assert.equal(jit.jitCompile(4096),steps,"all instructions compile: "+code);
  assert.equal(jit.jitRun(4096),executed);
  assert.deepEqual(State(),expected,"primitive parity: "+code+" "+JSON.stringify(opt));
  check?.();count++;
}
for(let top=0;top<8;top++)for(let k=0;k<7;k++)Compare([0xD9,0xE8+k],1,{top});
for(let rc=0;rc<4;rc++)for(const value of [-0,-0.49,0.49,-1.5,1.5,-2.5,2.5,2.9,-2.9,1e30,Infinity,NaN])
  Compare([0xD9,0xFC],1,{rc,value});
Compare([0xD9,0x2B],1,{},()=>assert.equal(get(a[7]),0xB7Fn));
Compare([0xD9,0x3B],1,{rc:2},()=>assert.equal(dv.getUint16(a[0]+6144,true),0xB7F));
// A preceding compare's deferred flags must survive rounding and integer stores.
Compare([0x48,0x39,0xC8,0xD9,0xFC],2,{});
Compare([0x48,0x39,0xC8,0xDD,0x0B],2,{});
const Cond=(cc,f)=>{
  const c=!!(f&1),p=!!(f&4),z=!!(f&64),s=!!(f&128),o=!!(f&2048),v=[o,c,z,c||z,s,p,s!=o,z||s!=o][cc>>1];
  return cc&1?!v:v;
};
for(let mask=0;mask<32;mask++)for(let cc=0;cc<16;cc++) {
  const flags=2+[1,4,64,128,2048].reduce((r,b,i)=>r+((mask>>i&1)?b:0),0);
  for (const size of [2,4,8]) {
    const prefix=size==2?[0x66]:size==8?[0x48]:[];
    Compare([...prefix,0x0F,0x40+cc,0xC1],1,{flags},()=>{
      const old=0xFEDCBA9876543210n,src=0x123456789ABCDEFAn;
      let value=Cond(cc,flags)?src:old;
      if(size==4)value&=0xFFFFFFFFn;
      if(size==2)value=(old&~0xFFFFn)|(value&0xFFFFn);
      assert.equal(get(a[1]),value,"CMOV result including false 32-bit zero extension");
    });
  }
  for(const operand of [[0xC0],[0xC4],[0x03]])
    Compare([0x0F,0x90+cc,...operand],1,{flags});
}
// Partial flag writers preserve CF or OF from earlier instructions. A later
// full writer may discard them, but readers and all exits must see the chain.
for(const size of [1,2,4,8])for(const shift of [1,3,7,16,31,63])
  for(const value of [0,1,-1,"0x7FFFFFFFFFFFFFFF","0x8000000000000000"])
    for(const flags of [2,3,0xAD7]) {
      const p=size===2?[0x66]:size===8?[0x48]:[];
      const inc=[...p,size===1?0xFE:0xFF,0xC0],dec=[...p,size===1?0xFE:0xFF,0xC8],
            shl=[...p,size===1?0xC0:0xC1,0xE0,shift],
            shr=[...p,size===1?0xC0:0xC1,0xE8,shift],
            sar=[...p,size===1?0xC0:0xC1,0xF8,shift];
      for(const steps of [
        [inc,shl,dec,shr,sar],
        [[0x48,0x01,0xC8],inc,shl,dec,[0x0F,0x90,0xC2],[0x48,0x11,0xC3]],
        [inc,sar,[0x48,0x31,0xDB],[0x0F,0x92,0xC2]],
        [shl,inc,[0x48,0x39,0xCB],dec,[0x0F,0x40,0xCA]]
      ])Compare(steps.flat(),steps.length,{flags,regs:{0:value}});
    }
// HEMU preserves DIV's architecturally undefined integer flags. A deferred
// writer must survive both normal execution and the interpreter fallback.
for(const prefix of [[0x48,0xFF,0xC0],[0x48,0xC1,0xE0,1],[0x48,0x01,0xC8]]) {
  Compare([...prefix,0x48,0xF7,0xF3],2,{regs:{0:17,1:9,2:0,3:3}});
  Compare([...prefix,0x48,0xF7,0xF3],2,{regs:{0:17,1:9,2:0,3:0}},undefined,1);
}
console.log(`${count} JIT primitive checks: x87 control/round/constants, partial/deferred flag chains, all CMOV/SET conditions and widths.`);
