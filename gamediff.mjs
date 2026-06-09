// In-game pixel-identity: boot real TempleOS, launch BlackDiamond, run a FIXED frame count with the
// JIT off, capture the framebuffer; repeat with the JIT on; compare. Equal frame count -> equal icount
// -> equal guest clock -> the renders MUST be byte-identical if the JIT is correct (this is the
// strongest correctness check for mul/div/bt etc., which the desktop barely exercises).
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
const ICOUNT = Number(r.globals.get("icount").addr);
const NF = Number(process.env.NF || 700);   // total frames before capture (deterministic, no timing window)
if (process.env.NOX87) globalThis.__NOX87 = 1;        // bisect toggles
if (process.env.NOMULDIV) globalThis.__NOMULDIV = 1;
if (process.env.NOBTMEM) globalThis.__NOBTMEM = 1;

async function boot(useJit) {
  if (useJit) jit.jitReset();
  let mx = 320, my = 240, mb = 0, gBase = 0; const keyq = []; const ovl = new Map();
  let inst, bad = false, fb = null;
  const host = createHost({ onText: (s) => { if (s && s.indexOf("BADOP") >= 0) { bad = true; process.stdout.write((useJit ? "JIT " : "INT ") + s); } }, snd: { tone: () => {} },
    snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
    diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
    diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
    present: (a, w, h, u8) => { fb = Buffer.from(u8.subarray(a, a + w * h)); } });
  host.env.__host_msx = () => BigInt(mx); host.env.__host_msy = () => BigInt(my); host.env.__host_msb = () => BigInt(mb); host.env.__host_wheel = () => 0n;
  host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n; host.env.__host_budget = () => 1500000n; host.env.__host_dt = () => 33n; host.env.__host_prof = () => {};
  host.env.__host_time = () => 0n;   // PIN the RTC (host.js default is new Date() = wall-clock -> nondeterministic between boots)
  if (useJit) {
    host.env.__jit_state = (rg, fl, rp) => { jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem); return 1n; };
    host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip)));
    host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
    host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c);
    host.env.__jit_dispatch = (b) => BigInt(jit.jitDispatch(Number(b)));
    host.env.__jit_chain = (a, b) => jit.jitChain(a, b);
  }
  inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
  const run = (n) => { for (let i = 0; i < n; i++) inst.exports.__main(); };
  const key = (...scs) => { for (const s of scs) { keyq.push(s); run(4); } };
  run(120); key(0x31, 0xB1); run(30); key(0x1D, 0x32, 0xB2, 0x9D); run(50); mx = Number(process.env.GX||108); my = Number(process.env.GY||325); run(6); mb = 1; run(10); mb = 0;  // launch BlackDiamond
  run(NF);
  const ic = Number(new DataView(inst.exports.memory.buffer).getBigUint64(ICOUNT, true));
  return { fb, bad, ic };
}
const a = await boot(process.env.BOTHJIT ? true : false);   // BOTHJIT: compare two JIT runs (determinism check)
const b = await boot(true);
console.log(`icount at capture: A=${a.ic}  B=${b.ic}  delta=${b.ic - a.ic}`);
let diff = 0; const N = a.fb ? a.fb.length : 0;
for (let i = 0; i < N; i++) if (a.fb[i] !== b.fb[i]) diff++;
let nz = 0; for (let i = 0; i < N; i++) if (b.fb[i]) nz++;
console.log(`frames=${NF}  pixels=${N}  non-black(JIT)=${(100 * nz / N).toFixed(1)}%`);
console.log(`pixel diff interp-vs-JIT: ${diff}/${N} (${(100 * diff / N).toFixed(3)}%)  ${a.bad || b.bad ? "BADOP!" : ""}`);
console.log(diff === 0 ? "IDENTICAL — JIT correct in-game (mul/div/bt all match the interpreter)" : "DIVERGENCE — JIT differs from interpreter in-game");
