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
const quick=["host.selftest.mjs","measure.mjs","boot-test.mjs","diskio-check.mjs",
  "atomic.test.mjs","time.test.mjs","keyboard.test.mjs","capture.test.mjs","barrier.test.mjs",
  "snapshot-format.test.mjs","patch.test.mjs","jit-primitives.test.mjs","fpu-check.mjs",
  "fpu-convert.test.mjs","fpu-compare.test.mjs","fpu-native.mjs","jit-x87.test.mjs","shift.test.mjs","jitdiff1.mjs"],
  full=["menu-clip.test.mjs","video.test.mjs","raster.test.mjs","rate.test.mjs","guestcheck.mjs","large-file.test.mjs",
    "jitrecycle.mjs","worker.test.mjs","worker-rate.test.mjs","worker-pause.test.mjs",
    "worker-patch-pause.test.mjs","worker-snapshot.test.mjs","welcome.test.mjs","god-tools.test.mjs"];
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
if(args.has("--desktop"))for(const cores of [1,4])
  Run("tools/hemu/desktop.test.mjs",{HEMU_DESKTOP_CORES:String(cores)});
console.log(`${count} engine checks passed in ${((performance.now()-start)/1000).toFixed(1)}s.`);
