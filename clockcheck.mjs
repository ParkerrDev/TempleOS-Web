// clockcheck.mjs — quantify the "everything runs ~2x speed" bug: replicate hemu-worker.js pacing exactly
// (real wall-clock dt, auto-sized budget) on the DESKTOP and measure guest time vs real time.
//   guest jiffies (u64 @ 0xBD98, 1000/s in TempleOS) -> jiffies per wall-second should be ~1000
//   guest TSC -> ticks per wall-second should match the snapshot's calibration regardless of JIT MIPS
// Run: node clockcheck.mjs        (JIT, like the live site)
//      NOJIT=1 node clockcheck.mjs (interpreter)
import { compileHolyC } from "./holyc-wasm/src/compiler.js";
import { createHost } from "./holyc-wasm/src/runtime/host.js";
import * as jit from "./jit.js";
import { readFileSync } from "node:fs";
const RAMSZ = 402653184;
const liveBuf = readFileSync("/tmp/live.bin");
const diskBuf = readFileSync("/tmp/templeos.raw");
const dir = "./hemu-wasm/src";
const src = readFileSync(dir + "/snapshot.HC", "latin1");
const r = compileHolyC(src, { filename: "snapshot.HC", lenient: false, includeResolver: (p) => { try { return readFileSync(dir + "/" + p, "latin1"); } catch { return null; } } });
const G = (n) => Number(r.globals.get(n).addr);
const ICOUNT = G("icount"), TSC = G("tsc"), PITDIV = G("pit_div"), TSCRATE = G("tsc_rate");
const mod = await WebAssembly.compile(r.bytes);
const NOJIT = !!process.env.NOJIT;

let gBase = 0, inst;
let curBudget = 1500000, dtMs = 16;
const ovl = new Map();
const host = createHost({ onText: () => {}, snd: { tone: () => {} },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
  diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
  present: () => {} });
host.env.__host_msx = () => 320n; host.env.__host_msy = () => 240n; host.env.__host_msb = () => 0n; host.env.__host_wheel = () => 0n;
host.env.__host_key = () => -1n; host.env.__host_prof = () => {};
host.env.__host_budget = () => BigInt(curBudget | 0); host.env.__host_dt = () => BigInt(dtMs | 0);
if (!NOJIT) {
  host.env.__jit_state = (rg, fl, rp) => { jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem); return 1n; };
  host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip)));
  host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
  host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c);
  host.env.__jit_dispatch = (b) => BigInt(jit.jitDispatch(Number(b)));
  host.env.__jit_chain = (a, b) => jit.jitChain(a, b); host.env.__jit_seg = (a, b, c) => jit.jitSeg(Number(a), Number(b), Number(c));
  jit.jitReset();
}
inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
const dv = () => new DataView(inst.exports.memory.buffer);
const jiffies = () => Number(dv().getBigUint64(gBase + 0xBD98, true));
const rdU64 = (a) => Number(dv().getBigUint64(a, true));

// worker-faithful loop (mirrors hemu-worker.js: 60Hz pacing + fractional-dt carry + 24M budget cap)
const FRAME_MS = 1000 / 60;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastT = performance.now(), dtAcc = 0;
const step = async () => { const now = performance.now();
  dtAcc += now - lastT; lastT = now; if (dtAcc > 100) dtAcc = 100;
  dtMs = Math.max(1, Math.min(100, Math.floor(dtAcc))); dtAcc -= dtMs;
  inst.exports.__main();
  const work = performance.now() - now;
  if (work > 15 && curBudget > 900000) curBudget = (curBudget * 0.90) | 0; else if (work < 11 && curBudget < 24000000) curBudget = (curBudget * 1.07) | 0;
  const wait = FRAME_MS - (performance.now() - now); if (wait > 1) await sleep(wait); };
for (let i = 0; i < 150; i++) await step();        // warm up / settle
const SECS = Number(process.env.SECS || 8);
const j0 = jiffies(), t0 = performance.now(), ic0 = rdU64(ICOUNT), ts0 = rdU64(TSC);
let mains = 0;
while (performance.now() - t0 < SECS * 1000) { await step(); mains++; }
const wall = (performance.now() - t0) / 1000;
const j1 = jiffies(), ic1 = rdU64(ICOUNT), ts1 = rdU64(TSC);
console.log(`=== desktop clock check (${NOJIT ? "INTERP" : "JIT"}) over ${wall.toFixed(2)}s wall ===`);
console.log(`guest jiffies/s : ${((j1 - j0) / wall).toFixed(0)}   (should be ~1000; ratio to real = ${((j1 - j0) / wall / 1000).toFixed(2)}x)`);
console.log(`guest TSC/s     : ${((ts1 - ts0) / wall / 1e6).toFixed(1)}M ticks/s`);
console.log(`throughput      : ${((ic1 - ic0) / wall / 1e6).toFixed(0)} MIPS, ${(mains / wall).toFixed(0)} __main/s, final budget ${curBudget}`);
console.log(`pit_div=${rdU64(PITDIV)} tsc_rate=${rdU64(TSCRATE)}`);
