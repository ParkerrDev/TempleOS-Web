import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {OpcodeOracle} from "./OpcodeOracle.mjs";
import {compileHemu} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";
import * as jit from "../../engine/jit.js";
import {CoreBus} from "../../engine/CoreBus.js";

const source=readFileSync(new URL("./AtomSplit.HC",import.meta.url)),
  sourceHash=createHash("sha256").update(source).digest("hex"),
  file=new URL("./atom-split-native.json",import.meta.url);
if(process.argv.includes("--record")) {
  assert.ok(process.env.HOLYC_QEMU_ORACLE,"Set HOLYC_QEMU_ORACLE to HolyC-wasm/tests/oracle/Qemu.mjs");
  const {QemuRun}=await import(pathToFileURL(process.env.HOLYC_QEMU_ORACLE)),
    result=await QemuRun([source],{timeout:120}),row=result.results[0];
  assert.equal(row.except,"");assert.equal(row.out.trim().split("\n").length,516);
  writeFileSync(file,JSON.stringify({backend:result.backend,sourceHash,out:row.out},null,2)+"\n");
  console.log("Native cross-word atomics:",result.evidence);
}
const expected=JSON.parse(readFileSync(file,"utf8")),physical=OpcodeOracle("atom-split");
assert.equal(sourceHash,expected.sourceHash,"regenerate original V5.03 evidence after changing the probe");
assert.equal(physical.length,387);
const lines=expected.out.trim().split("\n"),hardware=new Map(physical.map(row=>[row.split(" ").slice(0,4).join(" "),row]));
assert.equal(lines.length,516);assert.equal(hardware.size,387);
for(const row of lines) {
  const fields=row.split(" ");
  if(Number(fields[2])<63)assert.equal(row,hardware.get(fields.slice(0,4).join(" ")));
}
console.log("516 original TempleOS split-field cases recorded; all 387 within-line cases also match physical x86-64.");

let checks=0,rejected=0,coordinatedChecks=0,callbacks=[],executing=false;
for(const mode of ["private","shared","coordinated"]) {
  const sharedMemory=mode!=="private",coordinated=mode==="coordinated";
  const c=compileHemu({sharedMemory,exports:["InitMem","SplitBegin","SplitAddr"],extraSource:`
U0 SplitBegin(U64 acc,U64 arg,U64 flags,U64 addr,I64 cores)
{
  I64 i;
  for (i=0;i<16;i++) reg[i]=0xA123456789ABC000+i;
  reg[0]=acc;reg[2]=arg;reg[3]=0x0123456789ABCDEF;
  reg[1]=0xFEDCBA9876543210;reg[7]=addr;
  rip=4096;rfl=flags;halted=g_badop=0;g_ncore=cores;
  pic1_base=0x20;pic1_mask=pic1_isr=0;pic1_irr=1;irq_count=0;
}
U64 SplitAddr(I64 n)
{
  switch (n) {
    case 0:return reg;case 1:return &rfl;case 2:return &rip;
    case 3:return &halted;case 4:return &irq_count;
    case 5:return &pic1_irr;case 6:return &mem_size;
  }
  return 0;
}`}),host=createHemuHost();
  assert.deepEqual(c.warnings,[]);
  if(sharedMemory)host.env.mem=new WebAssembly.Memory({initial:1024,maximum:8192,shared:true});
  let bus;
  if(coordinated) {
    const ctrl=new Int32Array(new SharedArrayBuffer(64));
    for(let core=0;core<4;core++) {
      const owner=CoreBus(ctrl,core,4);owner.Join({polling:true});
      if(!core)bus=owner;
    }
    Object.assign(host.env,bus.Imports());
  }
  for(const [name,fn]of Object.entries(host.env))if(typeof fn==="function")
    host.env[name]=(...args)=>{if(executing)callbacks.push(name);return fn(...args);};
  const {instance}=await WebAssembly.instantiate(c.bytes,{env:host.env}),ex=(bus?bus.Guard(instance):instance).exports;
  host.attach(instance);ex.__rt_init();ex.InitMem(65536n);
  const base=Number(ex.RamBase()),mem=new Uint8Array(ex.memory.buffer),dv=new DataView(mem.buffer),
    at=Array.from({length:7},(_,i)=>Number(ex.SplitAddr(BigInt(i)))),
    Get=a=>dv.getBigUint64(a,true),Put=(a,v)=>dv.setBigUint64(a,BigInt.asUintN(64,v),true),
    State=()=>({regs:mem.slice(at[0],at[0]+128),flags:Get(at[1]),rip:Get(at[2]),halted:Get(at[3])});
  jit.jitState(at[0],at[1],at[2],base,ex.memory,ex.RdMem,ex.WrMem);
  for(const row of lines) {
    const fields=row.split(" "),[size,op,offset,seed]=fields.slice(0,4).map(Number),
      expected=fields.slice(4,9).map(w=>BigInt("0x"+w)),expectedMem=Buffer.from(fields[9],"hex"),
      mask=(1n<<BigInt(size*8))-1n,sign=1n<<BigInt(size*8-1),
      value=seed===1?sign-1n:seed===2?mask:0n,
      arg=op===14?0xD123456700000000n|(value>>32n):seed===1?1n:seed===2?0x12345678n&mask:mask;
    let acc=seed===2?value:BigInt.asUintN(64,~value);
    if(op===14)acc=0xA123456700000000n|(acc&0xFFFFFFFFn);
    const body=op<7?[op*8+1,0x17]:op<=10?[op<=8?0xFF:0xF7,7+(op-7)*8]:
      op===11?[0x87,0x17]:[0x0F,op===12?0xC1:op===13?0xB1:0xC7,op===14?0x0F:0x17],
      code=[...(op===11?[]:[0xF0]),...(size===2?[0x66]:size===8&&op!==14?[0x48]:[]),...body];
    for(const cores of [1,4])for(const compiled of [false,true])for(const alias of [false,true]) {
      const addr=0x3000+offset,prefix=compiled?[0x4D,0x8D,0x40,1]:[],
        address=BigInt(addr)+(alias?0x10000000000n:0n);
      ex.SplitBegin(acc,arg,seed===1?0xAD7n:0x202n,address,BigInt(cores));
      mem.fill(0xA5,base+0x2FC0,base+0x3100);
      for(let i=0;i<128;i++)mem[base+0x3000+i]=(i*29+seed*137)&255;
      Put(base+addr,value);mem.set([...prefix,...code,0xF4],base+4096);
      const before=State(),guard=mem.slice(base+0x2FC0,base+0x3100),outRegs=new DataView(before.regs.buffer);
      if(compiled)outRegs.setBigUint64(64,Get(at[0]+64)+1n,true);
      callbacks=[];executing=true;
      try {
        if(compiled) {
          jit.jitReset();assert.equal(jit.jitCompile(4096),1,"LOCK and memory XCHG end the compiled prefix");
          assert.equal(jit.jitRun(4096),1);
        }
        ex.Step();
      } finally {executing=false;}
      const label=`${mode} cores=${cores} jit=${compiled} alias=${alias} ${row}`;
      assert.deepEqual(callbacks,cores===1?[]:coordinated?["__bus_lock","__bus_unlock"]:["__bus_lock"],
        "single-core RAM RMW has no host callbacks; coordinated SMP owns the complete RMW");
      assert.equal(Get(at[4]),0n,"pending interrupt is deferred until the instruction finishes");
      assert.equal(Get(at[5]),1n);
      if(cores===4&&!coordinated) {
        assert.deepEqual(State(),{...before,rip:BigInt(4096+prefix.length+code.length),halted:2n},label);
        assert.deepEqual(mem.slice(base+0x2FC0,base+0x3100),guard,label);rejected++;
      } else {
        assert.equal(Get(at[3]),0n,label);
        for(const [index,v]of [[0,expected[0]],[2,expected[1]],[3,expected[2]],[1,expected[3]]])outRegs.setBigUint64(index*8,v,true);
        assert.deepEqual(mem.slice(at[0],at[0]+128),before.regs,label);
        assert.equal(Get(at[1])&([1,4,6].includes(op)?0xEC5n:0xED5n),expected[4],label);
        assert.equal(Get(at[2]),BigInt(4096+prefix.length+code.length),label);
        assert.deepEqual(Buffer.from(mem.slice(base+addr-8,base+addr+16)),expectedMem,label);
        if(cores===4)coordinatedChecks++;else checks++;
      }
    }
  }
  for(const cores of [1,4]) {
    ex.SplitBegin(11n,12n,0xAD7n,65533n,BigInt(cores));Put(at[6],65535n);
    mem.fill(0xA5,base+65520,base+65536);dv.setUint16(base+65533,0x1234,true);
    mem.set([0xF0,0x66,0xFF,0x07],base+4096);
    const before=mem.slice(base+65520,base+65536);ex.Step();
    if(cores===1||coordinated){before[13]=0x35;assert.equal(Get(at[3]),0n);}
    else assert.equal(Get(at[3]),2n);
    assert.deepEqual(mem.slice(base+65520,base+65536),before,"the valid tail field preserves the byte beyond guest RAM");
  }
  Put(at[6],65536n);
  for(const address of [65535n,65536n,0xFED00000n,0x1000000FFFFn,0xFFFFFFFFFFFFFFFFn]) {
    ex.SplitBegin(11n,12n,0xAD7n,address,1n);
    mem.set([0xF0,0x66,0xFF,0x07],base+4096);
    const before=State(),ram=mem.slice(base,base+65536);ex.Step();
    assert.deepEqual(State(),{...before,rip:4100n,halted:2n},"single-core unsupported address "+address);
    assert.deepEqual(mem.slice(base,base+65536),ram);
  }
}
console.log(`${checks} single-core and ${coordinatedChecks} coordinated four-core native split-field comparisons pass; ${rejected} uncoordinated attempts retain faults without writes. Pending IRQs remain deferred through complete instruction retirement.`);
