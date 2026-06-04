// boot-test.mjs — compile boot.HC, run the embedded x86-64 kernel in hemu
// headless, and confirm it drew the expected framebuffer pattern.
import { compileHolyC } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/compiler.js";
import { createHost } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/runtime/host.js";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const src = readFileSync(resolve(srcDir, "boot.HC"), "latin1");
const includeResolver = (p) => { try { return readFileSync(resolve(srcDir, p), "latin1"); } catch { return null; } };

let r;
try { r = compileHolyC(src, { filename: "boot.HC", lenient: false, includeResolver }); }
catch (e) { console.error("COMPILE ERROR:", e.message); process.exit(1); }
console.log(`compiled: ${r.bytes.length} bytes, ${r.warnings.length} warnings`);

let out = "", presented = null;
const host = createHost({
  onText: (s) => { out += s; },
  present: (addr, w, h, u8) => { presented = { addr, w, h, sample: [u8[addr], u8[addr + 16], u8[addr + 16 * 640]] }; },
});
const mod = await WebAssembly.compile(r.bytes);
const inst = await WebAssembly.instantiate(mod, { env: host.env });
host.attach(inst);
inst.exports.__rt_init();
const t0 = performance.now(); inst.exports.__main(); const t1 = performance.now();

process.stdout.write(out);
console.log(`present() called: ${!!presented}` + (presented ? `  w=${presented.w} h=${presented.h} firstpixels=${JSON.stringify(presented.sample)}` : ""));
console.log(`ran in ${((t1 - t0) / 1000).toFixed(3)}s`);
const ok = /patternOK=1/.test(out) && presented && presented.w === 640;
console.log(ok ? "BOOT TEST: PASS (kernel drew the framebuffer + present fired)" : "BOOT TEST: FAIL");
process.exit(ok ? 0 : 1);
