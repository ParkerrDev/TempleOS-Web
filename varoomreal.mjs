// Worker-FAITHFUL Varoom measurement: replicate hemu-worker.js pacing exactly (real wall-clock dt,
// auto-sized budget, present-drop-if-outstanding>=2) and report the numbers that decide the lever:
//   - distinct fps (what the user sees)
//   - MIPS (emulator throughput in this real-pacing regime)
//   - instructions per distinct frame (render cost)
//   - real-time hot-block profile (__PROF) — is the cost render-compute or a clock-tied spin?
// Run: GX=225 GY=325 SECS=6 node varoomreal.mjs
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
const NOJIT = !!process.env.NOJIT;
jit.jitSeg(Number(r.globals.get("msr_fsbase").addr), Number(r.globals.get("msr_gsbase").addr), Number(r.globals.get("tsc").addr));

let mx = 320, my = 240, mb = 0, gBase = 0; const keyq = []; const ovl = new Map();
let inst, bad = false;
let curBudget = 1500000, dtMs = 16, outstanding = 0;
let measuring = false, presents = 0, distinct = 0, lastHash = 0;
const host = createHost({ onText: (s) => { if (s && s.indexOf("BADOP") >= 0) { bad = true; process.stdout.write("GUEST: " + s); } }, snd: { tone: () => {} },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
  diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
  present: (a, w, h, u8) => {                       // worker copies w*h out per composite on the emu thread, then postMessages
    if (outstanding >= 2) return;                   // worker drops if main hasn't acked 2 frames
    const buf = Buffer.allocUnsafe(w * h); buf.set(u8.subarray(a, a + w * h));   // faithful: pay the copy on this thread
    if (measuring) { let s = 0; const STR = Number(process.env.STRIDE || 1); for (let i = 0; i < w * h; i += STR) s = (s * 16777619 ^ buf[i]) >>> 0; presents++; if (s !== lastHash) { distinct++; lastHash = s; } }
    outstanding++; outstanding--;                    // node has no 2nd thread; ack immediately (best-case, never drops)
  } });
host.env.__host_msx = () => BigInt(mx); host.env.__host_msy = () => BigInt(my); host.env.__host_msb = () => BigInt(mb); host.env.__host_wheel = () => 0n;
host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n;
host.env.__host_budget = () => BigInt(curBudget | 0); host.env.__host_dt = () => BigInt(dtMs | 0); host.env.__host_prof = () => {};
host.env.__host_time = () => 0n;                     // RTC pinned (1s granularity doesn't drive a 30fps loop)
const G_FS_OFF = Number(r.globals.get("msr_fsbase").addr);   // current task (Fs) -> bucket instrs by task
const taskInstr = new Map();
if (!NOJIT) {
  host.env.__jit_state = (rg, fl, rp) => { jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem); return 1n; };
  host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip)));
  host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
  host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c);
  host.env.__jit_dispatch = (b) => { if (!measuring) return BigInt(jit.jitDispatch(Number(b)));
    const fs = new DataView(inst.exports.memory.buffer).getBigUint64(G_FS_OFF, true); const n = jit.jitDispatch(Number(b)); taskInstr.set(fs, (taskInstr.get(fs) || 0) + n); return BigInt(n); };
  host.env.__jit_chain = (a, b) => jit.jitChain(a, b);
}
if (!NOJIT) jit.jitReset();
inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
const icount = () => { const dv = new DataView(inst.exports.memory.buffer); return Number(dv.getBigUint64(ICOUNT, true)); };
// faithful worker loop step (real dt + auto-budget); FFWD=N pins dt=33 + budget=N (fast-forward regime)
const FFWD = Number(process.env.FFWD || 0);
let lastT = performance.now();
const step = () => { if (FFWD) { dtMs = 33; curBudget = FFWD; inst.exports.__main(); return; }
  const now = performance.now(); dtMs = Math.max(1, Math.min(100, now - lastT)); lastT = now; inst.exports.__main();
  const work = performance.now() - now; if (work > 15 && curBudget > 900000) curBudget = (curBudget * 0.90) | 0; else if (work < 11 && curBudget < 2500000) curBudget = (curBudget * 1.07) | 0; };
const run = (n) => { for (let i = 0; i < n; i++) step(); };
const key = (...scs) => { for (const s of scs) { keyq.push(s); run(4); } };
// boot + launch Varoom (Ctrl+M menu, sprite click)
run(120); key(0x31, 0xB1); run(30); key(0x1D, 0x32, 0xB2, 0x9D); run(50);
mx = Number(process.env.GX || 225); my = Number(process.env.GY || 325); run(6); mb = 1; run(10); mb = 0;
run(400);
// MEASURE: run for SECS wall-clock seconds at faithful pacing
globalThis.__PROF = {}; globalThis.__COVBRK = {}; globalThis.__COVTRACE = 1;   // route jitDispatch -> trace (fills __PROF)
const SECS = Number(process.env.SECS || 6);
const ic0 = icount(); measuring = true; const t0 = performance.now(); let mains = 0;
while (performance.now() - t0 < SECS * 1000) { step(); mains++; }
const tTot = (performance.now() - t0) / 1000; measuring = false; const ic1 = icount();
const totalInstr = ic1 - ic0;
console.log(`=== Varoom @ worker-faithful pacing (${NOJIT ? "INTERP" : "JIT"}) over ${tTot.toFixed(2)}s ===`);
console.log(`distinct frames: ${distinct}  -> ${(distinct / tTot).toFixed(1)} FPS    (presents/composites: ${presents} -> ${(presents / tTot).toFixed(1)}/s)`);
console.log(`__main calls: ${mains} -> ${(mains / tTot).toFixed(0)}/s   final budget ${curBudget}  (avg dt ${(tTot * 1000 / mains).toFixed(1)}ms/main)`);
console.log(`instructions: ${(totalInstr / 1e6).toFixed(0)}M -> ${(totalInstr / 1e6 / tTot).toFixed(0)} MIPS`);
console.log(`instr / distinct frame: ${distinct ? (totalInstr / distinct / 1e6).toFixed(1) : "n/a"}M    instr / composite: ${presents ? (totalInstr / presents / 1e6).toFixed(1) : "n/a"}M`);
const prof = Object.entries(globalThis.__PROF).sort((a, b) => b[1] - a[1]);
const profTot = prof.reduce((s, e) => s + e[1], 0);
const U8 = new Uint8Array(inst.exports.memory.buffer);
console.log(`\nHOTTEST blocks at REAL-TIME pacing (instr-weighted; ${(profTot / 1e6).toFixed(0)}M):`);
for (const [rip, c] of prof.slice(0, 14)) {
  const a = gBase + Number(rip); let hex = ""; for (let i = 0; i < 16; i++) hex += U8[a + i].toString(16).padStart(2, "0") + " ";
  console.log(`   rip=${Number(rip).toString(16).padStart(8)}  ${(100 * c / profTot).toFixed(1)}%  ${hex}`);
}
// PARALLELISM POTENTIAL: bucket per-frame instrs by current task (Fs). Varoom's render runs as a JobQue'd
// job in its own task -> its whole call tree attributes there. A high render-task fraction = SMP scales.
const tasks = [...taskInstr.entries()].sort((a, b) => b[1] - a[1]);
const tTot2 = tasks.reduce((s, e) => s + e[1], 0);
console.log(`\nPER-TASK instruction share (Fs = current task) — parallel render runs in its own job task:`);
for (const [fs, n] of tasks.slice(0, 8)) console.log(`   Fs=0x${fs.toString(16).padStart(9, "0")}  ${(100 * n / tTot2).toFixed(1)}%  (${(n / 1e6).toFixed(0)}M)`);
console.log(`distinct tasks seen: ${tasks.length}; top task = ${tasks.length ? (100 * tasks[0][1] / tTot2).toFixed(1) : 0}% (Amdahl: if this is the parallel render, N cores -> speedup ~ 1/((1-p)+p/N))`);
// identify each task by scanning its CTask for ASCII strings (task_name: "Varoom"/"Animate"/"Adam"/...)
const U8d = new Uint8Array(inst.exports.memory.buffer);
const strings = (gaddr, len) => { const out = []; let cur = ""; for (let i = 0; i < len; i++) { const c = U8d[gBase + gaddr + i]; if (c >= 32 && c < 127) cur += String.fromCharCode(c); else { if (cur.length >= 3) out.push(cur); cur = ""; } } return out.slice(0, 8).join(" | "); };
console.log(`\nTASK IDENTITY (ASCII strings in each CTask, ~first 1.2KB):`);
for (const [fs, n] of tasks.slice(0, 5)) if (n > 0) console.log(`   Fs=0x${fs.toString(16)} (${(100 * n / tTot2).toFixed(1)}%): ${strings(Number(fs), 1200)}`);
console.log(bad ? "BADOP" : "no fault");
