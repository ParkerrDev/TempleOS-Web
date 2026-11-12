import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {GuestHarness} from "./GuestHarness.mjs";
import {HolyCStr,GuestPatchCheck,AC_DBL_BUF_PATCH,DOC_CLIP_PATCH} from "../../engine/GuestPatch.js";

//The corrections build from the host's copies of the two stock files on a
//guest with no disk at all. The guest checks a copy by the size and hash it
//checks its own installed file by, so a copy one byte off is refused before
//anything compiles, and the good one installs as the disk's text would.
const Read=name=>readFileSync(new URL("../../engine/patches/"+name,import.meta.url)),
  ac=Read("V5.03/ACTask.HC"),doc=Read("V5.03/DocRecalc.HC"),
  h=await GuestHarness({disk:false}),{gx}=h,
  Var=name=>gx.rd64(gx.varFind(name)),
  Flag=name=>gx.rdBytes(gx.varFind(name),1)[0],
  Text=name=>Buffer.from(gx.rdBytes(gx.varFind(name),8)).toString("latin1").replace(/\0+$/,"");
function Bad(bytes)
{
  const res=Uint8Array.from(bytes);
  res[res.length>>1]^=0x20;
  return res;
}
assert.equal(h.disk,null);
assert.deepEqual([ac.length,doc.length],[7294,36007]);
assert.ok(ac.includes(0x24) && doc.includes(0x1F),"the copies hold the bytes a HolyC string must escape");
await h.Exec(Read("ACDblBuf.HC").toString("latin1"));
await h.Exec(`ACDblBufTry(${HolyCStr(Bad(ac))},${ac.length});`);
assert.equal(Var("ac_dbl_buf_revision"),0);
assert.equal(Text("ac_dbl_buf_except"),"ACVer","a changed AutoComplete copy is refused");
//Another core builds; core 0 then only checks and jumps. With no disk, a
//second build could not read the file, so the install must not need one.
await h.Exec(`ac_dbl_buf_except=0;ACDblBufBuildTry(${HolyCStr(Bad(ac))},${ac.length});`);
assert.equal(Text("ac_dbl_buf_except"),"ACVer","a changed copy builds nothing on any core");
assert.equal(Flag("ac_dbl_buf_built"),0);
await h.Exec(`ac_dbl_buf_except=0;ACDblBufBuildTry(${HolyCStr(ac)},${ac.length});`);
assert.deepEqual([Flag("ac_dbl_buf_built"),Var("ac_dbl_buf_revision"),Var("ac_dbl_buf_except")],[1,0,0]);
await h.Exec("ACDblBufTry;");
assert.equal(Text("ac_dbl_buf_except"),"");
assert.equal(Var("ac_dbl_buf_revision"),1);
GuestPatchCheck(gx,[AC_DBL_BUF_PATCH]);

await h.Exec(Read("DocClip.HC").toString("latin1"));
await h.Exec(`I64 patch_copy_except=0;
U0 PatchCopyTry(U8 *src,I64 size)
{
  try
    DocClipBuild(src,size);
  catch {
    patch_copy_except=Fs->except_ch;
    Fs->catch_except=TRUE;
  }
}
PatchCopyTry(${HolyCStr(Bad(doc))},${doc.length});`);
assert.equal(Text("patch_copy_except"),"DocVer","a changed document copy is refused");
assert.equal(Var("doc_clip_new"),0);
await h.Exec(`DocClipBuild(${HolyCStr(doc)},${doc.length});DocClipInstall;`);
assert.equal(Var("doc_clip_revision"),1);
GuestPatchCheck(gx,[DOC_CLIP_PATCH,AC_DBL_BUF_PATCH]);
console.log("Guest patches: both build from the host's V5.03 copies with no disk; a copy one byte off is refused; "+
  "AutoComplete built apart installs without a second build.");
