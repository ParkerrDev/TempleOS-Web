import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {mkdir,readFile,rm,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {promisify} from "node:util";
import {ENTRIES,PROGRAMS} from "../../../Apps/Programs.js";
import {PLAYS} from "../../../Apps/Games/GamePlays.js";
import {Hash,RuntimeInputs,root} from "./Evidence.mjs";
import {GameFiles,StartInputs,StartOut,StartStage,START_WAIT,START_QUIT} from "./Install.mjs";
import {PlayEvents,PlayRecord} from "./Play.mjs";
import {PlayCompare} from "./PlayCmp.mjs";

//Every Games entry and program (Apps/Programs.js), installed and launched as
//the site does, in original TempleOS V5.03 under QEMU and in the site's HEMU,
//then played. Usage:
//  node Demo/Games/Test/Start.mjs [--write] [NAME...]
//Each machine runs the entry's control (no input, then Esc and Shift-Esc, the
//startup check) and its play script (Apps/Games/GamePlays.js); V5.03 plays it
//a second time to see whether the game is deterministic. --write writes
//Demo/Games/Startup.json and the machines' part of Demo/Games/Play.json; with
//names it replaces only theirs. Each entry keeps nativeSha256, the hash of the
//runtime and check it ran on, so one made before a change says it is stale.
//Frames go to OUT (tmp/games/start/) as PNGs.

const write=process.argv.includes("--write"),
  names=process.argv.slice(2).filter(arg=>arg!="--write"),
  games=names.length?names.map(name=>{
    const game=ENTRIES.find(g=>g.name==name);
    assert(game,"Unknown entry: "+name);
    return game;
  }):ENTRIES,
  jobs=Number(process.env.JOBS || 2),
  out=resolve(process.env.OUT || fileURLToPath(new URL("tmp/games/start/",root))),
  oracle=resolve(process.env.HOLYC_WASM || fileURLToPath(new URL("hemu/holyc-wasm/",root)),
    "tests/oracle/"),
  run=promisify(execFile);
assert(Number.isInteger(jobs) && jobs>=1 && jobs<=8,"JOBS must be 1 to 8.");
assert.deepEqual(Object.keys(PLAYS).sort(),ENTRIES.map(g=>g.name).sort(),
  "Apps/Games/GamePlays.js needs exactly one script for each Games entry and program.");
await mkdir(resolve(out,"hemu"),{recursive:true});
const {QemuRun}=await import(pathToFileURL(resolve(oracle,"Qemu.mjs"))),
  manifest=JSON.parse(await readFile(resolve(oracle,"Manifest.json"),"utf8"));

async function Real(files,events,dir,name)
{//The game staged in C:/ORACLE, copied where the site writes it, launched and played.
  const {staged,fixture}=StartStage(files,events,"C:/ORACLE/");
  try {
    const result=await QemuRun([fixture],{files:staged,timeout:420});
    if (result.results[0].except)
      return {start:"harness-error",quit:"-",end:"-",detail:"Fixture threw "+result.results[0].except,
        backend:result.backend};
    return {...await StartOut(result.results[0].out,events,dir,name),backend:result.backend};
  } catch (error) {
    const msg=String(error.message);
    return {start:/Fault:0x/.test(msg)?"fault":/Timed out/.test(msg)?"timeout":"harness-error",
      quit:"-",end:"-",detail:msg.slice(0,400)};
  }
}

async function Site(game,kind)
{//The shared catalog harness: the site's installer and launch in HEMU.
  const dir=resolve(out,"hemu",kind),file=resolve(dir,(game.packageId || game.file)+".json");
  await mkdir(dir,{recursive:true});
  await rm(file,{force:true});
  let failure;
  try {
    await run(process.execPath,["--max-old-space-size=3072",
      fileURLToPath(new URL("Catalog.mjs",import.meta.url)),game.name,kind],
      {timeout:600000,maxBuffer:65536,env:{...process.env,OUT:dir,
        FRAMES:resolve(out,game.packageId || game.file)}});
  } catch (error) {
    if (error.killed || error.signal)
      return {start:"timeout",quit:"-",end:"-",detail:"HEMU child stopped: "+(error.signal || "time")};
    failure=String(error.message).slice(0,400);
  }
  let report;
  try {
    report=JSON.parse(await readFile(file,"utf8"));
  } catch (error) {
    return {start:"harness-error",quit:"-",end:"-",
      detail:failure || "HEMU report unreadable: "+error.message};
  }
  return {start:report.run || "harness-error",quit:report.quit || "-",end:report.end || "-",
    snaps:report.snaps,engineSha256:report.engineSha256,
    detail:(report.failure || failure)?.split("\n")[0]};
}

async function Chk(game)
{
  const id=game.packageId || game.file,files=await GameFiles(game),dir=resolve(out,id),
    control=PlayEvents(game.name,"control"),play=PlayEvents(game.name,"play");
  const [real,realPlay,realAgain,site,sitePlay]=await Promise.all([
    Real(files,control,dir,"real-control"),Real(files,play,dir,"real-play"),
    Real(files,play,dir,"real-again"),Site(game,"control"),Site(game,"play")]);
  const res={name:game.name,program:PROGRAMS.includes(game) || undefined,
    filesSha256:files.sha256,script:PLAYS[game.name],
    real:{control:PlayRecord(real,"control"),play:PlayRecord(realPlay,"play"),
      again:PlayRecord(realAgain,"again")},
    site:{control:PlayRecord(site,"control"),play:PlayRecord(sitePlay,"play")},
    backend:real.backend,engineSha256:site.engineSha256||sitePlay.engineSha256};
  res.verdict=PlayCompare(res);
  await writeFile(resolve(out,id+".json"),JSON.stringify({...res,detail:{real:real.detail,
    realPlay:realPlay.detail,realAgain:realAgain.detail,site:site.detail,sitePlay:sitePlay.detail}},
    null,2)+"\n");
  const words=r=>[r.start,r.quit,r.end].join(" "),v=res.verdict;
  console.log(game.name+": V5.03 "+words(real)+" / play "+words(realPlay)+" "+v.real.response+
    ", HEMU "+words(site)+" / play "+words(sitePlay)+" "+v.site.response+
    (v.templeos?"":" FAILS")+(v.deterministic?", deterministic":"")+(v.siteSame?", frames agree":"")+
    [real,realPlay,realAgain,site,sitePlay].map(r=>r.detail?"; "+r.detail.split("\n")[0]:"").join(""));
  return res;
}

const results=new Array(games.length);
let next=0;
await Promise.all(Array.from({length:Math.min(jobs,games.length)},async function () {
  while (next<games.length) {
    const i=next++;
    results[i]=await Chk(games[i]);
    const engines=new Set(results.map(r=>r?.engineSha256).filter(Boolean));
    assert(!write || engines.size<=1,"HEMU changed during the run (at "+games[i].name+
      "); the evidence binds one engine. Rerun when it is still.");
  }
}));
if (write) {
  const backend=results.find(r=>r.backend)?.backend,
    engines=new Set(results.map(r=>r.engineSha256).filter(Boolean)),
    site={...await RuntimeInputs(),engineSha256:[...engines][0]},
    real={templeos:manifest.templeos,diskSha256:manifest.rawDiskSha256,backend},
    inputs=await StartInputs(),
    words=r=>({run:r.start,quit:r.quit,end:r.end}),
    native={real,site,inputs},nativeSha256=Hash(JSON.stringify(native));
  assert(engines.size==1,"HEMU engines differ between runs.");
  let old=null;
  try {
    old=JSON.parse(await readFile(new URL("Demo/Games/Play.json",root)));
  } catch (error) {
    if (error.code!="ENOENT")
      throw error;
  }
  const kept=g=>{//An entry not rerun, as the record has it, if it has one.
      const o=old?.games.find(o=>o.name==g.name);
      return o && {...o,nativeSha256:o.nativeSha256 || Hash(JSON.stringify(old.native))};
    },
    entries=ENTRIES.map(g=>results.find(r=>r.name==g.name) || kept(g)).filter(Boolean);
  await writeFile(new URL("Demo/Games/Startup.json",root),JSON.stringify({
    scope:"Each Games entry and program installed and launched as the site does, in original "+
      `TempleOS V5.03 under QEMU and in the site's HEMU: still running after ${START_WAIT} s `+
      "of guest time and through the times of its play script with no input, then completion "+
      `within ${START_QUIT} s after Esc or the subsequent Shift-Esc. `+
      "These are observation windows, not proof of which key caused completion. "+
      "Demo/Games/Play.json holds the same entries played.",
    real,site,inputs,
    games:entries.map(r=>({name:r.name,filesSha256:r.filesSha256,nativeSha256:r.nativeSha256 || nativeSha256,
      real:words(r.real.control),site:words(r.site.control),
      same:JSON.stringify(words(r.real.control))==JSON.stringify(words(r.site.control))}))
  },null,2)+"\n");
  const record={scope:"Each Games entry and program (Apps/Programs.js) played by its "+
      "script in Apps/Games/GamePlays.js "+
      "on three machines: original TempleOS V5.03 under QEMU (real), the site's HEMU "+
      "(site) and HolyC-WASM in the Games window (browser). Each runs the script and "+
      "a control without its input; V5.03 plays it twice. A snap, taken at the start "+
      "and before each step, is the frame's FNV-1a hash below the status line, its "+
      "count of colors and a 4-bit digest of each of 16x12 cells; a control keeps "+
      "the cells that moved without input. verdict, from PlayCmp.mjs, says per "+
      "machine whether the game stayed alive, drew, advanced and changed with the "+
      "input (input: cells that do not move without it changed; moved: the frames "+
      "changed but the game also moves by itself), and where the machines agree. "+
      "A program (program: true) runs when it returns cleanly before the script or "+
      "stays alive, draws and advances until its script ends it, and two machines "+
      "agree on it when they end it the same way.",
    native,
    browser:old?.browser,
    kvm:old?.kvm, //Kvm.mjs's, native HEMU on KVM.
    games:entries.map(function (r) {
      const o=old?.games.find(g=>g.name==r.name && g.script==r.script),
        g={name:r.name,program:r.program,script:r.script,filesSha256:r.filesSha256,nativeSha256:r.nativeSha256 || nativeSha256,
          real:r.real,site:r.site,browser:o?.browser,kvm:o?.kvm};
      g.verdict=PlayCompare(g);
      return g;
    })};
  await writeFile(new URL("Demo/Games/Play.json",root),JSON.stringify(record,null,1)+"\n");
}
const fails=results.filter(r=>!r.verdict.templeos).map(r=>r.name);
console.log(results.length-fails.length+" of "+results.length+
  " run the same in V5.03 and HEMU"+(fails.length?"; not: "+fails.join(", "):"."));
