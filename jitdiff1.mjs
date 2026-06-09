// Instruction-level differential test: run each instruction through hemu's interpreter (Step()) AND the
// JIT block on IDENTICAL inputs, compare reg[0..15]+rfl+written memory. Ground truth = the interpreter,
// so this PROVES the JIT's values (adc/sbb/mul/div/imul/string/bt) match exactly, free of any IRQ/timing
// confound. The new ops are the focus (complex flags).
import { compileHolyC } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/compiler.js";
import { createHost } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/runtime/host.js";
import * as jit from "/Users/parkerh/Dev/TempleOS-wasm/jit.js";
import { readFileSync } from "node:fs";
const RAMSZ = 402653184, SCRATCH = 0x10000000, MOPND = 0x10100000;   // guest scratch within real RAM (256MB): code + mem operand
const liveBuf = readFileSync(process.env.LIVE || "/tmp/live.bin");
const dir = "/Users/parkerh/Dev/hemu-wasm/src";
const src = readFileSync(dir + "/snapshot.HC", "latin1");
const r = compileHolyC(src, { filename: "snapshot.HC", lenient: false, includeResolver: (p) => { try { return readFileSync(dir + "/" + p, "latin1"); } catch { return null; } } });
// reg/rfl/rip/fpr/fsp/x87_sw moved into per-core CCpuState (snapshot.HC); capture their addresses from the
// guest's __jit_state/__jit_x87 handoff (robust vs the globals map). halted is 16B after rip in CCpuState.
let REG = 0, RFL = 0, RIP = 0, FPR = 0, FSP = 0, X87 = 0, HALTED = 0;
const mod = await WebAssembly.compile(r.bytes);
// msr_fsbase/gsbase now per-core (CCpuState); addresses handed to the JIT via __jit_seg (host import below).
let gBase = 0, inst;
const host = createHost({ onText: () => {}, snd: { tone: () => {} }, snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); }, diskRead: () => {}, diskWrite: () => {}, present: () => {} });
host.env.__host_msx = () => 0n; host.env.__host_msy = () => 0n; host.env.__host_msb = () => 0n; host.env.__host_wheel = () => 0n;
host.env.__host_key = () => -1n; host.env.__host_budget = () => 1000000n; host.env.__host_dt = () => 33n; host.env.__host_prof = () => {}; host.env.__host_time = () => 0n;
host.env.__jit_state = (rg, fl, rp) => { REG = Number(rg); RFL = Number(fl); RIP = Number(rp); HALTED = RIP + 16; jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem); return 1n; };
host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip))); host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
host.env.__jit_x87 = (a, b, c) => { FPR = Number(a); FSP = Number(b); X87 = Number(c); jit.jitX87(a, b, c); }; host.env.__jit_dispatch = (b) => BigInt(jit.jitDispatch(Number(b))); host.env.__jit_chain = (a, b) => jit.jitChain(a, b); host.env.__jit_seg = (fs, gs, tsc) => jit.jitSeg(Number(fs), Number(gs), Number(tsc));
inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
// boot the OS until the snapshot loads (snapLoad sets gBase + mem_size); else the interp MMIO-routes scratch RAM
for (let i = 0; i < 12 && gBase === 0; i++) inst.exports.__main();
if (!gBase) throw new Error("snapshot did not load (gBase still 0)");
// wire jit offsets (state ptrs) with the REAL gBase
jit.jitState(REG, RFL, RIP, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem); jit.jitX87(FPR, FSP, X87);

const dv = () => new DataView(inst.exports.memory.buffer);
const u8 = () => new Uint8Array(inst.exports.memory.buffer);
const setReg = (i, v) => dv().setBigUint64(REG + i * 8, BigInt.asUintN(64, BigInt(v)), true);
const getReg = (i) => dv().getBigUint64(REG + i * 8, true);
const setRfl = (v) => dv().setBigUint64(RFL, BigInt(v), true);
const getRfl = () => dv().getBigUint64(RFL, true);
const setMem = (a, v) => dv().setBigUint64(gBase + a, BigInt.asUintN(64, BigInt(v)), true);
const getMem = (a) => dv().getBigUint64(gBase + a, true);
const rnd = () => { let x = 0n; for (let k = 0; k < 8; k++) x = (x << 8n) | BigInt((Math.random() * 256) | 0); return x; };

let pass = 0, fail = 0; const fails = []; const failByName = {}, passByName = {};
function run1(bytes, inReg, inRfl, inMem) {
  // write code + terminator (0xCC ends the JIT block right after the test insn)
  const m = u8(); for (let k = 0; k < bytes.length; k++) m[gBase + SCRATCH + k] = bytes[k]; m[gBase + SCRATCH + bytes.length] = 0xCC;
  const applyIn = () => { for (let i = 0; i < 16; i++) setReg(i, inReg[i] ?? 0n); setRfl(inRfl); if (inMem) for (const [a, v] of inMem) setMem(a, v); dv().setBigUint64(HALTED, 0n, true); dv().setBigUint64(RIP, BigInt(SCRATCH), true); };
  // ---- interpreter ground truth ----
  applyIn(); inst.exports.Step();
  const iReg = []; for (let i = 0; i < 16; i++) iReg.push(getReg(i)); const iRfl = getRfl(); const iMem = inMem ? inMem.map(([a]) => getMem(a)) : [];
  // ---- JIT ----
  applyIn(); jit.jitReset(); jit.jitCompile(SCRATCH); jit.jitRun(SCRATCH);
  const jReg = []; for (let i = 0; i < 16; i++) jReg.push(getReg(i)); const jRfl = getRfl(); const jMem = inMem ? inMem.map(([a]) => getMem(a)) : [];
  return { iReg, iRfl, iMem, jReg, jRfl, jMem };
}
function test(name, bytes, inReg, inRfl, inMem, flagMask = 0x8D5n) {   // compare regs + (rfl & flagMask: CF PF ZF SF OF) + mem
  const res = run1(bytes, inReg, inRfl, inMem);
  let ok = true, why = [];
  for (let i = 0; i < 16; i++) if (res.iReg[i] !== res.jReg[i]) { ok = false; why.push(`r${i}: int=${res.iReg[i].toString(16)} jit=${res.jReg[i].toString(16)}`); }
  if ((res.iRfl & flagMask) !== (res.jRfl & flagMask)) { ok = false; why.push(`rfl&mask: int=${(res.iRfl & flagMask).toString(16)} jit=${(res.jRfl & flagMask).toString(16)}`); }
  for (let k = 0; k < res.iMem.length; k++) if (res.iMem[k] !== res.jMem[k]) { ok = false; why.push(`mem[${k}]: int=${res.iMem[k].toString(16)} jit=${res.jMem[k].toString(16)}`); }
  if (ok) { pass++; passByName[name] = (passByName[name] || 0) + 1; } else { fail++; failByName[name] = (failByName[name] || 0) + 1; if (fails.length < 8) fails.push(`${name}: ${why.join("; ")}`); }
}
// build reg input array helper
const R = (o) => { const a = []; for (let i = 0; i < 16; i++) a.push(o[i] ?? 0n); return a; };
const CF0 = 0x2n, CF1 = 0x3n;   // rfl base (bit1=1 always) with CF=0 / CF=1

// ---- ADC/SBB (the complex carry-in flags) — random + adversarial, 8/16/32/64-bit ----
for (let t = 0; t < 400; t++) {
  const a = rnd(), b = rnd(), cf = (t & 1) ? CF1 : CF0;
  test("adc rax,rbx", [0x48, 0x11, 0xD8], R({ 0: a, 3: b }), cf);
  test("sbb rax,rbx", [0x48, 0x19, 0xD8], R({ 0: a, 3: b }), cf);
  test("adc eax,ebx", [0x11, 0xD8], R({ 0: a, 3: b }), cf);
  test("sbb eax,ebx", [0x19, 0xD8], R({ 0: a, 3: b }), cf);
  test("adc ax,bx", [0x66, 0x11, 0xD8], R({ 0: a, 3: b }), cf);
  test("adc al,bl", [0x10, 0xD8], R({ 0: a, 3: b }), cf);
  test("adc rax,imm8", [0x48, 0x83, 0xD0, 0x7F], R({ 0: a }), cf);   // 83 /2 ib
  test("sbb rax,imm32", [0x48, 0x81, 0xD8, 0x21, 0x43, 0x65, 0x07], R({ 0: a }), cf);  // 81 /3 id
}
// adversarial carry edges
for (const [a, b, cf] of [[0xFFFFFFFFFFFFFFFFn, 0n, CF1], [0xFFFFFFFFFFFFFFFFn, 0xFFFFFFFFFFFFFFFFn, CF1], [0n, 0n, CF1], [5n, 5n, CF1], [0x8000000000000000n, 0x8000000000000000n, CF0]]) {
  test("adc edge", [0x48, 0x11, 0xD8], R({ 0: a, 3: b }), cf);
  test("sbb edge", [0x48, 0x19, 0xD8], R({ 0: a, 3: b }), cf);
}
// ---- MUL/IMUL/DIV/IDIV ----
for (let t = 0; t < 400; t++) {
  const a = rnd(), b = rnd();
  test("mul rbx", [0x48, 0xF7, 0xE3], R({ 0: a, 3: b }), CF0);
  test("imul rbx", [0x48, 0xF7, 0xEB], R({ 0: a, 3: b }), CF0);
  test("mul ebx", [0xF7, 0xE3], R({ 0: a, 3: b }), CF0);
  test("imul ecx", [0xF7, 0xE9], R({ 0: a, 1: b }), CF0);
  test("imul rax,rbx,imm8", [0x48, 0x6B, 0xC3, 0x05], R({ 3: b }), CF0);
  test("imul eax,ecx,imm32", [0x69, 0xC1, 0x11, 0x22, 0x33, 0x04], R({ 1: b }), CF0);
  // DIV/IDIV: keep RDX small (0) so the 64-bit-fits path is exercised; divisor nonzero
  const d = (b & 0xFFFFFFFFn) | 1n;
  test("div rbx (rdx=0)", [0x48, 0xF7, 0xF3], R({ 0: a, 2: 0n, 3: d }), CF0);
  test("idiv rbx (rdx=0)", [0x48, 0xF7, 0xFB], R({ 0: a & 0x7FFFFFFFFFFFFFFFn, 2: 0n, 3: d }), CF0);
  test("div ebx", [0xF7, 0xF3], R({ 0: a, 2: 0n, 3: d }), CF0);
}
// ---- string ops (MOVS/LODS/STOS, 64 & 8-bit), DF=0 and DF=1 ----
for (let t = 0; t < 100; t++) {
  const v = rnd(), df = (t & 1) ? 0x402n : 0x2n;   // bit10 = DF
  test("movsq", [0x48, 0xA5], R({ 6: BigInt(MOPND), 7: BigInt(MOPND + 0x1000) }), df, [[MOPND, v], [MOPND + 0x1000, 0n]]);
  test("lodsq", [0x48, 0xAD], R({ 6: BigInt(MOPND) }), df, [[MOPND, v]]);
  test("stosq", [0x48, 0xAB], R({ 0: v, 7: BigInt(MOPND) }), df, [[MOPND, 0n]]);
  test("lodsb", [0xAC], R({ 6: BigInt(MOPND) }), df, [[MOPND, v]]);
  test("stosb", [0xAA], R({ 0: v, 7: BigInt(MOPND) }), df, [[MOPND, 0n]]);
}
// ---- BT/BTS/BTR/BTC [mem], imm8 (byte-addressed bit string) ----
for (let t = 0; t < 100; t++) {
  const v = rnd(), bit = (Math.random() * 64) | 0;
  test("bt [rax],imm", [0x48, 0x0F, 0xBA, 0x20, bit], R({ 0: BigInt(MOPND) }), CF0, [[MOPND, v]]);
  test("bts [rax],imm", [0x48, 0x0F, 0xBA, 0x28, bit], R({ 0: BigInt(MOPND) }), CF0, [[MOPND, v], [MOPND + 8, 0n]]);
  test("btr [rax],imm", [0x48, 0x0F, 0xBA, 0x30, bit], R({ 0: BigInt(MOPND) }), CF0, [[MOPND, v], [MOPND + 8, 0n]]);
  test("btc [rax],imm", [0x48, 0x0F, 0xBA, 0x38, bit], R({ 0: BigInt(MOPND) }), CF0, [[MOPND, v], [MOPND + 8, 0n]]);
}
// ---- PUSHF/POPF/PUSH r/m/POP r/m ----
for (let t = 0; t < 50; t++) {
  const v = rnd(), sp = BigInt(MOPND + 0x800);
  test("push rbx", [0x48, 0xFF, 0xF3], R({ 3: v, 4: sp }), CF0, [[MOPND + 0x800 - 8, 0n]]);
  test("pop rbx", [0x8F, 0xC3], R({ 4: sp }), CF0, [[MOPND + 0x800, v]]);
  test("pushfq", [0x9C], R({ 4: sp }), 0x2n | (v & 0x8D5n), [[MOPND + 0x800 - 8, 0n]]);
}
console.log(`jitdiff1: ${pass} pass, ${fail} fail`);
console.log("failing ops:", Object.keys(failByName).length ? "" : "(none)");
for (const n of Object.keys(failByName).sort((a, b) => failByName[b] - failByName[a])) console.log(`   ${n}: ${failByName[n]} fail / ${(passByName[n] || 0) + failByName[n]} total`);
for (const f of fails) console.log("  e.g. " + f);
console.log(fail === 0 ? "ALL VALUES MATCH THE INTERPRETER — JIT new ops are bit-correct" : "VALUE MISMATCH — JIT op bug");
