import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {hemuFile,compileHemu} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";
const adapter=readFileSync(new URL("./CpuNativeHost.HC",import.meta.url),"latin1"),
  expand=source=>source.replace(/#include "([^"]+)"/g,(_,name)=>
    name==="host.HC"?adapter:expand(hemuFile(name))),
  source=expand(hemuFile("test.HC"))+muldivSource(),
  hash=createHash("sha256").update(Buffer.from(source,"latin1")).digest("hex"),
  file=new URL("./cpu-native.json",import.meta.url);
if(process.argv.includes("--record")) {
  const oracle=process.env.HOLYC_QEMU_ORACLE;
  if(!oracle)throw new Error("Set HOLYC_QEMU_ORACLE to HolyC-wasm/tests/oracle/Qemu.mjs.");
  const {QemuRun}=await import(pathToFileURL(oracle)),
    result=await QemuRun([Buffer.from(source,"latin1")],{timeout:180}),row=result.results[0];
  console.log("Native interpreter:",result.evidence);
  assert.equal(row.except,"");assert.doesNotMatch(row.out,/WARNING|ERROR|FAIL/);
  assert.match(row.out,/hemu: 31 passed, 0 failed .*badop=0/);
  writeFileSync(file,JSON.stringify({backend:result.backend,sourceHash:hash,out:row.out},null,2)+"\n");
}
const expected=JSON.parse(readFileSync(file,"utf8"));
assert.equal(hash,expected.sourceHash,"rerun original V5.03 after changing the interpreter or its native fixture");
const compiled=compileHemu({filename:"test.HC",extraSource:muldivSource()});assert.deepEqual(compiled.warnings,[]);
let output="";
const host=createHemuHost({onText:text=>output+=text}),
  {instance}=await WebAssembly.instantiate(compiled.bytes,{env:host.env});
host.attach(instance);instance.exports.__rt_init();instance.exports.__main();
assert.equal(output,expected.out);
const total=Number(expected.out.match(/total guest instr=(\d+)/)[1]);
console.log(`Full interpreter source compiles natively: 31 battery checks, multiply/divide hardware vectors and ${total.toLocaleString()} executed battery instructions agree in original V5.03 and WASM; zero badops.`);

function muldivSource() {
  const rows=readFileSync(new URL("./muldiv-oracle.txt",import.meta.url),"utf8").trim().split("\n"),
    statements=[];
  let checks=0;
  rows.forEach((line,index)=>{
    const [opText,sizeText,seed,a,d,b,fault,outA,outD,flags]=line.toUpperCase().split(" "),op=Number(opText),size=Number(sizeText),
      witness=seed==="0" && (size===1 && op===0 && BigInt("0x"+a)%256n===16n && BigInt("0x"+b)===16n ||
        size===1 && op===5 && BigInt("0x"+a)%65536n===256n && BigInt("0x"+b)===16n ||
        size===8 && op===6 && BigInt("0x"+a)===0n && BigInt("0x"+d)===1n && BigInt("0x"+b)===3n);
    if(index%127&&!witness)return;
    const code=size===2?[0x66]:size===8?[0x48]:[];
    if(op===2)code.push(0x0F,0xAF,0xC1);
    else if(op===3)code.push(0x6B,0xC1,0xFD);
    else if(op===4)code.push(0x69,0xC1,...(size===2?[1,1]:[1,1,0,0]));
    else code.push(size===1?0xF6:0xF7,0xC1+[4,5,0,0,0,6,7][op]*8);
    const value=code.reduce((n,byte,i)=>n|BigInt(byte)<<BigInt(i*8),0n);
    statements.push(`  WrMem(4096,8,0x${value.toString(16).toUpperCase()});`,
      `  rip=4096;halted=0;`,
      `  reg[0]=0x${a};reg[2]=0x${d};`,
      `  reg[1]=0x${b};rfl=${seed==="0"?"0x202":"0xAD7"};Step;`,
      `  Check("muldiv ${index} A",reg[0],0x${outA});`,
      `  Check("muldiv ${index} D",reg[2],0x${outD});`,
      `  Check("muldiv ${index} fault",halted,${fault==="1"?3:0});`);
    checks+=3;
    if(op<5){statements.push(`  Check("muldiv ${index} flags",rfl&0x801,0x${flags});`);checks++;}
  });
  return `\nU0 MulDivNativeCheck()\n{//Hardware vectors in the original HolyC build.\n  I64 before=g_pass;\n${statements.join("\n")}\n  Check("muldiv native count",g_pass-before,${checks});\n  "muldiv native: %d passed, %d failed\\n",g_pass-before,g_fail;\n}\nMulDivNativeCheck;\n`;
}
