// build.mjs - compile HEMU to its deployable WASM engines:
//   node engine/build.mjs [outDir]        outDir defaults to ./build (relative to the cwd)
// writes   hemu.wasm       the single-core engine (hemu-worker.js and the inline engine load it)
//          hemu-smp.wasm   the shared-memory SMP engine (BSP + AP workers over one WebAssembly.Memory)
//          hemu-smp.json   sidecar: linear-memory addresses + CCpuState offsets the SMP workers wire APs with
// The Netlify build runs this right after cloning (netlify.toml), so nothing compiled is ever committed.
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
// Sidecar: the linear-memory addresses the browser SMP workers need to wire the APs (the per-core JIT
// offsets + IPI mailbox + guest-RAM base), since a fetched .wasm carries no compiler globals map. Mirrors
// what smpmt.mjs reads from r.globals. CCpuState field offsets are fixed (HEMU/src/core.HC), stride 440.
const G = {}; for (const n of ["icount","g_ncore","g_ipi_pending","g_cpu_st","tsc","g_xmm_lo","g_xmm_hi","mem"]) { const g = smp.globals.get(n); if (g) G[n] = Number(g.addr); }
const sidecar = { globals: G, ccpu: { stride: 440, reg: 0, rip: 128, rfl: 136, fpr: 232, fsp: 296, x87_cw: 304, x87_sw: 312, fsbase: 320, gsbase: 328 }, xmmStride: 128 };
writeFileSync(resolve(out, "hemu-smp.json"), JSON.stringify(sidecar, null, 1));
console.log(`hemu-smp.json: SMP globals + CCpuState offsets (browser AP-wiring sidecar)`);
// Segment/TSC addresses flow to the JIT at runtime via the __jit_seg handoff (per-core CCpuState),
// so there are no hardcoded offsets to keep in sync.
