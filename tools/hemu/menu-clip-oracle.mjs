import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";

const module=process.env.HOLYC_QEMU_ORACLE;
if(!module)throw new Error("Set HOLYC_QEMU_ORACLE to HolyC-wasm/tests/oracle/Qemu.mjs.");
const {QemuRun}=await import(pathToFileURL(module)),
  probe=readFileSync(new URL("./MenuClip.HC",import.meta.url)),
  patch=readFileSync(new URL("../../engine/patches/DocClip.HC",import.meta.url)),
  source=Buffer.concat([patch,Buffer.from("\nDocClipInstall;\n"),probe]),
  result=await QemuRun([Buffer.concat([probe,Buffer.from("\nMenuClipRepro;\n")]),
    Buffer.concat([source,Buffer.from("\nMenuClipCheck;\n")])],{timeout:120});
for(const r of result.results)assert.equal(r.except,"");
const original=result.results[0].out.trim().split("\n").map(row=>{
  assert.match(row,/^REPRO [0-9A-F]{16}$/);return row.slice(6);
});
assert.equal(original.length,48);
assert.equal(new Set(original).size,2,"the original native routine alternates blank and visible sprite tails");
const poses=result.results[1].out.trim().split("\n").map(row=>{
  const m=/^MENU (\d) (\d+) (\d+) (\d+) (\d+) ([0-9A-F]{16})$/.exec(row);
  assert.ok(m,row);
  return {pose:Number(m[1]),bounds:m.slice(2,6).map(Number),hash:m[6]};
});
assert.equal(poses.length,6);
const Hash=b=>createHash("sha256").update(b).digest("hex"),
  fixture={patch:"doc-sprite-clip-v1",source:"TempleOS V5.03 ~/PersonalMenu.DD.Z",sprite:"Titanium",
    backend:result.backend,probeHash:Hash(probe),patchHash:Hash(patch),original,
    repeatedFrames:24,poses};
writeFileSync(new URL("./menu-clip-oracle.json",import.meta.url),JSON.stringify(fixture,null,2)+"\n");
console.log(result.evidence);
