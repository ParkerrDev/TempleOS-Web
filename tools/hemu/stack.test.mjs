import assert from "node:assert/strict";
import {OpcodeOracle} from "./OpcodeOracle.mjs";
import {compileHemu} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";
import * as jit from "../../engine/jit.js";

const rows=OpcodeOracle("stack"),data=0x1000000,start=data+1024,
  compiled=compileHemu({exports:["InitMem","StackAddr"],extraSource:`
U64 StackAddr(I64 n)
{
  switch (n) {
    case 0:return mem;case 1:return reg;case 2:return &rfl;
    case 3:return &rip;case 4:return &halted;
  }
  return 0;
}`}),host=createHemuHost(),{instance}=await WebAssembly.instantiate(compiled.bytes,{env:host.env});
assert.deepEqual(compiled.warnings,[]);
host.attach(instance);const ex=instance.exports;ex.__rt_init();ex.InitMem(33554432n);
const a=Array.from({length:5},(_,i)=>Number(ex.StackAddr(BigInt(i)))),
  bytes=new Uint8Array(ex.memory.buffer),view=new DataView(bytes.buffer),
  put=(p,n)=>view.setBigUint64(p,BigInt.asUintN(64,BigInt(n)),true),
  get=p=>view.getBigUint64(p,true);
jit.jitState(a[1],a[2],a[3],a[0],ex.memory,ex.RdMem,ex.WrMem);
let count=0,failures=[];
for(const row of rows) {
  const [id,sp,codeHex,...fields]=row.split(" "),
    [rsp,rax,rbp,flags,rip,r12]=fields.slice(0,6).map(n=>BigInt("0x"+n)),
    before=Buffer.from(fields[6],"hex"),after=Buffer.from(fields[7],"hex"),
    code=Buffer.from(codeHex,"hex");
  for(const mode of ["interpreter","compiled"]) {
    bytes.set(before,a[0]+data);bytes.fill(0,a[0]+start,a[0]+start+64);
    bytes.set([...code,0xF4],a[0]+start);
    const expected=Array.from({length:16},(_,i)=>0x1234567800000000n+BigInt(i));
    expected[1]=16n;expected[12]=BigInt(data+256);expected[0]=0xFEDCBA9876543210n;expected[4]=BigInt(data+Number(sp));expected[5]=BigInt(data+384);
    for(let i=0;i<16;i++)put(a[1]+i*8,expected[i]);
    put(a[2],0xAD7);put(a[3],start);put(a[4],0);
    expected[0]=rax;expected[4]=rsp;expected[5]=rbp;expected[12]=r12;
    try {
      if(mode==="compiled") {
        jit.jitReset();assert.equal(jit.jitCompile(start),1,"supported instruction compiles");
        assert.equal(jit.jitRun(start)&0x3FFFFFFF,1,"one instruction retires");
      } else ex.Step();
      assert.deepEqual(Array.from({length:16},(_,i)=>get(a[1]+i*8)),expected,"all registers");
      assert.equal(get(a[2])&0xED7n,flags&0xED7n,"defined flags preserved");
      assert.equal(get(a[3]),rip,"instruction target");assert.equal(get(a[4]),0n,"no fault");
      assert.deepEqual(Buffer.from(bytes.slice(a[0]+data,a[0]+data+640)),after,"stack and neighboring bytes");
    } catch(error) {failures.push(`${mode} case${id} ${codeHex}: ${error.message.split("\n")[0]}`);}
    count++;
  }
}
assert.deepEqual(failures,[]);
console.log(`${count} stack states match physical x86-64: source/destination ordering, 16-bit forms, call targets, return adjustment, flags and neighboring bytes.`);
