// FTST and FNSTSW drive TempleOS Sign(). Check both execution paths without a disk.
// Intel SDM, FTST: https://cdrdv2-public.intel.com/774492/325383-sdm-vol-2abcd.pdf
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileHemu} from '../../engine/compile.js';
import {createHemuHost} from '../../engine/host.js';
import * as jit from '../../engine/jit.js';
const extra=`
U0 FpuBegin(F64 value,U64 status) {
  fsp=3; FStset(0,value); x87_sw=status; rfl=0xAD7;
  reg[0]=0x123456789ABC0000; rip=4096; halted=0;
  mem[4096]=0xD9; mem[4097]=0xE4; mem[4098]=0xDF; mem[4099]=0xE0; mem[4100]=0xF4;
}
U0 FpuArithBegin(U64 op,U64 modrm,F64 a,F64 b,I64 top) {
  fsp=top; FStset(0,a); FStset(modrm&7,b); x87_sw=0; rfl=0xAD7; rip=4096; halted=0;
  mem[4096]=op;mem[4097]=modrm;mem[4098]=0xF4;
}
F64 FpuValue(I64 slot){return FStv(slot);}
U64 FpuProbe(I64 n) {
  switch(n) {
    case 0:return x87_sw; case 1:return reg[0]; case 2:return rfl; case 3:return fsp;
    case 4:return F64ToBits(FStv(0)); case 5:return mem; case 6:return &reg[0];
    case 7:return &rfl; case 8:return &rip; case 9:return &fpr[0];
    case 10:return &fsp; case 11:return &x87_sw;
  }
  return 0;
}
`;
const c=compileHemu({extraSource:extra,exports:['InitMem','FpuBegin','FpuProbe','FpuArithBegin','FpuValue']});
const host=createHemuHost(),{instance}=await WebAssembly.instantiate(c.bytes,{env:host.env}),ex=instance.exports;
host.attach(instance);ex.__rt_init();ex.InitMem(8192n);
const probe=n=>ex.FpuProbe(BigInt(n));
jit.jitState(probe(6),probe(7),probe(8),Number(probe(5)),ex.memory,ex.RdMem,ex.WrMem);
jit.jitX87(probe(9),probe(10),probe(11));
for(const mode of ['interpreter','jit'])for(const [value,flags] of [[-2,0x100],[2,0],[0,0x4000],[-0,0x4000],[NaN,0x4500],[-Infinity,0x100],[Infinity,0]]) {
  ex.FpuBegin(value,0x47A5n);
  const bits=probe(4);
  if(mode==='jit'){jit.jitReset();assert.equal(jit.jitCompile(4096),2);assert.equal(jit.jitRun(4096),2);}
  else {ex.Step();ex.Step();}
  const status=BigInt(0xA5|flags);
  assert.equal(probe(0),status,`${mode} FTST ${value}`);
  assert.equal(probe(1),0x123456789ABC0000n|status,`${mode} FNSTSW preserves upper RAX`);
  assert.equal(probe(2),0xAD7n,'EFLAGS preserved');assert.equal(probe(3),3n,'stack top preserved');
  assert.equal(probe(4),bits,'operand preserved');
}
console.log('FTST/FNSTSW: negative, positive, both zeros, NaN and infinities match in interpreter and JIT.');

// Intel SDM opcode tables: /4 and /6 compute ST0 op ST(i) for D8, DC and DE,
// while /5 and /7 compute ST(i) op ST0. DC/DE store in ST(i), DE also pops.
let cases=0;
for(const mode of ['interpreter','jit'])for(const op of [0xD8,0xDC,0xDE])
for(const slot of [1,3])for(const top of [0,3,7])for(const [a,b] of [[12,3],[-7,2]])
for(const [sub,expected] of [[0,a+b],[1,a*b],[4,a-b],[5,b-a],[6,a/b],[7,b/a]]){
  ex.FpuArithBegin(BigInt(op),BigInt(0xC0+sub*8+slot),a,b,BigInt(top));
  if(mode==='jit'){jit.jitReset();assert.equal(jit.jitCompile(4096),1);assert.equal(jit.jitRun(4096),1);}
  else ex.Step();
  const dest=op===0xD8?0:slot-(op===0xDE?1:0);
  assert.equal(ex.FpuValue(BigInt(dest)),expected,`${mode} opcode ${op.toString(16)}/${sub} ST${slot} TOP${top}`);
  assert.equal(probe(3),BigInt((top+(op===0xDE?1:0))&7),'correct stack pop');
  assert.equal(probe(2),0xAD7n,'arithmetic preserves EFLAGS');cases++;
}
console.log(`${cases} x87 register arithmetic cases passed, including operand order and wrapped stack tops.`);
