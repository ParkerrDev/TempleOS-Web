// smpboot.mjs - M1: boot single-core over an IMPORTED SHARED memory (the SMP substrate). Compiles
// snapshot.HC with sharedMemory:true (module imports env.mem shared), the host creates the shared
// WebAssembly.Memory and sets the per-instance __sp / __core globals. Verifies the desktop still
// boots + renders (no regression) - proving the shared-memory build works before adding workers.
import { compileHemu } from "../../engine/compile.js";
import { createHemuHost } from "../../engine/host.js";
import * as jit from "../../engine/jit.js";
import { readFileSync } from "node:fs";
const RAMSZ = 402653184;
const SMPSNAP = !!process.env.SMPSNAP;     // SMPSNAP=1 -> multi-core snapshot (g_cpu_st[0..N], live-smp.bin)
const liveBuf = readFileSync(SMPSNAP ? "/tmp/hemusnap/live-smp.bin" : "/tmp/live.bin");
const diskBuf = readFileSync("/tmp/templeos.raw");
const CORE = BigInt(process.env.CORE || 0);
const r = compileHemu({ smp: SMPSNAP, sharedMemory: true });
const G = (n) => Number(r.globals.get(n).addr);
const ICOUNT = G("icount");
const mod = await WebAssembly.compile(r.bytes);
// the SHARED guest RAM all workers will map (must match the module's imported limits: 512..8192 pages)
const sharedMem = new WebAssembly.Memory({ initial: 512, maximum: 8192, shared: true });

let mx = 320, my = 240, mb = 0, gBase = 0, inst, bad = false;
let curBudget = 1500000, dtMs = 16, measuring = false, presents = 0, distinct = 0, lastHash = 0, lastNz = 0;
const keyq = []; const ovl = new Map();
const host = createHemuHost({ onText: (s) => { if (s && s.indexOf("BADOP") >= 0) { bad = true; process.stdout.write("GUEST: " + s); } }, snd: { tone: () => {} },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
  diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
  present: (a, w, h, u8) => { if (!measuring) return; let s = 0x811c9dc5, nz = 0; for (let i = 0; i < w * h; i++) { const v = u8[a + i]; s = ((s ^ v) * 16777619) >>> 0; if (v) nz++; } presents++; lastNz = nz / (w * h); if (s !== lastHash) { distinct++; lastHash = s; } } });
host.env.__host_msx = () => BigInt(mx); host.env.__host_msy = () => BigInt(my); host.env.__host_msb = () => BigInt(mb); host.env.__host_wheel = () => 0n;
host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n;
host.env.__host_budget = () => BigInt(curBudget | 0); host.env.__host_dt = () => BigInt(dtMs | 0);
host.env.__jit_state = (rg, fl, rp) => { jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem, inst.exports.RasterHLE); return 1n; };
host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip)));
host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c);
host.env.__jit_dispatch = (b) => BigInt(jit.jitDispatch(Number(b)));
host.env.__jit_chain = (a, b) => jit.jitChain(a, b); host.env.__jit_seg = (...a) => jit.jitSeg(...a.map(Number));
host.env.mem = sharedMem;                                   // <-- the imported SHARED memory
jit.jitReset();
inst = await WebAssembly.instantiate(mod, { env: host.env });
console.log("exports has __core:", "__core" in inst.exports, " __sp:", "__sp" in inst.exports, " memory===shared:", inst.exports.memory === sharedMem);
inst.exports.__sp.value = 0x1000000n;     // STACK_TOP (16MiB) - this worker's shadow stack
inst.exports.__core.value = CORE;         // which core this worker runs
host.attach(inst); inst.exports.__rt_init();
const dv = () => new DataView(inst.exports.memory.buffer);
const rdU64 = (a) => Number(dv().getBigUint64(a, true));
const FRAME_MS = 1000 / 60, sleep = (ms) => new Promise((rr) => setTimeout(rr, ms));
let lastT = performance.now(), dtAcc = 0;
const step = async () => { const now = performance.now(); dtAcc += now - lastT; lastT = now; if (dtAcc > 100) dtAcc = 100;
  dtMs = Math.max(1, Math.min(100, Math.floor(dtAcc))); dtAcc -= dtMs; inst.exports.__main();
  const work = performance.now() - now; if (work > 15 && curBudget > 900000) curBudget = (curBudget * 0.90) | 0; else if (work < 11 && curBudget < 24000000) curBudget = (curBudget * 1.07) | 0;
  const wait = FRAME_MS - (performance.now() - now); if (wait > 1) await sleep(wait); };
const run = async (n) => { for (let i = 0; i < n; i++) await step(); };
await run(150); measuring = true; const ic0 = rdU64(ICOUNT); const t0 = performance.now();
await run(240); const wall = (performance.now() - t0) / 1000;
console.log(`${SMPSNAP ? "SMP-SNAP core " + CORE : "SHARED-MEM"} DESKTOP: ${(distinct / wall).toFixed(1)} distinct fps, ${(lastNz * 100).toFixed(0)}% non-black, ${((rdU64(ICOUNT) - ic0) / wall / 1e6).toFixed(0)} MIPS ${bad ? "BADOP!" : "(no fault)"}, g_ncore=${rdU64(G("g_ncore"))}`);
process.exit(bad ? 1 : 0);
