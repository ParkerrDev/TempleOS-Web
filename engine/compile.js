// compile.js - compile HEMU (the HolyC x86-64 emulator) with holyc-wasm: the one way build.mjs and
// every harness in tools/hemu does it. HEMU's source is pure HolyC and its host contract
// is HEMU/src/host.HC; this module fixes the compiler options that contract needs:
//   lenient:false - every symbol must resolve (an emulator has to be exactly right)
//   exports       - the functions the WASM host calls back into: the JIT's RdMem/WrMem/Step/RasterHLE,
//                   the guest-execution entry points (guestexec.js), and RunCore for the SMP engine.
// HEMU is the site's ../hemu clone (lowercase, as Netlify clones it; symlinked locally); HEMU_SRC
// overrides. SITE_DIR is the site root (some harnesses read game sources from it); SITE overrides.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileHolyC } from "../holyc-wasm/src/compiler.js";
import { GUEST_EXPORTS } from "./guestexec.js";

const here = fileURLToPath(new URL(".", import.meta.url));
export const HEMU_SRC = process.env.HEMU_SRC ? resolve(process.env.HEMU_SRC) : resolve(here, "../hemu/src");
export const SITE_DIR = process.env.SITE ? resolve(process.env.SITE) : resolve(here, "..");
export const JIT_EXPORTS = ["RdMem", "WrMem", "Step", "RasterHLE"];
export const HEMU_EXPORTS = [...JIT_EXPORTS, ...GUEST_EXPORTS];

export function hemuFile(name) { return readFileSync(resolve(HEMU_SRC, name), "latin1"); }
export function hemuIncludeResolver(p) { try { return hemuFile(p); } catch { return null; } }

// compileHemu({ smp, exports, extraSource, defines, source, filename }) -> the compileHolyC result.
//   smp:true     shared (imported) memory + the multi-core snapshot regs + RunCore (the SMP engine);
//                sharedMemory alone (no SMP snapshot) is a separate switch for the smpboot experiment
//   exports      extra function names to export (test probes); extraSource is appended to the entry file
//   source       compile this text instead of reading filename from HEMU_SRC (includes still resolve there)
export function compileHemu({ smp = false, sharedMemory = smp, exports = [], extraSource = "", defines = {}, source, filename = "snapshot.HC" } = {}) {
  const src = (source ?? hemuFile(filename)) + extraSource;
  return compileHolyC(src, {
    filename, lenient: false,
    sharedMemory, defines: smp ? { SMP_SNAP: "1", ...defines } : defines,
    exports: [...new Set([...JIT_EXPORTS, ...(smp ? ["RunCore"] : []), ...GUEST_EXPORTS, ...exports])],
    includeResolver: hemuIncludeResolver,
  });
}
