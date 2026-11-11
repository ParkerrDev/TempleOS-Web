import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {GuestHarness} from "./GuestHarness.mjs";
import {fat32List,fat32Read} from "../../engine/qcow2.js";

const source=readFileSync(process.env.GOD_TOOLS_SOURCE||new URL("../../god/Tools.HC",import.meta.url),"latin1");
const h=await GuestHarness({disk:true,exports:["InjectKey"]}),{gx,ex,disk,base,Name}=h;
await h.Exec(source);
const Member=(cls,name)=>Number(ex.GuestMember(Name(cls),Name(name,0x7100))),
  putDoc=Member("CTask","put_doc"),type=Member("CDocEntry","type_u8"),bin=Member("CDocEntry","bin_data"),
  data=Member("CDocBin","data"),size=Member("CDocBin","size");
const dv=()=>new DataView(ex.memory.buffer);
const Hash=bytes=>createHash("sha256").update(bytes).digest("hex");
function SpriteDoc(task) {
  const doc=gx.rd64(task+putDoc);let entry=gx.rd64(doc);
  for(let i=0;entry && entry!==doc && i<10000;i++,entry=gx.rd64(entry)) {
    if(gx.rd8(entry+type)!==37)continue;
    const b=gx.rd64(entry+bin),n=dv().getUint32(base+b+size,true),p=gx.rd64(b+data);
    assert.ok(p && n>20 && n<1024*1024,"a native sprite owns nonempty copied binary data");
    return gx.rdBytes(p,n);
  }
  return null;
}
let random=0x6D2B79F5,hex="";
for(let i=0;i<1024;i++){random=(Math.imul(random,1664525)+1013904223)>>>0;hex+=(random>>>28).toString(16);}
const initial=new Set(fat32List(disk,"Home").map(e=>e.name)),start=performance.now(),
  id=gx.launch({id:"doodle-save",name:"God Doodle acceptance",src:`GodToolDoodle("${hex}");`});
let saved=null,lastReport=0;
for(let frames=0;performance.now()-start<120000;frames++) {
  await h.Run();
  const state=gx.status(id);
  assert.ok(!["failed","error","done"].includes(state?.state),JSON.stringify(state));
  if(frames%15===0) {
    saved=fat32List(disk,"Home").find(e=>!initial.has(e.name)&&/^Doodle[0-9A-F]{16}\.DD$/i.test(e.name)&&e.size>1);
    if(saved)break;
  }
  if(performance.now()-lastReport>15000) {
    lastReport=performance.now();
    console.log("native Doodle:",frames,"frames;",Math.round((performance.now()-start)/1000),"seconds",state?.state);
  }
}
assert.ok(saved,"deterministic native GodDoodle must finish and persist its document");
assert.equal(saved.name.length,25,"the complete filename fits TempleOS FAT32's two-name-slot limit");
const file=fat32Read(disk,"Home",saved.name),task=gx.info().focus.addr;
await h.Exec(`I64 god_check_size;U8 *god_check_data=FileRead("C:/Home/${saved.name}",&god_check_size);if (!god_check_data || god_check_size!=${file.length}) throw('GodSave');Free(god_check_data);`);
assert.match(Buffer.from(file).toString("latin1"),/\$SP,/);
const sprite=SpriteDoc(task);assert.ok(sprite,"View still holds the inserted sprite");
assert.ok(Buffer.from(file).includes(Buffer.from(sprite)),"the saved DolDoc contains the exact native sprite payload");
const hash=Hash(sprite);await h.Run(60);
assert.equal(Hash(SpriteDoc(task)),hash,"View preserves the sprite after its source allocation was freed");
ex.InjectKey(1n);ex.InjectKey(0x81n);
for(let n=0;n<300 && gx.status(id)?.state!=="done";n++)await h.Run();
assert.equal(gx.status(id)?.state,"done",JSON.stringify(gx.status(id)));
assert.equal(Hash(fat32Read(disk,"Home",saved.name)),Hash(file),"task exit preserves the disk document");
console.log(`GodToolDoodle: saved ${saved.name}, ${file.length} bytes; native sprite ${sprite.length} bytes, ${hash}; View and Escape passed in ${((performance.now()-start)/1000).toFixed(2)}s.`);

const desc=Member("CDoc","desc"),curEntry=Member("CDoc","cur_entry"),tagOff=Member("CDocEntry","tag"),songInitial=new Set(fat32List(disk,"Home").map(e=>e.name)),
  songStart=performance.now(),songId=gx.launch({id:"song-save",name:"God Song acceptance",src:"GodToolSong;"});
let songFile=null,forms=0,timers=0;
for(let frames=0;performance.now()-songStart<120000;frames++) {
  await h.Run();
  const state=gx.status(songId);
  assert.ok(!["failed","error","done"].includes(state?.state),JSON.stringify(state));
  if(frames%15===0)songFile=fat32List(disk,"Home").find(e=>!songInitial.has(e.name)&&/^Song[0-9A-F]{16}\.DD$/i.test(e.name)&&e.size>1);
  if(songFile)break;
  if(frames%30===0) {
    const doc=gx.rd64(gx.info().focus.addr+putDoc),kind=gx.rdStr(doc+desc,8);
    if(kind==="Form") {
      forms++;
      ex.InjectKey(1n);ex.InjectKey(0x81n);
    } else if(kind==="Menu") {
      const tag=gx.rdStr(gx.rd64(gx.rd64(doc+curEntry)+tagOff));
      if(tag==="OKAY") {
        timers++;
        ex.InjectKey(1n);ex.InjectKey(0x81n);
      } else {
        ex.InjectKey(0x0Fn);ex.InjectKey(0x8Fn);
      }
    }
  }
}
assert.ok(songFile,"native GodSong must accept both forms and timer dialogs, then save");
assert.equal(forms,2,"both native rhythm/octave forms were accepted");
assert.ok(timers>0,"native timer input supplied song entropy");
assert.equal(songFile.name.length,23);
const song=fat32Read(disk,"Home",songFile.name),songText=Buffer.from(song).toString("latin1"),
  songTask=gx.info().focus.addr,aux=Member("CDocEntry","aux_str");
function SongDoc() {
  const doc=gx.rd64(songTask+putDoc);let entry=gx.rd64(doc);
  for(let n=0;entry && entry!==doc && n<10000;n++,entry=gx.rd64(entry))
    if(gx.rd8(entry+type)===40)return gx.rdStr(gx.rd64(entry+aux),1024);
  return null;
}
const liveSong=SongDoc();assert.ok(liveSong && liveSong.length>=16);
assert.ok(songText.includes(`A="${liveSong}"`),"View owns the native song string copied into the saved document");
assert.match(songText,/\$SO,"<Song>",A="[0-9A-GRqeistM/.]{16,}"\$/);
await h.Exec(`I64 song_check_size;U8 *song_check_data=FileRead("C:/Home/${songFile.name}",&song_check_size);if (!song_check_data || song_check_size!=${song.length}) throw('GodSave');Free(song_check_data);`);
await h.Run(60);
assert.equal(SongDoc(),liveSong,"View retains song data after GodSong frees its temporary strings");
ex.InjectKey(1n);ex.InjectKey(0x81n);
for(let n=0;n<300 && gx.status(songId)?.state!=="done";n++)await h.Run();
assert.equal(gx.status(songId)?.state,"done",JSON.stringify(gx.status(songId)));
assert.equal(Hash(fat32Read(disk,"Home",songFile.name)),Hash(song));
console.log(`GodToolSong: saved ${songFile.name}, ${song.length} bytes; accepted ${forms} forms and ${timers} timers; View and Escape passed in ${((performance.now()-songStart)/1000).toFixed(2)}s.`);
