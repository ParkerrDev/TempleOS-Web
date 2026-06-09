// smptest.mjs — validate the SMP foundation: compile the emulator with sharedMemory:true (imports a SHARED
// WebAssembly.Memory) and run ONE instance (interp; JIT off) over it. If the desktop renders non-black, the
// shared-memory codegen path works and we can instantiate N worker instances over the same memory next.
import { compileHolyC } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/compiler.js";
import { createHost } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/runtime/host.js";
import { readFileSync } from "node:fs";
const RAMSZ = 402653184;
const LIVE = process.env.LIVE || "/tmp/live.bin";
const liveBuf = readFileSync(LIVE);
const dir = "/Users/parkerh/Dev/hemu-wasm/src";
const src = readFileSync(dir + "/snapshot.HC", "latin1");
const r = compileHolyC(src, { filename: "snapshot.HC", lenient: false, sharedMemory: true, includeResolver: (p) => { try { return readFileSync(dir + "/" + p, "latin1"); } catch { return null; } } });
console.log(`compiled with sharedMemory: ${r.bytes.length} bytes`);
const mod = await WebAssembly.compile(r.bytes);
// host-created SHARED memory (SharedArrayBuffer-backed) — imported as env.mem by all instances
const memory = new WebAssembly.Memory({ initial: 512, maximum: 8192, shared: true });
console.log(`shared memory: ${memory.buffer.constructor.name} (${(memory.buffer.byteLength / 1048576) | 0} MiB), shared=${memory.buffer instanceof SharedArrayBuffer}`);
let mx = 320, my = 240, gBase = 0, lastFb = null;
const host = createHost({ onText: (s) => { if (s && s.indexOf("BADOP") >= 0) process.stdout.write("GUEST: " + s); }, snd: { tone: () => {} },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead: () => {}, diskWrite: () => {}, present: (a, w, h, u8) => { lastFb = Uint8Array.from(u8.subarray(a, a + w * h)); } });
host.env.__host_msx = () => BigInt(mx); host.env.__host_msy = () => BigInt(my); host.env.__host_msb = () => 0n; host.env.__host_wheel = () => 0n;
host.env.__host_key = () => -1n; host.env.__host_budget = () => 1000000n; host.env.__host_dt = () => 33n; host.env.__host_prof = () => {}; host.env.__host_time = () => 0n;
host.env.__jit_state = () => 0n;                          // JIT OFF (pure interp) — validate shared mem with the interpreter first
host.env.__jit_compile = () => 0n; host.env.__jit_run = () => 0n; host.env.__jit_x87 = () => {}; host.env.__jit_dispatch = () => 0n; host.env.__jit_chain = () => {};
host.env.mem = memory;                                    // <-- the shared memory the module imports
const inst = await WebAssembly.instantiate(mod, { env: host.env });
host.attach(inst); inst.exports.__rt_init();
console.log(`inst.exports.memory === shared memory: ${inst.exports.memory === memory}`);
for (let i = 0; i < 240; i++) inst.exports.__main();
let nz = 0; if (lastFb) for (let i = 0; i < lastFb.length; i++) if (lastFb[i]) nz++;
console.log(`gBase=0x${gBase.toString(16)}  frame non-black: ${lastFb ? (100 * nz / lastFb.length).toFixed(1) : "n/a"}%  (>5% = desktop rendered over SHARED memory ✓)`);
