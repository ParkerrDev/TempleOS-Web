// gamecheck.mjs — measure desktop/game fps under the WORKER-FAITHFUL loop (60Hz pacing + fractional dt +
// 24M budget cap, mirroring hemu-worker.js) with the corrected guest clock. Counts DISTINCT frames (full
// FNV hash per present) = what the user actually sees.
//   node gamecheck.mjs                  -> desktop only
//   GX=225 GY=325 node gamecheck.mjs    -> launch Varoom (Ctrl+M menu sprite at 225,325)
//   GX=108 GY=325 node gamecheck.mjs    -> launch BlackDiamond
//   NOJIT=1 ...                          -> interpreter
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
let curBudget = 1500000, dtMs = 16;
let measuring = false, presents = 0, distinct = 0, lastHash = 0;
const keyq = []; const ovl = new Map();
const host = createHost({ onText: (s) => { if (s && s.indexOf("BADOP") >= 0) { bad = true; process.stdout.write("GUEST: " + s); } }, snd: { tone: () => {} },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
  diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
  present: (a, w, h, u8) => { if (!measuring) return; let s = 0x811c9dc5; for (let i = 0; i < w * h; i++) s = ((s ^ u8[a + i]) * 16777619) >>> 0; presents++; if (s !== lastHash) { distinct++; lastHash = s; } } });
host.env.__host_msx = () => BigInt(mx); host.env.__host_msy = () => BigInt(my); host.env.__host_msb = () => BigInt(mb); host.env.__host_wheel = () => 0n;
host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n; host.env.__host_prof = () => {};
host.env.__host_budget = () => BigInt(curBudget | 0); host.env.__host_dt = () => BigInt(dtMs | 0);
let RIPOFF = 0;
const brkOps = new Map();                                 // COV=1: exact opcode+modrm at every chain-break rip
const brkRips = new Map();                                // COV: break RIP histogram -> post-run jitInspect (why is this rip cold?)
if (!NOJIT) {
  host.env.__jit_state = (rg, fl, rp) => { RIPOFF = Number(rp); jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem, inst.exports.RasterHLE); return 1n; };
  host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip)));
  host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
  host.env.__jit_x87 = (a, b, c) => { if (process.env.DBG) console.error('x87 handoff: fpr=' + a + ' fsp=' + b + ' sw=' + c); jit.jitX87(a, b, c); };
  host.env.__jit_dispatch = process.env.TIME ? (b) => { const t0 = performance.now(); const n = jit.jitDispatch(Number(b)); globalThis.__tJit = (globalThis.__tJit || 0) + performance.now() - t0; globalThis.__nJit = (globalThis.__nJit || 0) + n; globalThis.__dJit = (globalThis.__dJit || 0) + 1; return BigInt(n); }
    : process.env.COV ? (b) => { const n = jit.jitDispatch(Number(b));
    const m = new Uint8Array(inst.exports.memory.buffer); const dvv = new DataView(inst.exports.memory.buffer);
    let a = gBase + Number(dvv.getBigUint64(RIPOFF, true)), rexW = 0;
    for (;;) { const x = m[a]; if (x === 0x66 || x === 0x67 || x === 0xF0 || x === 0xF2 || x === 0xF3 || x === 0x2E || x === 0x36 || x === 0x3E || x === 0x26 || x === 0x64 || x === 0x65 || (x >= 0x40 && x <= 0x4F)) { if (x >= 0x40 && x <= 0x4F) rexW = (x >> 3) & 1; a++; } else break; }
    let key = m[a].toString(16).padStart(2, "0");
    if (m[a] === 0x0F) key = "0f" + m[a + 1].toString(16).padStart(2, "0");
    else if (m[a] >= 0xD8 && m[a] <= 0xDF) { const mm = m[a + 1]; key += ` mod${mm >> 6} /${(mm >> 3) & 7}${mm >> 6 === 3 ? " st" + (mm & 7) : ""}`; }
    else if (m[a] === 0xF6 || m[a] === 0xF7) { const mm = m[a + 1]; const xt = (mm >> 3) & 7; key += ` /${xt}=${["test","test","not","neg","mul","imul","div","idiv"][xt]} ${rexW ? "w64" : (m[a] === 0xF6 ? "b8" : "d32")}`; }
    if (measuring) { brkOps.set(key, (brkOps.get(key) || 0) + 1);
      const rr = Number(dvv.getBigUint64(RIPOFF, true)); brkRips.set(rr, (brkRips.get(rr) || 0) + 1); }
    return BigInt(n); } : (b) => BigInt(jit.jitDispatch(Number(b)));
  host.env.__jit_chain = process.env.COV ? (a, b) => {} : (a, b) => jit.jitChain(a, b);   // COV: JS dispatch so every break is observable
  host.env.__jit_seg = (a, b, c) => { if (process.env.DBG) console.error('seg handoff: fs=' + a + ' gs=' + b + ' tsc=' + c); jit.jitSeg(Number(a), Number(b), Number(c)); };
  jit.jitReset();
}
inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
const dv = () => new DataView(inst.exports.memory.buffer);
const rdU64 = (a) => Number(dv().getBigUint64(a, true));

const FRAME_MS = 1000 / 60;
const sleep = (ms) => new Promise((rr) => setTimeout(rr, ms));
let lastT = performance.now(), dtAcc = 0, stepN = 0;
const step = async () => { const now = performance.now();
  if (process.env.RASTLOG && (++stepN % (process.env.RASTLOG === "2" ? 1 : 30)) === 0) console.log(`f=${stepN} n=${rdU64(G("g_raster_n"))} cand=0x${rdU64(G("g_raster_cand")).toString(16)} ret=0x${rdU64(G("g_raster_ret")).toString(16)} chk=${rdU64(G("g_raster_checks"))} dif=${rdU64(G("g_raster_diffs"))} arm=${rdU64(G("g_raster_armframes"))} tries=${rdU64(G("g_raster_tries"))} cold=${rdU64(G("g_cold_n"))} scan=0x${rdU64(G("g_raster_scan_from")).toString(16)} game=${rdU64(G("g_game_running"))} rej=[${[0,1,2,3].map(q => "0x" + rdU64(G("g_raster_rej") + q * 8).toString(16)).join(",")}]x${rdU64(G("g_rej_n"))}`);
  dtAcc += now - lastT; lastT = now; if (dtAcc > 100) dtAcc = 100;
  dtMs = Math.max(1, Math.min(100, Math.floor(dtAcc))); dtAcc -= dtMs;
  inst.exports.__main();
  const work = performance.now() - now;
  if (work > 15 && curBudget > 900000) curBudget = (curBudget * 0.90) | 0; else if (work < 11 && curBudget < 24000000) curBudget = (curBudget * 1.07) | 0;
  const wait = FRAME_MS - (performance.now() - now); if (wait > 1) await sleep(wait); };
const run = async (n) => { for (let i = 0; i < n; i++) await step(); };
const key = async (...scs) => { for (const s of scs) { keyq.push(s); await run(4); } };

await run(150);
const GX = Number(process.env.GX || 0), GY = Number(process.env.GY || 0);
if (GX) {           // open Ctrl+M games menu, click the sprite -> launch game
  await key(0x31, 0xB1); await run(30); await key(0x1D, 0x32, 0xB2, 0x9D); await run(50);
  mx = GX; my = GY; await run(6); mb = 1; await run(10); mb = 0; await run(300);
}
const SECS = Number(process.env.SECS || 8);
if (process.env.COV === "2") { globalThis.__COVTRACE = 1; globalThis.__COVBRK = {}; }   // builtin trace: collide-vs-op categories
measuring = true; const t0 = performance.now(), ic0 = rdU64(ICOUNT);
let mains = 0;
while (performance.now() - t0 < SECS * 1000) { await step(); mains++; }
const wall = (performance.now() - t0) / 1000, ic1 = rdU64(ICOUNT);
measuring = false;
console.log(`=== ${GX ? `game @(${GX},${GY})` : "desktop"} ${NOJIT ? "INTERP" : "JIT"} | worker-faithful 60Hz loop, ${wall.toFixed(2)}s ===`);
console.log(`DISTINCT fps : ${(distinct / wall).toFixed(1)}   (presents/s ${(presents / wall).toFixed(1)}, __main/s ${(mains / wall).toFixed(0)})`);
console.log(`throughput   : ${((ic1 - ic0) / wall / 1e6).toFixed(0)} MIPS, final budget ${(curBudget / 1e6).toFixed(1)}M   ${bad ? "BADOP!" : "(no fault)"}`);
{ const hle = [0,1,2,3].map(q => rdU64(G("g_raster_hle") + q * 8)); console.log(`HLE          : n=${rdU64(G("g_raster_n"))} active=[${hle.map(a => "0x" + a.toString(16)).join(",")}] calls=${rdU64(G("g_raster_calls"))} cand=0x${rdU64(G("g_raster_cand")).toString(16)} checks=${rdU64(G("g_raster_checks"))} diffs=${rdU64(G("g_raster_diffs"))}`);
  if (rdU64(G("g_dbg_badn"))) { const b = [...Array(13)].map((_, q) => rdU64(G("g_dbg_bad") + q * 8));
    console.log(`1st BAD vrfy : zbad=${b[0]}/${b[2]} bod=${b[1]} idx=${b[3]} flags=0x${b[4].toString(16)} colw=0x${b[5].toString(16)} c1 e/n=${b[6]}/${b[7]} c2 e/n=0x${b[8].toString(16)}/0x${b[9].toString(16)} z e/n@${b[12]}=0x${b[10].toString(16)}/0x${b[11].toString(16)}`); } }
if (process.env.TIME) console.log(`in-JIT: ${(globalThis.__tJit / 1000 / wall * 100).toFixed(0)}% of wall, ${(globalThis.__nJit / 1e6 / (globalThis.__tJit / 1000)).toFixed(0)} MIPS inside blocks, ${(100 * globalThis.__nJit / (ic1 - ic0)).toFixed(1)}% coverage, ${globalThis.__dJit} dispatches (${(globalThis.__nJit / globalThis.__dJit).toFixed(0)} instr/dispatch)`);
if (process.env.COV) {
  const tot = [...brkOps.values()].reduce((s, c) => s + c, 0);
  console.log(`chain-breaks by exact opcode (${tot} total):`);
  for (const [k, c] of [...brkOps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(`   ${(100 * c / tot).toFixed(1).padStart(5)}%  ${k}  (${c})`);
  const JN = G("g_jit_n"), JR = G("g_jit_rip"), JH = G("g_jit_hot"), HT = G("g_hooktbl");
  console.log("top break RIPs (slot state explains why each stays interp'd):");
  for (const [rr, c] of [...brkRips.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    const sl = (rr ^ (rr >>> 16)) & 0xFFFF;   // jit-array slot hash; g_hooktbl is indexed by raw low-16
    const jn = Number(dv().getBigInt64(JN + sl * 8, true)), jr = Number(dv().getBigUint64(JR + sl * 8, true)), jh = Number(dv().getBigInt64(JH + sl * 8, true)), hk = new Uint8Array(inst.exports.memory.buffer)[HT + (rr & 0xFFFF)];
    const ins = jit.jitInspect(rr);
    console.log(`   0x${rr.toString(16)} x${c}  slot=0x${sl.toString(16)} jit_rip=0x${jr.toString(16)} jit_n=${jn} hot=${jh} hook=${hk}  js: cached=${ins.cached} failed=${ins.failed} n=${ins.ninstr}`);
  }
}
if (globalThis.__COVBRK) {
  const brk = Object.entries(globalThis.__COVBRK).sort((a, b) => b[1] - a[1]);
  const tot = brk.reduce((s, e) => s + e[1], 0);
  console.log(`break CATEGORY (collide = compiled but lost its table slot; cold = not yet compiled), ${tot} total:`);
  for (const [k, c] of brk.slice(0, 10)) console.log(`   ${(100 * c / tot).toFixed(1).padStart(5)}%  ${k}`);
}
