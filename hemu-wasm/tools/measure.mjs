// measure.mjs — compile hemu's test entry (test.HC, which #includes cpu.HC) with
// holyc-wasm, run the self-checking battery headless, report correctness + speed.
import { compileHolyC } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/compiler.js";
import { createHost } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/runtime/host.js";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const src = readFileSync(resolve(srcDir, "test.HC"), "latin1");
const includeResolver = (p) => { try { return readFileSync(resolve(srcDir, p), "latin1"); } catch { return null; } };

let r;
try {
  r = compileHolyC(src, { filename: "test.HC", lenient: false, includeResolver });
} catch (e) {
  console.error("COMPILE ERROR:", e.message);
  process.exit(1);
}
console.log(`compiled: ${r.bytes.length} bytes` + (r.warnings.length ? `, ${r.warnings.length} warnings` : ", 0 warnings"));
if (r.warnings.length) console.log("  warnings:", r.warnings.slice(0, 12));

let out = "";
const host = createHost({ onText: (s) => { out += s; } });
const mod = await WebAssembly.compile(r.bytes);
const inst = await WebAssembly.instantiate(mod, { env: host.env });
host.attach(inst);
inst.exports.__rt_init();

const t0 = performance.now();
inst.exports.__main();
const t1 = performance.now();

process.stdout.write(out);
const sec = (t1 - t0) / 1000;
const total = +((out.match(/total guest instr=(\d+)/) || [])[1] || 0);
const failed = +((out.match(/(\d+) failed/) || [])[1] || -1);
if (total) console.log(`[measure] ${total.toLocaleString()} guest instr in ${sec.toFixed(4)}s = ${(total / sec / 1e6).toFixed(1)}M instr/s`);
process.exit(failed === 0 ? 0 : 1);
