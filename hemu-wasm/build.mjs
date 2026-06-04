// build.mjs — compile the hemu snapshot resumer (HolyC) to WASM using the merged holyc-wasm
// compiler, writing snapshot.wasm next to this file (fetched by ../hemu.html).
//   node hemu-wasm/build.mjs
import { compileHolyC } from "../holyc-wasm/src/compiler.js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(dir, "src");
const src = readFileSync(resolve(srcDir, "snapshot.HC"), "latin1");
const r = compileHolyC(src, {
  filename: "snapshot.HC",
  lenient: false,
  includeResolver: (p) => { try { return readFileSync(resolve(srcDir, p), "latin1"); } catch { return null; } },
});
writeFileSync(resolve(dir, "snapshot.wasm"), Buffer.from(r.bytes));
console.log(`snapshot.wasm: ${r.bytes.length} bytes, ${r.warnings.length} warnings`);
for (const w of r.warnings) console.log("  warn:", w);
