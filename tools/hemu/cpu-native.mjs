import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {hemuFile,compileHemu} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";
const adapter=readFileSync(new URL("./CpuNativeHost.HC",import.meta.url),"latin1"),
  expand=source=>source.replace(/#include "([^"]+)"/g,(_,name)=>
    name==="host.HC"?adapter:expand(hemuFile(name))),
  source=expand(hemuFile("test.HC"))+muldivSource()+atomSource()+stackSource()+cpuIdSource(),
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
const compiled=compileHemu({filename:"test.HC",extraSource:muldivSource()+atomSource()+stackSource()+cpuIdSource()});assert.deepEqual(compiled.warnings,[]);
let output="";
const host=createHemuHost({onText:text=>output+=text}),
  {instance}=await WebAssembly.instantiate(compiled.bytes,{env:host.env});
host.attach(instance);instance.exports.__rt_init();instance.exports.__main();
assert.equal(output,expected.out);
const total=Number(expected.out.match(/total guest instr=(\d+)/)[1]);
console.log(`Full interpreter source compiles natively: 31 battery checks, multiply/divide, stack, split-field atomic and CPUID vectors, and ${total.toLocaleString()} executed battery instructions agree in original V5.03 and WASM; zero badops.`);

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

function atomSource() {
  const rows=JSON.parse(readFileSync(new URL("./atom-split-native.json",import.meta.url),"utf8")).out.trim().split("\n"),
    statements=[],Hex=n=>"0x"+BigInt.asUintN(64,n).toString(16).toUpperCase();
  let checks=0;
  for(const [index,row]of rows.entries()) {
    const fields=row.split(" "),[size,op,offset,seed]=fields.slice(0,4).map(Number);
    if(!(offset===7&&seed===1||offset===63&&seed===2))continue;
    const mask=(1n<<BigInt(size*8))-1n,sign=1n<<BigInt(size*8-1),
      value=seed===1?sign-1n:mask,arg=op===14?0xD123456700000000n|(value>>32n):seed===1?1n:0x12345678n&mask,
      bits=seed===1?~value:value,acc=op===14?0xA123456700000000n|(bits&0xFFFFFFFFn):bits,
      body=op<7?[op*8+1,0x17]:op<=10?[op<=8?0xFF:0xF7,7+(op-7)*8]:
        op===11?[0x87,0x17]:[0x0F,op===12?0xC1:op===13?0xB1:0xC7,op===14?0x0F:0x17],
      code=[...(op===11?[]:[0xF0]),...(size===2?[0x66]:size===8&&op!==14?[0x48]:[]),...body],
      encoded=code.reduce((n,byte,i)=>n|BigInt(byte)<<BigInt(i*8),0n),bytes=Buffer.from(fields[9],"hex"),addr=0x3000+offset;
    statements.push("  MemSet(mem+0x2FC0,0xA5,320);",
      `  for (i=0;i<128;i++) mem[0x3000+i]=i*29+${seed*137};`,
      `  WrMem(${addr},8,${Hex(value)});WrMem(4096,8,${Hex(encoded)});`,
      `  rip=4096;halted=0;rfl=${seed===1?"0xAD7":"0x202"};`,
      `  reg[0]=${Hex(acc)};reg[2]=${Hex(arg)};reg[7]=${addr};`,
      "  reg[3]=0x0123456789ABCDEF;reg[1]=0xFEDCBA9876543210;Step;");
    for(const [reg,at]of [[0,4],[2,5],[3,6],[1,7]])statements.push(`  Check("atom ${index} R${reg}",reg[${reg}],0x${fields[at]});`);
    statements.push(`  Check("atom ${index} flags",rfl&${[1,4,6].includes(op)?"0xEC5":"0xED5"},0x${fields[8]});`);
    for(let i=0;i<3;i++)statements.push(`  Check("atom ${index} mem${i}",RdMem(${addr-8+i*8},8),${Hex(bytes.readBigUInt64LE(i*8))});`);
    statements.push(`  Check("atom ${index} stop",halted,0);`, `  Check("atom ${index} RIP",rip,${4096+code.length});`);
    checks+=10;
  }
  return `\nU0 AtomSplitNativeCheck()\n{//Native x86 split fields in the original HolyC interpreter build.\n  I64 i,before=g_pass;\n  g_ncore=1;\n${statements.join("\n")}\n  Check("atom split native count",g_pass-before,${checks});\n  "atom split native: %d passed, %d failed\\n",g_pass-before,g_fail;\n}\nAtomSplitNativeCheck;\n`;
}

function stackSource() {
  const rows=readFileSync(new URL("./stack-oracle.txt",import.meta.url),"utf8").trim().split("\n"),
    statements=[],Hex=n=>"0x"+BigInt.asUintN(64,n).toString(16).toUpperCase();
  for(const row of rows) {
    const [id,sp,codeHex,...fields]=row.split(" "),
      [rsp,rax,rbp,flags,rip,r12]=fields.slice(0,6).map(n=>BigInt("0x"+n)),
      before=Buffer.from(fields[6],"hex"),after=Buffer.from(fields[7],"hex"),
      code=Buffer.from(codeHex,"hex"),encoded=[...code].reduce((n,b,i)=>n|BigInt(b)<<BigInt(i*8),0n);
    statements.push("  MemSet(mem+0x1000000,0xA5,640);",
      "  for (i=0;i<80;i++) want[i]=0xA5A5A5A5A5A5A5A5;");
    for(let i=0;i<80;i++) {
      const b=before.readBigUInt64LE(i*8),a=after.readBigUInt64LE(i*8);
      if(b!==0xA5A5A5A5A5A5A5A5n)statements.push(`  WrMem(${0x1000000+i*8},8,${Hex(b)});`);
      if(a!==0xA5A5A5A5A5A5A5A5n)statements.push(`  want[${i}]=${Hex(a)};`);
    }
    statements.push(`  WrMem(0x1000400,8,${Hex(encoded)});`,
      "  rip=0x1000400;halted=0;rfl=0xAD7;",
      `  reg[0]=0xFEDCBA9876543210;reg[1]=16;reg[12]=0x1000100;\n  reg[4]=${0x1000000+Number(sp)};reg[5]=0x1000180;Step;`,
      `  Check("stack ${id} RSP",reg[4],${Hex(rsp)});`,
      `  Check("stack ${id} RAX",reg[0],${Hex(rax)});`,
      `  Check("stack ${id} RBP",reg[5],${Hex(rbp)});`,
      `  Check("stack ${id} R12",reg[12],${Hex(r12)});`,
      `  Check("stack ${id} flags",rfl&0xED7,${Hex(flags&0xED7n)});`,
      `  Check("stack ${id} target",rip,${Hex(rip)});`,
      `  Check("stack ${id} fault",halted,0);`,
      `  for (i=0;i<80;i++) Check("stack ${id} bytes",RdMem(0x1000000+i*8,8),want[i]);`);
  }
  return `\nU0 StackNativeCheck()\n{//Physical x86 stack vectors in the original HolyC interpreter build.\n  I64 i,before=g_pass;\n  U64 want[80];\n  InitMem(33554432);\n${statements.join("\n")}\n  Check("stack native count",g_pass-before,${rows.length*87});\n  "stack native: %d passed, %d failed\\n",g_pass-before,g_fail;\n}\nStackNativeCheck;\n`;
}

function cpuIdSource() {
  const rows=[
    [0,1,0x756E6547,0x6C65746E,0x49656E69],
    [1,0x6FB,0x10800,0,0x1008331],
    [0x80000000,0x80000001,0,0,0],
    [0x80000001,0,0,0,0x20000000],
    [0x80000008,0,0,0,0]
  ],lines=[];
  for(const [leaf,...outputs] of rows) {
    lines.push(`  reg[0]=0x${leaf.toString(16).toUpperCase()};reg[1]=-1;`,
      "  rip=4096;rfl=0xAD7;halted=0;Step;");
    [0,3,1,2].forEach((reg,i)=>lines.push(`  Check("cpuid R${reg}",reg[${reg}],0x${outputs[i].toString(16).toUpperCase()});`));
    lines.push('  Check("cpuid flags",rfl,0xAD7);');
  }
  return `
U0 CpuIdNativeCheck()
{//Run the same virtual CPU source under the original HolyC compiler.
  I64 before=g_pass;
  g_ncore=1;WrMem(4096,8,0xA20F);
${lines.join("\n")}
  "cpuid native: %d passed, %d failed\\n",g_pass-before,g_fail;
}
CpuIdNativeCheck;
`;
}
