// measure.mjs - compile HEMU's self-test battery (HEMU/src/test.HC, which #includes cpu.HC) with
// holyc-wasm, run it headless, report correctness + speed.   node tools/hemu/measure.mjs
import assert from "node:assert/strict";
import { compileHemu, HEMU_SRC } from "../../engine/compile.js";
import { createHemuHost } from "../../engine/host.js";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(resolve(HEMU_SRC, "test.HC"), "latin1");   // HEMU/src/test.HC (#includes cpu.HC)

let r;
try {
  r = compileHemu({ source: src, filename: "test.HC",exports:["MeasureIdle"],extraSource:`
I64 MeasureIdle()
{
  Reset;
  mem[4096]=0x90;mem[4097]=0xF4;rip=4096;
  g_total=0;
  Go(1000);
  return g_total;
}` });
} catch (e) {
  console.error("COMPILE ERROR:", e.message);
  process.exit(1);
}
console.log(`compiled: ${r.bytes.length} bytes` + (r.warnings.length ? `, ${r.warnings.length} warnings` : ", 0 warnings"));
if (r.warnings.length) console.log("  warnings:", r.warnings.slice(0, 12));

let out = "";
const host = createHemuHost({ onText: (s) => { out += s; } });
const mod = await WebAssembly.compile(r.bytes);
const inst = await WebAssembly.instantiate(mod, { env: host.env });
host.attach(inst);
inst.exports.__rt_init();

const t0 = performance.now();
inst.exports.__main();
const t1 = performance.now();

assert.equal(inst.exports.MeasureIdle(),2n,"NOP and HLT execute twice; the remaining idle budget is not throughput");
process.stdout.write(out);
const sec = (t1 - t0) / 1000;
const total = +((out.match(/total guest instr=(\d+)/) || [])[1] || 0);
const failed = +((out.match(/(\d+) failed/) || [])[1] || -1);
if (total) console.log(`[measure] ${total.toLocaleString()} executed guest instr in ${sec.toFixed(4)}s = ${(total / sec / 1e6).toFixed(1)}M instr/s`);
process.exit(failed === 0 ? 0 : 1);
