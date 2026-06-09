// Differential test for the hemu JIT: boot hemu (so __jit_state hands over the CPU-state offsets),
// then JIT-compile + run a hand-built x86 block and check the resulting reg state.
import { compileHolyC } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/compiler.js";
import { createHost } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/runtime/host.js";
import * as jit from "/Users/parkerh/Dev/TempleOS-wasm/jit.js";
import { makeQcow2 } from "/tmp/qc.mjs";
import { readFileSync, openSync, readSync } from "node:fs";
const ELF="/tmp/hemusnap/core7.elf"; const fd=openSync(ELF,"r"); const eh=Buffer.alloc(64); readSync(fd,eh,0,64,0);
const phoff=Number(eh.readBigUInt64LE(0x20)),phnum=eh.readUInt16LE(0x38),phentsz=eh.readUInt16LE(0x36); const segs=[];
for(let i=0;i<phnum;i++){const p=Buffer.alloc(phentsz);readSync(fd,p,0,phentsz,phoff+i*phentsz);if(p.readUInt32LE(0)===1)segs.push({off:Number(p.readBigUInt64LE(8)),paddr:Number(p.readBigUInt64LE(24)),filesz:Number(p.readBigUInt64LE(32))});}
const q=makeQcow2(new Uint8Array(readFileSync("/tmp/templeos.qcow2")));
const dir="/Users/parkerh/Dev/hemu-wasm/src"; const src=readFileSync(dir+"/snapshot.HC","latin1");
const r=compileHolyC(src,{filename:"snapshot.HC",lenient:false,includeResolver:(p)=>{try{return readFileSync(dir+"/"+p,"latin1")}catch{return null}}});
let inst, gBase=0; const ovl=new Map();
const host=createHost({onText:()=>{},snd:{tone:()=>{}},
  snapLoad:(base,u8)=>{gBase=base;for(const s of segs){if(s.paddr>=402653184)continue;const n=Math.min(s.filesz,402653184-s.paddr);const b=Buffer.alloc(n);readSync(fd,b,0,n,s.off);u8.set(b,base+s.paddr);}},
  diskRead:(lba,cnt,u8,dst)=>{for(let s=0;s<cnt;s++){const o=ovl.get(lba+s);if(o)u8.set(o,dst+s*512);else q.readInto(lba+s,1,u8,dst+s*512);}},
  diskWrite:(lba,cnt,u8,src)=>{for(let s=0;s<cnt;s++)ovl.set(lba+s,u8.slice(src+s*512,src+s*512+512));}, present:()=>{}});
host.env.__jit_state=(rg,fl,rp)=>{jit.jitState(rg,fl,rp,gBase,inst.exports.memory,inst.exports.RdMem,inst.exports.WrMem); return 0n;};
host.env.__jit_compile=(rip)=>BigInt(jit.jitCompile(Number(rip)));
host.env.__jit_run=(rip)=>BigInt(jit.jitRun(Number(rip)));
host.env.__host_budget=()=>1500000n; host.env.__host_dt=()=>33n;
const mod=await WebAssembly.compile(r.bytes); inst=await WebAssembly.instantiate(mod,{env:host.env}); host.attach(inst); inst.exports.__rt_init();
inst.exports.__main();                          // boot once -> __jit_state fires -> jit learns offsets
const { REG } = jit.jitOffsets();
console.log("offsets: REG=0x"+REG.toString(16)+" gBase=0x"+gBase.toString(16));
const u8 = new Uint8Array(inst.exports.memory.buffer);
const SCRATCH = 0x700000;
// mov rax,5 ; mov rbx,7 ; mov rcx,rax ; add rax,rbx   (all REX.W)
const blk = [0x48,0xC7,0xC0,5,0,0,0, 0x48,0xC7,0xC3,7,0,0,0, 0x48,0x89,0xC1, 0x48,0x01,0xD8];
for (let k=0;k<blk.length;k++) u8[gBase+SCRATCH+k]=blk[k];
const buf = inst.exports.memory.buffer;
const reg = new BigInt64Array(buf, REG, 16);
reg[0]=999n; reg[1]=999n; reg[3]=999n;          // garbage, the block must overwrite
const n = jit.jitCompile(SCRATCH);
const newrip = jit.jitRun(SCRATCH);
const rfl = new DataView(buf).getBigUint64(jit.jitOffsets().RFL, true) & 0x8C5n;   // ZF|SF|PF|CF|OF bits
console.log(`ninstr=${n} newrip=0x${newrip.toString(16)} (expect 4, 0x${(SCRATCH+blk.length).toString(16)})`);
console.log(`rax=${reg[0]} rbx=${reg[3]} rcx=${reg[1]} rfl&8C5=0x${rfl.toString(16)} (expect 12, 7, 5, 0x4=PF)`);
const ok = n===4 && newrip===SCRATCH+blk.length && reg[0]===12n && reg[3]===7n && reg[1]===5n && rfl===0x4n;
console.log(ok ? "JIT M2: PASS" : "JIT M2: FAIL");
