// m2atomic.mjs - SMP M2 proof: two REAL worker_threads, one shared WebAssembly.Memory,
// native WASM atomics. Each worker runs a HolyC loop hammering a shared counter N times.
//   atomic   (__a_add64) -> final == 2*N exactly (no lost updates)
//   nonatomic (*p += 1)  -> final  < 2*N      (RMW races lose updates)
// The gap proves the atomic LOCK primitive is genuinely atomic across threads.
import { Worker, isMainThread, workerData, parentPort } from "node:worker_threads";
import { compileHolyC } from "../../holyc-wasm/src/compiler.js";
import { createHemuHost } from "../../engine/host.js";

const COUNTER = 0x2000000;            // shared counter address (clear of data/stack/heap)
const N = 5_000_000;                  // increments per worker
const SP_OF = (id) => 0x1000000 - id * 0x400000;   // per-worker shadow-stack base (4MB apart)

// HolyC: loop doing the increment, wrapped in a function so the loop index `i` is a per-instance
// LOCAL (top-level `I64 i` would be a GLOBAL in the shared memory -> both workers race the counter
// itself, terminating early). ATOMIC=1 -> native atomic; else racy load/add/store.
const srcFor = (atomic) => atomic
  ? `U0 Loop() { I64 i; for (i = 0; i < ${N}; i++) __a_add64(${COUNTER}, 1); }\n`
  : `U0 Loop() { U64 *p = ${COUNTER}; I64 i; for (i = 0; i < ${N}; i++) *p = *p + 1; }\n`;

if (!isMainThread) {
  // --- WORKER: instantiate the shared module over the shared memory, run the loop ---
  const { bytes, mem, id } = workerData;
  const mod = await WebAssembly.compile(bytes);
  const host = createHemuHost({});
  host.env.mem = mem;                                  // import the shared memory
  const inst = await WebAssembly.instantiate(mod, { env: host.env });
  inst.exports.__sp.value = BigInt(SP_OF(id));         // per-worker stack (region is shared)
  if (inst.exports.__core) inst.exports.__core.value = BigInt(id);
  host.attach(inst);
  parentPort.once("message", (m) => {                  // barrier: wait for "go" so both overlap
    if (m === "go") { inst.exports.Loop(); parentPort.postMessage("done"); }
  });
  parentPort.postMessage("ready");
} else {
  // --- MAIN: run the test for both variants ---
  async function trial(atomic) {
    const r = compileHolyC(srcFor(atomic), { filename: "m2.HC", lenient: false, sharedMemory: true, exports: ["Loop"] });
    const mem = new WebAssembly.Memory({ initial: 1024, maximum: 8192, shared: true });  // 64MB shared
    new DataView(mem.buffer).setBigUint64(COUNTER, 0n, true);                              // zero the counter
    const workers = [0, 1].map((id) => new Worker(new URL(import.meta.url), { workerData: { bytes: r.bytes, mem, id } }));
    await Promise.all(workers.map((w) => new Promise((res) => w.once("message", (m) => m === "ready" && res()))));
    const t0 = performance.now();
    const dones = workers.map((w) => new Promise((res) => w.once("message", (m) => m === "done" && res())));
    workers.forEach((w) => w.postMessage("go"));
    await Promise.all(dones);
    const ms = performance.now() - t0;
    const got = new DataView(mem.buffer).getBigUint64(COUNTER, true);
    await Promise.all(workers.map((w) => w.terminate()));
    return { got, ms };
  }
  const want = BigInt(2 * N);
  const A = await trial(true), B = await trial(false);
  console.log(`workers=2  N=${N.toLocaleString()} each  want(2N)=${want.toLocaleString()}`);
  console.log(`  ATOMIC    __a_add64 : ${A.got.toLocaleString()}  (${A.ms.toFixed(0)}ms)  ${A.got === want ? "EXACT ✓" : "WRONG ✗"}`);
  console.log(`  NONATOMIC *p=*p+1   : ${B.got.toLocaleString()}  (${B.ms.toFixed(0)}ms)  ${B.got < want ? `lost ${(want - B.got).toLocaleString()} updates` : "no loss (insufficient overlap)"}`);
  const pass = A.got === want && B.got < want;
  console.log(pass ? "=== M2 PASS: atomics are atomic across real threads; non-atomic races ===" : "=== M2 INCONCLUSIVE ===");
  process.exit(pass ? 0 : 1);
}
