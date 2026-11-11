import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {compileHemu} from "../../engine/compile.js";
import {createHemuHost,CpuFaultText} from "../../engine/host.js";
import * as jit from "../../engine/jit.js";
import {OpcodeOracle} from "./OpcodeOracle.mjs";
import {GuestHarness} from "./GuestHarness.mjs";

const entry=readFileSync(new URL("./DivideEntry.HC",import.meta.url),"latin1"),
  Source=name=>Buffer.from(readFileSync(new URL(name,import.meta.url),"latin1").replace('#include "DivideEntry"',entry),"latin1"),
  source=Source("./DivideNative.HC"),gateSource=Source("./DivideGate.HC"),catchSource=Source("./DivideCatch.HC"),
  Hash=source=>createHash("sha256").update(source).digest("hex"),hash=Hash(source),
  file=new URL("./divide-native.json",import.meta.url);
if(process.argv.includes("--record")) {
  assert.ok(process.env.HOLYC_QEMU_ORACLE,"Set HOLYC_QEMU_ORACLE to HolyC-wasm/tests/oracle/Qemu.mjs");
  const {QemuRun}=await import(pathToFileURL(process.env.HOLYC_QEMU_ORACLE)),
    result=await QemuRun([source,gateSource,catchSource],{timeout:120}),row=result.results[0];
  for(const row of result.results)assert.equal(row.except,"");
  assert.equal(row.out.trim().split("\n").length,1536);
  writeFileSync(file,JSON.stringify({backend:result.backend,sourceHash:hash,out:row.out,gateHash:Hash(gateSource),gate:result.results[1].out,catchHash:Hash(catchSource),caught:result.results[2].out},null,2)+"\n");
  console.log("Native divide frame:",result.evidence);
}
const expected=JSON.parse(readFileSync(file,"utf8"));
assert.equal(hash,expected.sourceHash,"regenerate original V5.03 evidence after changing the probe");
assert.equal(Hash(gateSource),expected.gateHash);assert.equal(Hash(catchSource),expected.catchHash);
const hardware=OpcodeOracle("divide");
assert.equal(hardware.length,48);
for(const row of hardware) {
  const [size,sign,kind,seed,...words]=row.split(" "),
    [a,d,divisor,trap,err,rip,flags,outA,outD,code]=words.map(s=>BigInt("0x"+s));
  assert.equal(trap,0n);assert.equal(err,0n);assert.equal(rip,0n);
  assert.equal(flags,(seed==="1"?0xAD7n:0x202n)|0x10000n);
  assert.equal(a,outA);assert.equal(d,outD);assert.equal(code,1n);
}
const c=compileHemu({exports:["InitMem","DivBegin","DivAddr"],extraSource:`
U0 DivBegin(U64 a,U64 d,U64 divisor,U64 flags,U64 sp,I64 gate)
{
  I64 i;
  for (i=0;i<16;i++) reg[i]=0xA123456789ABC000+i;
  reg[0]=a;reg[2]=d;reg[1]=divisor;reg[4]=sp;
  rip=4096;rfl=flags;halted=0;g_badop=0;
  msr_efer=0x500;cr0=1;g_cs=0x40;g_ss=0x60;
  idtr_base=0x3000;idtr_limit=4095;
  gdtr_base=0x4000;gdtr_limit=255;
  WrMem(idtr_base,8,0x5000|0x40<<16|(0x8E+gate)<<40);
  WrMem(idtr_base+8,8,0);
  WrMem(gdtr_base+0x40,8,0xAF9B000000FFFF);
}
U64 DivAddr(I64 i)
{
  switch (i) {
    case 0:return reg;case 1:return &rfl;case 2:return &rip;
    case 3:return &halted;case 4:return &g_cs;case 5:return &g_ss;
    case 6:return &idtr_base;case 7:return &idtr_limit;
    case 8:return &gdtr_base;case 9:return &gdtr_limit;
    case 10:return &cr0;case 11:return &msr_efer;
  }
  return 0;
}`});
assert.deepEqual(c.warnings,[]);
const host=createHemuHost(),{instance}=await WebAssembly.instantiate(c.bytes,{env:host.env}),ex=instance.exports;
host.attach(instance);ex.__rt_init();ex.InitMem(65536n);
const base=Number(ex.RamBase()),bytes=new Uint8Array(ex.memory.buffer),dv=new DataView(bytes.buffer),
  a=Array.from({length:12},(_,i)=>Number(ex.DivAddr(BigInt(i)))),
  Get=addr=>dv.getBigUint64(addr,true),Put=(addr,value)=>dv.setBigUint64(addr,BigInt.asUintN(64,BigInt(value)),true),
  Code=(size,sign)=>[...(size===2?[0x66]:size===8?[0x48]:[]),size===1?0xF6:0xF7,0xF1+sign*8],
  State=()=>({regs:bytes.slice(a[0],a[0]+128),flags:Get(a[1]),rip:Get(a[2]),halted:Get(a[3]),cs:Get(a[4]),ss:Get(a[5])});
jit.jitState(a[0],a[1],a[2],base,ex.memory,ex.RdMem,ex.WrMem);
let cases=0;
for(const row of expected.out.trim().split("\n")) {
  const v=row.split(" "),[id,size,sign,kind,align,gate,seed,delta,ipDelta,spDelta]=v.slice(0,10).map(Number),
    [rax,rdx,rcx,entryFlags,cs,savedFlags,ss]=v.slice(10).map(s=>BigInt("0x"+s)),
    flags=seed?0xED7n:2n,sp=0xA000n+BigInt(align)-8n,code=Code(size,sign);
  assert.equal(ipDelta,0);assert.equal(spDelta,0);assert.equal(cs,0x40n);assert.equal(ss,0x60n);
  for(const compiled of [false,true]) {
    ex.DivBegin(rax,rdx,rcx,flags,sp,BigInt(gate));
    bytes.fill(0xA5,base+0x9F00,base+0xA100);bytes.set([...code,0xF4],base+4096);
    const regs=bytes.slice(a[0],a[0]+128),saved=new DataView(regs.buffer),frame=sp+BigInt(delta);
    saved.setBigUint64(32,frame,true);
    if(compiled){jit.jitReset();assert.equal(jit.jitCompile(4096),1);assert.equal(jit.jitRun(4096),0);}
    ex.Step();
    const label=`#DE case ${id}, width=${size}, signed=${sign}, kind=${kind}, compiled=${compiled}`;
    assert.equal(Get(a[3]),0n,label);assert.equal(Get(a[2]),0x5000n,label);
    assert.equal(Get(a[1]),entryFlags,label);assert.equal(Get(a[4]),cs,label);assert.equal(Get(a[5]),ss,label);
    assert.deepEqual(bytes.slice(a[0],a[0]+128),regs,label);
    const actual=Array.from({length:5},(_,i)=>Get(base+Number(frame)+i*8));
    assert.deepEqual(actual,[4096n,cs,savedFlags,sp,ss],label);
    const lo=base+Number(frame),hi=base+Number((sp&~15n));
    assert.ok(bytes.slice(base+0x9F00,lo).every(n=>n===0xA5),"no error-code slot below RIP");
    assert.ok(bytes.slice(hi,base+0xA100).every(n=>n===0xA5),"alignment gap and old stack remain intact");
    cases++;
  }
}
const invalid=[
  ["not long mode",()=>Put(a[11],0)], ["not protected mode",()=>Put(a[10],0)],
  ["privilege transition",()=>Put(a[4],0x43)], ["nonzero SS RPL",()=>Put(a[5],0x63)],
  ["short IDT",()=>Put(a[7],14)], ["IDT past RAM",()=>Put(a[6],65536)],
  ["IDT straddles RAM",()=>Put(a[6],65528)], ["IDT wraps",()=>Put(a[6],-8)],
  ["absent gate",()=>bytes[base+0x3005]=0x0E], ["system bit",()=>bytes[base+0x3005]=0x9E],
  ["legacy gate",()=>bytes[base+0x3005]=0x86], ["IST switch",()=>bytes[base+0x3004]=1],
  ["reserved IST bits",()=>bytes[base+0x3004]=0x80], ["reserved gate word",()=>bytes[base+0x300C]=1],
  ["null selector",()=>dv.setUint16(base+0x3002,0,true)], ["LDT selector",()=>dv.setUint16(base+0x3002,0x44,true)],
  ["different code selector",()=>{Put(base+0x4048,Get(base+0x4040));dv.setUint16(base+0x3002,0x48,true);}],
  ["short GDT",()=>Put(a[9],6)], ["descriptor beyond GDT",()=>Put(a[9],0x46)],
  ["GDT past RAM",()=>Put(a[8],65536)], ["GDT straddles RAM",()=>Put(a[8],65500)],
  ["absent code",()=>bytes[base+0x4045]=0x1B], ["data segment",()=>bytes[base+0x4045]=0x93],
  ["system segment",()=>bytes[base+0x4045]=0x8B], ["ring3 code",()=>bytes[base+0x4045]=0xFB],
  ["legacy code",()=>bytes[base+0x4046]=0xCF], ["invalid L/D",()=>bytes[base+0x4046]=0xEF],
  ["handler past RAM",()=>Put(base+0x3008,1)], ["no stack room",()=>Put(a[0]+32,39)],
  ["stack past RAM",()=>Put(a[0]+32,65537)]
];
for(const [label,change]of invalid) {
  ex.DivBegin(17n,0n,0n,0xED7n,0xA001n,0n);bytes.set(Code(8,0),base+4096);
  change();const before=State(),ram=bytes.slice(base,base+65536);ex.Step();
  assert.deepEqual(State(),{...before,halted:3n},label);
  assert.deepEqual(bytes.slice(base,base+65536),ram,label);
  assert.match(CpuFaultText(ex),/CPU 0 stopped.*divide.*could not be delivered.*0x1000/,label);
}
console.log(`${cases} original-QEMU divide exception frames match interpreter/JIT; ${invalid.length} unsupported delivery cases remain stopped without operand or RAM writes.`);

let chains=0,limits=0;
for(const size of [1,2,4,8])for(const sign of [0,1])for(const seed of [2n,0xED7n]) {
  const prefix=[0x48,0x39,0xD0,0x48,0xFF,0xC6],code=Code(size,sign),
    Begin=()=>{
      ex.DivBegin(17n,0n,0n,seed,0xA003n,0n);
      bytes.fill(0xA5,base+0x9F00,base+0xA100);
      bytes.set([...prefix,...code,0xF4],base+4096);
    };
  Begin();ex.Step();ex.Step();ex.Step();
  const expectedState=State(),frame=bytes.slice(base+0x9F00,base+0xA100);
  Begin();jit.jitReset();assert.equal(jit.jitCompile(4096),3);
  assert.equal(jit.jitRun(4096),2,"only the successful prefix executes before #DE fallback");
  assert.equal(Get(a[2]),BigInt(4096+prefix.length));ex.Step();
  assert.deepEqual(State(),expectedState,"deferred flags and prefix registers survive the fault exit");
  assert.deepEqual(bytes.slice(base+0x9F00,base+0xA100),frame);
  assert.equal(Get(base+Number(Get(a[0]+32))),BigInt(4096+prefix.length),"saved RIP includes the divide operand-size prefix");
  chains++;
}
const groups=new Map();
for(const row of OpcodeOracle("muldiv")) {
  const fields=row.split(" "),[op,size]=fields.map(Number);
  if(op<5||fields[6]!=="0")continue;
  const key=op+"/"+size;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(fields);
}
for(const [key,rows]of groups) {
  const [op,size]=key.split("/").map(Number),sign=op===6?1:0,
    Quot=row=>(sign?BigInt.asIntN:BigInt.asUintN)(size*8,BigInt("0x"+row[7])),
    sorted=rows.toSorted((x,y)=>Quot(x)<Quot(y)?-1:Quot(x)>Quot(y)?1:0),
    witnesses=new Set([sorted[0],sorted.at(-1),rows[0],rows.at(-1)]);
  for(const row of witnesses)for(const compiled of [false,true]) {
    const [,,seed,rax,rdx,divisor,,outA,outD]=row,code=Code(size,sign);
    ex.DivBegin(BigInt("0x"+rax),BigInt("0x"+rdx),BigInt("0x"+divisor),seed==="0"?0x202n:0xAD7n,0xA003n,0n);
    bytes.set([...code,0xF4],base+4096);
    const before=State(),ram=bytes.slice(base,base+65536),regs=new DataView(before.regs.buffer);
    regs.setBigUint64(0,BigInt("0x"+outA),true);regs.setBigUint64(16,BigInt("0x"+outD),true);
    if(compiled){jit.jitReset();assert.equal(jit.jitCompile(4096),1);}
    if(!compiled||!jit.jitRun(4096))ex.Step();
    assert.deepEqual(State(),{...before,rip:BigInt(4096+code.length)},"in-range quotient must not enter a valid #DE gate");
    assert.deepEqual(bytes.slice(base,base+65536),ram);limits++;
  }
}
console.log(`${chains} JIT prefix/flag chains and ${limits} hardware quotient-limit cases pass with a valid exception gate.`);

const h=await GuestHarness();
await h.Exec(gateSource.toString("latin1"));
let ptr=Number(h.ex.GuestVar(h.Name("divide_gate_res"))),view=new DataView(h.ex.memory.buffer),out="";
for(let i=0;i<3;i++) {
  const words=Array.from({length:3},(_,j)=>view.getBigUint64(h.base+ptr+(i*3+j)*8,true).toString(16).toUpperCase().padStart(16,"0"));
  out+=i+" "+words.join(" ")+"\n";
}
assert.equal(out,expected.gate,"real guest gate DPL, selector RPL and accessed bit match QEMU");
await h.Exec(catchSource.toString("latin1"));
ptr=Number(h.ex.GuestVar(h.Name("divide_caught")));view=new DataView(h.ex.memory.buffer);
out=Array.from({length:4},(_,i)=>view.getBigUint64(h.base+ptr+i*8,true).toString(16).toUpperCase().padStart(16,"0")).join(" ")+"\n";
assert.equal(out,expected.caught,"native IntDivZero reaches task catch and normal execution resumes");
console.log(`${hardware.length} host SIGFPE contexts and native guest gate/catch behavior agree with the independent hardware and QEMU oracles.`);
