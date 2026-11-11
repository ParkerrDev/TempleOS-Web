import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileHemu} from '../../engine/compile.js';
import {createHemuHost} from '../../engine/host.js';
import * as jit from '../../engine/jit.js';
const c=compileHemu({exports:['InitMem','SseBegin','SseState'],extraSource:`
U0 SseBegin(I64 op,Bool memory,U64 a,U64 b,U64 flags)
{
  rip=4096;halted=0;rfl=flags;reg[3]=8192;
  xmm_lo[0]=a;xmm_hi[0]=0x123456789ABCDEF0;
  xmm_lo[1]=b;xmm_hi[1]=0xFEDCBA9876543210;
  WrMem(8192,8,b);
  mem[4096]=0x66;mem[4097]=0x0F;mem[4098]=0x2E+op;
  if (memory) mem[4099]=3;
  else mem[4099]=0xC1;
  mem[4100]=0xF4;
}
U64 SseState(I64 n)
{
  switch (n) {
    case 0:return mem;case 1:return &reg[0];case 2:return &rfl;
    case 3:return &rip;case 4:return xmm_lo[0];case 5:return xmm_hi[0];
    case 6:return xmm_lo[1];case 7:return xmm_hi[1];
    case 8:return rfl;case 9:return rip;
  }
  return 0;
}`});
assert.deepEqual(c.warnings,[]);
const host=createHemuHost(),{instance}=await WebAssembly.instantiate(c.bytes,{env:host.env}),ex=instance.exports;
host.attach(instance);ex.__rt_init();ex.InitMem(16384n);
const Get=i=>BigInt.asUintN(64,ex.SseState(BigInt(i)));
jit.jitState(Get(1),Get(2),Get(3),Get(0),ex.memory,ex.RdMem,ex.WrMem);
let count=0;
for(const row of readFileSync(new URL('./sse-compare-oracle.txt',import.meta.url),'utf8').trim().split('\n')) {
  const [a,b,op,seed,flags]=row.split(' '),left=BigInt('0x'+a),right=BigInt('0x'+b),before=BigInt('0x'+seed),
    expected=before&~0x8D5n|BigInt('0x'+flags);
  for(const memory of [0,1])for(const compiled of [false,true]) {
    ex.SseBegin(BigInt(op),BigInt(memory),left,right,before);
    if(compiled) {jit.jitReset();if(!jit.jitCompile(4096)||!jit.jitRun(4096))ex.Step();}
    else ex.Step();
    assert.equal(Get(8),expected,`${row} memory=${memory} jit=${compiled}`);
    assert.deepEqual([Get(4),Get(5),Get(6),Get(7)],[left,0x123456789ABCDEF0n,right,0xFEDCBA9876543210n]);
    assert.equal(Get(9),4100n);count++;
  }
}
console.log(`SSE compare: ${count} physical flags/operand comparisons; both zeros, NaNs and infinities, memory/register operands. MXCSR exception delivery remains outside this fixture.`);
