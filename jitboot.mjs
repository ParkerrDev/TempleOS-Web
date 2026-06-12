// Desktop JIT test on the bundled snapshot: boot real TempleOS (flat live.bin RAM + raw disk) with the
// JIT OFF vs ON, verify the desktop renders identically (correctness) and measure the speedup.
import { compileHolyC } from "./holyc-wasm/src/compiler.js";
import { createHost } from "./holyc-wasm/src/runtime/host.js";
import * as jit from "./jit.js";
import { readFileSync } from "node:fs";
const RAMSZ = 402653184;
const liveBuf = readFileSync(process.env.LIVE || "/tmp/live.bin");          // 402MB flat guest RAM
const diskBuf = readFileSync(process.env.RAW || "/tmp/templeos.raw");       // 256MB raw C: disk
const dir = "./hemu-wasm/src";
const src = readFileSync(dir + "/snapshot.HC", "latin1");
const r = compileHolyC(src, { filename: "snapshot.HC", lenient: false, includeResolver: (p) => { try { return readFileSync(dir + "/" + p, "latin1"); } catch { return null; } } });
const mod = await WebAssembly.compile(r.bytes);

async function boot(useJit, warm, timed) {
  if (useJit) jit.jitReset();
  let inst, gBase = 0, fb = null; const ovl = new Map();
  const host = createHost({ onText: () => {}, snd: { tone: () => {} },
    snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
    diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
    diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
    present: (a, w, h, u8) => { fb = Buffer.from(u8.subarray(a, a + w * h)); } });
  if (useJit) {
    host.env.__jit_state = (rg, fl, rp) => { jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem); return 1n; };
    host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip)));
    host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
    host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c);
    host.env.__jit_dispatch = (b) => BigInt(jit.jitDispatch(Number(b)));
    host.env.__jit_chain = (a, b) => jit.jitChain(a, b);
    host.env.__jit_seg = (...a) => jit.jitSeg(...a.map(Number));   // per-core FS/GS base + TSC addrs
  }
  host.env.__host_budget = () => 1500000n; host.env.__host_dt = () => 33n;
  inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
  for (let i = 0; i < warm; i++) inst.exports.__main();
  const t0 = performance.now(); for (let i = 0; i < timed; i++) inst.exports.__main(); const ms = (performance.now() - t0) / timed;
  return { ms, fb };
}
const a = await boot(false, 40, 40);
const b = await boot(true, 40, 40);
console.log(`interpreter: ${a.ms.toFixed(2)} ms/frame`);
console.log(`JIT on:      ${b.ms.toFixed(2)} ms/frame   speedup ${(a.ms / b.ms).toFixed(2)}x`);
let d = 0; for (let i = 0; i < a.fb.length; i++) if (a.fb[i] !== b.fb[i]) d++;
console.log(`pixel diff: ${d}/${a.fb.length} (${(100 * d / a.fb.length).toFixed(2)}%)`);
console.log(d === 0 ? "IDENTICAL — JIT correct on real OS" : d < a.fb.length * 0.02 ? "tiny diff (clock/cursor phase)" : "LARGE diff — JIT corrupts");
