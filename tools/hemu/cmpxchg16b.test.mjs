import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {OpcodeOracle} from "./OpcodeOracle.mjs";
import {compileHemu,hemuFile} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";
import {CoreBus} from "../../engine/CoreBus.js";
import * as jit from "../../engine/jit.js";
const source=readFileSync(new URL("./Cmp16Native.HC",import.meta.url)),
  guest=readFileSync(new URL("./Cmp16Guest.HC",import.meta.url)),
  guestHash=createHash("sha256").update(guest).digest("hex"),
  sourceHash=createHash("sha256").update(source).digest("hex"),
  file=new URL("./cmpxchg16b-native.json",import.meta.url);
if(process.argv.includes("--record")) {
  assert.ok(process.env.HOLYC_QEMU_ORACLE,"Set HOLYC_QEMU_ORACLE to the original-TempleOS runner.");
  const {QemuRun}=await import(pathToFileURL(process.env.HOLYC_QEMU_ORACLE)),
    result=await QemuRun([source,guest],{timeout:120}),row=result.results[0];
  assert.equal(row.except,"");assert.equal(result.results[1].except,"");
  writeFileSync(file,JSON.stringify({sourceHash,guestHash,backend:result.backend,evidence:result.evidence,out:row.out},null,2)+"\n");
}
const native=JSON.parse(readFileSync(file,"utf8")),physical=OpcodeOracle("cmpxchg16b"),faults=OpcodeOracle("cmpxchg16b-fault");
assert.equal(sourceHash,native.sourceHash);assert.equal(guestHash,native.guestHash);
assert.deepEqual(native.out.trim().split("\n"),physical);
assert.equal(physical.length,768);assert.equal(faults.length,204);
const Expand=name=>hemuFile(name).replace(/^#include\s+"([^"]+)".*$/gm,(_,child)=>Expand(child));
let instrumented=Expand("snapshot.HC"),writes=[];
const marker="{//Unaligned little-endian RAM accesses match x86 and WASM loads/stores.";
assert.equal(instrumented.split(marker).length,2);
instrumented='import U0 __cmp16_write(U64 addr,I64 size,U64 value);\n'+instrumented.replace(marker,marker+'\n  __cmp16_write(a,sz,v);');
let checked=0,refused=0,callbacks=[],running=false;
for(const mode of ["private","shared","coordinated"]) {
  const c=compileHemu({source:instrumented,sharedMemory:mode!=="private",exports:["InitMem","Cmp16Begin","Cmp16Addr"],extraSource:`
U0 Cmp16Begin(U64 ax,U64 dx,U64 bx,U64 cx,U64 flags,U64 addr,I64 cores)
{
  I64 i;
  for (i=0;i<16;i++) reg[i]=0xFEDCBA9876540000+i;
  reg[0]=ax;reg[2]=dx;reg[3]=bx;reg[1]=cx;reg[7]=addr;
  rip=4096;rfl=flags;halted=g_badop=0;g_ncore=cores;
  pic1_base=0x20;pic1_mask=pic1_isr=0;pic1_irr=1;irq_count=0;
}
U64 Cmp16Addr(I64 n)
{
  switch (n) {
    case 0:return reg;case 1:return &rfl;case 2:return &rip;
    case 3:return &halted;case 4:return &g_badop;
    case 5:return &irq_count;case 6:return &pic1_irr;case 7:return &mem_size;
  }
  return 0;
}`}),host=createHemuHost();
  assert.deepEqual(c.warnings,[]);
  host.env.__cmp16_write=(addr,size,value)=>{if(running)writes.push([addr,size,BigInt.asUintN(64,value)]);};
  if(mode!=="private")host.env.mem=new WebAssembly.Memory({initial:1024,maximum:8192,shared:true});
  let bus;
  if(mode==="coordinated") {
    const ctrl=new Int32Array(new SharedArrayBuffer(64));
    for(let core=0;core<4;core++) {
      const peer=CoreBus(ctrl,core,4);peer.Join({polling:true});if(!core)bus=peer;
    }
    Object.assign(host.env,bus.Imports());
  }
  for(const [name,fn]of Object.entries(host.env))if(typeof fn==="function")host.env[name]=(...args)=>{
    if(running&&name!=="__cmp16_write")callbacks.push(name);return fn(...args);
  };
  const {instance}=await WebAssembly.instantiate(c.bytes,{env:host.env}),ex=(bus?bus.Guard(instance):instance).exports;
  host.attach(instance);ex.__rt_init();ex.InitMem(65536n);
  const mem=new Uint8Array(ex.memory.buffer),view=new DataView(mem.buffer),base=Number(ex.RamBase()),
    at=Array.from({length:8},(_,i)=>Number(ex.Cmp16Addr(BigInt(i)))),
    Get=p=>view.getBigUint64(p,true),Put=(p,v)=>view.setBigUint64(p,BigInt.asUintN(64,v),true);
  jit.jitState(at[0],at[1],at[2],base,ex.memory,ex.RdMem,ex.WrMem);
  for(const row of physical) {
    const [locked,...words]=row.split(" "),lock=locked==="1",v=words.map(w=>BigInt("0x"+w)),
      [lo,hi,ax,dx,bx,cx,flags]=v,want=v.slice(7);
    for(const cores of [1,4])for(const compiled of [false,true])for(const alias of [false,true]) {
      const addr=0x3000n+(alias?0x10000000000n:0n),code=[...(lock?[0xF0]:[]),0x48,0x0F,0xC7,0x0F],
        prefix=compiled?[0x4D,0x8D,0x40,1]:[],label=`${mode} ${cores} ${compiled} ${alias} ${row}`;
      ex.Cmp16Begin(ax,dx,bx,cx,flags,addr,BigInt(cores));
      mem.fill(0xA5,base+0x2FF0,base+0x3020);Put(base+0x3000,lo);Put(base+0x3008,hi);
      mem.set([...prefix,...code,0xF4],base+4096);
      const regs=mem.slice(at[0],at[0]+128),expected=new DataView(regs.buffer),guard=mem.slice(base+0x2FF0,base+0x3020),
        fails=lock&&cores===4&&!bus;
      if(compiled)expected.setBigUint64(64,Get(at[0]+64)+1n,true);
      callbacks=[];writes=[];running=true;
      try {
        if(compiled) {jit.jitReset();assert.equal(jit.jitCompile(4096),1);assert.equal(jit.jitRun(4096),1);}
        ex.Step();
      } finally {running=false;}
      assert.deepEqual(callbacks,lock&&cores===4?(bus?["__bus_lock","__bus_unlock"]:["__bus_lock"]):[],label);
      assert.equal(Get(at[5]),0n,"pending IRQ cannot interrupt the pair");assert.equal(Get(at[6]),1n);
      assert.equal(Get(at[2]),BigInt(4096+prefix.length+code.length),label);
      assert.equal(Get(at[3]),fails?2n:0n,label);assert.equal(Get(at[4]),fails?0xF0n:0n,label);
      assert.deepEqual(writes,fails?[]:[[0x3000n,8n,want[0]],[0x3008n,8n,want[1]]],"both halves receive a write cycle even on mismatch");
      if(fails) {
        assert.deepEqual(mem.slice(base+0x2FF0,base+0x3020),guard,label);
        assert.equal(Get(at[1]),flags,label);refused++;
      } else {
        for(const [i,n]of [[0,2],[2,3],[3,4],[1,5]])expected.setBigUint64(i*8,want[n],true);
        assert.deepEqual([Get(base+0x3000),Get(base+0x3008)],want.slice(0,2),label);
        assert.equal(Get(at[1]),flags&~0x40n|want[6]&0x40n,label);
        assert.deepEqual(mem.slice(base+0x2FF0,base+0x3000),guard.slice(0,16));
        assert.deepEqual(mem.slice(base+0x3010,base+0x3020),guard.slice(32));checked++;
      }
      assert.deepEqual(mem.slice(at[0],at[0]+128),regs,label);
    }
  }
  for(const row of faults) {
    const fields=row.split(" "),[kind,lock,offset,match,seed]=fields.slice(0,5).map(Number),
      frame=fields.slice(5).map(n=>BigInt("0x"+n));
    assert.equal(frame[0],kind===0?13n:kind===1?6n:14n);
    assert.equal(frame[1],kind===2?7n:0n);assert.equal(frame[2],0n);
    //Read-only page faults establish the mandatory failed-compare write cycle.
    //Guest page protections and architectural #GP/#UD/#PF delivery are not implemented here.
    if(kind===2)continue;
    const address=0x3000n+BigInt(offset),flags=seed?0xAD7n:0x202n;
    ex.Cmp16Begin(0xFEDCBA9876543210n^BigInt(match===1),0x8123456789ABCDEFn^BigInt(match===2),1n,2n,flags,address,4n);
    const code=[...(lock?[0xF0]:[]),0x48,0x0F,0xC7,kind===1?0xC8:0x0F];mem.set(code,base+4096);
    const regs=mem.slice(at[0],at[0]+128),ram=mem.slice(base,base+65536);
    callbacks=[];writes=[];running=true;try{ex.Step();}finally{running=false;}
    assert.deepEqual(callbacks,[]);assert.deepEqual(writes,[]);
    assert.equal(Get(at[3]),2n);assert.equal(Get(at[4]),0xF0n);
    assert.deepEqual([0,2,3,1].map(i=>Get(at[0]+i*8)),frame.slice(3,7));
    assert.equal(Get(at[1])&0xED5n,frame[7]);
    assert.deepEqual(mem.slice(at[0],at[0]+128),regs);
    assert.deepEqual(mem.slice(base,base+65536),ram,"faults do not write RAM");
  }
  for(const size of [65536,65535])for(const locked of [false,true])for(const address of [65520n,65536n,0xFED00000n,0x1000000FFF0n]) {
    Put(at[7],BigInt(size));
    ex.Cmp16Begin(1n,2n,3n,4n,0xAD7n,address,4n);
    const code=[...(locked?[0xF0]:[]),0x48,0x0F,0xC7,0x0F];mem.set(code,base+4096);
    Put(base+65520,1n);Put(base+65528,2n);
    const regs=mem.slice(at[0],at[0]+128),ram=mem.slice(base,base+65536),
      valid=(address===65520n||address===0x1000000FFF0n)&&size===65536,
      success=valid&&(!locked||!!bus);
    callbacks=[];writes=[];running=true;try{ex.Step();}finally{running=false;}
    assert.equal(Get(at[3]),success?0n:2n,"complete aligned span validation");
    assert.deepEqual(writes,success?[[65520n,8n,3n],[65528n,8n,4n]]:[]);
    assert.deepEqual(callbacks,valid&&locked?(bus?["__bus_lock","__bus_unlock"]:["__bus_lock"]):[]);
    if(!success) {
      assert.deepEqual(mem.slice(at[0],at[0]+128),regs);assert.equal(Get(at[1]),0xAD7n);
      assert.deepEqual(mem.slice(base,base+65536),ram);
    }
  }
  Put(at[7],65536n);
  for(const code of [[0x48,0x0F,0xC7,0xC8],[0xF0,0x48,0x0F,0xC7,0xC8],[0x48,0x0F,0xC7,0x17]]) {
    ex.Cmp16Begin(1n,2n,3n,4n,0xAD7n,0x3000n,4n);mem.set(code,base+4096);
    const regs=mem.slice(at[0],at[0]+128),ram=mem.slice(base,base+65536);
    ex.Step();assert.equal(Get(at[3]),2n);assert.equal(Get(at[4]),0xF0n);
    assert.deepEqual(mem.slice(at[0],at[0]+128),regs);assert.equal(Get(at[1]),0xAD7n);
    assert.deepEqual(mem.slice(base,base+65536),ram);
  }
}
console.log(`${checked} CMPXCHG16B comparisons match 768 independent physical/native cases; ${refused} uncoordinated locked attempts refuse without writes. 204 physical fault frames retain evidence for alignment, register forms and mismatch write cycles; architectural #GP/#UD/#PF delivery remains outside this bounded RAM path.`);
