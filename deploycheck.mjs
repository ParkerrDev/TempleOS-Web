// deploycheck.mjs — validate the DEPLOY artifacts exactly as hemu-worker.js uses them: the prebuilt
// hemu-wasm/snapshot.wasm (not compile-from-source), the hardcoded G_FS/G_GS/G_TSC offsets, the 60Hz
// paced loop with fractional dt, and the JIT wiring. Boots the desktop, checks clock rate + distinct
// fps + non-black, then launches a game (GX/GY) and reports its fps. NOJIT=1 checks the interp fallback.
import { createHost } from "./holyc-wasm/src/runtime/host.js";
import * as jit from "./jit.js";
import { readFileSync } from "node:fs";
const RAMSZ = 402653184;
const liveBuf = readFileSync("/tmp/live.bin");
const diskBuf = readFileSync("/tmp/templeos.raw");
const NOJIT = !!process.env.NOJIT;
// segment/TSC addresses flow from the guest via __jit_seg (no hardcoded offsets)
const mod = await WebAssembly.compile(readFileSync("./hemu-wasm/snapshot.wasm"));   // the deploy artifact

let mx = 320, my = 240, mb = 0, gBase = 0, inst, bad = false;
let curBudget = 1500000, dtMs = 16;
let measuring = false, presents = 0, distinct = 0, lastHash = 0, lastNz = 0;
const keyq = []; const ovl = new Map();
const host = createHost({ onText: (s) => { if (s && s.indexOf("BADOP") >= 0) { bad = true; process.stdout.write("GUEST: " + s); } }, snd: { tone: () => {} },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
  diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
  present: (a, w, h, u8) => { if (!measuring) return; let s = 0x811c9dc5, nz = 0; for (let i = 0; i < w * h; i++) { const v = u8[a + i]; s = ((s ^ v) * 16777619) >>> 0; if (v) nz++; } presents++; lastNz = nz / (w * h); if (s !== lastHash) { distinct++; lastHash = s; } } });
host.env.__host_msx = () => BigInt(mx); host.env.__host_msy = () => BigInt(my); host.env.__host_msb = () => BigInt(mb); host.env.__host_wheel = () => 0n;
host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n; host.env.__host_prof = () => {};
host.env.__host_budget = () => BigInt(curBudget | 0); host.env.__host_dt = () => BigInt(dtMs | 0);
if (!NOJIT) {                                                   // EXACT hemu-worker.js wiring
  host.env.__jit_state = (rg, fl, rp) => { jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem); return 1n; };
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
const jiffies = () => Number(dv().getBigUint64(gBase + 0xBD98, true));

const FRAME_MS = 1000 / 60;
const sleep = (ms) => new Promise((rr) => setTimeout(rr, ms));
let lastT = performance.now(), dtAcc = 0;
const step = async () => { const now = performance.now();
  dtAcc += now - lastT; lastT = now; if (dtAcc > 100) dtAcc = 100;
  dtMs = Math.max(1, Math.min(100, Math.floor(dtAcc))); dtAcc -= dtMs;
  inst.exports.__main();
  const work = performance.now() - now;
  if (work > 15 && curBudget > 900000) curBudget = (curBudget * 0.90) | 0; else if (work < 11 && curBudget < 24000000) curBudget = (curBudget * 1.07) | 0;
  const wait = FRAME_MS - (performance.now() - now); if (wait > 1) await sleep(wait); };
const run = async (n) => { for (let i = 0; i < n; i++) await step(); };
const key = async (...scs) => { for (const s of scs) { keyq.push(s); await run(4); } };

await run(150);
measuring = true;
const j0 = jiffies(), t0 = performance.now();
await run(300);
const wallD = (performance.now() - t0) / 1000, jRate = (jiffies() - j0) / wallD;
console.log(`DESKTOP (${NOJIT ? "INTERP" : "JIT"}): ${(distinct / wallD).toFixed(1)} distinct fps, clock ${(jRate / 1000).toFixed(2)}x real, frame ${(lastNz * 100).toFixed(0)}% non-black ${bad ? "BADOP!" : ""}`);
measuring = false; presents = 0; distinct = 0;
const GX = Number(process.env.GX || 225), GY = Number(process.env.GY || 325);
await key(0x31, 0xB1); await run(30); await key(0x1D, 0x32, 0xB2, 0x9D); await run(50);
mx = GX; my = GY; await run(6); mb = 1; await run(10); mb = 0; await run(300);
measuring = true;
const t1 = performance.now();
await run(450);
const wallG = (performance.now() - t1) / 1000;
console.log(`GAME @(${GX},${GY}): ${(distinct / wallG).toFixed(1)} distinct fps, frame ${(lastNz * 100).toFixed(0)}% non-black ${bad ? "BADOP!" : "(no fault)"}`);
