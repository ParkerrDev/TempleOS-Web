import assert from "node:assert/strict";
import {createReadStream,mkdirSync,writeFileSync} from "node:fs";
import {createGunzip} from "node:zlib";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {resolve} from "node:path";
import {SnapshotOpen,SnapshotReader} from "../../engine/Snapshot.js";

assert.equal(process.platform,"linux","resource.ru_maxrss is measured in KiB by this Linux gate");
const input=process.env.HEMU_NATIVE_FIXTURE||resolve("build/native/TempleOS.hemu"),
  binary=resolve(process.env.HEMU_NATIVE_BINARY||"build/native/hemu-native");
function Reader(path) {
  const file=createReadStream(path),stream=file.pipe(createGunzip()),iter=stream[Symbol.asyncIterator]();
  return SnapshotReader({read:()=>iter.next(),async cancel(){file.destroy();stream.destroy();}});
}
async function Hash(path) {
  const hash=createHash("sha256");for await(const bytes of createReadStream(path))hash.update(bytes);return hash.digest("hex");
}
const saved=await SnapshotOpen(input,{reader:Reader});assert.ok(saved);const meta=saved.meta;await saved.Close();
const probe=spawnSync("python3",["tools/native/tests/resources.py",binary,input],{encoding:"utf8",timeout:120000});
assert.equal(probe.status,0,probe.stderr||probe.error?.message);
const result=JSON.parse(probe.stdout),limitBytes=meta.memoryBytes+meta.diskBytes+256*1024*1024,
  evidence={...result,limitBytes,memoryBytes:meta.memoryBytes,diskBytes:meta.diskBytes,engine:meta.engineHash,
    input:await Hash(input),binary:await Hash(binary)};
mkdirSync("build/native/evidence",{recursive:true});
writeFileSync("build/native/evidence/resources.json",JSON.stringify(evidence,null,2)+"\n");
assert.equal(result.exit,0,result.stderr);
const state=JSON.parse(result.stdout);assert.equal(state.memoryBytes,meta.memoryBytes);
assert.ok(result.maxRssKiB*1024<=limitBytes,`Snapshot load peaked at ${result.maxRssKiB} KiB, above the machine + disk + 256 MiB allowance`);
console.log(`Native snapshot peak: ${result.maxRssKiB} KiB; bounded by saved memory + disk + 256 MiB. Wall ${result.wallSeconds.toFixed(3)}s is an observed-load sample, not a startup guarantee.`);
