// varoomprof.mjs — WHERE does Varoom spend guest instructions? Drives jit.js's __PROF hot-block
// accumulator (instruction-weighted: P[rip] += ninstr for every block executed) under the trace
// dispatcher, launches Varoom, then dumps the top hot blocks with their guest bytes so capstone can
// identify each (render? physics? blit?). This is the measurement that decides whether SMP (parallel
// render) is even the right lever, vs a serial hot loop that needs single-thread optimization.
//   GX/GY default to the Varoom Ctrl+M sprite (225,325). GX=108 GY=325 = BlackDiamond.
import { compileHolyC } from "./holyc-wasm/src/compiler.js";
import { createHost } from "./holyc-wasm/src/runtime/host.js";
import * as jit from "./jit.js";
import { readFileSync, writeFileSync } from "node:fs";
const RAMSZ = 402653184;
const liveBuf = readFileSync("/tmp/live.bin");
const diskBuf = readFileSync("/tmp/templeos.raw");
const dir = "./hemu-wasm/src";
const src = readFileSync(dir + "/snapshot.HC", "latin1");
const r = compileHolyC(src, { filename: "snapshot.HC", lenient: false, includeResolver: (p) => { try { return readFileSync(dir + "/" + p, "latin1"); } catch { return null; } } });
const G = (n) => Number(r.globals.get(n).addr);
const ICOUNT = G("icount");
const mod = await WebAssembly.compile(r.bytes);

let mx = 320, my = 240, mb = 0, gBase = 0, inst, bad = false;
let curBudget = 1500000, dtMs = 16;
const keyq = []; const ovl = new Map();
const host = createHost({ onText: (s) => { if (s && s.indexOf("BADOP") >= 0) { bad = true; process.stdout.write("GUEST: " + s); } }, snd: { tone: () => {} },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
  diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
  present: () => {} });
host.env.__host_msx = () => BigInt(mx); host.env.__host_msy = () => BigInt(my); host.env.__host_msb = () => BigInt(mb); host.env.__host_wheel = () => 0n;
host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n; host.env.__host_prof = () => {};
host.env.__host_budget = () => BigInt(curBudget | 0); host.env.__host_dt = () => BigInt(dtMs | 0);
host.env.__jit_state = (rg, fl, rp) => { jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem); return 1n; };
host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip)));
host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c);
host.env.__jit_dispatch = (b) => BigInt(jit.jitDispatch(Number(b)));
host.env.__jit_chain = (a, b) => jit.jitChain(a, b);
host.env.__jit_seg = (...a) => jit.jitSeg(...a.map(Number));
jit.jitReset();
inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
const dv = () => new DataView(inst.exports.memory.buffer);
const rdU64 = (a) => Number(dv().getBigUint64(a, true));

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
const GX = Number(process.env.GX || 225), GY = Number(process.env.GY || 325);
if (GX) { await key(0x31, 0xB1); await run(30); await key(0x1D, 0x32, 0xB2, 0x9D); await run(50);
  mx = GX; my = GY; await run(6); mb = 1; await run(10); mb = 0; await run(300); }

// ---- PROFILE WINDOW ----
const SECS = Number(process.env.SECS || 8);
globalThis.__COVTRACE = 1; globalThis.__PROF = {};         // trace dispatch + instruction-weighted hot-block accumulation
const t0 = performance.now(), ic0 = rdU64(ICOUNT);
while (performance.now() - t0 < SECS * 1000) await step();
const wall = (performance.now() - t0) / 1000, ic1 = rdU64(ICOUNT);
globalThis.__COVTRACE = 0;
const P = globalThis.__PROF;
const entries = Object.entries(P).map(([rip, c]) => [Number(rip) >>> 0, c]).sort((a, b) => b[1] - a[1]);
const total = entries.reduce((s, e) => s + e[1], 0);
console.log(`=== Varoom hot-block profile (trace-dispatch; ${wall.toFixed(1)}s, ${(total / 1e6).toFixed(0)}M block-instr) ${bad ? "BADOP!" : ""} ===`);
// region split: low kernel (<0x10000000) vs high heap (>=0x10000000, where TempleOS JITs game+library code)
let low = 0, high = 0; for (const [a, c] of entries) { if (a < 0x10000000) low += c; else high += c; }
console.log(`region: <0x10000000 (static kernel) ${(100 * low / total).toFixed(1)}%   >=0x10000000 (heap: game+library) ${(100 * high / total).toFixed(1)}%`);
console.log(`top 30 hot blocks:`);
const u8 = new Uint8Array(inst.exports.memory.buffer);
const dump = [];
for (const [a, c] of entries.slice(0, 30)) {
  console.log(`  0x${a.toString(16).padStart(8, "0")}  ${(100 * c / total).toFixed(2).padStart(5)}%  (${(c / 1e6).toFixed(1)}M)`);
  const bytes = Buffer.from(u8.subarray(gBase + a, gBase + a + 80)).toString("hex");
  dump.push({ addr: a, count: c, pct: +(100 * c / total).toFixed(2), bytes });
}
writeFileSync("/tmp/varoom_prof.json", JSON.stringify(dump));
console.log(`wrote /tmp/varoom_prof.json (top 30 blocks + 80 bytes each for disasm)`);
// contiguous region dumps from the RUNNING image (Varoom is runtime-JIT'd; not in live.bin)
for (const [a, len] of [[0x1152cb00, 0x780], [0x119ff158, 0x220], [0x11ae7828, 0x220], [0x119e2540, 0x140], [0x11661210, 0x240]]) {
  writeFileSync(`/tmp/fn_${a.toString(16)}.bin`, Buffer.from(u8.subarray(gBase + a, gBase + a + len)));
}
console.log("dumped /tmp/fn_*.bin from running image");
