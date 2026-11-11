import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {compileHemu} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";
import * as jit from "../../engine/jit.js";

// fpu-oracle.txt is real x86 FISTP/FISTTP output from fpu-oracle.c.
// Intel SDM Vol.2A, FIST/FISTP and FISTTP:
// https://cdrdv2.intel.com/v1/dl/getContent/671199
const extra=`
U0 ConvertBegin(U64 bits,I64 rc,I64 size,Bool trunc)
{
  I64 op=0xDF,sub=3;
  fsp=3;FStset(0,BitsToF64(bits));x87_sw=0;x87_cw=0x37F|(rc<<10);
  rfl=0xAD7;reg[0]=6144;rip=4096;halted=0;
  if (size==4) op=0xDB;
  else if (size==8) sub=7;
  if (trunc) {
    sub=1;
    if (size==8) op=0xDD;
  }
  mem[4096]=op;mem[4097]=sub<<3;mem[4098]=0xF4;
  WrMem(6144,8,0);
}
U64 ConvertProbe(I64 n)
{
  switch (n) {
    case 0:return x87_sw;case 1:return fsp;case 2:return rfl;
    case 3:return RdMem(6144,8);case 4:return mem;
    case 5:return &reg[0];case 6:return &rfl;case 7:return &rip;
    case 8:return &fpr[0];case 9:return &fsp;case 10:return &x87_sw;
    case 11:return &x87_cw;
  }
  return 0;
}`;
const c=compileHemu({extraSource:extra,exports:["InitMem","ConvertBegin","ConvertProbe"]});
assert.deepEqual(c.warnings,[]);
const host=createHemuHost(),{instance}=await WebAssembly.instantiate(c.bytes,{env:host.env}),ex=instance.exports;
host.attach(instance);ex.__rt_init();ex.InitMem(8192n);
const probe=n=>ex.ConvertProbe(BigInt(n));
jit.jitState(probe(5),probe(6),probe(7),Number(probe(4)),ex.memory,ex.RdMem,ex.WrMem);
jit.jitX87(probe(8),probe(9),probe(10));
jit.jitSeg(0,0,0,probe(11),0,0);
const cases=readFileSync(new URL("./fpu-oracle.txt",import.meta.url),"utf8").trim().split("\n");
let compiled=0;
for (const mode of ["interpreter","jit"])
  for (const row of cases) {
    const [bits,rc,size,trunc,result,status]=row.split(" "),label=mode+" "+row;
    ex.ConvertBegin(BigInt("0x"+bits),BigInt(rc),BigInt(size),BigInt(trunc));
    if (mode=="jit") {
      jit.jitReset();
      if (jit.jitCompile(4096)) {
        assert.equal(jit.jitRun(4096),1,label);
        compiled++;
      } else ex.Step();
    } else ex.Step();
    assert.equal(BigInt.asUintN(64,probe(3)),BigInt("0x"+result),label+" result");
    assert.equal(probe(0)&0x221n,BigInt("0x"+status),label+" status");
    assert.equal(probe(1),4n,label+" pops once");
    assert.equal(probe(2),0xAD7n,label+" preserves EFLAGS");
  }
assert.ok(compiled>=cases.length*5/6,"all supported integer stores must use the JIT");
console.log(`${cases.length*2} x87 integer-store hardware comparisons passed (${compiled} compiled): NaN, overflow, destination widths, ties and all rounding modes.`);
