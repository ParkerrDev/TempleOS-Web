// varoomceiling.mjs — box-independent ceiling for Varoom. Two numbers that DON'T depend on the 60Hz
// pacing or (much) on box load relative to itself:
//   (1) guest instructions per DISTINCT displayed frame  — deterministic work-per-frame (the algorithm)
//   (2) flat-out JIT MIPS                                 — raw throughput on THIS box (caveat: contention)
//   => fps ceiling on a machine doing M MIPS  =  M / (instr-per-frame)
// Run UNPACED (no sleep, fixed huge budget) so we measure throughput, not the pacing cap.
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
const ICOUNT = G("icount");
const mod = await WebAssembly.compile(r.bytes);
const NOJIT = !!process.env.NOJIT;

let mx = 320, my = 240, mb = 0, gBase = 0, inst, bad = false;
let measuring = false, distinct = 0, lastHash = 0, presents = 0;
const keyq = []; const ovl = new Map();
const host = createHost({ onText: (s) => { if (s && s.indexOf("BADOP") >= 0) { bad = true; process.stdout.write("GUEST: " + s); } }, snd: { tone: () => {} },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
  diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
  present: (a, w, h, u8) => { if (!measuring) return; let s = 0x811c9dc5; for (let i = 0; i < w * h; i++) s = ((s ^ u8[a + i]) * 16777619) >>> 0; presents++; if (s !== lastHash) { distinct++; lastHash = s; } } });
host.env.__host_msx = () => BigInt(mx); host.env.__host_msy = () => BigInt(my); host.env.__host_msb = () => BigInt(mb); host.env.__host_wheel = () => 0n;
host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n; host.env.__host_prof = () => {};
let BUD = Number(process.env.BUD || 4000000);
host.env.__host_budget = () => BigInt(BUD); host.env.__host_dt = () => 16n;   // FIXED budget+dt: unpaced, deterministic clock
if (!NOJIT) {
  host.env.__jit_state = (rg, fl, rp) => { jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem, process.env.NORHI ? undefined : inst.exports.RasterHLE); return 1n; };
  host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip)));
  host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
  host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c);
  host.env.__jit_dispatch = (b) => BigInt(jit.jitDispatch(Number(b)));
  host.env.__jit_chain = (a, b) => jit.jitChain(a, b);
  host.env.__jit_seg = (a, b, c) => jit.jitSeg(Number(a), Number(b), Number(c));
  jit.jitReset();
}
inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
const dv = () => new DataView(inst.exports.memory.buffer);
const rdU64 = (a) => Number(dv().getBigUint64(a, true));
const run = (n) => { for (let i = 0; i < n; i++) inst.exports.__main(); };
const key = (...scs) => { for (const s of scs) { keyq.push(s); run(4); } };
// boot + launch Varoom (unpaced)
run(150); key(0x31, 0xB1); run(30); key(0x1D, 0x32, 0xB2, 0x9D); run(50);
mx = 225; my = 325; run(6); mb = 1; run(10); mb = 0; run(250);
// FLAT-OUT throughput window: spin __main as fast as possible for SECS wall-seconds
const SECS = Number(process.env.SECS || 6);
measuring = true;
const t0 = performance.now(), ic0 = rdU64(ICOUNT); let mains = 0;
while (performance.now() - t0 < SECS * 1000) { run(1); mains++; }
const wall = (performance.now() - t0) / 1000, ic1 = rdU64(ICOUNT);
measuring = false;
const instr = ic1 - ic0, mips = instr / wall / 1e6;
const ipf = distinct ? instr / distinct : 0;
console.log(`=== Varoom ceiling (${NOJIT ? "INTERP" : "JIT"}, unpaced, budget ${(BUD / 1e6).toFixed(1)}M, ${wall.toFixed(1)}s) ${bad ? "BADOP!" : ""} ===`);
console.log(`flat-out throughput : ${mips.toFixed(0)} MIPS   (${mains} __main, ${(mains / wall).toFixed(0)}/s)`);
console.log(`distinct frames     : ${distinct}  (${(distinct / wall).toFixed(1)} fps UNPACED on this box)`);
console.log(`guest instr / frame : ${(ipf / 1e6).toFixed(1)}M   <- deterministic work per displayed frame`);
console.log(`HLE state: n=${Number(dv().getBigInt64(G("g_raster_n"), true))} active=[${[0,1,2,3].map(k=>"0x"+Number(dv().getBigUint64(G("g_raster_hle")+k*8,true)).toString(16)).join(",")}] calls=${Number(dv().getBigInt64(G("g_raster_calls"), true))} cand=0x${Number(dv().getBigUint64(G("g_raster_cand"), true)).toString(16)} checks=${Number(dv().getBigInt64(G("g_raster_checks"), true))} diffs=${Number(dv().getBigInt64(G("g_raster_diffs"), true))} game=${Number(dv().getBigUint64(G("g_game_running"), true))}`);
console.log(`=> fps ceiling at  300 MIPS: ${(300e6 / ipf).toFixed(1)}   600 MIPS: ${(600e6 / ipf).toFixed(1)}   1000 MIPS: ${(1000e6 / ipf).toFixed(1)}   1500 MIPS: ${(1500e6 / ipf).toFixed(1)}`);
