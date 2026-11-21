import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {gameProject} from "../../../Apps/Games/GameSrc.js";
import {installGame} from "../../../Apps/Games/GamePkgs.js";
import {PROGRAMS,ProgramSrc} from "../../../Apps/Programs.js";
import {Hash,root} from "./Evidence.mjs";
import {FrameRle,KeyBytes,MS_START,PlayEnd,SnapSave} from "./Play.mjs";

//The page's fetch and storage, for the site's modules run outside it.
globalThis.localStorage={getItem(){return null;}};
globalThis.fetch=async url=>new Response(await readFile(new URL(url,root)));

let installs=0;

//runInTempleOS in GamesRun.js, without the page: what a Games entry writes to the
//guest disk and what it then launches. Both machines get exactly this. A
//program (Apps/Programs.js) is written where it installs or launched from its
//source, as God Tools does.
export async function GameInstall(game,write,hashOnly=false)
{
  if (game.media) {
    if (hashOnly)
      await write(game.media.path,null,game.media.sha256);
    else {
      assert(process.env.KQ_DISK,"Set KQ_DISK to KQ1PCJR.IMG.");
      const bytes=await readFile(process.env.KQ_DISK);
      assert.equal(Hash(bytes),game.media.sha256,"Incorrect PCjr game disk.");
      await write(game.media.path,bytes);
    }
  }
  if (PROGRAMS.includes(game)) {
    const src=await ProgramSrc(game);
    if (!game.install)
      return {name:game.name,src};
    await write(game.install,Buffer.from(src,"latin1"));
    return {path:game.install,name:game.name};
  }
  if (game.packageId) {
    const generation=++installs; //A fresh guest each time, so nothing is cached.
    return installGame(game.packageId,async function (path,buffer) {
      await write(path,new Uint8Array(buffer));
      return {ok:true};
    },undefined,undefined,()=>generation);
  }
  const project=await gameProject(game),doc=await project.open(project.entry);
  if (game.install) {
    await write(game.install,new Uint8Array(doc.encode(doc.text)));
    return {path:game.install,name:game.name};
  }
  return {name:game.name,src:"#define TOS_NATIVE 1\n"+doc.text};
}

//Seconds of guest time, the same in both machines.
export const START_WAIT=15,START_QUIT=10,FRAME_SECONDS=0.016;
export const ESC=[0x01,0x81],SHIFT_ESC=[0x2A,0x01,0x81,0xAA];

export async function GameFiles(game,hashOnly=false)
{//What the entry writes and launches, and one hash over all of it.
  const files=[],hashes=[];
  const launch=await GameInstall(game,async function (path,bytes,sha256) {
    hashes.push({path,sha256:sha256 || Hash(bytes)});
    if (bytes) files.push({path,bytes});
  },hashOnly);
  return {files,launch,sha256:Hash(JSON.stringify({launch,files:hashes}))};
}

export async function StartInputs()
{//The files that decide what the startup check does, beside the site runtime.
  const res={};
  for (const name of ["Demo/Games/Test/Start.HC","Demo/Games/Test/Start.mjs",
    "Demo/Games/Test/Catalog.mjs","Demo/Games/Test/Install.mjs","Demo/Games/Test/Play.mjs",
    "Apps/Games/GamePlays.js","Apps/Games/GamePkgs.js","Apps/Games/GameSrc.js","Apps/Programs.js"])
    res[name]=Hash(await readFile(new URL(name,root)));
  return res;
}

export async function KvmInputs()
{//What decides a run in native HEMU beside the startup check's inputs: the
//KVM host, its capture, the oracle's output hook and Kvm.mjs.
  const res=await StartInputs();
  for (const name of ["hemu/Linux/HEMU.CPP","hemu/Misc/Ram.py","hemu/live-smp.bin.gz",
    "hemu/capture-smp.txt","hemu/templeos-hd.qcow2.gz","hemu/stock-smp.disk",
    "hemu/holyc-wasm/tests/oracle/QemuCapture.HC","Demo/Games/Test/Kvm.mjs"])
    res[name]=Hash(await readFile(new URL(name,root)));
  return res;
}

const OPS={snap:1,key:2,ms:3,quit:4}; //Start.HC's PLAY_ ops.

export function I64Str(hex)
{//GuestExec.js's i64str, for the hex Start.HC prints.
  let v=BigInt("0x"+hex),res="";
  for (let i=0;i<8 && v&255n;i++,v>>=8n)
    res+=String.fromCharCode(Number(v&255n));
  return res;
}

function HolyStr(st)
{
  assert(!/["\\\x00-\x1f]/.test(st),"Unexpected character in "+st);
  return '"'+st.replaceAll("$","$$$$")+'"';
}

function HolyEvents(events)
{//PlayEvents as Start.HC's play_ev: time in ms, op and two arguments.
  const quads=events.map(function (ev) {
    if (ev.op=="key") {
      const bytes=KeyBytes(ev.key,ev.down);
      return [ev.t,OPS.key,bytes.reduce((a,b,i)=>a+b*256**i,0),bytes.length];
    }
    if (ev.op=="ms")
      return [ev.t,OPS.ms,ev.x+ev.y*65536,ev.l+ev.r*2];
    return [ev.t,OPS[ev.op],0,0];
  });
  return Buffer.from(`#define START_WAIT ${START_WAIT}\n#define START_QUIT ${START_QUIT}\n`+
    `#define PLAY_MS_X ${MS_START[0]}\n#define PLAY_MS_Y ${MS_START[1]}\n`+
    `#define PLAY_EV_NUM ${quads.length}\nI64 play_ev[PLAY_EV_NUM*4]={`+
    quads.flat().join(",")+"};\n");
}

const start=await readFile(new URL("Start.HC",import.meta.url));

export function StartStage({files,launch},events,dir)
{//Start.HC's run of a game in V5.03: the files to stage in dir under 8.3
//names, and the fixture that copies them where the site writes them,
//launches and plays.
  const staged=[],made=new Set();
  let fixture="",code;
  files.forEach(function (file,i) {
    const name="P"+String(i).padStart(4,"0")+(/\.Z$/i.test(file.path)?".Z":".BIN"),
      parts=file.path.split("/");
    for (let j=2;j<parts.length;j++) {
      const sub=parts.slice(0,j).join("/");
      if (!made.has(sub)) {
        made.add(sub);
        fixture+="DirMk("+HolyStr(sub)+");\n";
      }
    }
    staged.push({name,bytes:file.bytes});
    fixture+="CopySingle("+HolyStr(dir+name)+","+HolyStr(file.path)+");\n";
  });
  if (launch.src!==undefined) {
    staged.push({name:"GAME.HC",bytes:Buffer.from(launch.src,"latin1")});
    code='ExePutS2(FileRead("'+dir+'GAME.HC"));';
  } else
    code="ExeFile2("+HolyStr(launch.path)+");";
  staged.push({name:"START.HC",bytes:Buffer.concat([HolyEvents(events),start])});
  fixture+='#include "'+dir+'START.HC"\nStartChk("'+
    code.replaceAll('"','\\"').replaceAll("$","$$$$")+'");\n';
  return {staged,fixture:Buffer.from(fixture,"latin1")};
}

export async function StartOut(out,events,dir,name)
{//What Start.HC printed, as a run; its snaps are saved as dir/name-N.png.
  const row=/^START (\S+)$/m.exec(out),end=/^END (\d+) (\S+)$/m.exec(out),
    word=w=>w.startsWith("except:")?"except:"+I64Str(w.slice(7)):w,snaps=[];
  assert(row,"Start.HC printed no result: "+out.slice(-400));
  for (const m of out.matchAll(/^SNAP (\d+) (\d+) ([A-P0-9]+)$/gm))
    snaps.push({updates:+m[2],...await SnapSave(dir,name+"-"+snaps.length,FrameRle(m[3]))});
  if (row[1]!="running")
    return {start:word(row[1]),quit:"-",end:"-",snaps};
  assert(end,"Start.HC printed no end: "+out.slice(-400));
  return {start:"running",quit:PlayEnd(events,+end[1]),end:word(end[2]),snaps};
}
