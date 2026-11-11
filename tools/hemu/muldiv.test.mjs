import assert from "node:assert/strict";
import {OpcodeOracle} from "./OpcodeOracle.mjs";
import {compileHemu} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";
import * as jit from "../../engine/jit.js";

const c=compileHemu({exports:["InitMem","MulDivBegin","MulDivProbe"],extraSource:`
U0 MulDivBegin(U64 a,U64 d,U64 b,U64 flags)
{
  I64 i;
  for (i=0;i<16;i++) reg[i]=0xA123456789ABC000+i;
  reg[0]=a;reg[2]=d;reg[1]=b;reg[3]=0x3003;
  rfl=flags;rip=4096;halted=0;g_badop=0;
}
U64 MulDivProbe(I64 n)
{
  switch (n) {
    case 0:return reg;case 1:return &rfl;case 2:return &rip;
    case 3:return halted;case 4:return g_badop;
  }
  return 0;
}`});
assert.deepEqual(c.warnings,[]);
const host=createHemuHost(),{instance}=await WebAssembly.instantiate(c.bytes,{env:host.env}),ex=instance.exports;
host.attach(instance);ex.__rt_init();ex.InitMem(65536n);
const base=Number(ex.RamBase()),bytes=new Uint8Array(ex.memory.buffer),view=new DataView(bytes.buffer),
  addr=Array.from({length:3},(_,i)=>Number(ex.MulDivProbe(BigInt(i)))),
  Get=at=>view.getBigUint64(at,true),groups=new Map();
jit.jitState(addr[0],addr[1],addr[2],base,ex.memory,ex.RdMem,ex.WrMem);
for(const row of OpcodeOracle("muldiv")) {
  const fields=row.split(" "),key=fields.slice(0,2).join("/");
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(fields);
}
let cases=0,faults=0,compiled=0,fallbacks=0;
for(const [key,rows]of groups) {
  const [op,size]=key.split("/").map(Number),prefix=size===2?[0x66]:size===8?[0x48]:[];
  for(const memory of [false,true])for(const translated of [false,true]) {
    let code=[...prefix];
    const rm=memory?3:0xC1;
    if(op===2)code.push(0x0F,0xAF,rm);
    else if(op===3)code.push(0x6B,rm,0xFD);
    else if(op===4)code.push(0x69,rm,...(size===2?[1,1]:[1,1,0,0]));
    else code.push(size===1?0xF6:0xF7,(memory?3:0xC1)+[4,5,0,0,0,6,7][op]*8);
    bytes.set([...code,0xF4],base+4096);jit.jitReset();
    const block=translated?jit.jitCompile(4096):0;
    if(translated){assert.equal(block,1,"multiply/divide instruction compiles");compiled++;}
    for(const row of rows) {
      const [,,seed,low,high,arg,fault,outA,outD,flags]=row,
        initial=seed==="1"?0xAD7n:0x202n,
        a=BigInt("0x"+low),d=BigInt("0x"+high),b=BigInt("0x"+arg);
      ex.MulDivBegin(a,d,b,initial);
      bytes.fill(0xA5,base+0x2FFB,base+0x3013);
      view.setBigUint64(base+0x3003,b,true);
      const untouched=bytes.slice(base+0x2FFB,base+0x3013),regs=bytes.slice(addr[0],addr[0]+128),
        expected=new DataView(regs.buffer);
      expected.setBigUint64(0,BigInt("0x"+outA),true);
      expected.setBigUint64(16,BigInt("0x"+outD),true);
      if(!block||!jit.jitRun(4096)){ex.Step();if(block)fallbacks++;}
      const label=`${key} memory=${memory} jit=${translated} ${row.join(" ")}`;
      assert.equal(ex.MulDivProbe(3n),fault==="1"?3n:0n,label);
      assert.equal(ex.MulDivProbe(4n),0n,label);
      assert.deepEqual(bytes.slice(addr[0],addr[0]+128),regs,label);
      assert.deepEqual(bytes.slice(base+0x2FFB,base+0x3013),untouched,label);
      if(op<5) {
        assert.equal(Get(addr[1])&0x801n,BigInt("0x"+flags),label);
        assert.equal(Get(addr[1])&~0x801n,initial&~0x801n,"HEMU preserves undefined MUL flags: "+label);
      } else assert.equal(Get(addr[1]),initial,"HEMU preserves undefined DIV flags: "+label);
      if(fault==="1")faults++;
      cases++;
    }
  }
}
// Exercise the partial multiply flag writer between deferred full/partial
// writers and readers. Single-op hardware parity alone misses these chains.
let chains=0;
for(const [key,rows]of groups) {
  const [op,size]=key.split("/").map(Number);
  if(op>=5)continue;
  const p=size===2?[0x66]:size===8?[0x48]:[],mul=[...p];
  if(op===2)mul.push(0x0F,0xAF,0xC1);
  else if(op===3)mul.push(0x6B,0xC1,0xFD);
  else if(op===4)mul.push(0x69,0xC1,...(size===2?[1,1]:[1,1,0,0]));
  else mul.push(size===1?0xF6:0xF7,0xC1+(op===0?4:5)*8);
  const cmp=[0x48,0x39,0xC8],inc=[0x48,0xFF,0xC6],
    adc=[0x48,0x83,0xD3,0],clear=[0x48,0x31,0xF6],
    seto=[0x41,0x0F,0x90,0xC0],setb=[0x41,0x0F,0x92,0xC1],
    setz=[0x41,0x0F,0x94,0xC2];
  for(const steps of [[cmp,inc,mul,seto,setb,setz,adc],
    [inc,mul,inc,seto,setb,adc],[mul,mul,seto,setb],
    [mul,clear,seto,setb]]) {
    const code=steps.flat();bytes.set([...code,0xF4],base+4096);
    jit.jitReset();assert.equal(jit.jitCompile(4096),steps.length);
    for(const row of rows.filter((_,i)=>i<8||i%127===0)) {
      const [,,seed,low,high,arg]=row,
        Begin=()=>ex.MulDivBegin(BigInt("0x"+low),BigInt("0x"+high),
          BigInt("0x"+arg),seed==="1"?0xAD7n:0x202n),
        State=()=>({regs:bytes.slice(addr[0],addr[0]+128),flags:Get(addr[1]),rip:Get(addr[2])});
      Begin();for(const _ of steps)ex.Step();const expected=State();
      Begin();assert.equal(jit.jitRun(4096),steps.length);
      assert.deepEqual(State(),expected,`multiply flag chain ${code} ${row.join(" ")}`);
      chains++;
    }
  }
}
let ripCases=0;
for(const size of [2,4,8])for(const op of [0x69,0x6B]) {
  const code=[...(size===2?[0x66]:size===8?[0x48]:[]),op,0x05,0,0,0,0,
    ...(op===0x6B?[0xFD]:size===2?[1,1]:[1,1,0,0])],
    displacement=code.length-(op===0x6B?1:size===2?2:4)-4;
  const encoded=Uint8Array.from(code);
  new DataView(encoded.buffer).setInt32(displacement,0x3003-(4096+code.length),true);
  bytes.set([...encoded,0xF4],base+4096);jit.jitReset();
  assert.equal(jit.jitCompile(4096),1);
  for(const value of [0n,1n,0x12345678n,0x8000000000000000n,0xFFFFFFFFFFFFFFFFn]) {
    const Begin=()=>{
      ex.MulDivBegin(7n,19n,0n,0xAD7n);
      view.setBigUint64(base+0x3003,value,true);
    },State=()=>({regs:bytes.slice(addr[0],addr[0]+128),flags:Get(addr[1]),rip:Get(addr[2])});
    Begin();ex.Step();const expected=State();Begin();assert.equal(jit.jitRun(4096),1);
    assert.deepEqual(State(),expected,"RIP-relative multiply includes its immediate bytes");ripCases++;
  }
}
// Do not speculatively read a device divisor before re-running the instruction
// in HolyC. Preserve the arithmetic prefix, including its flags, on that exit.
let deviceReads=0;
jit.jitState(addr[0],addr[1],addr[2],base,ex.memory,()=>{deviceReads++;return 0n;},ex.WrMem);
const deviceCode=[0x48,0x83,0xC0,1,0x48,0xF7,0x33],
  DeviceStart=()=>{
    ex.MulDivBegin(19n,0n,3n,0xAD7n);
    view.setBigUint64(addr[0]+24,0xFEE00020n,true);
    bytes.set([...deviceCode,0xF4],base+4096);
  },
  DeviceState=()=>({regs:bytes.slice(addr[0],addr[0]+128),flags:Get(addr[1]),rip:Get(addr[2])});
DeviceStart();jit.jitReset();assert.equal(jit.jitCompile(4096),2);
assert.equal(jit.jitRun(4096),1);assert.equal(deviceReads,0);
const prefix=DeviceState();DeviceStart();ex.Step();assert.deepEqual(prefix,DeviceState());
console.log(`${cases} multiply/divide hardware comparisons (${compiled} compiled encodings, ${fallbacks} interpreter fallbacks, ${faults} retained faults, ${chains} deferred flag chains, ${ripCases} RIP-relative operands): full registers, defined flags, byte pairs and quotient limits.`);
