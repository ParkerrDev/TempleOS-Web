import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {GuestHarness} from "./GuestHarness.mjs";
import {GuestPatchCheck,AC_DBL_BUF_PATCH} from "../../engine/GuestPatch.js";

//The AutoComplete window refills without leaving any frame or task switch with
//it hidden, and no look of it lasts only a few frames, even when it changes
//size, as in the corrected native QEMU/KVM reference.
const probe=readFileSync(new URL("./ACFlicker.HC",import.meta.url)),
  patch=readFileSync(new URL("../../engine/patches/ACDblBuf.HC",import.meta.url)),
  fixture=JSON.parse(readFileSync(new URL("./ac-flicker-oracle.json",import.meta.url))),
  Hash=b=>createHash("sha256").update(b).digest("hex");
assert.equal(Hash(probe),fixture.probeHash);
assert.equal(Hash(patch),fixture.patchHash);
assert.equal(fixture.patch,AC_DBL_BUF_PATCH);
for(const p of fixture.original)assert.ok(p.spans>0,"original native flicker is independently recorded");
for(const p of fixture.patched)assert.deepEqual([p.hidden,p.switches,p.spans,p.shorts],[0,0,0,0]);
const h=await GuestHarness({disk:true}),{gx}=h,ms=3000,
  Sum=(rows,key)=>rows.reduce((n,p)=>n+p[key],0);
function Results() {
  const res=gx.varFind("ac_flicker_res"),text=gx.varFind("ac_flicker_text");
  return [0,1,2].map(phase=>{
    const [frames,hidden,refills,switches,spans,changes,shorts]=
      Array.from({length:7},(_,i)=>gx.rd64(res+(phase*7+i)*8));
    return {frames,hidden,refills,switches,spans,changes,shorts,text:gx.rdStr(text+phase*64)};
  });
}
await h.Exec(probe.toString("latin1"));
await h.Exec(`ACFlickerCheck(${ms});`);
const original=Results();
original.forEach((p,i)=>{
  assert.ok(p.refills>=5,"the probe makes AutoComplete refill its list");
  assert.ok(p.spans>0 && p.switches>0,"the stock routines hide the window while they refill it");
  assert.equal(p.text,fixture.patched[i].text);
});
assert.ok(Sum(original,"shorts")>0,"the stock window blinks on the screen");
await h.Exec(patch.toString("latin1"));
await h.Exec("ACDblBufTry;");
const revision=gx.varFind("ac_dbl_buf_revision"),except=gx.varFind("ac_dbl_buf_except");
assert.equal(gx.rd64(revision),1);
assert.equal(gx.rd64(except),0);
GuestPatchCheck(gx,[AC_DBL_BUF_PATCH]);
await h.Exec("ACDblBufTry;");
assert.equal(Buffer.from(gx.rdBytes(except,8)).toString("latin1").replace(/\0+$/,""),"ACEntry",
  "a second install is refused and leaves the first in place");
GuestPatchCheck(gx,[AC_DBL_BUF_PATCH]);
await h.Exec(`ACFlickerCheck(${ms});`);
const patched=Results();
patched.forEach((p,i)=>{
  assert.ok(p.refills>=5 && p.frames>0);
  assert.deepEqual([p.hidden,p.switches,p.spans,p.shorts],[0,0,0,0],"the corrected window is never hidden and never blinks");
  assert.equal(p.text,fixture.patched[i].text);
});
assert.ok(patched[0].changes<=2 && patched[1].changes<=2,"refilling the same list changes the screen only for the new word");
assert.ok(patched[2].changes>=2,"the window went between the list and StandBy");
console.log(`AutoComplete: stock routines hid the window on ${Sum(original,"spans")} of ${Sum(original,"refills")} refills `+
  `and showed ${Sum(original,"shorts")} looks of it that lasted 3 frames or less; corrected, ${Sum(patched,"refills")} refills, `+
  `${patched[2].changes} changes of size and ${Sum(patched,"frames")} frames with it never hidden and no such look, as in native QEMU/KVM.`);
