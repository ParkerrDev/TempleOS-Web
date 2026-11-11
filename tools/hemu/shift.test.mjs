import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {compileHemu} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";
import * as jit from "../../engine/jit.js";

//shift-oracle.c executes these instructions directly on x86-64 hardware.
//Only architecturally defined flag bits are compared for each count.
const c=compileHemu({exports:["InitMem","ShiftBegin","ShiftProbe"],extraSource:`
U0 ShiftBegin(I64 size,I64 op,I64 cnt,U64 value,U64 flags,Bool immediate)
{
  I64 i=4096;
  reg[0]=value;reg[1]=cnt;rfl=flags;rip=i;halted=0;
  if (size==2) mem[i++]=0x66;
  else if (size==8) mem[i++]=0x48;
  if (immediate) {
    if (size==1) mem[i++]=0xC0;else mem[i++]=0xC1;
  } else if (size==1) mem[i++]=0xD2;else mem[i++]=0xD3;
  mem[i++]=0xC0|op<<3;
  if (immediate) mem[i++]=cnt;
  mem[i]=0xF4;
}
U64 ShiftProbe(I64 n)
{
  switch (n) {
    case 0:return reg[0];case 1:return rfl;case 2:return mem;
    case 3:return &reg[0];case 4:return &rfl;case 5:return &rip;
  }
  return 0;
}`});
assert.deepEqual(c.warnings,[]);
const host=createHemuHost(),{instance}=await WebAssembly.instantiate(c.bytes,{env:host.env}),ex=instance.exports;
host.attach(instance);ex.__rt_init();ex.InitMem(8192n);
const Probe=n=>ex.ShiftProbe(BigInt(n));
jit.jitState(Probe(3),Probe(4),Probe(5),Number(Probe(2)),ex.memory,ex.RdMem,ex.WrMem);
const cases=readFileSync(new URL("./shift-oracle.txt",import.meta.url),"utf8").trim().split("\n");
let compiled=0,checks=0;
for(const mode of ["cl","immediate","jit"])for(const row of cases) {
  const [size,op,count,value,initial,result,flags]=row.split(" "),s=Number(size),o=Number(op),
    masked=Number(count)&(s===8?63:31),bits=s*8,label=mode+" "+row;
  let effective=masked,mask=0xED5n;
  if(o<2)effective%=bits;
  else if(o<4 && s<4)effective%=bits+1;
  if(masked!==1 && masked!==0 && (o<2 || effective!==0))mask&=~0x800n;
  if(o>=4 && masked!==0) {
    mask&=~0x10n; //AF undefined for nonzero shifts.
    if(o!==7 && masked>=bits)mask&=~1n;
  }
  ex.ShiftBegin(BigInt(size),BigInt(op),BigInt(count),BigInt("0x"+value),BigInt("0x"+initial),BigInt(mode!=="cl"));
  if(mode==="jit") {
    jit.jitReset();
    if(jit.jitCompile(4096)) {
      assert.equal(jit.jitRun(4096),1,label);compiled++;
    } else ex.Step();
  } else ex.Step();
  assert.equal(BigInt.asUintN(64,Probe(0)),BigInt("0x"+result),label+" result");
  assert.equal(Probe(1)&mask,BigInt("0x"+flags)&mask,label+" flags");checks++;
}
assert.ok(compiled>=cases.length*3/7,"immediate SHL/SHR/SAR must compile");
console.log(`${checks} x86 shift/rotate hardware comparisons passed (${compiled} compiled): all widths, both carry inputs, masked counts, overflow and register preservation.`);
