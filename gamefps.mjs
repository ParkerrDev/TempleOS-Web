// Measure in-game performance: boot real TempleOS (flat live.bin + raw disk), launch BlackDiamond
// (Ctrl+M menu + sprite click), then time the in-game loop with the JIT OFF vs ON. game-fps scales
// with emulator throughput, so the in-game JIT speedup is the fps multiplier (need ~2.8x for 30fps).
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
const mod = await WebAssembly.compile(r.bytes);
jit.jitSeg(Number(r.globals.get("msr_fsbase").addr), Number(r.globals.get("msr_gsbase").addr), Number(r.globals.get("tsc").addr));

async function gameFps(useJit) {
  if (useJit) jit.jitReset();
  let mx = 320, my = 240, mb = 0, gBase = 0; const keyq = []; const ovl = new Map();
  let inst, measuring = false, presents = 0, changes = 0, lastHash = 0, lastFb = null, bad = false;
  const host = createHost({ onText: (s) => { if (s && s.indexOf("BADOP") >= 0) { bad = true; if (useJit) process.stdout.write("GUEST(jit): " + s); } }, snd: { tone: () => {} },
    snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
    diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
    diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
    present: (a, w, h, u8) => {   // the real runtime OVERLAPS the blit off the emulation thread, so DON'T copy in the timed path
      if (measuring) { let s = 0; for (let i = 0; i < w * h; i += 16) s = (s * 31 + u8[a + i]) >>> 0; presents++; if (s !== lastHash) { changes++; lastHash = s; } }   // cheap frame-change hash only
      else lastFb = Buffer.from(u8.subarray(a, a + w * h)); } });   // capture a frame only outside the timed window (for non-black %)
  host.env.__host_msx = () => BigInt(mx); host.env.__host_msy = () => BigInt(my); host.env.__host_msb = () => BigInt(mb); host.env.__host_wheel = () => 0n;
  host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n; host.env.__host_budget = () => BigInt(Number(process.env.BUDGET || 1500000)); host.env.__host_dt = () => 33n; host.env.__host_prof = () => {};
  host.env.__host_time = () => 0n;   // pin RTC (deterministic; host.js default is wall-clock)
  if (useJit) {
    host.env.__jit_state = (rg, fl, rp) => { jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem); return 1n; };
    host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip)));
    host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
    host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c);
    host.env.__jit_dispatch = (b) => BigInt(jit.jitDispatch(Number(b)));
    if (!process.env.NOCHAIN) host.env.__jit_chain = (a, b) => jit.jitChain(a, b);   // NOCHAIN -> JS dispatch loop instead of the WASM module
  }
  inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
  const run = (n) => { for (let i = 0; i < n; i++) inst.exports.__main(); };
  const key = (...scs) => { for (const s of scs) { keyq.push(s); run(4); } };
  run(120); key(0x31, 0xB1); run(30); key(0x1D, 0x32, 0xB2, 0x9D); run(50); mx = Number(process.env.GX||108); my = Number(process.env.GY||325); run(6); mb = 1; run(10); mb = 0;  // launch BlackDiamond
  run(400);
  const MW = Number(process.env.MW || 240);
  measuring = true; const t0 = performance.now(); run(MW); const ms = (performance.now() - t0) / MW; measuring = false;
  return { ms, frameRate: changes / presents, bad, lastFb };
}
const off = await gameFps(false);
const on = await gameFps(true);
// MEASURED game fps = distinct framebuffer changes per wall-clock second when the emulator runs flat-out
// (CPU-bound, which is what the JIT changes). = frameChangeRate * (__main per wall-second).
const fpsCpu = (ms, fr) => fr * (1000 / ms);
const fpsCap = (ms, fr) => fr * Math.min(90, 1000 / ms);   // deploy caps presents at 90fps
console.log(`in-game interp: ${off.ms.toFixed(2)} ms/__main, ${(off.frameRate * 100).toFixed(1)}% frames change -> ${fpsCpu(off.ms, off.frameRate).toFixed(1)} fps (CPU-bound), ${fpsCap(off.ms, off.frameRate).toFixed(1)} fps (90-capped)`);
console.log(`in-game JIT:    ${on.ms.toFixed(2)} ms/__main, ${(on.frameRate * 100).toFixed(1)}% frames change -> ${fpsCpu(on.ms, on.frameRate).toFixed(1)} fps (CPU-bound), ${fpsCap(on.ms, on.frameRate).toFixed(1)} fps (90-capped)`);
console.log(`in-game JIT throughput speedup: ${(off.ms / on.ms).toFixed(2)}x   ${on.bad ? "(BADOP! JIT broke the game)" : "(no fault)"}`);
let nz = 0; if (on.lastFb) for (let i = 0; i < on.lastFb.length; i++) if (on.lastFb[i]) nz++;
console.log(`JIT game frame non-black: ${(100 * nz / (on.lastFb ? on.lastFb.length : 1)).toFixed(1)}%`);
