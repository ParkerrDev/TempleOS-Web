import assert from "node:assert/strict";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {spritePackage,SPRITE_PLAYER} from "../sprite-codec.js";
import {GrNew} from "./Gr.js";

const source=await readFile(SPRITE_PLAYER,"utf8"),
  codec=await GrNew(await readFile(new URL("Gr.HC",import.meta.url),"utf8")),
  frames=[Uint8Array.of(4,255,1),Uint8Array.of(2,14,5)],
  encoded=frames.map(frame=>codec.encodeGR(frame,3,1)),
  dir=new URL("../tmp/sprites/",import.meta.url);
await mkdir(dir,{recursive:true});
const path=new URL("player.zip",dir).pathname;
await writeFile(path,spritePackage(encoded,3,1,100,source));
const files=JSON.parse(execFileSync("python3",["-c",
  "import sys,zipfile,json,base64; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({n:base64.b64encode(z.read(n)).decode() for n in z.namelist()}))",path],{encoding:"utf8"}));
for (let i=0;i<frames.length;i++)
  assert.deepEqual(Buffer.from(files[`Frame00${i}.GR`],"base64"),Buffer.from(encoded[i]));
assert.deepEqual(JSON.parse(Buffer.from(files["animation.json"],"base64")),
  {width:3,height:1,frames:2,delayMs:100,palette:"TempleOS standard",transparent:255});

if (process.argv.includes("--native")) {
  const {QemuRun}=await import("../holyc-wasm/tests/oracle/Qemu.mjs"),
    fixture=String.raw`
#exe {
  Cd("C:/ORACLE");
  Copy("FRAME000.GR","Frame000.GR");
  Copy("FRAME001.GR","Frame001.GR");
}
F64 test_time=0;
I64 test_keys=0,test_frees=0;
CTaskSettings *test_settings=SettingsPush;
U0 TestDraw(CTask *,CDC *) {}
Fs->draw_it=&TestDraw;
WinHorz(10,49);WinVert(8,31);
Fs->text_attr=YELLOW<<4+BLUE;
Fs->scroll_x=13;Fs->scroll_y=17;Fs->scroll_z=19;
U0 TestFree(CDC *dc)
{
  if (dc) test_frees++;
  DCDel(dc);
}
I64 TestKey()
{
  I64 i,x=(Fs->pix_width-3)/2,y=(Fs->pix_height-1)/2;
  CDC *dc=DCNew(640,480);
  F64 times[6];
  times[0]=0;times[1]=0.049;times[2]=0.099;
  times[3]=0.101;times[4]=0.199;times[5]=0.201;
  for (i=0;i<6;i++) {
    test_time=times[i];
    Fs->draw_it(Fs,dc);
    if (i==3 || i==4) {
      if (GrPeek(dc,x,y)!=GREEN || GrPeek(dc,x+1,y)!=YELLOW ||
          GrPeek(dc,x+2,y)!=PURPLE) throw('Frame1');
    } else if (GrPeek(dc,x,y)!=RED || GrPeek(dc,x+1,y)!=WHITE ||
          GrPeek(dc,x+2,y)!=BLUE) throw('Frame0');
    if (GrPeek(dc,0,0)!=WHITE) throw('Back');
  }
  DCDel(dc);
  test_keys++;
  PostMsg(Fs,MSG_KEY_DOWN,CH_ESC,SC_ESC);
  return GetChar;
}
#define tS test_time
#define GetChar TestKey
#define DCDel TestFree
#include "C:/ORACLE/PLAY.HC"
U0 TestRestored()
{
  I64 i;
  if (Fs->draw_it!=&TestDraw || Fs->next_settings!=test_settings ||
      Fs->win_left!=10 || Fs->win_right!=49 ||
      Fs->win_top!=8 || Fs->win_bottom!=31 ||
      Fs->text_attr!=YELLOW<<4+BLUE || Fs->scroll_x!=13 ||
      Fs->scroll_y!=17 || Fs->scroll_z!=19) throw('Restore');
  for (i=0;i<SPRITE_COUNT;i++)
    if (sprite_images[i]) throw('Images');
}
TestRestored;
if (test_keys!=1 || test_frees!=2) throw('Exit');
"Player:frames-key-settings-cleanup\n";
Del("C:/ORACLE/Frame001.GR");
PlaySprites;
TestRestored;
if (test_keys!=1 || test_frees!=3) throw('Failure');
"Player:missing-frame-settings-cleanup\n";
SettingsPop;
`,result=await QemuRun([fixture],{timeout:60,files:[
      {name:"PLAY.HC",bytes:Buffer.from(files["Play.HC"],"base64")},
      ...encoded.map((bytes,i)=>({name:`FRAME00${i}.GR`,bytes}))]});
  await writeFile(new URL("player-native.json",dir),JSON.stringify(result,null,2)+"\n");
  assert.equal(result.results[0].except,"");
  assert.match(result.results[0].out,/Player:frames-key-settings-cleanup/);
  assert.match(result.results[0].out,/Player:missing-frame-settings-cleanup/);
  console.log("Original V5.03 exported player: frame timing/pixels, native key exit, settings and success/failure image cleanup pass: "+result.evidence);
}
console.log("Sprite package: native frames and animation metadata pass.");
