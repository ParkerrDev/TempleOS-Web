// build.mjs - compile HEMU to its deployable WASM engines:
//   node engine/build.mjs [outDir]        outDir defaults to ./build (relative to the cwd)
// writes   hemu.wasm       the single-core engine (hemu-worker.js and the inline engine load it)
//          hemu-smp.wasm   the shared-memory SMP engine (BSP + AP workers over one WebAssembly.Memory)
//          hemu-smp.json   sidecar: the address of the SMP IPI mailboxes
// Netlify rebuilds production engines; historical test modules are pinned fixtures.
// HEMU's source is found by compile.js (../hemu/src; HEMU_SRC overrides).
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { compileHemu } from "./compile.js";

const out = resolve(process.argv[2] || "build");
mkdirSync(out, { recursive: true });

const r = compileHemu();
writeFileSync(resolve(out, "hemu.wasm"), Buffer.from(r.bytes));
console.log(`hemu.wasm: ${r.bytes.length} bytes, ${r.warnings.length} warnings`);
for (const w of r.warnings) console.log("  warn:", w);

// SMP build: shared (imported) memory + multi-core snapshot regs + RunCore export - the engine the
// browser SMP workers (BSP + APs over one shared WebAssembly.Memory) load. The single-core build above
// is unchanged. Needs the SMP snapshot (multi-core capture) + per-core wiring.
const smp = compileHemu({ smp: true });
writeFileSync(resolve(out, "hemu-smp.wasm"), Buffer.from(smp.bytes));
console.log(`hemu-smp.wasm: ${smp.bytes.length} bytes (shared memory, SMP), ${smp.warnings.length} warnings`);
// Sidecar: the IPI mailboxes' address, which the page hands the BSP so it can drop stale boot IPIs
// when it releases the APs (a fetched .wasm carries no compiler globals map). Everything else the
// workers need they get from the engine's own exports (RamBase, CoreAttach, RunCore).
const sidecar = { globals: { g_ipi_pending: Number(smp.globals.get("g_ipi_pending").addr) } };
writeFileSync(resolve(out, "hemu-smp.json"), JSON.stringify(sidecar, null, 1));
console.log(`hemu-smp.json: the SMP IPI mailbox address`);
