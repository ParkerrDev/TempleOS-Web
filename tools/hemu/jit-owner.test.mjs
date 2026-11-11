import assert from 'node:assert/strict';
import * as jit from '../../engine/jit.js';

const REG=16,FLAGS=144,RIP=152,BASE=256,JIT_RIP=65536,JIT_N=589824,PC=4096;
function Owner(shared=false) {
  const memory=new WebAssembly.Memory(shared?{initial:32,maximum:32,shared:true}:{initial:32}),
    view=new DataView(memory.buffer),slot=(PC^PC>>>16)&65535;
  view.setBigUint64(RIP,BigInt(PC),true);
  view.setBigUint64(JIT_RIP+slot*8,BigInt(PC),true);
  view.setBigInt64(JIT_N+slot*8,-2n,true);
  return {memory,view,calls:0};
}
function Attach(owner,handler,chain=true) {
  jit.jitState(REG,FLAGS,RIP,BASE,owner.memory,()=>0n,()=>{},handler);
  if(chain)jit.jitChain(JIT_RIP,JIT_N);
}
let count=0;
for(const shared of [false,true])for(const missing of [undefined,null])for(const chain of [false,true]) {
  const prior=Owner(shared),next=Owner(shared);
  function Handler(owner) {
    return ()=>{owner.calls++;owner.view.setUint8(BASE+64,owner.calls);return 0n;};
  }
  Attach(prior,Handler(prior));
  assert.equal(jit.jitDispatch(8),0);
  assert.equal(prior.calls,1,'The registered owner receives its handler call.');
  const beforePrior=new Uint8Array(prior.memory.buffer).slice(),
    beforeNext=new Uint8Array(next.memory.buffer).slice();
  Attach(next,missing,chain);
  assert.equal(jit.jitDispatch(8),0);
  assert.equal(prior.calls,1,'An owner without HLE must not invoke a previous owner.');
  assert.deepEqual(new Uint8Array(prior.memory.buffer),beforePrior);
  assert.deepEqual(new Uint8Array(next.memory.buffer),beforeNext);
  Attach(next,Handler(next));
  assert.equal(jit.jitDispatch(8),0);
  assert.equal(next.calls,1,'A later registered handler belongs to the new owner.');
  assert.equal(prior.calls,1);
  count++;
}
for(const shared of [false,true]) {
  const prior=Owner(shared),next=Owner(shared),code=[0x48,0xFF,0xC0,0xF4];
  for(const [owner,value] of [[prior,10n],[next,50n]]) {
    new Uint8Array(owner.memory.buffer).set(code,BASE+PC);
    owner.view.setBigUint64(REG,value,true);
  }
  Attach(prior,null,false);
  assert.equal(jit.jitCompile(PC),1);assert.equal(jit.jitRun(PC),1);
  assert.equal(prior.view.getBigUint64(REG,true),11n);
  const before=new Uint8Array(prior.memory.buffer).slice();
  Attach(next,null,false);
  assert.equal(jit.jitRun(PC),0,'Attaching an owner discards modules importing earlier memory.');
  assert.equal(jit.jitDispatch(8),0);
  assert.deepEqual(new Uint8Array(prior.memory.buffer),before);
  assert.equal(next.view.getBigUint64(REG,true),50n);
  assert.equal(jit.jitCompile(PC),1);assert.equal(jit.jitRun(PC),1);
  assert.equal(next.view.getBigUint64(REG,true),51n);
  jit.jitReset();assert.equal(jit.jitRun(PC),0);
  assert.equal(jit.jitCompile(PC),1);assert.equal(jit.jitRun(PC),1);
  assert.equal(next.view.getBigUint64(REG,true),52n,'Code-only reset retains current owner bindings.');
  count++;
}
for(const shared of [false,true])for(const code of [
  [0x64,0x48,0x8B,0x03],[0x65,0x48,0x8B,0x03],
  [0x0F,0x31],[0xD9,0xE8],[0xD9,0x3B],[0x0F,0xAE,0x03]
]) {
  const prior=Owner(shared),next=Owner(shared);
  Attach(prior,null,false);
  jit.jitX87(2048,2112,2120);jit.jitSeg(2136,2144,2152,2160,2176,2304);
  Attach(next,null,false);
  if(code[1]===0x3B||code[1]===0xAE)jit.jitX87(3072,3136,3144);
  new Uint8Array(next.memory.buffer).set([...code,0xF4],BASE+PC);
  next.view.setBigUint64(REG+24,64n,true);
  next.view.setBigUint64(BASE+64,0x1234n,true);
  next.view.setBigUint64(BASE+80,0xBADn,true);
  next.view.setBigUint64(2136,16n,true);next.view.setBigUint64(2144,16n,true);
  if(code[0]===0x64||code[0]===0x65) {
    assert.equal(jit.jitCompile(PC),0,'Unknown FS/GS bases require interpreter execution.');
    const prefix=[0x48,0xFF,0xC0];
    new Uint8Array(next.memory.buffer).set([...prefix,...code,0xF4],BASE+PC);
    jit.jitReset();next.view.setBigUint64(REG,10n,true);
    assert.equal(jit.jitCompile(PC),1);assert.equal(jit.jitRun(PC),1);
    assert.equal(next.view.getBigUint64(REG,true),11n);
    assert.equal(next.view.getBigUint64(RIP,true),BigInt(PC+prefix.length));
    for(const base of [0n,16n]) {
      new Uint8Array(next.memory.buffer).set([...code,0xF4],BASE+PC);
      next.view.setBigUint64(2136,base,true);next.view.setBigUint64(2144,base,true);
      jit.jitSeg(2136,2144,0,0,0,0);jit.jitReset();
      assert.equal(jit.jitCompile(PC),1);assert.equal(jit.jitRun(PC),1);
      assert.equal(next.view.getBigUint64(REG,true),base?0xBADn:0x1234n,
        'A registered base is used even when its value is zero.');
    }
  } else {
    assert.equal(jit.jitCompile(PC),0,'Missing optional CPU bindings retain the interpreter fallback.');
  }
  assert.equal(prior.calls,0);count++;
}
console.log(`${count} JIT ownership cases preserve memory, callback and optional CPU bindings across attachments.`);
