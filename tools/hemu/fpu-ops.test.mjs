import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {compileHemu} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";
import * as jit from "../../engine/jit.js";

const c=compileHemu({exports:["InitMem","OpsBegin","OpsState"],extraSource:`
U0 OpsBegin(I64 op,I64 mod_rm,U64 flags,I64 top,F64 arg1,F64 arg2,I64 value,U64 sw)
{
  rip=4096;halted=0;g_badop=0;rfl=flags;fsp=top;x87_sw=sw;x87_cw=0x37F;
  FStset(0,arg1);FStset(1,arg2);reg[0]=8192;reg[3]=8192;
  mem[4096]=op;mem[4097]=mod_rm;mem[4098]=0xF4;WrMem(8192,8,value);
}
U64 OpsState(I64 n)
{
  switch (n) {
    case 0:return mem;case 1:return &reg[0];case 2:return &rfl;
    case 3:return &rip;case 4:return &fpr[0];case 5:return &fsp;
    case 6:return &x87_sw;case 7:return &x87_cw;
    case 8:return rfl;case 9:return fsp;case 10:return FSwGet;
    case 11:return FStv(0)(U64);case 12:return halted;case 13:return g_badop;
    case 14:return reg[0];case 15:return RdMem(8192,8);
  }
  return 0;
}`});
assert.deepEqual(c.warnings,[]);
let output="";
const host=createHemuHost({onText:s=>output+=s}),{instance}=await WebAssembly.instantiate(c.bytes,{env:host.env}),ex=instance.exports;
host.attach(instance);ex.__rt_init();ex.InitMem(16384n);
const Get=i=>BigInt.asUintN(64,ex.OpsState(BigInt(i))),base=Number(Get(0)),bytes=new Uint8Array(ex.memory.buffer);
jit.jitState(Get(1),Get(2),Get(3),Get(0),ex.memory,ex.RdMem,ex.WrMem);
jit.jitX87(Get(4),Get(5),Get(6));jit.jitSeg(0,0,0,Get(7));
let cases=0;
function Run(code,useJit) {
  bytes.set([...code,0xF4],base+4096);jit.jitReset();let turns=0;
  while(!Get(12)) {
    assert.ok(turns++<16,"short instruction stream must stop");
    const pc=Number(new DataView(ex.memory.buffer).getBigUint64(Number(Get(3)),true));
    if(useJit&&jit.jitCompile(pc)&&jit.jitRun(pc))continue;
    ex.Step();
  }
}
const rows=readFileSync(new URL("./fpu-ops-oracle.txt",import.meta.url),"utf8").trim().split("\n").filter(x=>!x.startsWith("#"));
for(const useJit of [false,true])for(const row of rows) {
  const [kind,...a]=row.split(" "),label=`${useJit?"JIT":"interpreter"} ${row}`;
  if(kind==="MOVE") {
    const [op,flags,value,after]=a,mode=Number(op),code=[mode<4?0xDA:0xDB,0xC1+(mode%4)*8];
    for(const top of [0,3,7]) {
      ex.OpsBegin(...code.map(BigInt),BigInt("0x"+flags),BigInt(top),1.25,-3.5,0n,0x4500n);
      Run(code,useJit);
      assert.equal(Get(11),BigInt("0x"+value),label);
      assert.equal(Get(8),BigInt("0x"+after),label+" flags");
      assert.equal(Get(9),BigInt(top),label+" top");
      assert.equal(Get(10),0x4500n|BigInt(top<<11),label+" status");
      assert.equal(Get(13),0n,label+" supported");cases++;
    }
  } else if(kind==="STATUS") {
    const [top,before,after]=a,code=[0xDF,0xE0,0xDB,0xE2,0xDD,0x3B];
    ex.OpsBegin(0n,0n,0xAD7n,BigInt(top),1.25,-3.5,0x1122334455667788n,1n);
    Run(code,useJit);
    assert.equal(Get(14)&0xFFFFn,BigInt("0x"+before),label+" FNSTSW AX");
    assert.equal(Get(15),0x1122334455660000n|BigInt("0x"+after),label+" FNCLEX and FNSTSW memory");
    assert.equal(Get(8),0xAD7n,label+" flags");assert.equal(Get(13),0n,label+" supported");cases++;
  } else {
    assert.equal(kind,"ICOMP");
    const [width,pop,left,right,sw]=a,code=[width==="2"?0xDE:0xDA,pop==="1"?0x18:0x10];
    ex.OpsBegin(...code.map(BigInt),0xAD7n,7n,Number(left),-3.5,BigInt(right),0n);
    Run(code,useJit);
    assert.equal(Get(10),BigInt("0x"+sw),label);
    assert.equal(Get(8),0xAD7n,label+" flags");assert.equal(Get(13),0n,label+" supported");cases++;
  }
}
for(const useJit of [false,true])for(const code of [[0xD9,0xD1],[0xDB,0xF8],[0xDF,0xE1],
  [0xDE,0xD8],[0xDD,0xF8],[0xD9,0x08],[0xDB,0x28],[0xDB,0x38],[0xDD,0x20],[0xD9,0x30],[0xD9,0xF5]]) {
  ex.OpsBegin(...code.map(BigInt),0xAD7n,3n,1.25,-3.5,0x1122334455667788n,0x4500n);
  Run(code,useJit);
  assert.equal(Get(12),2n,"unsupported encoding must stop");
  assert.equal(Get(13),BigInt(code[0]*256+code[1]),"report both opcode bytes");
  assert.equal(Get(11),0x3FF4000000000000n,"unsupported opcode cannot change ST0");
  assert.equal(Get(8),0xAD7n);assert.equal(Get(9),3n);
  assert.equal(Get(15),0x1122334455667788n);cases++;
}
assert.equal((output.match(/BADOPX87/g)||[]).length,22,"every unsupported instruction is diagnosed");
console.log(`${cases} x87 dispatch checks: independent FCMOV, status/clear, integer comparison results and explicit unsupported-instruction stops.`);
