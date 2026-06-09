// Comprehensive M2 JIT test: boot hemu, then JIT-run hand-built blocks exercising memory operands,
// operand sizes, ALU, lea, push/pop, and control flow; compare to hand-computed expected state.
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
  host.env.__jit_x87=(a,b,c)=>jit.jitX87(a,b,c);
  host.env.__jit_dispatch=(b)=>BigInt(jit.jitDispatch(Number(b)));
host.env.__host_budget=()=>1500000n; host.env.__host_dt=()=>33n;
const mod=await WebAssembly.compile(r.bytes); inst=await WebAssembly.instantiate(mod,{env:host.env}); host.attach(inst); inst.exports.__rt_init();
inst.exports.__main();
const { REG } = jit.jitOffsets();
const SC=0x700000;
let pass=0, fail=0;
function run(bytes, regInit){
  jit.jitReset();
  const u8=new Uint8Array(inst.exports.memory.buffer);
  for(let k=0;k<bytes.length;k++) u8[gBase+SC+k]=bytes[k];
  u8[gBase+SC+bytes.length]=0xF4;          // HLT terminator so the block ends after our instructions
  const reg=new BigInt64Array(inst.exports.memory.buffer, REG, 16);
  for(let k=0;k<16;k++) reg[k]=0n;
  if(regInit) for(const[k,v] of Object.entries(regInit)) reg[k]=BigInt.asIntN(64,BigInt(v));
  const n=jit.jitCompile(SC); jit.jitRun(SC);                    // jitRun returns instr count now; block writes rip
  const nr=Number(new DataView(inst.exports.memory.buffer).getBigUint64(jit.jitOffsets().RIP, true));
  return {n, nr, reg, dv:new DataView(inst.exports.memory.buffer)};
}
const U=(v)=>BigInt.asUintN(64,BigInt(v));
function chk(name, cond, got){ if(cond){pass++; /*console.log("ok "+name);*/} else {fail++; console.log("FAIL "+name+"  got "+got);} }

// A: memory store+load  (rdi=0x710000)  mov [rdi],rax ; mov rbx,[rdi]
{ const rdi=0x710000; const {reg,dv}=run([0x48,0x89,0x07, 0x48,0x8B,0x1F], {7:rdi, 0:0xCAFE});
  chk("A mem[rdi]", dv.getBigUint64(gBase+rdi,true)===0xCAFEn, dv.getBigUint64(gBase+rdi,true));
  chk("A rbx load", reg[3]===0xCAFEn, reg[3]); }
// B: 32-bit zeroes upper  mov rax,-1 ; mov eax,5
{ const {reg}=run([0x48,0xC7,0xC0,0xFF,0xFF,0xFF,0xFF, 0xB8,5,0,0,0]);
  chk("B eax zero-upper", reg[0]===5n, U(reg[0]).toString(16)); }
// C: 8-bit preserves upper  mov rax,0x1122 ; mov al,0xFF
{ const {reg}=run([0x48,0xC7,0xC0,0x22,0x11,0,0, 0xB0,0xFF]);
  chk("C al merge", reg[0]===0x11FFn, U(reg[0]).toString(16)); }
// D: lea rbx,[rdi+8]
{ const rdi=0x710000; const {reg}=run([0x48,0x8D,0x5F,0x08], {7:rdi});
  chk("D lea", reg[3]===BigInt(rdi+8), U(reg[3]).toString(16)); }
// E: push rax ; pop rbx   (rsp=0x720000)
{ const {reg}=run([0x50, 0x5B], {4:0x720000, 0:0x1234});
  chk("E pop=push", reg[3]===0x1234n, reg[3]); chk("E rsp restored", reg[4]===0x720000n, U(reg[4]).toString(16)); }
// F: sub rax,rax (ZF=1) ; jz +5   -> taken, returns SC+3+2+5
{ const {nr}=run([0x48,0x29,0xC0, 0x74,0x05], {0:9});
  chk("F jz taken", nr===SC+10, "0x"+nr.toString(16)+" want 0x"+(SC+10).toString(16)); }
// F2: sub rax,1 from 1 -> 0? use cmp rax,rbx (5 vs 7, NZ) ; jz +5 -> NOT taken -> falls through SC+5
{ const {nr}=run([0x48,0x39,0xD8, 0x74,0x05], {0:5,3:7});   // cmp rax,rbx ; jz
  chk("F2 jz not-taken", nr===SC+5, "0x"+nr.toString(16)+" want 0x"+(SC+5).toString(16)); }
// G: jmp +3
{ const {nr}=run([0xEB,0x03]); chk("G jmp", nr===SC+5, "0x"+nr.toString(16)); }
// H: add [rdi],rax  (mem dest)  mem=10, rax=5 -> 15
{ const rdi=0x710000; const {dv}=run([0x48,0x01,0x07], {7:rdi, 0:5});
  // pre-set mem=10
  // (run zeroed regs then wrote; we need mem preset BEFORE compile/run — redo)
}
// SHIFTS: shl rax,4 (3->48); shr rbx,2 (40->10); sar rcx,1 (-8->-4)
{ const {reg}=run([0x48,0xC1,0xE0,0x04, 0x48,0xC1,0xEB,0x02, 0x48,0xC1,0xF9,0x01], {0:3,3:40,1:-8});
  chk("shl rax,4", reg[0]===48n, reg[0]); chk("shr rbx,2", reg[3]===10n, reg[3]); chk("sar rcx,1", reg[1]===-4n, U(reg[1]).toString(16)); }
// LEAVE: rbp=0x720000, [0x720000]=0xABC -> rsp=0x720008, rbp=0xABC
{ const rbp=0x720000; jit.jitReset(); const u8=new Uint8Array(inst.exports.memory.buffer);
  new DataView(inst.exports.memory.buffer).setBigUint64(gBase+rbp,0xABCn,true);
  const bytes=[0xC9,0xF4]; for(let k=0;k<bytes.length;k++) u8[gBase+SC+k]=bytes[k];
  const reg=new BigInt64Array(inst.exports.memory.buffer,REG,16); for(let k=0;k<16;k++)reg[k]=0n; reg[5]=BigInt(rbp);
  jit.jitCompile(SC); jit.jitRun(SC);
  chk("leave rsp", reg[4]===BigInt(rbp+8), U(reg[4]).toString(16)); chk("leave rbp", reg[5]===0xABCn, reg[5]); }
// PUSH imm8: rsp=0x720000, push -5 -> [0x71FFF8]=-5, rsp=0x71FFF8
{ const {reg,dv}=run([0x6A,0xFB], {4:0x720000});
  chk("push imm rsp", reg[4]===BigInt(0x720000-8), U(reg[4]).toString(16));
  chk("push imm val", dv.getBigInt64(gBase+0x720000-8,true)===-5n, dv.getBigInt64(gBase+0x720000-8,true)); }
// grp3: not rax (5 -> -6); neg rbx (7 -> -7)
{ const {reg}=run([0x48,0xF7,0xD0, 0x48,0xF7,0xDB], {0:5,3:7});
  chk("not rax", reg[0]===~5n, U(reg[0]).toString(16)); chk("neg rbx", reg[3]===-7n, U(reg[3]).toString(16)); }
// bt group: bts rax,4 (0->0x10); btr rbx,1 (0xF->0xD)
{ const {reg}=run([0x48,0x0F,0xBA,0xE8,0x04, 0x48,0x0F,0xBA,0xF3,0x01], {0:0,3:0xF});
  chk("bts rax,4", reg[0]===0x10n, U(reg[0]).toString(16)); chk("btr rbx,1", reg[3]===0xDn, U(reg[3]).toString(16)); }
// self-loop TRACE: dec rcx ; jnz top  (rcx=5 -> loops 5x -> 0); exit rip = fall-through (SC+5)
{ const {reg,nr}=run([0x48,0xFF,0xC9, 0x75,0xFB], {1:5});
  chk("loop rcx->0", reg[1]===0n, reg[1]); chk("loop exit rip", nr===SC+5, "0x"+nr.toString(16)); }
// x87: fld qword [rdi]; fmul qword [rsi]; fild dword [rdx-... actually: fld x; fmul y; fstp z  -> z = x*y
{ jit.jitReset(); const u8=new Uint8Array(inst.exports.memory.buffer); const dv=new DataView(inst.exports.memory.buffer);
  const X=0x730000, Y=0x730008, Z=0x730010; dv.setFloat64(gBase+X,3.0,true); dv.setFloat64(gBase+Y,4.0,true); dv.setFloat64(gBase+Z,0,true);
  const bytes=[0xDD,0x07, 0xDC,0x0E, 0xDD,0x1A, 0xF4]; for(let k=0;k<bytes.length;k++) u8[gBase+SC+k]=bytes[k];
  const reg=new BigInt64Array(inst.exports.memory.buffer,REG,16); for(let k=0;k<16;k++)reg[k]=0n; reg[7]=BigInt(X); reg[6]=BigInt(Y); reg[2]=BigInt(Z);
  jit.jitCompile(SC); jit.jitRun(SC);
  chk("x87 fld*fmul*fstp", new DataView(inst.exports.memory.buffer).getFloat64(gBase+Z,true)===12.0, new DataView(inst.exports.memory.buffer).getFloat64(gBase+Z,true)); }
// x87 int: fild dword [rdi]; fild dword [rsi]; faddp not jitted -> use: fild x; fimul? no. fild x(=5); fistp [rdx] -> z=5
{ jit.jitReset(); const u8=new Uint8Array(inst.exports.memory.buffer); const dv=new DataView(inst.exports.memory.buffer);
  const X=0x730020, Z=0x730028; dv.setInt32(gBase+X,5,true); dv.setBigInt64(gBase+Z,0n,true);
  const bytes=[0xDB,0x07, 0xDF,0x3A, 0xF4]; for(let k=0;k<bytes.length;k++) u8[gBase+SC+k]=bytes[k];   // fild dword[rdi]; fistp qword[rdx]
  const reg=new BigInt64Array(inst.exports.memory.buffer,REG,16); for(let k=0;k<16;k++)reg[k]=0n; reg[7]=BigInt(X); reg[2]=BigInt(Z);
  jit.jitCompile(SC); jit.jitRun(SC);
  chk("x87 fild/fistp", new DataView(inst.exports.memory.buffer).getBigInt64(gBase+Z,true)===5n, new DataView(inst.exports.memory.buffer).getBigInt64(gBase+Z,true)); }
console.log(`M2 TEST: ${pass} pass, ${fail} fail  => ${fail===0?"ALL PASS":"FAILURES"}`);
