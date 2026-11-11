import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {GuestHarness} from "./GuestHarness.mjs";

const source=readFileSync(new URL("./MenuClip.HC",import.meta.url),"latin1"),
  fixture=JSON.parse(readFileSync(new URL("./menu-clip-oracle.json",import.meta.url))),
  h=await GuestHarness({disk:true,exports:["MenuFrame","MenuAccelOff","MenuAccelCount"],extraSource:`
U64 MenuFrame(I64 which) {if (!which) return g_desk;return g_desk_seq;}
U0 MenuAccelOff() {
  g_hle_blit=0;g_poly3_hle=0;g_raster_n=0;
  video_blot=0;video_line=0;video_flush=0;
}
I64 MenuAccelCount() {return g_raster_calls+g_poly3_calls+video_calls;}
`}),{gx,ex,Name}=h;
const patch=readFileSync(new URL("../../engine/patches/DocClip.HC",import.meta.url));
assert.equal(createHash("sha256").update(Buffer.from(source,"latin1")).digest("hex"),fixture.probeHash);
assert.equal(createHash("sha256").update(patch).digest("hex"),fixture.patchHash);
assert.equal(new Set(fixture.original).size,2,"original native flicker is independently recorded");
await h.Exec(patch.toString("latin1"));
await h.Exec("DocClipInstall;");
await h.Exec(source);
await h.Exec("MenuClipInit;");
const rect=Number(ex.GuestVar(Name("menu_clip_rect"))),
  sprite=Number(ex.GuestVar(Name("menu_clip_sprite"))),
  doc=gx.rd64(Number(ex.GuestVar(Name("menu_clip_doc")))),
  cache=Number(ex.GuestVar(Name("doc_clip_cache"))),
  tagOff=Number(ex.GuestMember(Name("CDocEntry"),Name("tag",0x7100))),
  tag=gx.rdStr(gx.rd64(gx.rd64(sprite)+tagOff));
assert.equal(tag,fixture.sprite,"the native reference and test select the same stock game icon");
function FrameHash(bounds) {
  const pixels=new Uint8Array(ex.memory.buffer,Number(ex.MenuFrame(0n)),640*480);
  let hash=0xCBF29CE484222325n;
  for(let y=bounds[2];y<=bounds[3];y++)for(let x=bounds[0];x<=bounds[1];x++)
    hash=BigInt.asUintN(64,(hash^BigInt(pixels[y*640+x]))*0x100000001B3n);
  return hash.toString(16).padStart(16,"0").toUpperCase();
}
let frames=0;
for(const mode of ["accelerated","native"]) {
  if(mode==="native")ex.MenuAccelOff();
  const calls=ex.MenuAccelCount();
  for(const pose of fixture.poses) {
    await h.Exec(`MenuClipPose(${pose.pose});`);
    const bounds=Array.from({length:4},(_,i)=>gx.rd64(rect+i*8));
    assert.deepEqual(bounds,pose.bounds,"the sprite is partially clipped at the expected native coordinates");
    let seq=ex.MenuFrame(1n),n=0;
    const fullPasses=new Set();
    for(let run=0;n<24 && run<2000;run++) {
      await h.Run();
      const next=ex.MenuFrame(1n);
      if(next===seq)continue;
      seq=next;
      assert.equal(FrameHash(bounds),pose.hash,`${mode} pose ${pose.pose} completed frame ${n}`);
      for(let i=0;i<256;i++)if(gx.rd64(cache+i*32)===doc)
        fullPasses.add(gx.rd64(cache+i*32+16));
      n++;frames++;
    }
    assert.equal(n,24,"the guest must complete all repeated frames");
    assert.ok(fullPasses.size>0 && fullPasses.size<24,"incremental frames reuse bounds without walking the full document");
  }
  if(mode==="native")assert.equal(ex.MenuAccelCount(),calls,"native reference uses no raster/video HLE");
}
await h.Exec("Kill(menu_clip_task);");
console.log(`Ctrl+M: ${frames} completed frames equal corrected native QEMU/KVM pixels for ${tag}, clipped at six native scrollbar positions along both window edges; native and accelerated rendering.`);
