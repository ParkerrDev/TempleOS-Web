// rastercases.mjs — scope the span-filler HLE: hook entry of the hot rasterizer (0x1152cc28) during
// Varoom and histogram the ACTUAL cases hit (CDC flags, z-buffer on/off, colors, span length). The
// function branches many ways (offset/bbox/collision/2 dither modes/3 draw modes); Varoom likely uses
// a narrow subset, so this tells me exactly what the native HLE must implement vs fall through.
import { compileHolyC } from "./holyc-wasm/src/compiler.js";
import { createHost } from "./holyc-wasm/src/runtime/host.js";
import * as jit from "./jit.js";
import { readFileSync } from "node:fs";
const RAMSZ = 402653184;
const RASTER = Number(process.env.RASTER || 0x1152cc28);
const liveBuf = readFileSync("/tmp/live.bin");
const diskBuf = readFileSync("/tmp/templeos.raw");
const dir = "./hemu-wasm/src";
const src = readFileSync(dir + "/snapshot.HC", "latin1");
const r = compileHolyC(src, { filename: "snapshot.HC", lenient: false, includeResolver: (p) => { try { return readFileSync(dir + "/" + p, "latin1"); } catch { return null; } } });
const mod = await WebAssembly.compile(r.bytes);
let mx = 320, my = 240, mb = 0, gBase = 0, inst, bad = false, RIPOFF = 0;
let curBudget = 1500000, dtMs = 16;
const keyq = []; const ovl = new Map();
const host = createHost({ onText: (s) => { if (s && s.indexOf("BADOP") >= 0) { bad = true; process.stdout.write("G:" + s); } }, snd: { tone: () => {} },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
  diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
  present: () => {} });
host.env.__host_msx = () => BigInt(mx); host.env.__host_msy = () => BigInt(my); host.env.__host_msb = () => BigInt(mb); host.env.__host_wheel = () => 0n;
host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n; host.env.__host_prof = () => {};
host.env.__host_budget = () => BigInt(curBudget | 0); host.env.__host_dt = () => BigInt(dtMs | 0);
let measuring = false, calls = 0;
const flagHist = new Map(), spanHist = { 0:0, 1:0, 2:0, 8:0, 32:0, 128:0, 512:0 }, drawModes = new Map();
let zon = 0, zoff = 0;
host.env.__jit_state = (rg, fl, rp) => { RIPOFF = Number(rp); jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem); return 1n; };
host.env.__jit_compile = (rip) => Number(rip) === RASTER ? 0n : BigInt(jit.jitCompile(Number(rip)));   // never JIT the raster entry: keep it observable in dispatch
host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c);
host.env.__jit_dispatch = (b) => { const n = jit.jitDispatch(Number(b));
  if (measuring) { const dv = new DataView(inst.exports.memory.buffer);
    const rip = Number(dv.getBigInt64(RIPOFF, true)) >>> 0;
    if (rip === RASTER) {
      const rsp = Number(dv.getBigUint64(/*reg[4]*/ 0, true));   // placeholder; set below via REGOFF
    }
  }
  return BigInt(n); };
host.env.__jit_chain = (a, b) => jit.jitChain(a, b);   // native chaining (fast); RASTER stays unjittable -> RUNDISP breaks there each call
host.env.__jit_seg = (...a) => jit.jitSeg(...a.map(Number));
jit.jitReset();
inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
// REG base: g_cpu_st[0].f_reg (reg[4]=rsp). The dispatch wrapper above needs REGOFF; recompute the real hook here.
const REGOFF = Number(r.globals.get("g_cpu_st").addr);
host.env.__jit_dispatch = (b) => { const n = jit.jitDispatch(Number(b));
  if (measuring) { const dv = new DataView(inst.exports.memory.buffer);
    const rip = Number(dv.getBigInt64(RIPOFF, true)) >>> 0;
    if (rip === RASTER) {
      calls++;
      const rsp = Number(dv.getBigUint64(REGOFF + 4 * 8, true));               // reg[4]=rsp; at entry [rsp+8]=arg1=dc
      const dc = Number(dv.getBigUint64(gBase + rsp + 8, true));
      const x1 = Number(dv.getBigInt64(gBase + rsp + 0x10, true));
      const x2 = Number(dv.getBigInt64(gBase + rsp + 0x18, true));
      const flags = dv.getUint32(gBase + dc + 0x1c, true);
      const zptr = Number(dv.getBigUint64(gBase + dc + 0x188, true));
      const col1 = dv.getUint32(gBase + dc + 0xa0, true), col2 = dv.getUint32(gBase + dc + 0xa4, true);
      if (zptr) zon++; else zoff++;
      const fkey = "flags&0x3e00=0x" + (flags & 0x3e00).toString(16) + (zptr ? " Z" : " noZ");
      flagHist.set(fkey, (flagHist.get(fkey) || 0) + 1);
      const span = Math.abs(x2 - x1) + 1;
      let bucket = span <= 1 ? 1 : span <= 2 ? 2 : span <= 8 ? 8 : span <= 32 ? 32 : span <= 128 ? 128 : 512;
      spanHist[bucket] = (spanHist[bucket] || 0) + 1;
      const dmk = "col1=0x" + (col1 & 0xffff).toString(16) + " col2=0x" + (col2 & 0xffff).toString(16);
      drawModes.set(dmk, (drawModes.get(dmk) || 0) + 1);
    }
  }
  return BigInt(n); };
const dv = () => new DataView(inst.exports.memory.buffer);
const FRAME_MS = 1000 / 60, sleep = (ms) => new Promise((rr) => setTimeout(rr, ms));
let lastT = performance.now(), dtAcc = 0;
const step = async () => { const now = performance.now(); dtAcc += now - lastT; lastT = now; if (dtAcc > 100) dtAcc = 100;
  dtMs = Math.max(1, Math.min(100, Math.floor(dtAcc))); dtAcc -= dtMs; inst.exports.__main();
  const work = performance.now() - now; if (work > 15 && curBudget > 900000) curBudget = (curBudget * 0.9) | 0; else if (work < 11 && curBudget < 24000000) curBudget = (curBudget * 1.07) | 0;
  const wait = FRAME_MS - (performance.now() - now); if (wait > 1) await sleep(wait); };
const run = async (n) => { for (let i = 0; i < n; i++) await step(); };
const key = async (...scs) => { for (const s of scs) { keyq.push(s); await run(4); } };
await run(150); await key(0x31, 0xB1); await run(30); await key(0x1D, 0x32, 0xB2, 0x9D); await run(50);
mx = 225; my = 325; await run(6); mb = 1; await run(10); mb = 0; await run(300);
measuring = true; const t0 = performance.now();
while (performance.now() - t0 < (Number(process.env.SECS || 5)) * 1000) await step();
measuring = false;
console.log(`=== span-filler 0x${RASTER.toString(16)} cases (${calls} calls) ${bad ? "BADOP" : ""} ===`);
console.log(`z-buffer:  on=${zon}  off=${zoff}`);
console.log(`flag/Z combos:`); for (const [k, c] of [...flagHist.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${(100 * c / calls).toFixed(1).padStart(5)}%  ${k}  (${c})`);
console.log(`span length buckets (<=): ${Object.entries(spanHist).map(([k, v]) => k + ":" + v).join("  ")}`);
console.log(`top color combos:`); for (const [k, c] of [...drawModes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${(100 * c / calls).toFixed(1).padStart(5)}%  ${k}`);
