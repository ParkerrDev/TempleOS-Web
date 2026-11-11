import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {OpcodeOracle} from "./OpcodeOracle.mjs";
import {compileHemu,hemuFile} from "../../engine/compile.js";
import {createHemuHost} from "../../engine/host.js";
import * as jit from "../../engine/jit.js";
const source=readFileSync(new URL("./CmpWriteNative.HC",import.meta.url)),
  device=readFileSync(new URL("./CmpWriteIpi.HC",import.meta.url)),
  Hash=b=>createHash("sha256").update(b).digest("hex"),file=new URL("./cmpwrite-native.json",import.meta.url);
if(process.argv.includes("--record")) {
  assert.ok(process.env.HOLYC_QEMU_ORACLE,"Set HOLYC_QEMU_ORACLE to the original-TempleOS runner.");
  const {QemuRun}=await import(pathToFileURL(process.env.HOLYC_QEMU_ORACLE)),result=await QemuRun([source,device],{timeout:120});
  for(const row of result.results)assert.equal(row.except,"");
  writeFileSync(file,JSON.stringify({sourceHash:Hash(source),deviceHash:Hash(device),
    backend:result.backend,evidence:result.evidence,out:result.results[0].out,device:result.results[1].out},null,2)+"\n");
}
const native=JSON.parse(readFileSync(file,"utf8")),physical=OpcodeOracle("cmpwrite"),faults=OpcodeOracle("cmpwrite-fault");
assert.equal(Hash(source),native.sourceHash);assert.equal(Hash(device),native.deviceHash);
assert.deepEqual(native.out.trim().split("\n"),physical);assert.equal(physical.length,72);
assert.deepEqual(native.device.trim().split(" ").map(n=>BigInt("0x"+n)),[1n,0xE1n,0xE1n,2n],
  "original APIC self-IPI is issued again by a failed CMPXCHG32 write cycle");
assert.equal(faults.length,40);
for(const line of faults) {
  const f=line.split(" ");
  assert.deepEqual(f.slice(5,8).map(n=>BigInt("0x"+n)),[14n,7n,0n],"read-only pages fault as writes on both outcomes");
}
const Expand=name=>hemuFile(name).replace(/^#include\s+"([^"]+)".*$/gm,(_,child)=>Expand(child));
let instrumented=Expand("snapshot.HC"),writes=[],running=false;
const marker="{//Unaligned little-endian RAM accesses match x86 and WASM loads/stores.";
assert.equal(instrumented.split(marker).length,2);
instrumented='import U0 __cmp_write(U64 addr,I64 size,U64 value);\n'+instrumented.replace(marker,marker+'\n  __cmp_write(a,sz,v);');
const c=compileHemu({source:instrumented,exports:["InitMem","CmpWriteBegin","CmpWriteAddr"],extraSource:`
U0 CmpWriteBegin(U64 ax,U64 dx,U64 bx,U64 cx,U64 flags,U64 addr)
{
  I64 i;
  for (i=0;i<16;i++) reg[i]=0xFEDCBA9876540000+i;
  reg[0]=ax;reg[2]=dx;reg[3]=bx;reg[1]=cx;reg[7]=addr;
  rip=4096;rfl=flags;halted=g_badop=0;g_ncore=4;
  MemSet(g_ipi_pending,0,sizeof(g_ipi_pending));
  g_icr_high[0]=1<<24;
}
U64 CmpWriteAddr(I64 n)
{
  switch (n) {
    case 0:return reg;case 1:return &rfl;case 2:return &rip;
    case 3:return &halted;case 4:return &g_badop;
    case 5:return g_icr_high;case 6:return g_ipi_pending;
  }
  return 0;
}`}),host=createHemuHost();
assert.deepEqual(c.warnings,[]);
host.env.__cmp_write=(addr,size,value)=>{if(running)writes.push([BigInt.asUintN(64,addr),size,BigInt.asUintN(64,value)]);};
const {instance}=await WebAssembly.instantiate(c.bytes,{env:host.env}),ex=instance.exports;
host.attach(instance);ex.__rt_init();ex.InitMem(65536n);
const mem=new Uint8Array(ex.memory.buffer),dv=new DataView(mem.buffer),base=Number(ex.RamBase()),
  at=Array.from({length:7},(_,i)=>Number(ex.CmpWriteAddr(BigInt(i)))),
  Get=p=>dv.getBigUint64(p,true),Put=(p,v)=>dv.setBigUint64(p,BigInt.asUintN(64,v),true);
jit.jitState(at[0],at[1],at[2],base,ex.memory,ex.RdMem,ex.WrMem);
for(const bytes of [[0x0F,0xB1,0x0F],[0x0F,0xC7,0x0F]]) {
  ex.CmpWriteBegin(1n,0n,3n,4n,0xAD7n,0xFEE00300n);
  mem.set(bytes,base+4096);ex.Step();
  assert.equal(Get(at[3]),0n);
  assert.equal(Get(at[6]+8),0x100n,"failed compare must reach the actual emulated ICR command endpoint");
}
let ramCases=0,deviceCases=0;
for(const row of physical) {
  const words=row.split(" "),[kind,size,v,match]=words.slice(0,4).map(Number),
    [value,ax,dx,bx,cx,flags,...want]=words.slice(5).map(n=>BigInt("0x"+n)),
    bytes=[...(size===2?[0x66]:size===8&&kind<2?[0x48]:[]),0x0F,kind===2?0xC7:size===1?0xB0:0xB1,kind===1?0xCA:0x0F],
    addresses=kind===1?[0x3000n]:[0x3000n,0x3001n,0x10000003000n,0x10000003001n];
  if(!v&&!match&&(kind===2||kind===0&&size===4))addresses.push(0xFEE00300n,0xFEE00310n,0x100FEE00300n,0x100FEE00310n);
  for(const address of addresses)for(const compiled of [false,true]) {
    const isDevice=Number(address&0xFFFFFFFFFFn)>=65536,offset=Number(address&0xFFFFFFFFFFn),
      prefix=compiled?[0x4D,0x8D,0x40,1]:[],label=`${address.toString(16)} ${compiled} ${row}`;
    ex.CmpWriteBegin(ax,dx,bx,cx,flags,address);
    mem.fill(0xA5,base+0x2FF0,base+0x3020);Put(base+Number(address&0xFFFFn),value);
    mem.set([...prefix,...bytes,0xF4],base+4096);
    const regs=mem.slice(at[0],at[0]+128),expected=new DataView(regs.buffer),before=mem.slice(base+0x2FF0,base+0x3020);
    if(compiled)expected.setBigUint64(64,Get(at[0]+64)+1n,true);
    writes=[];running=true;
    try {
      if(compiled){jit.jitReset();assert.equal(jit.jitCompile(4096),1);assert.equal(jit.jitRun(4096),1);}
      ex.Step();
    } finally {running=false;}
    assert.equal(Get(at[3]),0n,label);assert.equal(Get(at[4]),0n,label);
    for(const [i,n]of [[0,1],[2,2],[3,3],[1,4]])expected.setBigUint64(i*8,want[n],true);
    assert.deepEqual(mem.slice(at[0],at[0]+128),regs,label);
    assert.equal(Get(at[1])&0xED5n,want[5],label);
    assert.equal(Get(at[2]),BigInt(4096+prefix.length+bytes.length),label);
    assert.deepEqual(writes,kind===1?[]:[[address,BigInt(size),want[0]&((1n<<BigInt(size*8))-1n)]],
      "memory always writes; failed register destinations preserve their upper bits");
    if(isDevice) {
      if((offset&0xFFF)===0x300) {
        assert.equal(Get(at[6]+8),0x100n,"failure writeback queues the old ICR command");
        assert.equal(Get(at[5]),1n<<24n);
      } else {
        assert.equal(Get(at[5]),0n,"failure writeback reaches the destination latch");
        assert.equal(Get(at[6]+8),0n);
      }
      deviceCases++;
    } else {
      assert.equal(Get(base+offset),want[0],label);
      for(let i=0;i<before.length;i++)if(kind===1||i+0x2FF0<offset||i+0x2FF0>=offset+size)
        assert.equal(mem[base+0x2FF0+i],before[i],label);
      ramCases++;
    }
  }
}
console.log(`${ramCases} RAM/register cases match physical and original V5.03; ${deviceCases} real emulated ICR side effects retain the mandatory failure write cycle. Native APIC resend and 40 read-only faults establish independent write evidence; failed register destinations keep their high halves.`);
