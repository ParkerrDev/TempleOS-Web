// smp2.mjs — first 2-core run: TWO emulator instances (MY_CORE=0 and MY_CORE=1) over ONE shared WASM memory,
// resuming the 8-core snapshot (live8.bin). Core 0 runs full __main (boots desktop + renders); core 1 raw-Step()s
// its idle servant loop. Validates: shared-memory multi-instance, per-core state (g_cpu_st[0] vs [1]), the
// multi-core snapshot resume, and that core 1 executing over shared RAM doesn't corrupt core 0's desktop. (Interp
// only; JIT + IPI come next.)
import { compileHolyC } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/compiler.js";
import { createHost } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/runtime/host.js";
import { readFileSync } from "node:fs";
const RAMSZ = 402653184;
const liveBuf = readFileSync(process.env.LIVE || "/tmp/live8.bin");
const dir = "/Users/parkerh/Dev/hemu-wasm/src";
const src = readFileSync(dir + "/snapshot.HC", "latin1");
const inc = (p) => { try { return readFileSync(dir + "/" + p, "latin1"); } catch { return null; } };
const r0 = compileHolyC(src, { filename: "snapshot.HC", lenient: false, sharedMemory: true, defines: { SMP: 1 }, includeResolver: inc });           // MY_CORE defaults 0
const r1 = compileHolyC(src, { filename: "snapshot.HC", lenient: false, sharedMemory: true, defines: { SMP: 1, MY_CORE: 1 }, includeResolver: inc });
console.log(`compiled core0=${r0.bytes.length}B core1=${r1.bytes.length}B`);
const ICOUNT = Number(r0.globals.get("icount").addr);
const mod0 = await WebAssembly.compile(r0.bytes), mod1 = await WebAssembly.compile(r1.bytes);
const memory = new WebAssembly.Memory({ initial: 512, maximum: 8192, shared: true });   // shared guest RAM
let gBase = 0, fb = null;
function mkHost(isCore0) {
  const h = createHost({ onText: (s) => { if (s && s.indexOf("BADOP") >= 0) process.stdout.write((isCore0 ? "C0 " : "C1 ") + s); }, snd: { tone: () => {} },
    snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },   // only core 0 calls this (g_inited shared)
    diskRead: () => {}, diskWrite: () => {}, present: (a, w, h, u8) => { if (isCore0) fb = Uint8Array.from(u8.subarray(a, a + w * h)); } });
  h.env.__host_msx = () => 0n; h.env.__host_msy = () => 0n; h.env.__host_msb = () => 0n; h.env.__host_wheel = () => 0n;
  h.env.__host_key = () => -1n; h.env.__host_budget = () => 1000000n; h.env.__host_dt = () => 33n; h.env.__host_prof = () => {}; h.env.__host_time = () => 0n;
  h.env.mem = memory;                                  // the shared memory both instances import
  return h;
}
const host0 = mkHost(true), host1 = mkHost(false);
// instantiate BOTH before running (active data segments re-init on each instantiate; idempotent only pre-run)
const inst0 = await WebAssembly.instantiate(mod0, { env: host0.env }); host0.attach(inst0);
const inst1 = await WebAssembly.instantiate(mod1, { env: host1.env }); host1.attach(inst1);
inst0.exports.__rt_init(); inst1.exports.__rt_init();
const icount = () => Number(new BigInt64Array(memory.buffer, ICOUNT, 1)[0]);
// core 0: boot + render (its first __main does InitMem + load live8.bin + SetSnapRegs for ALL cores + g_inited=1)
for (let i = 0; i < 200; i++) inst0.exports.__main();
let nz0 = 0; if (fb) for (let i = 0; i < fb.length; i++) if (fb[i]) nz0++;
console.log(`core0 booted: gBase=0x${gBase.toString(16)} desktop non-black ${fb ? (100 * nz0 / fb.length).toFixed(1) : "n/a"}%`);
// core 1: raw-Step its idle servant loop over the SHARED memory (MY_CORE=1 -> uses g_cpu_st[1], fs/gs of core 1)
const ic0 = icount();
let c1bad = false;
try { for (let i = 0; i < 2000000; i++) inst1.exports.Step(); } catch (e) { c1bad = true; console.log("core1 Step threw:", e.message); }
const ic1 = icount();
console.log(`core1 ran: icount delta ${(ic1 - ic0)} instructions (>0 = core1 executed over shared memory ✓)  ${c1bad ? "FAULTED" : ""}`);
// core 0 again: did core 1 corrupt the desktop?
fb = null; for (let i = 0; i < 60; i++) inst0.exports.__main();
let nz1 = 0; if (fb) for (let i = 0; i < fb.length; i++) if (fb[i]) nz1++;
console.log(`core0 after core1: desktop non-black ${fb ? (100 * nz1 / fb.length).toFixed(1) : "n/a"}%  (still ~same = no corruption ✓)`);
