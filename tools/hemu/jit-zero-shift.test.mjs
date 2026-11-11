import assert from 'node:assert/strict';
import {compileHemu} from '../../engine/compile.js';
import {createHemuHost} from '../../engine/host.js';
import * as jit from '../../engine/jit.js';

const SIZE=402653184,PC=4096,DATA=6144,extraSource=`
U64 ShiftAddr(I64 n)
{
  switch (n) {
    case 0:return reg;case 1:return &rfl;case 2:return &rip;
    case 3:return &halted;case 4:return &g_badop;
    case 5:return &msr_fsbase;case 6:return &msr_gsbase;
    case 7:return g_icr_high;
  }
  return 0;
}`;
let checks=0;
for(const sharedMemory of [false,true]) {
  const built=compileHemu({sharedMemory,exports:['InitMem','ShiftAddr'],extraSource}),host=createHemuHost();
  assert.deepEqual(built.warnings,[]);
  if(sharedMemory)host.env.mem=new WebAssembly.Memory({initial:1024,maximum:8192,shared:true});
  const {instance}=await WebAssembly.instantiate(built.bytes,{env:host.env}),ex=instance.exports;
  host.attach(instance);ex.__rt_init();ex.InitMem(BigInt(SIZE));
  const bytes=new Uint8Array(ex.memory.buffer),view=new DataView(bytes.buffer),base=Number(ex.RamBase()),
    a=Array.from({length:8},(_,i)=>Number(ex.ShiftAddr(BigInt(i)))),
    put=(p,v)=>view.setBigUint64(p,BigInt.asUintN(64,BigInt(v)),true),get=p=>view.getBigUint64(p,true);
  let reads=[],writes=[];
  jit.jitState(a[0],a[1],a[2],base,ex.memory,
    (p,s)=>{reads.push([p,s]);return ex.RdMem(p,s);},
    (p,s,v)=>{writes.push([p,s,v]);ex.WrMem(p,s,v);});
  jit.jitSeg(a[5],a[6],0,0,0,0);
  function Reset(code,count,address,operand,segment) {
    bytes.fill(0x6C,base,base+16);
    bytes.fill(0,base+PC,base+PC+128);bytes.set([...code,0xF4],base+PC);
    bytes.fill(0xA5,base+DATA-16,base+DATA+32);bytes.fill(0x5A,base+SIZE-32,base+SIZE+16);
    for(let i=0;i<16;i++)put(a[0]+i*8,0xFEDCBA9876543200n+BigInt(i));
    put(a[0]+8,0x8765432100000000n+BigInt(count));
    if(address!==null&&operand>=0)put(a[0]+operand*8,address-BigInt(segment?DATA:0));
    put(a[1],0xAD7);put(a[2],PC);put(a[3],0);put(a[4],0);
    put(a[5],segment===1?DATA:0);put(a[6],segment===2?DATA:0);put(a[7],0xFEDCBA9876543210n);
    reads=[];writes=[];
  }
  const State=()=>({regs:bytes.slice(a[0],a[0]+128),flags:get(a[1]),rip:get(a[2]),halt:get(a[3]),bad:get(a[4]),icr:get(a[7]),
    low:bytes.slice(base,base+16),data:bytes.slice(base+DATA-16,base+DATA+32),tail:bytes.slice(base+SIZE-32,base+SIZE+16)});
  function Compare(code,count,address,operand,{segment=0,instructions=1}={}) {
    const label=JSON.stringify({sharedMemory,code,count,address:String(address),operand,segment});
    Reset(code,count,address,operand,segment);for(let i=0;i<instructions;i++)ex.Step();const expected=State();
    Reset(code,count,address,operand,segment);jit.jitReset();
    assert.equal(jit.jitCompile(PC),instructions,'compile '+label);
    assert.equal(jit.jitRun(PC),instructions,label);assert.deepEqual(State(),expected,label);
    const device=address!==null&&(address<0n||address>=BigInt(SIZE));
    assert.equal(reads.length,device?1:0,'read exactly once, including a zero count '+label);
    assert.equal(writes.length,device?1:0,'write exactly once, including a zero count '+label);checks++;
  }
  // A zero-count read/modify/write still reaches device memory.
  Compare([0x48,0xC1,0x3B,0],0,0xFEE00310n,3);
  for(const width of [1,2,4,8])for(const op of [4,5,7])for(const count of [0,width===8?64:32,128,192])
    for(const immediate of [true])for(const operand of [3,4,5,9,-1])
      for(const address of [BigInt(DATA),BigInt(SIZE-1),BigInt(SIZE),0x10000001800n,-0x1FFFFCF0n]) {
        const rex=(width===8?8:0)|(operand===9?1:0),code=[...(width===2?[0x66]:[]),...(rex?[0x40|rex]:[]),
          (immediate?0xC0:0xD2)+(width===1?0:1)],field=op<<3;
        if(operand===-1) {
          const disp=new Uint8Array(4),length=code.length+5+(immediate?1:0);
          new DataView(disp.buffer).setInt32(0,Number(BigInt.asIntN(32,address-BigInt(PC+length))),true);code.push(field|5,...disp);
        } else if(operand===4)code.push(field|4,0x24);
        else if(operand===5)code.push(field|0x45,0);
        else code.push(field|(operand&7));
        if(immediate)code.push(count);
        Compare(code,count,operand===-1?BigInt.asIntN(32,address):address,operand);
      }
  for(const width of [1,2,4,8])for(const op of [4,5,7])
    for(const count of [0,width===8?64:32,128,192])for(const operand of [0,1,4,5,9])for(const rexPresent of [false,true]) {
      const rex=(width===8?8:0)|(operand===9?1:0),code=[...(width===2?[0x66]:[]),...(rex||rexPresent?[0x40|rex]:[]),
        width===1?0xC0:0xC1,0xC0|op<<3|(operand&7),count];
      Compare(code,count,null,operand);
      Compare([0x49,0x83,0xC0,1,...code,0x0F,0x90,0xC3],count,null,operand,{instructions:3});
    }
  for(const segment of [1,2])for(const op of [4,5,7])for(const count of [0,64,128]) {
    Compare([segment===1?0x64:0x65,0x48,0xC1,op<<3|3,count],count,0xFEE00310n,3,{segment});
  }
}
console.log(`${checks} zero-count compiled shifts preserve registers, flags, segments and RAM/MMIO read-modify-write effects.`);
