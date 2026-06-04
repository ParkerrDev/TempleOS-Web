// build.mjs — compile the hemu browser entries (boot.HC, anim.HC) to host/*.wasm.
import { compileHolyC } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/compiler.js";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = resolve(root, "src");
const includeResolver = (p) => { try { return readFileSync(resolve(srcDir, p), "latin1"); } catch { return null; } };

for (const name of ["boot", "anim"]) {
  const src = readFileSync(resolve(srcDir, `${name}.HC`), "latin1");
  const r = compileHolyC(src, { filename: `${name}.HC`, lenient: false, includeResolver });
  writeFileSync(resolve(root, `host/${name}.wasm`), Buffer.from(r.bytes));
  console.log(`built host/${name}.wasm: ${r.bytes.length} bytes, ${r.warnings.length} warnings`);
}
