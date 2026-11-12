import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";

//Native QEMU/KVM reference for the AutoComplete double buffer. The original
//V5.03 routines hide the window while they refill it; the corrected ones never
//do, and no look of the window lasts only a few frames, even when it changes size.
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
  assert.equal(rows.length,3,out);
  return rows.map((row,phase)=>{
    const m=/^AC (\d) (\d+) (\d+) (\d+) (\d+) (\d+) (\d+) (\d+) (.*)$/.exec(row);
    assert.ok(m,row);
    assert.equal(Number(m[1]),phase);
    const [frames,hidden,refills,switches,spans,changes,shorts]=m.slice(2,9).map(Number);
    return {frames,hidden,refills,switches,spans,changes,shorts,text:m[9]};
  });
}
const original=Phases(result.results[0].out),patched=Phases(result.results[1].out);
console.log(JSON.stringify({original,patched}));
const texts=["Word:Dir","AutoComplete is in StandBy","AutoComplete is in StandBy"];
for(const p of original) {
  assert.ok(p.spans>0 && p.switches>0,"the original routines let tasks run with the window hidden");
  assert.ok(p.refills>=10);
}
assert.ok(original.reduce((n,p)=>n+p.hidden,0)>0,"the native window manager drew frames without the window");
assert.ok(original.reduce((n,p)=>n+p.shorts,0)>0,"the native screen showed looks of the window that lasted a few frames");
patched.forEach((p,i)=>{
  assert.deepEqual([p.hidden,p.switches,p.spans,p.shorts],[0,0,0,0],"the corrected window is never hidden and never blinks");
  assert.ok(p.refills>=10 && p.frames>0);
  assert.equal(p.text,texts[i]);
});
assert.ok(patched[0].changes<=2 && patched[1].changes<=2,"refilling the same list changes the screen only for the new word");
assert.ok(patched[2].changes>=6,"the window went between the list and StandBy");
original.forEach((p,i)=>assert.equal(p.text,texts[i]));
const Hash=b=>createHash("sha256").update(b).digest("hex"),
  fixture={patch:"ac-dbl-buf-v1",source:"TempleOS V5.03 ::/Adam/AutoComplete/ACTask.HC.Z",
    backend:result.backend,ms:8000,probeHash:Hash(probe),patchHash:Hash(patch),original,patched};
writeFileSync(new URL("./ac-flicker-oracle.json",import.meta.url),JSON.stringify(fixture,null,2)+"\n");
console.log(result.evidence);
