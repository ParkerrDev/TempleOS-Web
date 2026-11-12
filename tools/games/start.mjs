import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {promisify} from "node:util";
import {GAMES} from "../../GameCatalog.js";
import {RuntimeInputs,root} from "./Evidence.mjs";
import {GameFiles,StartInputs} from "./Install.mjs";

//Every Games entry, installed and launched as the site does, in original
//TempleOS V5.03 under QEMU and in the site's HEMU. Usage:
//  node tools/games/start.mjs [--write] [NAME...]
//--write needs every entry and writes games/startup.json.

const write=process.argv.includes("--write"),
  names=process.argv.slice(2).filter(arg=>arg!="--write"),
  games=names.length?names.map(name=>{
    const game=GAMES.find(g=>g.name==name);
    assert(game,"Unknown catalog game: "+name);
    return game;
  }):GAMES,
  jobs=Number(process.env.JOBS || 6),
  out=resolve(process.env.OUT || fileURLToPath(new URL("tmp/games/start/",root))),
  oracle=resolve(process.env.HOLYC_WASM || fileURLToPath(new URL("holyc-wasm/",root)),
    "tests/oracle/"),
  start=await readFile(new URL("Start.HC",import.meta.url)),
  run=promisify(execFile);
assert(!write || !names.length,"--write records every entry; give no names.");
assert(Number.isInteger(jobs) && jobs>=1 && jobs<=16,"JOBS must be 1 to 16.");
await mkdir(resolve(out,"hemu"),{recursive:true});
const {QemuRun}=await import(pathToFileURL(resolve(oracle,"Qemu.mjs"))),
  manifest=JSON.parse(await readFile(resolve(oracle,"Manifest.json"),"utf8"));

function I64Str(hex)
{//guestexec.js's i64str, for the hex Start.HC prints.
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

async function Real({files,launch})
{//Stage the files under 8.3 names, copy them where the site writes them, launch.
  const staged=[],made=new Set();
  let fixture="";
  files.forEach(function (file,i) {
    const name="P"+String(i).padStart(4,"0")+(/\.Z$/i.test(file.path)?".Z":".BIN"),
      parts=file.path.split("/");
    for (let j=2;j<parts.length;j++) {
      const dir=parts.slice(0,j).join("/");
      if (!made.has(dir)) {
        made.add(dir);
        fixture+="DirMk("+HolyStr(dir)+");\n";
      }
    }
    staged.push({name,bytes:file.bytes});
    fixture+="CopySingle("+HolyStr("C:/ORACLE/"+name)+","+HolyStr(file.path)+");\n";
  });
  let code;
  if (launch.src!==undefined) {
    staged.push({name:"GAME.HC",bytes:Buffer.from(launch.src,"latin1")});
    code='ExePutS2(FileRead("C:/ORACLE/GAME.HC"));';
  } else
    code="ExeFile2("+HolyStr(launch.path)+");";
  staged.push({name:"START.HC",bytes:start});
  fixture+='#include "C:/ORACLE/START.HC"\nStartChk("'+
    code.replaceAll('"','\\"').replaceAll("$","$$$$")+'");\n';
  try {
    const result=await QemuRun([Buffer.from(fixture,"latin1")],{files:staged,timeout:300}),
      row=/^START (\S+) (\S+) (\S+)$/m.exec(result.results[0].out);
    if (result.results[0].except)
      return {run:"harness-error",quit:"-",end:"-",detail:"Fixture threw "+result.results[0].except,
        backend:result.backend};
    assert(row,"Start.HC printed no result: "+result.results[0].out.slice(-400));
    const word=w=>w.startsWith("except:")?"except:"+I64Str(w.slice(7)):w;
    return {run:word(row[1]),quit:row[2],end:word(row[3]),backend:result.backend};
  } catch (error) {
    const msg=String(error.message);
    return {run:/Fault:0x/.test(msg)?"fault":/Timed out/.test(msg)?"timeout":"harness-error",
      quit:"-",end:"-",detail:msg.slice(0,400)};
  }
}

async function Site(game)
{//The shared catalog harness: the site's installer and launch in HEMU.
  const file=resolve(out,"hemu",(game.packageId || game.file)+".json");
  try {
    await run(process.execPath,["--max-old-space-size=3072",
      fileURLToPath(new URL("catalog.mjs",import.meta.url)),game.name],
      {timeout:300000,maxBuffer:65536,env:{...process.env,OUT:resolve(out,"hemu")}});
  } catch (error) {
    if (error.killed || error.signal)
      return {run:"timeout",quit:"-",end:"-",detail:"HEMU child stopped: "+(error.signal || "time")};
  }
  const report=JSON.parse(await readFile(file,"utf8"));
  return {run:report.run || "harness-error",quit:report.quit || "-",end:report.end || "-",
    engineSha256:report.engineSha256,
    detail:report.failure?report.failure.split("\n")[0]:undefined};
}

async function Chk(game)
{
  const files=await GameFiles(game),[real,site]=await Promise.all([Real(files),Site(game)]),
    same=real.run==site.run && real.quit==site.quit && real.end==site.end,
    res={name:game.name,filesSha256:files.sha256,real,site,same};
  await writeFile(resolve(out,(game.packageId || game.file)+".json"),JSON.stringify(res,null,2)+"\n");
  console.log(game.name+": V5.03 "+[real.run,real.quit,real.end].join(" ")+", HEMU "+
    [site.run,site.quit,site.end].join(" ")+(same?"":" DIFFERENT")+
    (real.detail?"; V5.03: "+real.detail.split("\n")[0]:"")+
    (site.detail?"; HEMU: "+site.detail:""));
  return res;
}

const results=new Array(games.length);
let next=0;
await Promise.all(Array.from({length:Math.min(jobs,games.length)},async function () {
  while (next<games.length) {
    const i=next++;
    results[i]=await Chk(games[i]);
  }
}));
if (write) {
  const backend=results.find(r=>r.real.backend)?.real.backend,
    engines=new Set(results.map(r=>r.site.engineSha256).filter(Boolean));
  assert(engines.size==1,"HEMU engines differ between runs.");
  const record={
    scope:"Each Games entry installed and launched as the site does, in original "+
      "TempleOS V5.03 under QEMU and in the site's HEMU: still running after 15 s "+
      "of guest time, then whether Esc or Shift-Esc ends it and how it ends. "+
      "Gameplay is not compared.",
    real:{templeos:manifest.templeos,diskSha256:manifest.rawDiskSha256,backend},
    site:{...await RuntimeInputs(),engineSha256:[...engines][0]},
    inputs:await StartInputs(),
    games:results.map(r=>({name:r.name,filesSha256:r.filesSha256,
      real:{run:r.real.run,quit:r.real.quit,end:r.real.end},
      site:{run:r.site.run,quit:r.site.quit,end:r.site.end},same:r.same}))
  };
  await writeFile(new URL("games/startup.json",root),JSON.stringify(record,null,2)+"\n");
}
const differ=results.filter(r=>!r.same).map(r=>r.name);
console.log(results.length-differ.length+" of "+results.length+
  " start and quit the same in V5.03 and HEMU"+(differ.length?"; different: "+differ.join(", "):"."));
