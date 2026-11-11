import {spawnSync} from "node:child_process";
import {realpathSync} from "node:fs";
import {fileURLToPath} from "node:url";

const args=new Set(process.argv.slice(2));
if([...args].some(a=>!["--full","--desktop"].includes(a))) {
  console.error("Usage: node tools/hemu/check.mjs [--full] [--desktop]");
  process.exit(2);
}
const root=fileURLToPath(new URL("../../",import.meta.url)),start=performance.now();
console.log("Compiler:",realpathSync(new URL("../../holyc-wasm",import.meta.url)));
const quick=["host.selftest.mjs","measure.mjs","cpu-native.mjs","boot-test.mjs","diskio-check.mjs",
  "atomic.test.mjs","atomic-flags.test.mjs","atom-split.test.mjs","bit.test.mjs","cmpxchg8b.test.mjs","muldiv.test.mjs","divide.test.mjs","time.test.mjs","mem-native.mjs","dev-native.mjs","keyboard.test.mjs","capture.test.mjs","barrier.test.mjs",
  "bus.test.mjs","bus-hemu.test.mjs","snapshot-format.test.mjs","snapregs.test.mjs","patch.test.mjs","jit-primitives.test.mjs","jit-loop.test.mjs","jit-branch.test.mjs","fpu-check.mjs",
  "fpu-convert.test.mjs","fpu-compare.test.mjs","fpu-ops.test.mjs","cpu-fault.test.mjs","fpu-native.mjs","jit-x87.test.mjs","shift.test.mjs","jitdiff1.mjs"],
  full=["menu-clip.test.mjs","video.test.mjs","raster.test.mjs","raster-native.mjs","raster-fallback.test.mjs","rate.test.mjs","guestcheck.mjs","large-file.test.mjs",
    "jitrecycle.mjs","worker.test.mjs","worker-fault.test.mjs","worker-legacy-fault.test.mjs","worker-clock.test.mjs","worker-rate.test.mjs","worker-pause.test.mjs",
    "worker-patch-pause.test.mjs","worker-snapshot.test.mjs","worker-bus.test.mjs","welcome.test.mjs","god-tools.test.mjs"];
let count=0;
function Run(path,env={}) {
  console.log("Checking",path);
  const r=spawnSync(process.execPath,["--max-old-space-size=3072",path],{
    cwd:root,stdio:"inherit",env:{...process.env,...env},timeout:300000
  });
  if(r.error)console.error(r.error.message);
  if(r.status!==0)process.exit(r.status||1);
  count++;
}
for(const path of quick)Run("tools/hemu/"+path);
if(args.has("--full")||args.has("--desktop"))Run("engine/build.mjs");
if(args.has("--full"))for(const path of full)Run("tools/hemu/"+path);
if(args.has("--full"))for(const path of ["worker-legacy-fault.test.mjs","worker-snapshot.test.mjs"])
  Run("tools/hemu/"+path,{HEMU_BUS_PROTOCOL:"1"});
if(args.has("--desktop"))for(const cores of [1,4])
  Run("tools/hemu/desktop.test.mjs",{HEMU_DESKTOP_CORES:String(cores)});
if(args.has("--desktop")) {
  Run("tools/hemu/desktop-lifecycle.test.mjs");
  Run("tools/browser/snapshot.mjs");
  Run("tools/browser/snapshot.mjs",{HEMU_LEGACY:"1"});
  Run("tools/browser/bus.mjs");
  Run("tools/browser/boot-cancel.mjs");
}
console.log(`${count} engine checks passed in ${((performance.now()-start)/1000).toFixed(1)}s.`);
