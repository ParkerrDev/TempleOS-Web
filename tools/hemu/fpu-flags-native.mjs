import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
const module=process.env.HOLYC_QEMU_ORACLE;
if(!module)throw new Error("Set HOLYC_QEMU_ORACLE to HolyC-wasm/tests/oracle/Qemu.mjs.");
const {QemuRun}=await import(pathToFileURL(module)),
  source=readFileSync(new URL("./FpuFlags.HC",import.meta.url)),
  result=await QemuRun([source],{timeout:180}),
  file=new URL(`./fpu-flags-${result.backend.accelerator}.json`,import.meta.url);
assert.equal(result.results[0].except,"");
assert.equal(result.results[0].out.trim().split("\n").length,16);
result.probeHash=createHash("sha256").update(source).digest("hex");
if(process.argv.includes("--record"))writeFileSync(file,JSON.stringify(result,null,2)+"\n");
else {
  const expected=JSON.parse(readFileSync(file));
  assert.equal(result.probeHash,expected.probeHash);
  assert.deepEqual(result.results,expected.results);
}
console.log(result.backend,result.evidence);
