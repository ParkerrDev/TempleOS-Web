import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";

//Native QEMU/KVM reference for the AutoComplete double buffer. The original
//V5.03 routines hide the window while they refill it; the corrected ones never do.
const module=process.env.HOLYC_QEMU_ORACLE;
if(!module)throw new Error("Set HOLYC_QEMU_ORACLE to HolyC-wasm/tests/oracle/Qemu.mjs.");
const {QemuRun}=await import(pathToFileURL(module)),
  probe=readFileSync(new URL("./ACFlicker.HC",import.meta.url)),
  patch=readFileSync(new URL("../../engine/patches/ACDblBuf.HC",import.meta.url)),
  run=Buffer.from("\nACFlickerCheck(8000);\n"),
  result=await QemuRun([Buffer.concat([probe,run]),
    Buffer.concat([patch,Buffer.from("\nACDblBufInstall;\n"),probe,run])],{timeout:240});
for(const r of result.results)assert.equal(r.except,"");
function Phases(out) {
  const rows=out.trim().split("\n").filter(row=>row.startsWith("AC "));
  assert.equal(rows.length,2,out);
  return rows.map((row,phase)=>{
    const m=/^AC (\d) (\d+) (\d+) (\d+) (\d+) (\d+) (.*)$/.exec(row);
    assert.ok(m,row);
    assert.equal(Number(m[1]),phase);
    const [frames,hidden,refills,switches,spans]=m.slice(2,7).map(Number);
    return {frames,hidden,refills,switches,spans,text:m[7]};
  });
}
const original=Phases(result.results[0].out),patched=Phases(result.results[1].out),
  texts=["Word:Dir","AutoComplete is in StandBy"];
for(const p of original) {
  assert.ok(p.spans>0 && p.switches>0,"the original routines let tasks run with the window hidden");
  assert.ok(p.refills>=10);
}
assert.ok(original[0].hidden+original[1].hidden>0,"the native window manager drew frames without the window");
patched.forEach((p,i)=>{
  assert.deepEqual([p.hidden,p.switches,p.spans],[0,0,0],"the corrected routines never hide the window");
  assert.ok(p.refills>=10 && p.frames>0);
  assert.equal(p.text,texts[i]);
});
original.forEach((p,i)=>assert.equal(p.text,texts[i]));
const Hash=b=>createHash("sha256").update(b).digest("hex"),
  fixture={patch:"ac-dbl-buf-v1",source:"TempleOS V5.03 ::/Adam/AutoComplete/ACTask.HC.Z",
    backend:result.backend,ms:8000,probeHash:Hash(probe),patchHash:Hash(patch),original,patched};
writeFileSync(new URL("./ac-flicker-oracle.json",import.meta.url),JSON.stringify(fixture,null,2)+"\n");
console.log(result.evidence);
console.log(JSON.stringify({original,patched}));
