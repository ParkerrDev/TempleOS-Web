// Build the JIT-hooked hemu wasm (canonical compiler + canonical snapshot.HC, which has the JIT
// dispatch hooks) and write it for the browser test to fetch.
import { compileHolyC } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/compiler.js";
import { readFileSync, writeFileSync } from "node:fs";
const dir = "/Users/parkerh/Dev/hemu-wasm/src";
const src = readFileSync(dir + "/snapshot.HC", "latin1");
const r = compileHolyC(src, { filename: "snapshot.HC", lenient: false, includeResolver: (p) => { try { return readFileSync(dir + "/" + p, "latin1"); } catch { return null; } } });
writeFileSync("/Users/parkerh/Dev/TempleOS-wasm/snapshot-jit.wasm", Buffer.from(r.bytes));
console.log("wrote snapshot-jit.wasm", r.bytes.length, "bytes; globals icount@" + r.globals.get("icount").addr);
