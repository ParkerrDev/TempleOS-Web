// Coverage diagnostic: of the instructions executed in-game, what FRACTION runs in JIT'd blocks
// (native WASM) vs the interpreter? And what fraction of wall-clock is spent in __jit_dispatch?
// This decides the lever: low coverage -> the interpreter dominates (fix coverage/thrash); high
// coverage -> the block bodies dominate (fix block leanness via lazy flags).
import { compileHolyC } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/compiler.js";
import { createHost } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/runtime/host.js";
import * as jit from "/Users/parkerh/Dev/TempleOS-wasm/jit.js";
import { readFileSync } from "node:fs";
const RAMSZ = 402653184;
const liveBuf = readFileSync(process.env.LIVE || "/tmp/live.bin");
const diskBuf = readFileSync(process.env.RAW || "/tmp/templeos.raw");
const dir = "/Users/parkerh/Dev/hemu-wasm/src";
const src = readFileSync(dir + "/snapshot.HC", "latin1");
const r = compileHolyC(src, { filename: "snapshot.HC", lenient: false, includeResolver: (p) => { try { return readFileSync(dir + "/" + p, "latin1"); } catch { return null; } } });
const ICOUNT = Number(r.globals.get("icount").addr);
const mod = await WebAssembly.compile(r.bytes);
jit.jitSeg(Number(r.globals.get("msr_fsbase").addr), Number(r.globals.get("msr_gsbase").addr), Number(r.globals.get("tsc").addr));

let mx = 320, my = 240, mb = 0, gBase = 0; const keyq = []; const ovl = new Map();
let inst, bad = false;
// instrumentation accumulators (during measuring only)
let measuring = false, jitInstrs = 0, nDisp = 0, tJit = 0, nCompile = 0, nCompileMeasure = 0;
const host = createHost({ onText: (s) => { if (s && s.indexOf("BADOP") >= 0) { bad = true; process.stdout.write("GUEST: " + s); } }, snd: { tone: () => {} },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
  diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
  present: () => {} });
host.env.__host_msx = () => BigInt(mx); host.env.__host_msy = () => BigInt(my); host.env.__host_msb = () => BigInt(mb); host.env.__host_wheel = () => 0n;
host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n; host.env.__host_budget = () => 1500000n; host.env.__host_dt = () => 33n; host.env.__host_prof = () => {};
host.env.__jit_state = (rg, fl, rp) => { jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem); return 1n; };
host.env.__jit_compile = (rip) => { if (measuring) nCompileMeasure++; nCompile++; return BigInt(jit.jitCompile(Number(rip))); };
host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c);
host.env.__jit_dispatch = (b) => {
  if (!measuring) return BigInt(jit.jitDispatch(Number(b)));
  const t = performance.now(); const n = jit.jitDispatch(Number(b)); tJit += performance.now() - t;
  jitInstrs += n; nDisp++; return BigInt(n);
};
host.env.__jit_chain = (a, b) => jit.jitChain(a, b);

jit.jitReset();
globalThis.__JITSTATS = {};                       // histogram of unhandled opcodes that END blocks (coverage killers)
inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
const icount = () => { const dv = new DataView(inst.exports.memory.buffer); return Number(dv.getBigUint64(ICOUNT, true)); };  // fresh view (memory may grow)
const run = (n) => { for (let i = 0; i < n; i++) inst.exports.__main(); };
const key = (...scs) => { for (const s of scs) { keyq.push(s); run(4); } };
run(120); key(0x31, 0xB1); run(30); key(0x1D, 0x32, 0xB2, 0x9D); run(50); mx = Number(process.env.GX||108); my = Number(process.env.GY||325); run(6); mb = 1; run(10); mb = 0;  // launch BlackDiamond
run(400);
globalThis.__COVTRACE = 1; globalThis.__COVBRK = {}; globalThis.__PROF = {};   // break histogram + per-block instr-weighted exec profile
const ic0 = icount(); measuring = true; const t0 = performance.now(); run(240); const tTot = performance.now() - t0; measuring = false; const ic1 = icount();
globalThis.__COVTRACE = 0;
const totalInstr = ic1 - ic0;
console.log(`total instructions executed (icount delta): ${(totalInstr / 1e6).toFixed(1)}M`);
console.log(`  JIT'd (native):   ${(jitInstrs / 1e6).toFixed(1)}M  = ${(100 * jitInstrs / totalInstr).toFixed(1)}% COVERAGE`);
console.log(`  interpreted:      ${((totalInstr - jitInstrs) / 1e6).toFixed(1)}M  = ${(100 * (totalInstr - jitInstrs) / totalInstr).toFixed(1)}%`);
console.log(`wall-clock: total ${tTot.toFixed(0)}ms, in __jit_dispatch ${tJit.toFixed(0)}ms = ${(100 * tJit / tTot).toFixed(1)}% of time in native JIT`);
console.log(`dispatch calls: ${nDisp}, avg instrs/dispatch: ${nDisp ? (jitInstrs / nDisp).toFixed(0) : 0}`);
console.log(`__jit_compile calls: total ${nCompile} (${nCompileMeasure} during measure -> ${(nCompileMeasure / 240).toFixed(1)}/frame = recompile thrash)`);
const st = jit.jitStats ? jit.jitStats() : {};
console.log(`distinct blocks: ${st.blocks} (live ${st.live}, unjittable ${st.unjittable})`);
const ops = Object.entries(globalThis.__JITSTATS).sort((a, b) => b[1] - a[1]).slice(0, 20);
console.log(`top unhandled opcodes ENDING blocks (op -> #distinct-blocks):`);
for (const [op, c] of ops) console.log(`   ${op.padEnd(6)} ${c}`);
const brk = Object.entries(globalThis.__COVBRK).sort((a, b) => b[1] - a[1]);
const brkTot = brk.reduce((s, e) => s + e[1], 0);
console.log(`\nRUNTIME-weighted chain breaks (why the JIT hands back to the interpreter), total ${brkTot}:`);
for (const [k, c] of brk.slice(0, 22)) console.log(`   ${k.padEnd(10)} ${c}  (${(100 * c / brkTot).toFixed(1)}%)`);
const prof = Object.entries(globalThis.__PROF).sort((a, b) => b[1] - a[1]);
const profTot = prof.reduce((s, e) => s + e[1], 0);
const U8 = new Uint8Array(inst.exports.memory.buffer);
console.log(`\nHOTTEST JIT'd blocks (instr-weighted; ${profTot ? (profTot / 1e6).toFixed(0) : 0}M block-instr total) — bytes for disasm:`);
for (const [rip, c] of prof.slice(0, 12)) {
  const a = gBase + Number(rip); let hex = "";
  for (let i = 0; i < 28; i++) hex += U8[a + i].toString(16).padStart(2, "0") + " ";
  console.log(`   rip=${Number(rip).toString(16)}  ${(100 * c / profTot).toFixed(1)}%  n=${jit.jitStats ? "" : ""}  ${hex}`);
}
console.log(bad ? "BADOP — JIT broke the game" : "no fault");
