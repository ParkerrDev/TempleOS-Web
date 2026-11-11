import assert from "node:assert/strict";
import {compileHemu} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";
import * as jit from "../../engine/jit.js";

const size=402653184,start=4096,data=6144,compiled=compileHemu({exports:["InitMem","StackMemoryAddr"],extraSource:`
U64 StackMemoryAddr(I64 n)
{
  switch (n) {
    case 0:return mem;case 1:return reg;case 2:return &rfl;
    case 3:return &rip;case 4:return fpr;case 5:return &fsp;
    case 6:return &x87_sw;case 7:return g_icr_high;case 8:return &halted;
    case 9:return &g_cs;case 10:return &g_ss;
  }
  return 0;
}`}),host=createHemuHost(),{instance}=await WebAssembly.instantiate(compiled.bytes,{env:host.env});
assert.deepEqual(compiled.warnings,[]);
host.attach(instance);const ex=instance.exports;ex.__rt_init();ex.InitMem(BigInt(size));
const a=Array.from({length:11},(_,i)=>Number(ex.StackMemoryAddr(BigInt(i)))),
  bytes=new Uint8Array(ex.memory.buffer),view=new DataView(bytes.buffer),
  put=(p,n)=>view.setBigUint64(p,BigInt.asUintN(64,BigInt(n)),true),
  get=p=>view.getBigUint64(p,true);
let callbacks=0;
jit.jitState(a[1],a[2],a[3],a[0],ex.memory,
  (address,width)=>{callbacks++;return ex.RdMem(address,width);},
  (address,width,value)=>{callbacks++;ex.WrMem(address,width,value);});
jit.jitX87(a[4],a[5],a[6]);
function Reset(op,prefix,address,operand=BigInt(data)) {
  bytes.fill(0,a[0]+start,a[0]+start+128);bytes.set([...prefix,...op.code,0xF4],a[0]+start);
  bytes.fill(0xA5,a[0]+data-32,a[0]+data+80);
  bytes.fill(0xA5,a[0]+size-32,a[0]+size+16);
  for(let i=0;i<16;i++)put(a[1]+i*8,0x1234567800000000n+BigInt(i));
  put(a[0]+data,start+64);put(a[0]+data+8,8);put(a[0]+data+16,0xAD7);
  put(a[0]+data+24,data+64);put(a[0]+data+32,16);
  put(a[1]+24,operand);put(a[1]+32,address-BigInt(op.delta||0));
  put(a[1]+40,address);put(a[2],0xAD7);put(a[3],start);
  put(a[5],7);put(a[6],0x41);put(a[7],0);put(a[8],0);
  for(let i=0;i<8;i++)view.setFloat64(a[4]+i*8,i+0.25,true);
  //The compiled IRET path retains the existing flat CS/SS contract.
  const frame=get(a[1]+32)+(prefix[2]===0xC4?8n:0n);
  put(a[9],ex.RdMem(BigInt.asIntN(64,frame+8n),8n));
  put(a[10],ex.RdMem(BigInt.asIntN(64,frame+32n),8n));callbacks=0;
}
function State() {
  return {regs:bytes.slice(a[1],a[1]+128),flags:get(a[2]),rip:get(a[3]),
    fp:bytes.slice(a[4],a[4]+64),top:get(a[5]),sw:get(a[6]),icr:get(a[7]),halt:get(a[8]),
    cs:get(a[9]),ss:get(a[10]),ram:bytes.slice(a[0]+data-32,a[0]+data+80),
    tail:bytes.slice(a[0]+size-32,a[0]+size+16)};
}
const operations=[
  {code:[0x50],delta:-8},{code:[0x54],delta:-8},{code:[0xFF,0xF4],delta:-8},
  {code:[0xFF,0x34,0x24],delta:-8},{code:[0x68,1,2,3,4],delta:-8},{code:[0x6A,0xFF],delta:-8},
  {code:[0x58]},{code:[0x5C]},{code:[0x8F,0xC4]},{code:[0x8F,0x04,0x24]},
  {code:[0x8F,0x44,0x24,8]},{code:[0x8F,0x44,0x24,0xF8]},
  {code:[0x66,0x50],delta:-2},{code:[0x66,0x54],delta:-2},{code:[0x66,0xFF,0x34,0x24],delta:-2},
  {code:[0x66,0x68,0x78,0xF6],delta:-2},{code:[0x66,0x6A,0xA5],delta:-2},
  {code:[0x66,0x58]},{code:[0x66,0x5C]},{code:[0x66,0x8F,0x04,0x24]},
  {code:[0xFF,0xD4],delta:-8},{code:[0xFF,0x54,0x24,0xF8],delta:-8},
  {code:[0xE8,1,0,0,0],delta:-8},{code:[0xC3]},{code:[0xC2,24,0]},
  {code:[0xC9],base:5},{code:[0x66,0xC9],base:5},
  {code:[0x9C],delta:-8},{code:[0x9D]},{code:[0x48,0xCF],span:40}
],prefixes=[[],[0x48,0x83,0xC0,1],[0x48,0x83,0xC4,8],[0xD9,0xE8]],
  addresses=[BigInt(data),0xFEE00030n,0x10000001800n,0xFEE00310n,-0x1FFFFD0n,
    BigInt(size-1),BigInt(size-2),BigInt(size-4),BigInt(size)];
let count=0,fallbacks=0;
for(const op of operations)for(const prefix of prefixes) {
  const before=prefix.length?1:0;
  Reset(op,prefix,BigInt(data));jit.jitReset();
  assert.equal(jit.jitCompile(start),before+1,"ordinary stack operand compiles");
  for(const address of addresses) {
    Reset(op,prefix,address);if(before)ex.Step();const prefixState=State(),
      access=BigInt.asUintN(64,get(a[1]+(op.base||4)*8)+BigInt(op.delta||0)),
      fallback=access>BigInt(size-(op.span||1));
    ex.Step();const expected=State();
    Reset(op,prefix,address);const ran=jit.jitRun(start)&0x3FFFFFFF;
    if(fallback) {
      assert.equal(ran,before,"non-RAM stack returns before the instruction");
      assert.deepEqual(State(),prefixState,"fallback exposes exactly the completed dirty prefix");
      assert.equal(callbacks,0,"no speculative stack/explicit operand callback");
      ex.Step();fallbacks++;
    } else assert.equal(ran,before+1);
    assert.deepEqual(State(),expected,"implicit stack routing "+op.code+" @ "+address+" prefix "+prefix);
    count++;
  }
}
for(const op of [{code:[0xFF,0x33],delta:-8},{code:[0x8F,0x03]},{code:[0xFF,0x13],delta:-8}])
  for(const operand of [0xFEE00030n,0xFEE00310n]) {
    Reset(op,[],BigInt(data),operand);ex.Step();const expected=State();
    Reset(op,[],BigInt(data),operand);jit.jitReset();assert.equal(jit.jitCompile(start),1);
    assert.equal(jit.jitRun(start),1);assert.equal(callbacks,1,"one explicit device operand access");
    assert.deepEqual(State(),expected);count++;
  }
console.log(`${count} implicit stack/device states match Step (${fallbacks} exact-prefix fallbacks), including aliases, boundary spans, dirty SP/FPU prefixes and single explicit device accesses.`);
for(let ext=1;ext<8;ext++)for(const prefix of prefixes) {
  const op={code:[0x8F,0x04|ext<<3,0x24]},before=prefix.length?1:0;
  Reset(op,prefix,0xFEE00310n);if(before)ex.Step();const expected=State();
  ex.Step();const stopped=State();
  assert.equal(stopped.halt,2n);assert.equal(stopped.rip,BigInt(start+prefix.length+op.code.length));
  assert.deepEqual({...stopped,halt:expected.halt,rip:expected.rip},expected,"reserved POP has no operand side effect");
  Reset(op,prefix,0xFEE00310n);jit.jitReset();assert.equal(jit.jitCompile(start),before);
  if(before)assert.equal(jit.jitRun(start),before);
  assert.equal(callbacks,0);ex.Step();assert.deepEqual(State(),stopped);
}
console.log("28 reserved POP encodings retain a stopped state without stack or operand mutation.");
