import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
const root=fileURLToPath(new URL("../../",import.meta.url)),out=resolve(root,"build/native/version.so");
if(process.platform!=="linux")throw Error("This version refusal witness targets the Linux JSC adapter");
const build=spawnSync("cc",["-shared","-fPIC",resolve(root,"tools/native/tests/version.c"),"-o",out],{stdio:"inherit"});
assert.equal(build.status,0);
for(const args of [[],["check","missing.hemu"]]) {
  const run=spawnSync(resolve(root,"build/native/hemu-native"),args,{encoding:"utf8",timeout:5000,
    env:{...process.env,QT_QPA_PLATFORM:"offscreen",LD_PRELOAD:out}});
  assert.equal(run.status,1,run.error?.message||run.stderr);
  assert.match(run.stderr,/JavaScriptCoreGTK changed since this build/);
}
console.log("Native GUI/CLI reject a mismatched JSC runtime before reading or executing a machine.");
