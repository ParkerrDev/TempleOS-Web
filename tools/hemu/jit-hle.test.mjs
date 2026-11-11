import assert from "node:assert/strict";
import * as jit from "../../engine/jit.js";

const REG=16,FLAGS=144,RIP=152,BASE=4096,JIT_RIP=0x100000,JIT_N=0x180000,
  hook=0x1000,alias=0x11001,next=0x1200;
let cases=0;
for(const shared of [false,true])for(const tag of [-2,-1,0,1]) {
  const memory=new WebAssembly.Memory(shared?{initial:64,maximum:64,shared:true}:{initial:64}),
    bytes=new Uint8Array(memory.buffer),view=new DataView(memory.buffer),
    put=(at,value)=>view.setBigInt64(at,BigInt(value),true),
    get=at=>view.getBigUint64(at,true),slot=address=>(address^address>>>16)&65535;
  let handled=0,probes=0,accept=true;
  const handler=()=>{
    probes++;
    if(get(RIP)!==BigInt(hook)||!accept)return 0n;
    handled++;bytes[BASE+64]++;put(RIP,next);return 1n;
  };
  assert.equal(slot(hook),slot(alias));
  bytes.set([0x48,0xFF,0xC1,0xF4],BASE+alias);
  bytes.set([0x48,0xFF,0xC0,0xF4],BASE+next);
  jit.jitState(REG,FLAGS,RIP,BASE,memory,()=>0n,()=>{},handler);
  jit.jitChain(JIT_RIP,JIT_N);
  for(const address of [alias,next]) {
    const count=jit.jitCompile(address);assert.equal(count,1);
    put(JIT_RIP+slot(address)*8,address);put(JIT_N+slot(address)*8,count);
  }
  put(JIT_N+slot(alias)*8,tag);
  for(const budget of [0,1,2,-1,-2]) {
    put(REG,10);put(REG+8,20);put(RIP,hook);bytes[BASE+64]=0;
    handled=probes=0;
    assert.equal(jit.jitDispatch(budget),Math.abs(budget));
    assert.equal(handled,budget?1:0,"Eviction cannot disable the registered hook.");
    assert.equal(bytes[BASE+64],budget?1:0);
    assert.equal(get(REG),Math.abs(budget)===2?11n:10n);
    assert.equal(get(REG+8),20n);
    assert.equal(get(RIP),BigInt(budget?next+(Math.abs(budget)===2?3:0):hook));
    if(!budget)assert.equal(probes,0,"No callback runs after its budget is exhausted.");
    assert.equal(get(JIT_RIP+slot(alias)*8),BigInt(alias));cases++;
  }
  accept=false;put(RIP,hook);handled=0;
  const before=bytes.slice();assert.equal(jit.jitDispatch(4),0);
  assert.equal(handled,0);assert.deepEqual(bytes,before,"Refused hooks leave the interpreter's state intact.");
  put(JIT_N+slot(alias)*8,1);put(RIP,alias);put(REG+8,20);
  assert.equal(jit.jitDispatch(1),1);assert.equal(get(REG+8),21n);
  assert.equal(get(RIP),BigInt(alias+3),"The colliding compiled block remains executable.");cases+=2;
  const sti=hook-1;bytes[BASE+sti]=0xFB;
  assert.equal(jit.jitCompile(sti),1);put(JIT_RIP+slot(sti)*8,sti);put(JIT_N+slot(sti)*8,1);
  accept=true;handled=0;put(FLAGS,0);put(RIP,sti);
  assert.equal(jit.jitDispatch(-2),1,"An interrupt window returns before the following hook.");
  assert.equal(handled,0);assert.equal(get(RIP),BigInt(hook));assert.equal(get(FLAGS)&0x200n,0x200n);
  assert.equal(jit.jitDispatch(1),1);assert.equal(handled,1);cases++;
}
console.log(`${cases} HLE dispatch cases: cache eviction, compiled continuation, shared/private RAM, refusal and exact budgets.`);
