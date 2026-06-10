// jit.js — x86-64 basic-block JIT for hemu: decodes guest x86 straight out of hemu's shared WASM
// memory and emits one native WASM function per hot block (reusing holyc-wasm's emitter). Blocks read
// /write hemu's CPU state (reg[]/rfl) and guest RAM in that same shared memory, so JIT'd blocks and
// the interpreter interleave seamlessly. See hemu-wasm/JIT-DESIGN.md.
//
// M2 (integer core): mov / ALU (add,or,and,sub,xor,cmp + imm) / test / inc,dec / neg,not / lea /
// movzx,movsx,movsxd / push,pop / shifts / imul(2op) / xchg / nop, across reg + MEMORY operands and
// 8/16/32/64-bit sizes, with EAGER EFLAGS matching the interpreter, and control flow (jmp/jcc/call/
// ret) ending a block. Anything not handled ends the block early (the interpreter resumes there).
// TODO(deploy): switch the import to "./holyc-wasm/src/wasm/emitter.js" + sync abi.js/host.js.
import { Module, Func, OP, VT, sleb } from "./holyc-wasm/src/wasm/emitter.js";   // relative so it loads in the browser (deploy) AND node; the deploy's emitter is kept in sync with the canonical

let REG = 0, RFL = 0, RIP = 0, GBASE = 0, MEM = null, U8 = null, RDMEM = null, WRMEM = null;
let MSRFS = 0, MSRGS = 0, SEG = 0, TSC = 0; // FS/GS base + tsc global offsets (via jitSeg); SEG = current insn's seg prefix (0/1=FS/2=GS)
let RD_IDX = 0, WR_IDX = 1;                // imported func indices (RdMem, WrMem) within each JIT module
const MEMSIZE = 402653184;                 // guest RAM size; ea >= this is MMIO/alias -> route to hemu's RdMem/WrMem
const MEMM = { isMem: true };              // synthetic "memory operand" so rdRM/wrRM route a register-computed addr (local 3) through the MMIO check (string ops)
const blocks = new Map();                  // entry rip -> { fn, ninstr }  (compile-time bookkeeping)
const blockFn = new Array(65536).fill(null);   // fast dispatch arrays, indexed by rip & 0xFFFF
const blockRip = new Int32Array(65536).fill(-1);

export function jitState(reg, rfl, rip, gbase, memObj, rdMem, wrMem) {
  REG = Number(reg); RFL = Number(rfl); RIP = Number(rip);
  GBASE = Number(gbase); MEM = memObj; U8 = new Uint8Array(memObj.buffer);
  RDMEM = rdMem; WRMEM = wrMem;             // hemu's exported RdMem/WrMem (handle MMIO + the 2^40 alias)
}
export function jitSeg(fs, gs, tsc) { MSRFS = Number(fs); MSRGS = Number(gs); TSC = Number(tsc) || 0; }   // FS/GS base + tsc global byte-offsets (from the compiler's globals map)
export function jitReset() { blocks.clear(); blockFn.fill(null); blockRip.fill(-1); }
export function jitOffsets() { return { REG, RFL, RIP, GBASE }; }
export function jitStats() { let live = 0, unj = 0; for (const e of blocks.values()) { if (e.fn) live++; else unj++; } return { blocks: blocks.size, live, unjittable: unj }; }

// ---- emit helpers (append into Func body f) ----
const i32c = (f, v) => f.raw(OP.i32_const, ...sleb(v | 0));
const i64c = (f, v) => f.raw(OP.i64_const, ...sleb(BigInt.asIntN(64, BigInt(v))));
const ld64 = (f) => f.load("i64_load", 0, 3);
const st64 = (f) => f.store("i64_store", 0, 3);
const LDSZ = { 1: "i64_load8_u", 2: "i64_load16_u", 4: "i64_load32_u", 8: "i64_load" };
const STSZ = { 1: "i64_store8", 2: "i64_store16", 4: "i64_store32", 8: "i64_store" };
const ALN = { 1: 0, 2: 1, 4: 2, 8: 3 };

// reg #i read/write at size sz (rex=true if a REX prefix is present -> regs 4..7 are SPL.. not AH..).
function regAddr(i, sz, rex) { return (sz === 1 && !rex && i >= 4 && i < 8) ? REG + (i - 4) * 8 + 1 : REG + i * 8; }
function rdReg(f, i, sz, rex) { i32c(f, regAddr(i, sz, rex)); f.load(LDSZ[sz], 0, ALN[sz]); }
function wrReg(f, i, sz, rex, emitVal) {
  if (sz === 8) { i32c(f, REG + i * 8); emitVal(); st64(f); }
  else if (sz === 4) { i32c(f, REG + i * 8); emitVal(); i64c(f, 0xFFFFFFFF); f.op("i64_and"); st64(f); }   // 32-bit write zero-extends
  else { i32c(f, regAddr(i, sz, rex)); emitVal(); f.store(STSZ[sz], 0, ALN[sz]); }                          // 8/16 preserve upper
}

// effective address of a memory ModRM -> local 3 (guest addr). endRip needed for RIP-relative.
function emitEA(f, m, endRip) {
  globalThis.__sawmem = true;                             // bisect marker (JITSAFE&2 skips mem blocks)
  if (m.ripRel) { i64c(f, endRip + m.disp); }
  else {
    i64c(f, m.disp);
    if (m.base >= 0) { rdReg(f, m.base, 8, true); f.op("i64_add"); }
    if (m.index >= 0) { rdReg(f, m.index, 8, true); if (m.scale > 1) { i64c(f, m.scale); f.op("i64_mul"); } f.op("i64_add"); }
  }
  if (SEG && (SEG === 1 ? MSRFS : MSRGS)) { i32c(f, SEG === 1 ? MSRFS : MSRGS); ld64(f); f.op("i64_add"); }  // FS/GS segment base (cpu.HC: ea = addr + g_segbase)
  f.local_set(3);
  // RSP/RBP-relative (no index) and RIP-relative always address the guest stack/code in RAM (ea < MEMSIZE),
  // so the per-access MMIO bounds branch is provably dead — mark it for elision in rdRM/wrRM. No segment override
  // (FS/GS could shift ea anywhere). Only emitEA sets this; every other path keeps the safe bounds check.
  m.knownRam = !SEG && (m.ripRel || (m.index < 0 && (m.base === 4 || m.base === 5)));
}
const memAddr = (f) => { i64c(f, GBASE); f.local_get(3); f.op("i64_add"); f.op("i32_wrap_i64"); };  // -> i32 wasm addr

// ---- x87 FPU: fpr[8] f64 stack, fsp top, ST(0)=fpr[fsp]; ST(i)=fpr[(fsp+i)&7]. Matches cpu.HC OpX87. ----
let FPR = 0, FSP = 0, X87SW = 0;
export function jitX87(fpr, fsp, sw) { FPR = Number(fpr); FSP = Number(fsp); X87SW = Number(sw); }
const fc64 = (f, v) => f.raw(OP.f64_const, ...new Uint8Array(new Float64Array([v]).buffer));   // f64.const
const fStAddr = (f, i) => { i32c(f, FSP); f.load("i64_load", 0, 3); if (i) { i64c(f, i); f.op("i64_add"); } i64c(f, 7); f.op("i64_and"); i64c(f, 8); f.op("i64_mul"); i64c(f, FPR); f.op("i64_add"); f.op("i32_wrap_i64"); };
const fLd = (f, i) => { fStAddr(f, i); f.load("f64_load", 0, 3); };                            // push ST(i) (f64)
const fSt = (f, i, ev) => { fStAddr(f, i); ev(); f.store("f64_store", 0, 3); };                // ST(i) = f64 from ev()
const fInc = (f, d) => { i32c(f, FSP); i32c(f, FSP); f.load("i64_load", 0, 3); i64c(f, d); f.op("i64_add"); i64c(f, 7); f.op("i64_and"); f.store("i64_store", 0, 3); }; // fsp=(fsp+d)&7
const fPush = (f, ev) => { ev(); f.local_set(5); fInc(f, -1); fSt(f, 0, () => f.local_get(5)); };  // local5(f64): v(old fsp) -> dec fsp -> store
const fPop = (f) => fInc(f, 1);
const fRoundI = (f) => { f.local_set(5); f.local_get(5); fc64(f, 0.5); f.local_get(5); f.op("f64_copysign"); f.op("f64_add"); f.fc("i64_trunc_sat_f64_s"); }; // RoundI = trunc(d+copysign(0.5,d)); SATURATING like cpu.HC F64ToInt (a trapping trunc would crash the block on NaN where the interpreter continues)

// ---- WASM dispatch module: a persistent runtime that call_indirects JIT'd blocks back-to-back in NATIVE
// wasm (zero JS per block) until an un-JIT'd rip. The block fns live in its funcref table (table.set on
// compile); it reads rip + hemu's g_jit_rip[]/g_jit_n[] (offsets from jitChain) to verify each block. ----
let JITRIP = 0, JITN = 0, RUNTBL = null, RUNDISP = null;
function buildRuntime() {
  if (!RIP || !JITRIP || !MEM) return;
  const rm = new Module();
  rm.importMemory("env", "mem", 1);
  rm.setTable(65536); rm.exportTable("tbl");
  const bt = rm.typeIndex([], [VT.i32]);                              // JIT block func type ([]->i32 count)
  const { index, setBody } = rm.func([VT.i32], [VT.i32], "dispatch"); // (budget) -> instr count ran
  const f = new Func();
  i32c(f, 0); f.local_set(1);                                         // ran = 0
  f.loop(0x40);
    i32c(f, RIP); f.load("i32_load", 0, 2); f.local_set(2);                                   // rip = [RIP] (low 32)
    f.local_get(2); i32c(f, 0xFFFF); f.op("i32_and"); f.local_set(3);                          // slot = rip & 0xFFFF
    i32c(f, JITRIP); f.local_get(3); i32c(f, 8); f.op("i32_mul"); f.op("i32_add"); f.load("i32_load", 0, 2);
    f.local_get(2); f.op("i32_eq");                                                            // g_jit_rip[slot] == rip
    i32c(f, JITN); f.local_get(3); i32c(f, 8); f.op("i32_mul"); f.op("i32_add"); f.load("i32_load", 0, 2); i32c(f, 0); f.op("i32_gt_s"); f.op("i32_and"); // && g_jit_n[slot] > 0
    f.local_get(1); f.local_get(0); f.op("i32_lt_s"); f.op("i32_and");                         // && ran < budget
    f.if_(0x40);
      f.local_get(3); f.call_indirect(bt, 0); f.local_set(4);                                  // count = table[slot]() (block writes rip)
      f.local_get(1); f.local_get(4); f.op("i32_add"); f.local_set(1);                         // ran += count
      f.local_get(4); f.br_if(1);                                                              // continue ONLY if count!=0 (count==0 = a guard early-exit made no progress -> break so cpu.HC interprets that insn, else infinite spin)
    f.end();
  f.end();
  f.local_get(1);                                                                              // return ran
  setBody([{ count: 4, vt: VT.i32 }], f);                                                      // locals 1,2,3,4 = ran, rip, slot, count
  rm.exportFunc("dispatch", index);
  const inst = new WebAssembly.Instance(new WebAssembly.Module(Uint8Array.from(rm.emit())), { env: { mem: MEM } });
  RUNTBL = inst.exports.tbl; RUNDISP = inst.exports.dispatch;
}
export function jitChain(jitRipOff, jitNOff) { JITRIP = Number(jitRipOff); JITN = Number(jitNOff); buildRuntime(); }

// read / write a decoded r/m operand (reg or mem) at size sz. For mem, emitEA(f,m,endRip) must run first.
function rdRM(f, m, sz, rex) {
  if (!m.isMem) { rdReg(f, m.rm, sz, rex); return; }
  if (m.knownRam) { memAddr(f); f.load(LDSZ[sz], 0, ALN[sz]); return; }  // rsp/rbp/rip-relative: always RAM, no MMIO check
  f.local_get(3); i64c(f, MEMSIZE); f.op("i64_lt_u"); f.if_(VT.i64);   // ea < RAM size?
  memAddr(f); f.load(LDSZ[sz], 0, ALN[sz]);                            //  yes: direct RAM load
  f.else_(); f.local_get(3); i64c(f, sz); f.call(RD_IDX); f.end();     //  no: RdMem(ea,sz) -> MMIO/alias
}
function wrRM(f, m, sz, rex, emitVal) {
  if (!m.isMem) { wrReg(f, m.rm, sz, rex, emitVal); return; }
  if (m.knownRam) { memAddr(f); emitVal(); f.store(STSZ[sz], 0, ALN[sz]); return; }  // rsp/rbp/rip-relative: always RAM
  f.local_get(3); i64c(f, MEMSIZE); f.op("i64_lt_u"); f.if_();
  memAddr(f); emitVal(); f.store(STSZ[sz], 0, ALN[sz]);                //  RAM: store exactly sz bytes
  f.else_(); f.local_get(3); i64c(f, sz); emitVal(); f.call(WR_IDX); f.end();  // MMIO: WrMem(ea,sz,val)
}

// EAGER flags == interpreter (cpu.HC): rfl = (rfl & ~0x8C5) | ZF|SF|PF|CF|OF. a=local0,b=local1,r=local2.
function emitFlags(f, kind, sz) {
  const hb = sz * 8 - 1, mask = sz === 8 ? null : (1n << BigInt(sz * 8)) - 1n;
  const maskR = () => { if (mask !== null) { i64c(f, mask); f.op("i64_and"); } };
  i32c(f, RFL); i32c(f, RFL); ld64(f); i64c(f, -0x8C6); f.op("i64_and");
  f.local_get(2); maskR(); f.op("i64_eqz"); f.op("i64_extend_i32_u"); i64c(f, 0x40); f.op("i64_mul"); f.op("i64_or");          // ZF
  f.local_get(2); i64c(f, hb); f.op("i64_shr_u"); i64c(f, 1); f.op("i64_and"); i64c(f, 0x80); f.op("i64_mul"); f.op("i64_or"); // SF
  f.local_get(2); i64c(f, 0xFF); f.op("i64_and"); f.op("i64_popcnt"); i64c(f, 1); f.op("i64_and"); f.op("i64_eqz"); f.op("i64_extend_i32_u"); i64c(f, 4); f.op("i64_mul"); f.op("i64_or"); // PF
  if (kind === "add") {
    f.local_get(2); maskR(); f.local_get(0); maskR(); f.op("i64_lt_u"); f.op("i64_extend_i32_u"); f.op("i64_or");             // CF=r<a
    f.local_get(0); f.local_get(2); f.op("i64_xor"); f.local_get(1); f.local_get(2); f.op("i64_xor"); f.op("i64_and"); i64c(f, hb); f.op("i64_shr_u"); i64c(f, 1); f.op("i64_and"); i64c(f, 0x800); f.op("i64_mul"); f.op("i64_or"); // OF
  } else if (kind === "sub") {
    f.local_get(0); maskR(); f.local_get(1); maskR(); f.op("i64_lt_u"); f.op("i64_extend_i32_u"); f.op("i64_or");             // CF=a<b
    f.local_get(0); f.local_get(1); f.op("i64_xor"); f.local_get(0); f.local_get(2); f.op("i64_xor"); f.op("i64_and"); i64c(f, hb); f.op("i64_shr_u"); i64c(f, 1); f.op("i64_and"); i64c(f, 0x800); f.op("i64_mul"); f.op("i64_or"); // OF
  }                                                                                                                            // logic: CF=OF=0
  st64(f);
}

// LAZY FLAGS: most ALU flag-sets are DEAD (overwritten before any jcc/flag-reader). Instead of emitting
// emitFlags (~30 wasm ops) eagerly, an add/sub/logic/test/cmp/neg SAVES a/b/r (locals 0/1/2) into dedicated
// locals 16/17/18 and records FLAGPEND; we emitFlags ONCE, on demand, at the next flag-reader / partial-flag
// op / block exit (materialize). A following full-overwrite ALU just replaces FLAGPEND (the old set was dead).
let FLAGPEND = null;
function deferFlags(f, kind, sz) { f.local_get(0); f.local_set(16); f.local_get(1); f.local_set(17); f.local_get(2); f.local_set(18); FLAGPEND = { kind, sz }; }
function materialize(f) { if (FLAGPEND) { f.local_get(16); f.local_set(0); f.local_get(17); f.local_set(1); f.local_get(18); f.local_set(2); emitFlags(f, FLAGPEND.kind, FLAGPEND.sz); FLAGPEND = null; } }

// ADC (isSbb=0) / SBB (isSbb=1): r = a ± b ± CF, flags exactly per cpu.HC Arith opn 2/3 (carry-in CF).
// dst accessed via rd()/wr(ev) closures (reg or mem); src via srcEmit(). a=L0 b=L1 r=L2 cin=L6 t=L7.
function emitAdcSbb(f, sz, isSbb, rd, wr, srcEmit) {
  materialize(f);                                          // reads CF -> the deferred flags must be live first
  const mask = sz === 8 ? null : (1n << BigInt(sz * 8)) - 1n;
  rd(); f.local_set(0); srcEmit(); f.local_set(1);
  i32c(f, RFL); ld64(f); i64c(f, 1); f.op("i64_and"); f.local_set(6);            // cin = rfl & CF
  if (!isSbb) { f.local_get(0); f.local_get(1); f.op("i64_add"); f.local_get(6); f.op("i64_add"); }
  else { f.local_get(0); f.local_get(1); f.op("i64_sub"); f.local_get(6); f.op("i64_sub"); }
  if (mask !== null) { i64c(f, mask); f.op("i64_and"); }                          // r = (a±b±cin) & m
  f.local_set(2);
  wr(() => f.local_get(2));
  emitAdcSbbFlags(f, isSbb, sz);
}
function emitAdcSbbFlags(f, isSbb, sz) {
  const bits = sz * 8, hb = bits - 1, mask = sz === 8 ? null : (1n << BigInt(bits)) - 1n;
  const maskR = () => { if (mask !== null) { i64c(f, mask); f.op("i64_and"); } };
  i32c(f, RFL); i32c(f, RFL); ld64(f); i64c(f, -0x8C6); f.op("i64_and");          // clear CF,PF,ZF,SF,OF (keep AF)
  f.local_get(2); f.op("i64_eqz"); f.op("i64_extend_i32_u"); i64c(f, 0x40); f.op("i64_mul"); f.op("i64_or");   // ZF (r pre-masked)
  f.local_get(2); i64c(f, hb); f.op("i64_shr_u"); i64c(f, 1); f.op("i64_and"); i64c(f, 0x80); f.op("i64_mul"); f.op("i64_or"); // SF
  f.local_get(2); i64c(f, 0xFF); f.op("i64_and"); f.op("i64_popcnt"); i64c(f, 1); f.op("i64_and"); f.op("i64_eqz"); f.op("i64_extend_i32_u"); i64c(f, 4); f.op("i64_mul"); f.op("i64_or"); // PF
  if (!isSbb) {                                                                   // ADC CF
    if (sz === 8) { f.local_get(0); f.local_get(1); f.op("i64_add"); f.local_set(7);   // t=a+b; CF=(t<a)|(r<t)
      f.local_get(7); f.local_get(0); f.op("i64_lt_u"); f.local_get(2); f.local_get(7); f.op("i64_lt_u"); f.op("i32_or"); f.op("i64_extend_i32_u"); f.op("i64_or"); }
    else { f.local_get(0); maskR(); f.local_get(1); maskR(); f.op("i64_add"); f.local_get(6); f.op("i64_add"); i64c(f, bits); f.op("i64_shr_u"); i64c(f, 1); f.op("i64_and"); f.op("i64_or"); }  // CF=((a&m)+(b&m)+cin)>>bits
  } else {                                                                        // SBB CF = (a&m)<(b&m) | ((a&m)==(b&m) & cin)
    f.local_get(0); maskR(); f.local_get(1); maskR(); f.op("i64_lt_u");
    f.local_get(0); maskR(); f.local_get(1); maskR(); f.op("i64_eq"); f.local_get(6); i64c(f, 0); f.op("i64_ne"); f.op("i32_and"); f.op("i32_or"); f.op("i64_extend_i32_u"); f.op("i64_or");
  }
  if (!isSbb) { f.local_get(0); f.local_get(2); f.op("i64_xor"); f.local_get(1); f.local_get(2); f.op("i64_xor"); f.op("i64_and"); }   // ADC OF=(a^r)&(b^r)&sb
  else { f.local_get(0); f.local_get(1); f.op("i64_xor"); f.local_get(0); f.local_get(2); f.op("i64_xor"); f.op("i64_and"); }          // SBB OF=(a^b)&(a^r)&sb
  i64c(f, hb); f.op("i64_shr_u"); i64c(f, 1); f.op("i64_and"); i64c(f, 0x800); f.op("i64_mul"); f.op("i64_or");
  st64(f);
}

// push i32 condition (0/1) for jcc code cc (0..15), computed from rfl.
function emitCond(f, cc) {
  const bit = (b) => { i32c(f, RFL); f.load("i32_load", 0, 2); i32c(f, b); f.op("i32_shr_u"); i32c(f, 1); f.op("i32_and"); };
  const base = cc >> 1;
  if (base === 0) bit(11);                                            // O
  else if (base === 1) bit(0);                                        // B (CF)
  else if (base === 2) bit(6);                                        // Z
  else if (base === 3) { bit(0); bit(6); f.op("i32_or"); }            // BE (CF|ZF)
  else if (base === 4) bit(7);                                        // S
  else if (base === 5) bit(2);                                        // P
  else if (base === 6) { bit(7); bit(11); f.op("i32_xor"); }          // L (SF^OF)
  else { bit(6); bit(7); bit(11); f.op("i32_xor"); f.op("i32_or"); }  // LE (ZF|(SF^OF))
  if (cc & 1) { i32c(f, 1); f.op("i32_xor"); }                        // odd cc = negation
}

const imm8s = (j) => (U8[j] << 24) >> 24;
const imm16s = (j) => ((U8[j] | (U8[j + 1] << 8)) << 16) >> 16;
const imm32s = (j) => (U8[j] | (U8[j + 1] << 8) | (U8[j + 2] << 16) | (U8[j + 3] << 24)) | 0;
const immSz = (j, sz) => sz === 1 ? imm8s(j) : sz === 2 ? imm16s(j) : imm32s(j);   // sign-extended imm of operand size (sz=8 -> imm32)
const immLen = (sz) => sz === 1 ? 1 : sz === 2 ? 2 : 4;                            // 0x66 -> 2-byte imm! (the bug that froze games)
const imm64 = (j) => { let v = 0n; for (let k = 7; k >= 0; k--) v = (v << 8n) | BigInt(U8[j + k]); return BigInt.asIntN(64, v); };

// decode ModRM (+SIB+disp) at j; returns the operand descriptor and the cursor after it.
function decodeModRM(j, rexR, rexX, rexB) {
  const modrm = U8[j]; j++;
  const mod = modrm >> 6, reg = ((modrm >> 3) & 7) | (rexR << 3), rm0 = modrm & 7;
  if (mod === 3) return { reg, isMem: false, rm: rm0 | (rexB << 3), j };
  let base = -1, index = -1, scale = 1, disp = 0, ripRel = false;
  if (rm0 === 4) {                                   // SIB
    const sib = U8[j]; j++; scale = 1 << (sib >> 6);
    const idx = ((sib >> 3) & 7) | (rexX << 3); if (idx !== 4) index = idx;   // index 4 = none
    const bs = (sib & 7);
    if (bs === 5 && mod === 0) { disp = imm32s(j); j += 4; }                   // no base, disp32
    else base = bs | (rexB << 3);
  } else if (rm0 === 5 && mod === 0) { disp = imm32s(j); j += 4; ripRel = true; } // RIP-relative
  else base = rm0 | (rexB << 3);
  if (mod === 1) { disp += imm8s(j); j += 1; }
  else if (mod === 2) { disp += imm32s(j); j += 4; }
  return { reg, isMem: true, base, index, scale, disp, ripRel, j };
}

const ALUW = { 0: "i64_add", 1: "i64_or", 4: "i64_and", 5: "i64_sub", 6: "i64_xor", 7: "i64_sub" };
const ALUK = (g) => g === 0 ? "add" : (g === 5 || g === 7) ? "sub" : "logic";

// emit a generic ALU on (dst=rm/reg, src=value-on-demand) writing back unless cmp/test.
function emitALU(f, m, sz, rex, grp, srcEmit, isCmpTest) {
  rdRM(f, m, sz, rex); f.local_set(0);                    // a = dst
  srcEmit(); f.local_set(1);                              // b = src
  f.local_get(0); f.local_get(1); f.op(ALUW[grp]); f.local_set(2);
  if (!isCmpTest) wrRM(f, m, sz, rex, () => f.local_get(2));
  deferFlags(f, ALUK(grp), sz);
}

export function jitCompile(rip) {
  if (blocks.has(rip)) {                                   // cache hit: re-point the slot to THIS rip's block —
    const e = blocks.get(rip);                             // a colliding rip (same slot) may have overwritten it,
    if (e.fn) { const sl = rip & 0xFFFF; blockFn[sl] = e.fn; blockRip[sl] = rip; if (RUNTBL) RUNTBL.set(sl, e.fn); }  // and the dispatch indexes by slot.
    return e.ninstr;
  }
  globalThis.__sawmem = false; FLAGPEND = null;          // start each block with no deferred flags
  const m = new Module();                                 // build module + imports first so RD_IDX/WR_IDX are known
  m.importMemory("env", "mem", 1);
  RD_IDX = m.importFunc("env", "RdMem", [VT.i64, VT.i64], [VT.i64]);
  WR_IDX = m.importFunc("env", "WrMem", [VT.i64, VT.i64, VT.i64], []);
  const blk = m.func([], [VT.i32], "blk");   // returns instr count (i32 -> JS number, no BigInt in the dispatch loop)
  const f = new Func();
  let i = GBASE + rip, n = 0, term = false, loopT = null;   // loopT set if the block is a self-loop (jcc back to entry)
  for (; n < 400;) {
    let j = i, rexW = 0, rexR = 0, rexX = 0, rexB = 0, rex = 0, pfx66 = 0, two = 0; SEG = 0;
    for (;;) {                                            // prefixes
      const b = U8[j];
      if (b === 0x66) { pfx66 = 1; j++; }
      else if (b === 0x64) { SEG = 1; j++; }              // FS: segment override (ea += msr_fsbase)
      else if (b === 0x65) { SEG = 2; j++; }              // GS:
      else if (b === 0x2E || b === 0x36 || b === 0x3E || b === 0x26) { j++; }   // CS/SS/DS/ES = flat in 64-bit (skip)
      else if (b >= 0x40 && b <= 0x4F) { rex = 1; rexW = (b >> 3) & 1; rexR = (b >> 2) & 1; rexX = (b >> 1) & 1; rexB = b & 1; j++; break; }
      else break;
    }
    let op = U8[j]; j++;
    if (op === 0x0F) { two = 1; op = U8[j]; j++; }
    const szV = rexW ? 8 : (pfx66 ? 2 : 4);              // size for "v" operands
    let handled = false;
    if (globalThis.__JITSAFE) {                          // bisect: bit1 keep only mov+ALU; bit2 also drop mem
      const safe = !two && ((op >= 0x88 && op <= 0x8B) || op === 0xC6 || op === 0xC7 || (op >= 0xB0 && op <= 0xBF)
        || (op < 0x40 && [1, 3, 4, 5].includes(op & 7)) || op === 0x80 || op === 0x81 || op === 0x83 || op === 0x90);
      if (!safe) break;
    }
    if (globalThis.__NOCF) {                             // bisect: end block before jmp rel8/rel32
      if (!two && (op === 0xEB || op === 0xE9)) break;
    }

    if (!two) {
      const lo = op & 7, grp = op >> 3;
      if (op === 0x88 || op === 0x89 || op === 0x8A || op === 0x8B) {        // mov
        const sz = (op & 1) ? szV : 1, toReg = (op & 2) !== 0;
        const m = decodeModRM(j, rexR, rexX, rexB); j = m.j;
        if (m.isMem) emitEA(f, m, j - GBASE);
        if (toReg) wrReg(f, m.reg, sz, rex, () => rdRM(f, m, sz, rex));
        else wrRM(f, m, sz, rex, () => rdReg(f, m.reg, sz, rex));
        handled = true;
      } else if (op === 0xC6 || op === 0xC7) {                               // mov r/m, imm
        const sz = op === 0xC6 ? 1 : szV;
        const m = decodeModRM(j, rexR, rexX, rexB); j = m.j;
        const v = immSz(j, sz); j += immLen(sz);
        if (m.isMem) emitEA(f, m, j - GBASE);
        wrRM(f, m, sz, rex, () => i64c(f, v));
        handled = true;
      } else if (op >= 0xB0 && op <= 0xBF) {                                 // mov reg, imm
        const r8 = op < 0xB8, sz = r8 ? 1 : szV, reg = (op & 7) | (rexB << 3);
        let v; if (r8) { v = imm8s(j); j += 1; } else if (sz === 8) { v = imm64(j); j += 8; } else if (sz === 2) { v = imm16s(j); j += 2; } else { v = imm32s(j); j += 4; }
        wrReg(f, reg, sz, rex, () => i64c(f, v));
        handled = true;
      } else if (op < 0x40 && (lo === 0 || lo === 1 || lo === 2 || lo === 3) && (ALUW[grp] !== undefined || grp === 2 || grp === 3)) { // ALU/ADC/SBB r/m,r | r,r/m
        const sz = (op & 1) ? szV : 1;
        const m = decodeModRM(j, rexR, rexX, rexB); j = m.j;
        if (m.isMem) emitEA(f, m, j - GBASE);
        const dstRm = (lo === 0 || lo === 1);
        if (grp === 2 || grp === 3) {                                        // ADC/SBB (carry-in)
          if (dstRm) emitAdcSbb(f, sz, grp === 3, () => rdRM(f, m, sz, rex), (ev) => wrRM(f, m, sz, rex, ev), () => rdReg(f, m.reg, sz, rex));
          else emitAdcSbb(f, sz, grp === 3, () => rdReg(f, m.reg, sz, rex), (ev) => wrReg(f, m.reg, sz, rex, ev), () => rdRM(f, m, sz, rex));
        } else if (dstRm) emitALU(f, m, sz, rex, grp, () => rdReg(f, m.reg, sz, rex), grp === 7);
        else { /* r,r/m: dst=reg, src=rm */ const rg = m.reg;
          rdReg(f, rg, sz, rex); f.local_set(0); rdRM(f, m, sz, rex); f.local_set(1);
          f.local_get(0); f.local_get(1); f.op(ALUW[grp]); f.local_set(2);
          if (grp !== 7) wrReg(f, rg, sz, rex, () => f.local_get(2));
          deferFlags(f, ALUK(grp), sz);
        }
        handled = true;
      } else if (op < 0x40 && (lo === 4 || lo === 5) && (ALUW[grp] !== undefined || grp === 2 || grp === 3)) {  // ALU/ADC/SBB AL/eAX, imm
        const sz = lo === 4 ? 1 : szV;
        const v = immSz(j, sz); j += immLen(sz);
        if (grp === 2 || grp === 3) emitAdcSbb(f, sz, grp === 3, () => rdReg(f, 0, sz, rex), (ev) => wrReg(f, 0, sz, rex, ev), () => i64c(f, v));
        else { rdReg(f, 0, sz, rex); f.local_set(0); i64c(f, v); f.local_set(1);
          f.local_get(0); f.local_get(1); f.op(ALUW[grp]); f.local_set(2);
          if (grp !== 7) wrReg(f, 0, sz, rex, () => f.local_get(2));
          deferFlags(f, ALUK(grp), sz); }
        handled = true;
      } else if (op === 0x80 || op === 0x81 || op === 0x83) {                // grp1: ALU/ADC/SBB r/m, imm
        const sz = op === 0x80 ? 1 : szV;
        const m = decodeModRM(j, rexR, rexX, rexB); const g = (U8[j] >> 3) & 7; j = m.j;
        let v; if (op === 0x81) { v = immSz(j, sz); j += immLen(sz); } else { v = imm8s(j); j += 1; }
        if (m.isMem) emitEA(f, m, j - GBASE);
        if (g === 2 || g === 3) emitAdcSbb(f, sz, g === 3, () => rdRM(f, m, sz, rex), (ev) => wrRM(f, m, sz, rex, ev), () => i64c(f, v));
        else emitALU(f, m, sz, rex, g, () => i64c(f, v), g === 7);
        handled = true;
      } else if (op === 0x84 || op === 0x85) {                               // test r/m, r
        const sz = (op & 1) ? szV : 1;
        const m = decodeModRM(j, rexR, rexX, rexB); j = m.j;
        if (m.isMem) emitEA(f, m, j - GBASE);
        rdRM(f, m, sz, rex); f.local_set(0); rdReg(f, m.reg, sz, rex); f.local_set(1);
        f.local_get(0); f.local_get(1); f.op("i64_and"); f.local_set(2);
        deferFlags(f, "logic", sz); handled = true;
      } else if (op === 0xA8 || op === 0xA9) {                               // test AL/eAX, imm
        const sz = op === 0xA8 ? 1 : szV; const v = immSz(j, sz); j += immLen(sz);
        rdReg(f, 0, sz, rex); f.local_set(0); i64c(f, v); f.local_set(1);
        f.local_get(0); f.local_get(1); f.op("i64_and"); f.local_set(2); deferFlags(f, "logic", sz); handled = true;
      } else if (op === 0x8D) {                                             // lea reg, m
        const m = decodeModRM(j, rexR, rexX, rexB); j = m.j;
        if (!m.isMem) break;
        emitEA(f, m, j - GBASE);
        wrReg(f, m.reg, szV, rex, () => f.local_get(3));
        handled = true;
      } else if (op === 0xFE || op === 0xFF) {                               // grp5: inc/dec (/0,/1) [+push /6]
        const sz = op === 0xFE ? 1 : szV;
        const ext = (U8[j] >> 3) & 7;
        const m = decodeModRM(j, rexR, rexX, rexB); j = m.j;
        if (ext === 0 || ext === 1) {                                        // inc / dec (does NOT touch CF)
          materialize(f);                                                    // reads+preserves CF -> deferred flags must be live
          if (m.isMem) emitEA(f, m, j - GBASE);
          rdRM(f, m, sz, rex); f.local_set(0); i64c(f, 1); f.local_set(1);
          f.local_get(0); f.local_get(1); f.op(ext === 0 ? "i64_add" : "i64_sub"); f.local_set(2);
          wrRM(f, m, sz, rex, () => f.local_get(2));
          // flags: like add/sub but preserve CF. emit add/sub flags then restore CF from before.
          // simpler+correct: compute ZF/SF/PF/OF, keep old CF.
          i32c(f, RFL); i32c(f, RFL); ld64(f); i64c(f, -0x8C6 | 0x1); f.op("i64_and");   // clear ZSPOF, KEEP CF
          f.local_get(2); if (sz !== 8) { i64c(f, (1n << BigInt(sz * 8)) - 1n); f.op("i64_and"); } f.op("i64_eqz"); f.op("i64_extend_i32_u"); i64c(f, 0x40); f.op("i64_mul"); f.op("i64_or");
          f.local_get(2); i64c(f, sz * 8 - 1); f.op("i64_shr_u"); i64c(f, 1); f.op("i64_and"); i64c(f, 0x80); f.op("i64_mul"); f.op("i64_or");
          f.local_get(2); i64c(f, 0xFF); f.op("i64_and"); f.op("i64_popcnt"); i64c(f, 1); f.op("i64_and"); f.op("i64_eqz"); f.op("i64_extend_i32_u"); i64c(f, 4); f.op("i64_mul"); f.op("i64_or");
          if (ext === 0) { f.local_get(0); f.local_get(2); f.op("i64_xor"); f.local_get(1); f.local_get(2); f.op("i64_xor"); f.op("i64_and"); }
          else { f.local_get(0); f.local_get(1); f.op("i64_xor"); f.local_get(0); f.local_get(2); f.op("i64_xor"); f.op("i64_and"); }
          i64c(f, sz * 8 - 1); f.op("i64_shr_u"); i64c(f, 1); f.op("i64_and"); i64c(f, 0x800); f.op("i64_mul"); f.op("i64_or");
          st64(f);
          handled = true;
        } else if (op === 0xFF && (ext === 2 || ext === 4)) {                // call/jmp r/m (indirect)
          materialize(f);                                                    // block exit -> flush deferred flags
          if (m.isMem) emitEA(f, m, j - GBASE);
          if (ext === 2) { /* call: push next rip */ i32c(f, REG + 4 * 8); rdReg(f, 4, 8, true); i64c(f, 8); f.op("i64_sub"); st64(f); // rsp-=8
            i64c(f, GBASE); rdReg(f, 4, 8, true); f.op("i64_add"); f.op("i32_wrap_i64"); i64c(f, j - GBASE); f.store("i64_store", 0, 3); }
          rdRM(f, m, 8, true);                                              // target on stack -> block return
          term = true; n++; i = j; break;
        } else if (op === 0xFF && ext === 6) {                              // PUSH r/m (always 8 bytes; cpu.HC RdRM(8))
          if (m.isMem) emitEA(f, m, j - GBASE);
          rdRM(f, m, 8, true); f.local_set(0);                             // v (read BEFORE rsp changes, in case base==rsp)
          i32c(f, REG + 4 * 8); rdReg(f, 4, 8, true); i64c(f, 8); f.op("i64_sub"); st64(f);   // rsp -= 8
          i64c(f, GBASE); rdReg(f, 4, 8, true); f.op("i64_add"); f.op("i32_wrap_i64"); f.local_get(0); f.store("i64_store", 0, 3);  // [rsp] = v
          handled = true;
        } else break;
      } else if (op >= 0x50 && op <= 0x57) {                                 // push reg
        const r = (op & 7) | (rexB << 3);
        i32c(f, REG + 4 * 8); rdReg(f, 4, 8, true); i64c(f, 8); f.op("i64_sub"); st64(f);    // rsp -= 8
        i64c(f, GBASE); rdReg(f, 4, 8, true); f.op("i64_add"); f.op("i32_wrap_i64"); rdReg(f, r, 8, true); f.store("i64_store", 0, 3);
        handled = true;
      } else if (op >= 0x58 && op <= 0x5F) {                                 // pop reg
        const r = (op & 7) | (rexB << 3);
        wrReg(f, r, 8, true, () => { i64c(f, GBASE); rdReg(f, 4, 8, true); f.op("i64_add"); f.op("i32_wrap_i64"); f.load("i64_load", 0, 3); });
        i32c(f, REG + 4 * 8); rdReg(f, 4, 8, true); i64c(f, 8); f.op("i64_add"); st64(f);    // rsp += 8
        handled = true;
      } else if (op === 0x63) {                                              // movsxd r64, r/m32
        const m = decodeModRM(j, rexR, rexX, rexB); j = m.j;
        if (m.isMem) emitEA(f, m, j - GBASE);
        wrReg(f, m.reg, 8, rex, () => { rdRM(f, m, 4, rex); f.op("i64_extend32_s"); });
        handled = true;
      } else if (op >= 0x70 && op <= 0x7F) {                                 // jcc rel8
        const tgt = (j + 1 - GBASE) + imm8s(j); j += 1;
        materialize(f);                                                      // jcc reads flags (loop-trace re-reads each iteration)
        if (tgt === rip && !globalThis.__NOLOOP) loopT = { cc: op & 0xF, fall: j - GBASE };         // backward jcc to entry -> trace as a native loop
        else { i64c(f, tgt); i64c(f, j - GBASE); emitCond(f, op & 0xF); f.op("select"); }
        term = true; n++; i = j; break;
      } else if (op === 0xEB) {                                              // jmp rel8
        const tgt = (j + 1 - GBASE) + imm8s(j); j += 1; materialize(f); i64c(f, tgt); term = true; n++; i = j; break;
      } else if (op === 0xE9) {                                              // jmp rel32
        const tgt = (j + 4 - GBASE) + imm32s(j); j += 4; materialize(f); i64c(f, tgt); term = true; n++; i = j; break;
      } else if (op === 0xE8) {                                              // call rel32
        const tgt = (j + 4 - GBASE) + imm32s(j); j += 4; materialize(f);
        i32c(f, REG + 4 * 8); rdReg(f, 4, 8, true); i64c(f, 8); f.op("i64_sub"); st64(f);    // rsp -= 8
        i64c(f, GBASE); rdReg(f, 4, 8, true); f.op("i64_add"); f.op("i32_wrap_i64"); i64c(f, j - GBASE); f.store("i64_store", 0, 3);   // [rsp] = ret
        i64c(f, tgt); term = true; n++; i = j; break;
      } else if (op === 0xC3) {                                              // ret
        materialize(f);
        i64c(f, GBASE); rdReg(f, 4, 8, true); f.op("i64_add"); f.op("i32_wrap_i64"); f.load("i64_load", 0, 3);   // target = [rsp]
        i32c(f, REG + 4 * 8); rdReg(f, 4, 8, true); i64c(f, 8); f.op("i64_add"); st64(f);    // rsp += 8
        term = true; n++; i = j; break;
      } else if (op === 0xC2) {                                              // ret imm16
        const k = U8[j] | (U8[j + 1] << 8); j += 2; materialize(f);
        i64c(f, GBASE); rdReg(f, 4, 8, true); f.op("i64_add"); f.op("i32_wrap_i64"); f.load("i64_load", 0, 3);
        i32c(f, REG + 4 * 8); rdReg(f, 4, 8, true); i64c(f, 8 + k); f.op("i64_add"); st64(f);
        term = true; n++; i = j; break;
      } else if (op === 0xC9) {                                              // leave: rsp=rbp; rbp=[rsp]; rsp+=8
        i32c(f, REG + 4 * 8); rdReg(f, 5, 8, true); st64(f);                 // rsp = rbp
        wrReg(f, 5, 8, true, () => { i64c(f, GBASE); rdReg(f, 4, 8, true); f.op("i64_add"); f.op("i32_wrap_i64"); f.load("i64_load", 0, 3); });
        i32c(f, REG + 4 * 8); rdReg(f, 4, 8, true); i64c(f, 8); f.op("i64_add"); st64(f);
        handled = true;
      } else if (op === 0x68 || op === 0x6A) {                               // push imm (sign-extended to 64)
        const v = op === 0x6A ? imm8s(j) : imm32s(j); j += op === 0x6A ? 1 : 4;
        i32c(f, REG + 4 * 8); rdReg(f, 4, 8, true); i64c(f, 8); f.op("i64_sub"); st64(f);   // rsp -= 8
        i64c(f, GBASE); rdReg(f, 4, 8, true); f.op("i64_add"); f.op("i32_wrap_i64"); i64c(f, v); f.store("i64_store", 0, 3);
        handled = true;
      } else if (op === 0x9C) {                                              // PUSHFQ: rsp-=8; [rsp]=rfl
        materialize(f);                                                      // pushes rfl -> deferred flags must be live first
        i32c(f, REG + 4 * 8); rdReg(f, 4, 8, true); i64c(f, 8); f.op("i64_sub"); st64(f);
        i64c(f, GBASE); rdReg(f, 4, 8, true); f.op("i64_add"); f.op("i32_wrap_i64"); i32c(f, RFL); ld64(f); f.store("i64_store", 0, 3);
        handled = true;
      } else if (op === 0x9D) {                                              // POPFQ: rfl = ([rsp] & ~0x10000) | 2; rsp+=8
        FLAGPEND = null;                                                     // overwrites rfl entirely -> any deferred flags are dead
        i32c(f, RFL);
        i64c(f, GBASE); rdReg(f, 4, 8, true); f.op("i64_add"); f.op("i32_wrap_i64"); f.load("i64_load", 0, 3);
        i64c(f, ~0x10000); f.op("i64_and"); i64c(f, 2); f.op("i64_or"); st64(f);
        i32c(f, REG + 4 * 8); rdReg(f, 4, 8, true); i64c(f, 8); f.op("i64_add"); st64(f);
        handled = true;
      } else if (op === 0x8F) {                                             // POP r/m64: v=[rsp]; rsp+=8; r/m=v (ea uses OLD rsp)
        const mm = decodeModRM(j, rexR, rexX, rexB); j = mm.j;
        if (mm.isMem) emitEA(f, mm, j - GBASE);
        i64c(f, GBASE); rdReg(f, 4, 8, true); f.op("i64_add"); f.op("i32_wrap_i64"); f.load("i64_load", 0, 3); f.local_set(0);
        i32c(f, REG + 4 * 8); rdReg(f, 4, 8, true); i64c(f, 8); f.op("i64_add"); st64(f);
        wrRM(f, mm, 8, true, () => f.local_get(0));
        handled = true;
      } else if (op === 0x69 || op === 0x6B) {                              // IMUL r, r/m, imm (no flags; result masked to sz, matches cpu.HC)
        const mm = decodeModRM(j, rexR, rexX, rexB); j = mm.j;
        if (mm.isMem) emitEA(f, mm, j - GBASE);
        let v; if (op === 0x6B) { v = imm8s(j); j += 1; } else { v = immSz(j, szV); j += immLen(szV); }
        rdRM(f, mm, szV, rex);
        if (szV === 1) f.op("i64_extend8_s"); else if (szV === 2) f.op("i64_extend16_s"); else if (szV === 4) f.op("i64_extend32_s");  // sext(a,sz)
        i64c(f, v); f.op("i64_mul"); f.local_set(0);
        wrReg(f, mm.reg, szV, rex, () => f.local_get(0));
        handled = true;
      } else if ((op >= 0xA4 && op <= 0xA7) || (op >= 0xAA && op <= 0xAF)) {  // string ops MOVS/CMPS/STOS/LODS/SCAS (non-REP; REP F2/F3 -> interp bulk path)
        const sz = (op & 1) ? szV : 1;
        i64c(f, sz); i64c(f, -sz); i32c(f, RFL); f.load("i32_load", 0, 2); i32c(f, 0x400); f.op("i32_and"); f.op("i32_eqz"); f.op("select"); f.local_set(6);  // d = DF ? -sz : sz
        if (op === 0xAC || op === 0xAD) {                                    // LODS: RAX(sz)=[rsi]; rsi+=d
          rdReg(f, 6, 8, true); f.local_set(3); wrReg(f, 0, sz, rex, () => rdRM(f, MEMM, sz, rex));
          i32c(f, REG + 6 * 8); rdReg(f, 6, 8, true); f.local_get(6); f.op("i64_add"); st64(f);
        } else if (op === 0xAA || op === 0xAB) {                             // STOS: [rdi]=RAX(sz); rdi+=d
          rdReg(f, 7, 8, true); f.local_set(3); wrRM(f, MEMM, sz, rex, () => rdReg(f, 0, sz, rex));
          i32c(f, REG + 7 * 8); rdReg(f, 7, 8, true); f.local_get(6); f.op("i64_add"); st64(f);
        } else if (op === 0xA4 || op === 0xA5) {                             // MOVS: [rdi]=[rsi]; rsi+=d; rdi+=d
          rdReg(f, 6, 8, true); f.local_set(3); rdRM(f, MEMM, sz, rex); f.local_set(0);
          rdReg(f, 7, 8, true); f.local_set(3); wrRM(f, MEMM, sz, rex, () => f.local_get(0));
          i32c(f, REG + 6 * 8); rdReg(f, 6, 8, true); f.local_get(6); f.op("i64_add"); st64(f);
          i32c(f, REG + 7 * 8); rdReg(f, 7, 8, true); f.local_get(6); f.op("i64_add"); st64(f);
        } else if (op === 0xAE || op === 0xAF) {                             // SCAS: cmp RAX,[rdi]; rdi+=d
          rdReg(f, 0, sz, rex); f.local_set(0); rdReg(f, 7, 8, true); f.local_set(3); rdRM(f, MEMM, sz, rex); f.local_set(1);
          f.local_get(0); f.local_get(1); f.op("i64_sub"); f.local_set(2); deferFlags(f, "sub", sz);
          i32c(f, REG + 7 * 8); rdReg(f, 7, 8, true); f.local_get(6); f.op("i64_add"); st64(f);
        } else {                                                            // CMPS (A6/A7): cmp [rsi],[rdi]; rsi+=d; rdi+=d
          rdReg(f, 6, 8, true); f.local_set(3); rdRM(f, MEMM, sz, rex); f.local_set(0);
          rdReg(f, 7, 8, true); f.local_set(3); rdRM(f, MEMM, sz, rex); f.local_set(1);
          f.local_get(0); f.local_get(1); f.op("i64_sub"); f.local_set(2); deferFlags(f, "sub", sz);
          i32c(f, REG + 6 * 8); rdReg(f, 6, 8, true); f.local_get(6); f.op("i64_add"); st64(f);
          i32c(f, REG + 7 * 8); rdReg(f, 7, 8, true); f.local_get(6); f.op("i64_add"); st64(f);
        }
        handled = true;
      } else if (op === 0xFA || op === 0xFB || op === 0xFC || op === 0xFD) { // cli/sti/cld/std (just toggle the rfl bit)
        const bit = op <= 0xFB ? 0x200 : 0x400;                             // IF or DF
        materialize(f);                                                      // read-modify-writes rfl -> deferred flags must be live
        i32c(f, RFL); i32c(f, RFL); ld64(f);
        if (op & 1) { i64c(f, bit); f.op("i64_or"); } else { i64c(f, ~bit); f.op("i64_and"); }
        st64(f); handled = true;
      } else if (op === 0xC0 || op === 0xC1 || op === 0xD0 || op === 0xD1) { // grp2 shift by imm8 / by 1
        const sz = (op & 1) ? szV : 1, byOne = op >= 0xD0;
        const opn = (U8[j] >> 3) & 7;
        const mm = decodeModRM(j, rexR, rexX, rexB); j = mm.j;
        let cnt = byOne ? 1 : (U8[j] & (sz === 8 ? 63 : 31)); if (!byOne) j += 1;
        if (mm.isMem) emitEA(f, mm, j - GBASE);
        if ((opn === 4 || opn === 5 || opn === 7) && cnt !== 0) {            // SHL/SHR/SAR (rotates deferred)
          materialize(f);                                                    // partial-writes CF/ZSP (keeps OF) -> deferred flags live first (also frees locals 0-2)
          const bits = sz * 8, hb = bits - 1, mask = sz === 8 ? null : (1n << BigInt(bits)) - 1n;
          rdRM(f, mm, sz, rex); f.local_set(0);                             // v = operand (zero-ext)
          if (opn === 4) {                                                  // SHL: res=(v<<cnt)&m ; CF=(v>>(bits-cnt))&1
            f.local_get(0); i64c(f, cnt); f.op("i64_shl"); if (mask !== null) { i64c(f, mask); f.op("i64_and"); } f.local_set(2);
            f.local_get(0); i64c(f, bits - cnt); f.op("i64_shr_u"); i64c(f, 1); f.op("i64_and"); f.local_set(1);
          } else if (opn === 5) {                                           // SHR: res=v>>cnt ; CF=(v>>(cnt-1))&1
            f.local_get(0); i64c(f, cnt); f.op("i64_shr_u"); f.local_set(2);
            f.local_get(0); i64c(f, cnt - 1); f.op("i64_shr_u"); i64c(f, 1); f.op("i64_and"); f.local_set(1);
          } else {                                                         // SAR: res=(sext(v)>>cnt)&m ; CF=(v>>(cnt-1))&1
            f.local_get(0); if (sz === 4) f.op("i64_extend32_s"); else if (sz === 2) f.op("i64_extend16_s"); else if (sz === 1) f.op("i64_extend8_s");
            i64c(f, cnt); f.op("i64_shr_s"); if (mask !== null) { i64c(f, mask); f.op("i64_and"); } f.local_set(2);
            f.local_get(0); i64c(f, cnt - 1); f.op("i64_shr_u"); i64c(f, 1); f.op("i64_and"); f.local_set(1);
          }
          wrRM(f, mm, sz, rex, () => f.local_get(2));
          // flags: rfl = (rfl & ~(CF|ZF|SF|PF)) | cf | ZSP(res)   (shifts DON'T set OF, matching DoShift)
          i32c(f, RFL); i32c(f, RFL); ld64(f); i64c(f, -0xC6); f.op("i64_and");
          f.local_get(1); f.op("i64_or");                                                                                  // CF (local1 = 0/1)
          f.local_get(2); if (mask !== null) { i64c(f, mask); f.op("i64_and"); } f.op("i64_eqz"); f.op("i64_extend_i32_u"); i64c(f, 0x40); f.op("i64_mul"); f.op("i64_or"); // ZF
          f.local_get(2); i64c(f, hb); f.op("i64_shr_u"); i64c(f, 1); f.op("i64_and"); i64c(f, 0x80); f.op("i64_mul"); f.op("i64_or");   // SF
          f.local_get(2); i64c(f, 0xFF); f.op("i64_and"); f.op("i64_popcnt"); i64c(f, 1); f.op("i64_and"); f.op("i64_eqz"); f.op("i64_extend_i32_u"); i64c(f, 4); f.op("i64_mul"); f.op("i64_or"); // PF
          st64(f);
          handled = true;
        } else if (cnt === 0 && (opn === 4 || opn === 5 || opn === 7)) { handled = true; }  // shift by 0 = no-op
      } else if (op === 0xF6 || op === 0xF7) {                               // grp3: test/not/neg (mul/div deferred)
        const sz = op === 0xF6 ? 1 : szV, ext = (U8[j] >> 3) & 7;
        const mm = decodeModRM(j, rexR, rexX, rexB); j = mm.j;
        if (ext <= 1) {                                                      // TEST r/m, imm
          const il = sz === 1 ? 1 : sz === 2 ? 2 : 4;
          const v = il === 1 ? imm8s(j) : il === 2 ? (U8[j] | (U8[j + 1] << 8)) : imm32s(j); j += il;
          if (mm.isMem) emitEA(f, mm, j - GBASE);
          rdRM(f, mm, sz, rex); f.local_set(0); i64c(f, v); f.local_set(1);
          f.local_get(0); f.local_get(1); f.op("i64_and"); f.local_set(2);
          deferFlags(f, "logic", sz); handled = true;
        } else if (ext === 2) {                                             // NOT (no flags)
          if (mm.isMem) emitEA(f, mm, j - GBASE);
          wrRM(f, mm, sz, rex, () => { rdRM(f, mm, sz, rex); i64c(f, -1); f.op("i64_xor"); });
          handled = true;
        } else if (ext === 3) {                                            // NEG: r=0-a ; SetSub(0,a,r)
          if (mm.isMem) emitEA(f, mm, j - GBASE);
          rdRM(f, mm, sz, rex); f.local_set(1); i64c(f, 0); f.local_set(0);
          f.local_get(0); f.local_get(1); f.op("i64_sub"); f.local_set(2);
          wrRM(f, mm, sz, rex, () => f.local_get(2));
          deferFlags(f, "sub", sz); handled = true;
        } else {                                                            // ext 4-7: MUL/IMUL/DIV/IDIV -> RDX:RAX, NO flags (matches cpu.HC Grp3)
          if (globalThis.__NOMULDIV) break;                                  // bisect toggle
          if (mm.isMem) emitEA(f, mm, j - GBASE);
          rdRM(f, mm, sz, rex); f.local_set(0);                            // a = rm (zero-extended)
          const sextL = (L) => { f.local_get(L); if (sz === 1) f.op("i64_extend8_s"); else if (sz === 2) f.op("i64_extend16_s"); else if (sz === 4) f.op("i64_extend32_s"); };
          const RAX = REG + 0 * 8, RDX = REG + 2 * 8;
          const exitHere = () => { f.if_(0x40); materialize(f); i32c(f, RIP); i64c(f, i - GBASE); st64(f); i32c(f, n); f.op("return"); f.end(); };  // rare/trapping case -> re-run in interpreter (flush flags)
          if (ext === 4 || ext === 5) {                                    // MUL / IMUL
            rdReg(f, 0, sz, rex); f.local_set(1);                          // b = AL/AX/EAX/RAX
            if (sz === 8) {                                                // full 128-bit: al/ah/bl/bh -> ll/lh/hl/hh -> mid -> lo(RAX)/hi(RDX)
              f.local_get(0); i64c(f, 0xFFFFFFFF); f.op("i64_and"); f.local_set(6);   // al
              f.local_get(0); i64c(f, 32); f.op("i64_shr_u"); f.local_set(7);         // ah
              f.local_get(1); i64c(f, 0xFFFFFFFF); f.op("i64_and"); f.local_set(8);   // bl
              f.local_get(1); i64c(f, 32); f.op("i64_shr_u"); f.local_set(9);         // bh
              f.local_get(6); f.local_get(8); f.op("i64_mul"); f.local_set(10);       // ll = al*bl
              f.local_get(6); f.local_get(9); f.op("i64_mul"); f.local_set(11);       // lh = al*bh
              f.local_get(7); f.local_get(8); f.op("i64_mul"); f.local_set(12);       // hl = ah*bl
              f.local_get(7); f.local_get(9); f.op("i64_mul"); f.local_set(13);       // hh = ah*bh
              f.local_get(10); i64c(f, 32); f.op("i64_shr_u");
              f.local_get(11); i64c(f, 0xFFFFFFFF); f.op("i64_and"); f.op("i64_add");
              f.local_get(12); i64c(f, 0xFFFFFFFF); f.op("i64_and"); f.op("i64_add"); f.local_set(14);  // mid = (ll>>32)+(lh&lo)+(hl&lo)
              i32c(f, RAX); f.local_get(10); i64c(f, 0xFFFFFFFF); f.op("i64_and"); f.local_get(14); i64c(f, 32); f.op("i64_shl"); f.op("i64_or"); st64(f);  // RAX = lo
              i32c(f, RDX);                                                // RDX = hi = hh + (lh>>32)+(hl>>32)+(mid>>32)
              f.local_get(13);
              f.local_get(11); i64c(f, 32); f.op("i64_shr_u"); f.op("i64_add");
              f.local_get(12); i64c(f, 32); f.op("i64_shr_u"); f.op("i64_add");
              f.local_get(14); i64c(f, 32); f.op("i64_shr_u"); f.op("i64_add");
              if (ext === 5) {                                            // IMUL sign-correct: hi -= (a<0?b:0) + (b<0?a:0)
                f.local_get(0); i64c(f, 63); f.op("i64_shr_s"); f.local_get(1); f.op("i64_and"); f.op("i64_sub");
                f.local_get(1); i64c(f, 63); f.op("i64_shr_s"); f.local_get(0); f.op("i64_and"); f.op("i64_sub");
              }
              st64(f);
            } else {                                                      // sz<8: r = a*b (MUL zero-ext, IMUL sign-ext); RAX=low, RDX=high
              if (ext === 4) { f.local_get(0); f.local_get(1); f.op("i64_mul"); }
              else { sextL(0); sextL(1); f.op("i64_mul"); }
              f.local_set(2);
              wrReg(f, 0, sz, rex, () => f.local_get(2));                  // RAX = r & mask
              wrReg(f, 2, sz, rex, () => { f.local_get(2); i64c(f, sz * 8); f.op("i64_shr_u"); });  // RDX = (r>>sz*8) & mask
            }
          } else if (ext === 6) {                                         // DIV (unsigned)
            if (sz === 8) {                                               // guard a==0 || RDX!=0 (128-bit dividend -> interpreter); else RAX=lo/a, RDX=lo%a
              f.local_get(0); f.op("i64_eqz"); i32c(f, RDX); ld64(f); f.op("i64_eqz"); i32c(f, 1); f.op("i32_xor"); f.op("i32_or"); exitHere();
              i32c(f, RAX); ld64(f); f.local_set(1);                      // lo = RAX
              i32c(f, RAX); f.local_get(1); f.local_get(0); f.op("i64_div_u"); st64(f);
              i32c(f, RDX); f.local_get(1); f.local_get(0); f.op("i64_rem_u"); st64(f);
            } else {                                                      // r = (RDX<<bits)|RAX (zero-ext); RAX=r/a, RDX=r%a
              f.local_get(0); f.op("i64_eqz"); exitHere();               // guard a==0
              rdReg(f, 2, sz, rex); i64c(f, sz * 8); f.op("i64_shl"); rdReg(f, 0, sz, rex); f.op("i64_or"); f.local_set(1);  // r
              wrReg(f, 0, sz, rex, () => { f.local_get(1); f.local_get(0); f.op("i64_div_u"); });
              wrReg(f, 2, sz, rex, () => { f.local_get(1); f.local_get(0); f.op("i64_rem_u"); });
            }
          } else {                                                        // IDIV (signed)
            sextL(0); f.local_set(0);                                     // a = sext(rm)  (so sa is signed; reuse local 0)
            f.local_get(0); f.op("i64_eqz"); f.local_get(0); i64c(f, -1); f.op("i64_eq"); f.op("i32_or"); exitHere();  // guard sa==0 || sa==-1 (div trap)
            if (sz === 8) {                                               // cpu.HC 64-bit-fits: RAX=lo/a, RDX=lo%a (ignores RDX dividend)
              i32c(f, RAX); ld64(f); f.local_set(1);                      // lo = RAX
              i32c(f, RAX); f.local_get(1); f.local_get(0); f.op("i64_div_s"); st64(f);
              i32c(f, RDX); f.local_get(1); f.local_get(0); f.op("i64_rem_s"); st64(f);
            } else {                                                      // sdd = (sext(RDX)<<bits)|(RAX&mask); RAX=sdd/sa, RDX=sdd%sa
              sextL2: { rdReg(f, 2, sz, rex); if (sz === 1) f.op("i64_extend8_s"); else if (sz === 2) f.op("i64_extend16_s"); else if (sz === 4) f.op("i64_extend32_s"); }
              i64c(f, sz * 8); f.op("i64_shl"); rdReg(f, 0, sz, rex); f.op("i64_or"); f.local_set(1);  // sdd
              wrReg(f, 0, sz, rex, () => { f.local_get(1); f.local_get(0); f.op("i64_div_s"); });
              wrReg(f, 2, sz, rex, () => { f.local_get(1); f.local_get(0); f.op("i64_rem_s"); });
            }
          }
          handled = true;
        }
      } else if (op >= 0xD8 && op <= 0xDF) {                                 // x87 FPU (geometry+int core; rest -> interpreter)
        if (!FPR || globalThis.__NOX87) break;                               // x87 offsets not wired (or bisect toggle)
        const modrm = U8[j], sub = (modrm >> 3) & 7, isMemX = (modrm >> 6) !== 3, sti = modrm & 7;
        if (isMemX) {
          const memOK = (op === 0xDD && (sub === 0 || sub === 1 || sub === 2 || sub === 3))   // FLD/FISTTP/FST/FSTP m64
            || (op === 0xDF && (sub === 1 || sub === 5 || sub === 7))                // FISTTP m16/FILD/FISTP m64int
            || (op === 0xDB && (sub === 0 || sub === 1 || sub === 3))                // FILD/FISTTP/FISTP m32int
            || (op === 0xDC && sub !== 2 && sub !== 3);                            // FADD/FMUL/FSUB(R)/FDIV(R) m64
          if (!memOK) break;
          const mm = decodeModRM(j, rexR, rexX, rexB); j = mm.j; emitEA(f, mm, j - GBASE);
          // FISTTP mNN (sub 1, the SSE3 truncate-and-pop F64->int store; HolyC emits it for every F64->I64
          // cast, so it's ~half of Varoom's chain breaks). cpu.HC: WrMem(ea,N,F64ToInt(st0)); pop — F64ToInt
          // is the SATURATING HolyC cast (i64.trunc_sat), NOT the round-nearest fRoundI.
          const STW = { 0xDD: ["i64_store", 3], 0xDB: ["i64_store32", 2], 0xDF: ["i64_store16", 1] };
          if (sub === 1 && op !== 0xDC) { memAddr(f); fLd(f, 0); f.fc("i64_trunc_sat_f64_s"); f.store(STW[op][0], 0, STW[op][1]); fPop(f); }
          else if (op === 0xDD && sub === 0) fPush(f, () => { memAddr(f); f.load("f64_load", 0, 3); });
          else if (op === 0xDD && sub === 2) { memAddr(f); fLd(f, 0); f.store("f64_store", 0, 3); }
          else if (op === 0xDD && sub === 3) { memAddr(f); fLd(f, 0); f.store("f64_store", 0, 3); fPop(f); }
          else if (op === 0xDF && sub === 5) fPush(f, () => { memAddr(f); f.load("i64_load", 0, 3); f.op("f64_convert_i64_s"); });
          else if (op === 0xDF && sub === 7) { memAddr(f); fLd(f, 0); fRoundI(f); f.store("i64_store", 0, 3); fPop(f); }
          else if (op === 0xDB && sub === 0) fPush(f, () => { memAddr(f); f.load("i64_load32_u", 0, 2); f.op("i64_extend32_s"); f.op("f64_convert_i64_s"); });
          else if (op === 0xDB && sub === 3) { memAddr(f); fLd(f, 0); fRoundI(f); f.store("i64_store32", 0, 2); fPop(f); }
          else if (op === 0xDC) {                                                  // st0 = st0 OP mem  (sub 0/1/4/5/6/7)
            memAddr(f); f.load("f64_load", 0, 3); f.local_set(5);                  // b -> local5
            const W = sub === 1 ? "f64_mul" : (sub === 0) ? "f64_add" : (sub === 4 || sub === 5) ? "f64_sub" : "f64_div";
            const rev = sub === 5 || sub === 7;                                    // FSUBR/FDIVR: b OP a
            fSt(f, 0, () => { if (rev) { f.local_get(5); fLd(f, 0); } else { fLd(f, 0); f.local_get(5); } f.op(W); });
          }
          handled = true;
        } else {                                                                  // register forms (ST(i))
          const regOK = ((op === 0xD8 || op === 0xDC) && sub !== 2 && sub !== 3)   // st0 OP st(i) / st(i) OP st0
            || (op === 0xD9 && (sub === 0 || sub === 1 || (sub === 4 && sti <= 1)
              || (sub === 7 && sti === 2)));                                       // FLD st(i) / FXCH / FCHS,FABS / FSQRT
          if (!regOK) break;
          j += 1;                                                                  // consume modrm
          if (op === 0xD8) {                                                       // st0 = st0 OP st(i)
            fLd(f, sti); f.local_set(5);
            const W = sub === 1 ? "f64_mul" : sub === 0 ? "f64_add" : (sub === 4 || sub === 5) ? "f64_sub" : "f64_div";
            const rev = sub === 5 || sub === 7;
            fSt(f, 0, () => { if (rev) { f.local_get(5); fLd(f, 0); } else { fLd(f, 0); f.local_get(5); } f.op(W); });
          } else if (op === 0xDC) {                                                // st(i) = st(i) OP st0
            fLd(f, 0); f.local_set(5);
            const W = sub === 1 ? "f64_mul" : sub === 0 ? "f64_add" : (sub === 4 || sub === 5) ? "f64_sub" : "f64_div";
            const rev = sub === 5 || sub === 7;
            fSt(f, sti, () => { if (rev) { f.local_get(5); fLd(f, sti); } else { fLd(f, sti); f.local_get(5); } f.op(W); });
          } else if (op === 0xD9 && sub === 0) fPush(f, () => fLd(f, sti));        // FLD st(i)
          else if (op === 0xD9 && sub === 1) { fLd(f, 0); f.local_set(5); fSt(f, 0, () => fLd(f, sti)); fSt(f, sti, () => f.local_get(5)); }  // FXCH
          else if (op === 0xD9 && sub === 4 && sti === 0) fSt(f, 0, () => { fLd(f, 0); f.op("f64_neg"); });    // FCHS
          else if (op === 0xD9 && sub === 4 && sti === 1) fSt(f, 0, () => { fLd(f, 0); f.op("f64_abs"); });    // FABS
          else if (op === 0xD9 && sub === 7 && sti === 2) fSt(f, 0, () => { fLd(f, 0); f.op("f64_sqrt"); });   // FSQRT (cpu.HC __pow(d,.5); V8's fdlibm pow(x,.5) IS sqrt(x) bit-for-bit)
          handled = true;
        }
      } else if (op === 0x98) {                                              // CBW/CWDE/CDQE: sign-extend the accumulator
        if (rexW) wrReg(f, 0, 8, true, () => { rdReg(f, 0, 4, rex); f.op("i64_extend32_s"); });        // CDQE RAX=sext32(EAX)
        else if (pfx66) wrReg(f, 0, 2, rex, () => { rdReg(f, 0, 1, rex); f.op("i64_extend8_s"); });    // CBW  AX=sext8(AL)
        else wrReg(f, 0, 4, rex, () => { rdReg(f, 0, 2, rex); f.op("i64_extend16_s"); });              // CWDE EAX=sext16(AX)
        handled = true;
      } else if (op === 0x99) {                                              // CDQ/CQO: sign-extend A into D (no flags)
        if (rexW) { i32c(f, REG + 2 * 8); rdReg(f, 0, 8, true); i64c(f, 63); f.op("i64_shr_s"); st64(f); }   // CQO RDX = RAX>>s63
        else wrReg(f, 2, 4, rex, () => { rdReg(f, 0, 4, rex); f.op("i64_extend32_s"); i64c(f, 63); f.op("i64_shr_s"); });  // CDQ EDX = sext(EAX)>>s63
        handled = true;
      } else if (op === 0x90 && !rex) { handled = true; }                    // nop
    } else {                                                                 // 0F two-byte
      if (op === 0x31 && TSC) {                                             // RDTSC: tsc += 100; EAX=tsc.lo; EDX=tsc.hi  (cpu.HC self-advances tsc so spin-waits end)
        i32c(f, TSC); i32c(f, TSC); ld64(f); i64c(f, 100); f.op("i64_add"); st64(f);
        wrReg(f, 0, 4, rex, () => { i32c(f, TSC); ld64(f); });
        wrReg(f, 2, 4, rex, () => { i32c(f, TSC); ld64(f); i64c(f, 32); f.op("i64_shr_u"); });
        handled = true;
      } else if (op === 0xB6 || op === 0xB7) {                              // movzx
        const ssz = op === 0xB6 ? 1 : 2; const m = decodeModRM(j, rexR, rexX, rexB); j = m.j;
        if (m.isMem) emitEA(f, m, j - GBASE);
        wrReg(f, m.reg, szV, rex, () => rdRM(f, m, ssz, rex));               // LDSZ is _u -> zero-extended
        handled = true;
      } else if (op === 0xBE || op === 0xBF) {                               // movsx
        const ssz = op === 0xBE ? 1 : 2; const m = decodeModRM(j, rexR, rexX, rexB); j = m.j;
        if (m.isMem) emitEA(f, m, j - GBASE);
        wrReg(f, m.reg, szV, rex, () => { rdRM(f, m, ssz, rex); f.op(ssz === 1 ? "i64_extend8_s" : "i64_extend16_s"); });
        handled = true;
      } else if (op >= 0x80 && op <= 0x8F) {                                 // jcc rel32
        const tgt = (j + 4 - GBASE) + imm32s(j); j += 4;
        materialize(f);                                                      // jcc reads flags (loop-trace re-reads each iteration)
        if (tgt === rip && !globalThis.__NOLOOP) loopT = { cc: op & 0xF, fall: j - GBASE };         // backward jcc to entry -> trace as a native loop
        else { i64c(f, tgt); i64c(f, j - GBASE); emitCond(f, op & 0xF); f.op("select"); }
        term = true; n++; i = j; break;
      } else if (op === 0xBA) {                                              // grp8 bt/bts/btr/btc r/m, imm8
        const mm = decodeModRM(j, rexR, rexX, rexB); const which = ((U8[j] >> 3) & 7) - 4; j = mm.j;
        const imm = U8[j]; j += 1;
        if (which >= 0) {
          materialize(f);                                                    // bt reads+sets CF -> deferred flags live first (frees local 0)
          if (mm.isMem) {                                                   // MEMORY: byte-addressed bit string (cpu.HC DoBit: ea+=bit>>3; bit&=7; asz=1)
            if (globalThis.__NOBTMEM) break;                                 // bisect toggle
            emitEA(f, mm, j - GBASE);
            const byteOff = imm >> 3, bit = imm & 7, mb = 1n << BigInt(bit);
            if (byteOff) { f.local_get(3); i64c(f, byteOff); f.op("i64_add"); f.local_set(3); }  // ea += imm>>3 (compile-time const)
            rdRM(f, mm, 1, rex); f.local_set(0);                            // a = byte at ea
            i32c(f, RFL); i32c(f, RFL); ld64(f); i64c(f, -2); f.op("i64_and");                    // clear CF
            f.local_get(0); i64c(f, bit); f.op("i64_shr_u"); i64c(f, 1); f.op("i64_and"); f.op("i64_or"); st64(f);  // CF = bit
            if (which !== 0) {                                              // BTS/BTR/BTC: modify+store the byte
              f.local_get(0);
              if (which === 1) { i64c(f, mb); f.op("i64_or"); }
              else if (which === 2) { i64c(f, ~mb); f.op("i64_and"); }
              else { i64c(f, mb); f.op("i64_xor"); }
              f.local_set(1); wrRM(f, mm, 1, rex, () => f.local_get(1));
            }
          } else {                                                         // REGISTER: bit mod operand-size, full-width
            const bit = imm & (szV * 8 - 1), mb = 1n << BigInt(bit);
            i32c(f, RFL); i32c(f, RFL); ld64(f); i64c(f, -2); f.op("i64_and");
            rdReg(f, mm.rm, szV, rex); i64c(f, bit); f.op("i64_shr_u"); i64c(f, 1); f.op("i64_and"); f.op("i64_or"); st64(f);
            if (which === 1) wrReg(f, mm.rm, szV, rex, () => { rdReg(f, mm.rm, szV, rex); i64c(f, mb); f.op("i64_or"); });
            else if (which === 2) wrReg(f, mm.rm, szV, rex, () => { rdReg(f, mm.rm, szV, rex); i64c(f, ~mb); f.op("i64_and"); });
            else if (which === 3) wrReg(f, mm.rm, szV, rex, () => { rdReg(f, mm.rm, szV, rex); i64c(f, mb); f.op("i64_xor"); });
          }
          handled = true;
        }
      } else if (op === 0x1F) { const m = decodeModRM(j, rexR, rexX, rexB); j = m.j; handled = true; }  // nop r/m
    }

    if (!handled) { if (globalThis.__JITSTATS) globalThis.__JITSTATS[(two ? "0F " : "") + op.toString(16)] = (globalThis.__JITSTATS[(two ? "0F " : "") + op.toString(16)] || 0) + 1; break; }   // unknown op: end block (interpreter resumes here)
    i = j; n++;
  }
  if (n === 0) return 0;
  if ((globalThis.__JITSAFE & 2) && globalThis.__sawmem) { blocks.set(rip, { fn: null, ninstr: 0 }); return 0; }  // bisect: skip mem blocks
  // Calling convention (chaining-ready): block STORES the exit rip to the shared RIP and RETURNS the
  // instruction count. For a self-loop, wrap the body in a native WASM loop so the whole loop runs in
  // one call (this is the dispatch win: a `dec rcx; jnz top` blit stays native instead of host round-tripping).
  if (loopT) {
    const K = 1024;                                        // iteration cap per call: bound a single loop-block's instr count well under the PIT period so IRQs fire on time
    f.bytes.unshift(OP.loop, 0x40);                        // loop void, wrapping the already-emitted body
    f.local_get(4); i64c(f, 1); f.op("i64_add"); f.local_set(4);                                  // counter++
    f.local_get(4); i64c(f, K); f.op("i64_lt_u"); emitCond(f, loopT.cc); f.op("i32_and"); f.br_if(0);  // loop while counter<K && taken
    f.end();
    i32c(f, RIP); i64c(f, rip); i64c(f, loopT.fall); f.local_get(4); i64c(f, K); f.op("i64_ge_u"); f.op("select"); st64(f);  // exit rip = cap? entry : fallthrough
    f.local_get(4); i64c(f, n); f.op("i64_mul"); f.op("i32_wrap_i64");   // return counter*n = instructions actually run (i32)
  } else {
    if (term) { f.local_set(3); i32c(f, RIP); f.local_get(3); st64(f); }   // terminator left exit rip on the stack (already materialized before the push)
    else { materialize(f); i32c(f, RIP); i64c(f, i - GBASE); st64(f); }    // fall-through: flush deferred flags so the interpreter sees correct rfl
    i32c(f, n);                                            // return instr count (i32)
  }
  blk.setBody([{ count: 5, vt: VT.i64 }, { count: 1, vt: VT.f64 }, { count: 13, vt: VT.i64 }], f);  // i64: 0-3 scratch, 4 loop counter; f64: 5 x87 scratch; i64 6-15: mul/div scratch; i64 16-18: lazy-flag a/b/r
  m.exportFunc("run", blk.index);
  let inst;
  try { inst = new WebAssembly.Instance(new WebAssembly.Module(Uint8Array.from(m.emit())), { env: { mem: MEM, RdMem: RDMEM, WrMem: WRMEM } }); }
  catch (e) { blocks.set(rip, { fn: null, ninstr: 0 }); return 0; }   // unjittable block: fall back to interpreter
  blocks.set(rip, { fn: inst.exports.run, ninstr: n });
  blockFn[rip & 0xFFFF] = inst.exports.run; blockRip[rip & 0xFFFF] = rip;   // fast dispatch arrays
  if (RUNTBL) RUNTBL.set(rip & 0xFFFF, inst.exports.run);                   // + the WASM dispatch table (call_indirect)
  return n;
}

export function jitRun(rip) { const b = blocks.get(rip); return (b && b.fn) ? b.fn() : 0; }  // runs the block (it writes rip); returns instr count

// Chain JIT'd blocks back-to-back without returning to the interpreter+host each block: each block writes
// the next rip to shared memory and returns its instr count; we keep running while the next rip is also a
// JIT'd block (and the budget holds). One host round-trip covers a whole hot loop -> breaks the dispatch plateau.
// Hot loop is pure i32 + array indexing + a direct wasm call — no BigInt, no Map.
export function jitDispatch(budget) {
  if (globalThis.__COVTRACE) return jitDispatchTrace(budget);     // DIAGNOSTIC: runtime-weight the break opcodes
  if (RUNDISP && globalThis.__WASMDISP === 2) return jitDispatchG(budget);  // DEBUG: JS twin of the WASM logic (hemu arrays + table)
  if (RUNDISP && !globalThis.__JSDISP) return RUNDISP(budget);    // native WASM dispatch (default; __JSDISP forces the JS loop)
  const ripV = new Int32Array(MEM.buffer, RIP, 1);      // JS fallback (no runtime module): rip fits in i31
  let ran = 0;
  while (ran < budget) {
    const rip = ripV[0], slot = rip & 0xFFFF;
    if (blockRip[slot] !== rip) break;                 // next rip isn't a JIT'd block -> back to the interpreter
    const fn = blockFn[slot]; if (!fn) break;
    const c = fn(); ran += c; if (c === 0) break;      // count==0 = guard early-exit, no progress -> let the interpreter run that insn
  }
  return ran;
}

// DIAGNOSTIC dispatch: same chain logic, but when it breaks, decode the opcode AT the break rip and
// accumulate a RUNTIME-weighted histogram (globalThis.__COVBRK) + categorize the break:
//   "op:<hex>"  the chain ended at an unhandled opcode (block terminated there; interpreter must run it)
//   "cold"      the break rip has no compiled block yet (warmup / first reach)
//   "collide"   the rip IS compiled (blocks map) but lost its slot to a colliding rip
function jitDispatchTrace(budget) {
  const dv = new DataView(MEM.buffer), u8 = new Uint8Array(MEM.buffer);
  const brk = (globalThis.__COVBRK ||= {});
  let ran = 0;
  while (ran < budget) {
    const rip = dv.getInt32(RIP, true), slot = rip & 0xFFFF;
    if (blockRip[slot] === rip && blockFn[slot]) { if (globalThis.__PROF) { const P = globalThis.__PROF; P[rip] = (P[rip] || 0) + (blocks.get(rip)?.ninstr || 1); } const c = blockFn[slot](); ran += c; if (c === 0) break; continue; }
    // chain broke -> categorize, weighted by 1 (each break = one interpreter hand-off)
    let key;
    if (blocks.has(rip)) key = "collide";
    else {
      // decode prefixes to the real opcode at GBASE+rip
      let j = GBASE + rip, two = 0, seg = 0;
      for (;;) { const b = u8[j];
        if (b === 0x66 || b === 0x67 || b === 0xF0 || b === 0xF2 || b === 0xF3) { j++; }
        else if (b === 0x64 || b === 0x65) { seg = b; j++; }
        else if (b >= 0x40 && b <= 0x4F) { j++; break; }
        else break; }
      let op = u8[j]; if (op === 0x0F) { two = 1; op = u8[j + 1]; }
      key = seg ? "seg:" + seg.toString(16) : "op:" + (two ? "0F" : "") + op.toString(16);
    }
    brk[key] = (brk[key] || 0) + 1;
    break;
  }
  return ran;
}

// DEBUG twin: same logic as the WASM dispatch module but in JS (reads hemu's g_jit_rip/g_jit_n + the table).
function jitDispatchG(budget) {
  const dv = new DataView(MEM.buffer);
  let ran = 0;
  while (ran < budget) {
    const rip = dv.getInt32(RIP, true), slot = rip & 0xFFFF;
    if (dv.getInt32(JITRIP + slot * 8, true) !== rip) break;
    if (dv.getInt32(JITN + slot * 8, true) <= 0) break;
    const fn = RUNTBL.get(slot); if (!fn) break;
    const c = fn(); ran += c; if (c === 0) break;
  }
  return ran;
}
