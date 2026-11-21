import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {constants} from "node:fs";
import {copyFile,mkdir,open,readFile,rm,symlink,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {promisify} from "node:util";
import {gunzipSync} from "node:zlib";
import {ENTRIES} from "../../../Apps/Programs.js";
import {PLAYS} from "../../../Apps/Games/GamePlays.js";
import {fat32Upload,makeQcow2,makeRaw} from "../../../hemu/holyc-wasm/Apps/HEMU/Kernel/QCow2.js";
import {Hash,root} from "./Evidence.mjs";
import {GameFiles,I64Str,KvmInputs,StartOut,StartStage} from "./Install.mjs";
import {KEYS,PlayEvents,PlayRecord} from "./Play.mjs";
import {PlayCompare,PlayVerdict} from "./PlayCmp.mjs";

//Every Games entry and program (Apps/Programs.js) played in native HEMU: hemu/Linux/HEMU.CPP on KVM, from
//the four-core capture make_hemu installs. Start.HC plays it in the guest
//as Start.mjs has it play in V5.03 under QEMU, so only the machine differs.
//Usage: node Demo/Games/Test/Kvm.mjs [--write] [NAME...]
//Each run is HEMU -t DIR, built here, never the installed one. Hyprland starts
//it with a rule on the process that opens its window on workspace 9, and a
//rule on its app id, HEMUTEST, does the same as a backstop; its disk has
//the run's files in C:/Tmp; keys typed into DIR/keys.fifo close the Welcome
//card with Shift-Esc, answer the tour and include them; port 0xE9 carries Start.HC's output. --write puts the
//runs in Demo/Games/Play.json as each entry's kvm, which no runner is gated on,
//with inputsSha256, the hash of the record's kvm it was made with.

const write=process.argv.includes("--write"),
  names=process.argv.slice(2).filter(arg=>arg!="--write"),
  games=names.length?names.map(name=>{
    const game=ENTRIES.find(g=>g.name==name);
    assert(game,"Unknown entry: "+name);
    return game;
  }):ENTRIES,
  jobs=Number(process.env.JOBS || 3),
  out=resolve(process.env.OUT || fileURLToPath(new URL("tmp/games/kvm/",root))),
  hemu=new URL("hemu/",root),
  run=promisify(execFile),
  Sleep=ms=>new Promise(done=>setTimeout(done,ms)),
  capture=await readFile(new URL("holyc-wasm/tests/oracle/QemuCapture.HC",hemu)),
  playFile=new URL("Demo/Games/Play.json",root),
  STAGE="C:/Tmp/",TIMEOUT=420000,
  RULE='hl.window_rule({ name = "hemutest", match = { class = "^HEMUTEST$" }, '+
    'workspace = "9 silent" })',
  //Characters the typed lines use: a key of Play.mjs's KEYS, + for Shift.
  TYPE={" ":"space","\n":"enter","-":"minus","=":"equal","'":"quote",";":"semicolon",
    ".":"dot","/":"slash","*":"+8","(":"+9",")":"+0",">":"+dot","_":"+minus",
    '"':"+quote",":":"+semicolon","#":"+3","\x1B":"+esc"},
  //The capture's disk cache and FAT block predate the files this run put on
  //the disk, so the guest drops them before it reads one.
  FRESH="CDrv *dv=Let2Drv('C');DskCacheInvalidate(dv);"+
    "dv->fat_blk_dirty=0;dv->cur_fat_blk_num=-1;\n";
assert(Number.isInteger(jobs) && jobs>=1 && jobs<=6,"JOBS must be 1 to 6.");

const procs=new Set(); //The pids of the test HEMUs running, killed if this is.
for (const sig of ["SIGINT","SIGTERM","SIGHUP"])
  process.on(sig,function () {
    procs.forEach(Kill);
    process.exit(1);
  });

function Kill(pid)
{
  try {
    process.kill(pid,"SIGKILL");
  } catch {}
}

async function Base()
{//HEMU and the capture as make_hemu makes them, in OUT/base.
  const dir=resolve(out,"base"),src=name=>fileURLToPath(new URL(name,hemu));
  await mkdir(dir,{recursive:true});
  await run("cc",["-O2",src("Linux/HEMU.CPP"),"-o",resolve(dir,"HEMU"),"-lasound"]);
  await run("python3",[src("Misc/Ram.py"),src("live-smp.bin.gz"),resolve(dir,"RAM.BIN")]);
  await copyFile(src("capture-smp.txt"),resolve(dir,"Regs.TXT"));
  //The disk: the qcow2 laid flat, then the sectors the capture had changed,
  //each a 32 bit block number and its 512 bytes.
  const q=await makeQcow2(gunzipSync(await readFile(new URL("templeos-hd.qcow2.gz",hemu)))),
    flat=new Uint8Array(q.virtualSize),changed=await readFile(new URL("stock-smp.disk",hemu));
  q.readInto(0,q.virtualSize/512,flat,0);
  for (let i=0;i<changed.length;i+=516)
    flat.set(changed.subarray(i+4,i+516),changed.readUInt32LE(i)*512);
  await writeFile(resolve(dir,"Disk.BIN"),flat);
  return {dir,flat};
}

async function DiskMake(base,dir,staged)
{//The base disk with the run's files in C:/Tmp. The copy shares its blocks.
  const disk=await makeRaw(base.flat),file=resolve(dir,"Disk.BIN");
  for (const f of staged)
    fat32Upload(disk,f.name,f.bytes,STAGE.slice(3,-1));
  await copyFile(resolve(base.dir,"Disk.BIN"),file,constants.COPYFILE_FICLONE);
  const fd=await open(file,"r+");
  try {
    for (const [lba,bytes] of disk.overlay)
      await fd.write(bytes,0,512,lba*512);
  } finally {
    await fd.close();
  }
}

async function Type(keys,text)
{//Text typed on HEMU's keyboard at QEMU's sendkey pace. A character's downs
//and ups go in one write: a key held while this process is busy with another
//run would repeat.
  for (const ch of text) {
    let key=TYPE[ch] || ch.toLowerCase();
    const shift=key[0]=="+" || ch!=ch.toLowerCase();
    key=KEYS[key.replace(/^\+/,"")];
    assert(key,"No key types "+JSON.stringify(ch));
    const lines=[shift && "42 1",key[0]+" 1",key[0]+" 0",shift && "42 0"].filter(Boolean);
    await keys.write(lines.join("\n")+"\n");
    await Sleep(30*lines.length);
  }
}

async function Stray(pid)
{//Test windows anywhere but workspace 9, of all or of the HEMU pid. Its own is
//checked, so one that strays fails its run, not the others.
  const {stdout}=await run("hyprctl",["clients","-j"]);
  return JSON.parse(stdout).filter(c=>c.class=="HEMUTEST" && (!pid || c.pid==pid) &&
    c.workspace.name!="9").map(c=>({pid:c.pid,at:c.at,workspace:c.workspace.name}));
}

async function Shown(pid)
{//When the HEMU pid's window is up, in 20 s.
  for (let t0=Date.now();Date.now()-t0<20000;await Sleep(200)) {
    const {stdout}=await run("hyprctl",["clients","-j"]);
    if (JSON.parse(stdout).some(c=>c.pid==pid))
      return;
  }
  throw Error("No window in 20 s");
}

async function Launch(base,dir)
{//HEMU -t DIR, started by Hyprland with the rule on the process, so its window
//opens on workspace 9 wherever the pointer and focus are. DIR gets its pid,
//its stdout (port 0xE9), its stderr and its exit code.
  const at=name=>resolve(dir,name),read=name=>readFile(at(name),"latin1").catch(()=>null),
    sh="cd '"+dir+"' && { '"+resolve(base.dir,"HEMU")+"' -t '"+dir+"' >E9.TXT 2>Err.TXT & "+
      "echo $! >Pid.TMP && mv Pid.TMP Pid.TXT; wait $!; echo $? >Exit.TMP && mv Exit.TMP Exit.TXT; }";
  await run("hyprctl",["eval",RULE]);
  await run("hyprctl",["eval","hl.exec_cmd("+JSON.stringify(sh)+',{ workspace = "9 silent" })']);
  let pid=null;
  for (let t0=Date.now();!(pid=Number(await read("Pid.TXT"))) && Date.now()-t0<10000;)
    await Sleep(100);
  assert(pid,"Hyprland did not start HEMU in 10 s");
  procs.add(pid);
  async function State()
  {
    const exit=await read("Exit.TXT");
    return {text:await read("E9.TXT") || "",errors:(await read("Err.TXT") || "").slice(-2000),
      code:exit===null?null:Number(exit)};
  }
  async function End()
  {//Killed, and gone.
    Kill(pid);
    for (let t0=Date.now();(await read("Exit.TXT"))===null && Date.now()-t0<10000;)
      await Sleep(100);
    procs.delete(pid);
  }
  return {pid,State,End};
}

async function Kvm(base,files,events,frames,name)
{//One run in HEMU -t: Start.HC's result, or why there is none.
  const dir=resolve(out,"run",frames.split("/").at(-1)+"-"+name),
    {staged,fixture}=StartStage(files,events,STAGE);
  staged.push({name:"CAPTURE.HC",bytes:capture},{name:"F0000.HC",bytes:fixture},
    {name:"W0000.HC",bytes:Buffer.from('#define ORACLE_NUM 0\n#define ORACLE_FILE "'+STAGE+
      'F0000.HC"\n#include "'+STAGE+'CAPTURE.HC"\n')},
    {name:"RUN.HC",bytes:Buffer.from('PopUp("#include \\"'+STAGE+'W0000.HC\\";",Fs);\n'+
      "OutU8(0xE9,4);\n")}); //As Qemu.mjs runs a fixture.
  await rm(dir,{recursive:true,force:true});
  await mkdir(dir,{recursive:true});
  await DiskMake(base,dir,staged);
  for (const f of ["RAM.BIN","Regs.TXT"])
    await symlink(resolve(base.dir,f),resolve(dir,f));
  await run("mkfifo",[resolve(dir,"keys.fifo")]);
  const hemu=await Launch(base,dir),keys=await open(resolve(dir,"keys.fifo"),"r+");
  let text="",errors="",code=null;
  try {
    await Shown(hemu.pid);
    await Sleep(1000);
    const stray=await Stray(hemu.pid);
    assert(!stray.length,"Its window is off workspace 9: "+JSON.stringify(stray));
    await Type(keys,"\x1B");
    await Sleep(1000);
    await Type(keys,"n");
    await Sleep(1000);
    await Type(keys,FRESH);
    await Sleep(500);
    await Type(keys,'#include "'+STAGE+'RUN.HC";\n');
    for (let t0=Date.now();!text.includes("\x04") && code===null && Date.now()-t0<TIMEOUT &&
        (text || Date.now()-t0<20000);) {//The fixture starts in 20 s or not at all.
      await Sleep(200);
      ({text,errors,code}=await hemu.State());
    }
    if (!text.includes("\x04")) {
      if (code===null) {//What the screen showed, to look at.
        await rm(resolve(dir,"frame.ppm"),{force:true});
        await keys.write("F\n");
        await Sleep(1000);
        await mkdir(frames,{recursive:true});
        await copyFile(resolve(dir,"frame.ppm"),resolve(frames,name+"-end.ppm")).catch(()=>{});
      }
      return {start:code==2?"reset":code===null?"timeout":"harness-error",quit:"-",end:"-",
        detail:(code===null?(text?"No end in "+TIMEOUT/1000+" s":"No start in 20 s"):"HEMU exited "+code+": "+errors)+
          "; 0xE9: "+JSON.stringify(text.slice(-300))};
    }
    const left=await Stray(hemu.pid);
    assert(!left.length,"Its window left workspace 9: "+JSON.stringify(left));
    const first=text.indexOf("\x1E0:B\x1F"),last=/\x1E0:E:([0-9A-F]+)\x1F/.exec(text.slice(first));
    assert(first>=0 && last,"Start.HC's output is not whole: "+JSON.stringify(text.slice(-300)));
    if (I64Str(last[1]))
      return {start:"harness-error",quit:"-",end:"-",detail:"Fixture threw "+I64Str(last[1])};
    return await StartOut(text.slice(first+5,first+last.index),events,frames,name);
  } catch (error) {
    return {start:"harness-error",quit:"-",end:"-",detail:String(error.message).slice(0,400)};
  } finally {
    await hemu.End();
    await keys.close();
    await rm(dir,{recursive:true,force:true});
  }
}

const base=await Base(),
  old=JSON.parse(await readFile(playFile,"utf8").catch(()=>"null")),
  queue=games.flatMap(game=>["control","play"].map(kind=>({game,kind}))),
  runs=new Map();
let next=0;
await Promise.all(Array.from({length:Math.min(jobs,queue.length)},async function () {
  while (next<queue.length) {
    const {game,kind}=queue[next++],id=game.packageId || game.file,
      files=await GameFiles(game),
      r=await Kvm(base,files,PlayEvents(game.name,kind),resolve(out,id),"kvm-"+kind);
    if (!runs.has(game.name))
      runs.set(game.name,{filesSha256:files.sha256});
    runs.get(game.name)[kind]=PlayRecord(r,kind);
    const k=runs.get(game.name);
    if (k.control && k.play) {
      const g=old?.games.find(g=>g.name==game.name),
        v=PlayCompare({...g,kvm:k}),kv=PlayVerdict(k.play,k.control),
        words=r=>[r.start,r.quit,r.end].join(" ");
      console.log(game.name+": kvm "+words(k.control)+" / play "+words(k.play)+" "+kv.response+
        (kv.plays?", plays":kv.runs?", runs":", does not play")+
        (g?(v.kvmMatch?", as V5.03":", NOT as V5.03 ("+words(g.real.play)+")")+
          (v.kvmSame?", frames agree":""):"")+
        [k.control,k.play].map(r=>r.detail?"; "+r.detail:"").join(""));
    }
  }
}));
assert(!(await Stray()).length,"A test window is off workspace 9.");
const {stdout:left}=await run("hyprctl",["clients","-j"]);
assert(!JSON.parse(left).some(c=>c.class=="HEMUTEST"),"A test HEMU is still open.");
if (write) {//Read again: Start.mjs may have written the machines' part meanwhile.
  const record=JSON.parse(await readFile(playFile,"utf8").catch(()=>"null")),
    kvm=await KvmInputs(),was=record?.kvm && Hash(JSON.stringify(record.kvm));
  assert(record,"Demo/Games/Play.json is made by Start.mjs --write first.");
  record.kvm=kvm;
  for (const g of record.games) {
    if (runs.has(g.name))
      g.kvm={...runs.get(g.name),inputsSha256:Hash(JSON.stringify(kvm))};
    else if (g.kvm && !g.kvm.inputsSha256)
      g.kvm.inputsSha256=was;
    g.verdict=PlayCompare(g);
  }
  await writeFile(playFile,JSON.stringify(record,null,1)+"\n");
}
const verdicts=games.map(game=>PlayCompare({...old?.games.find(g=>g.name==game.name),
    kvm:runs.get(game.name)})),
  differ=games.filter((game,i)=>!verdicts[i].kvmMatch).map(game=>game.name),
  ran=games.filter(game=>{
    const k=runs.get(game.name),v=PlayVerdict(k.play,k.control);
    return v.plays || v.runs;
  });
console.log(ran.length+" of "+games.length+" play or run in native HEMU; "+
  (games.length-differ.length)+" as in V5.03"+(differ.length?"; not: "+differ.join(", "):"."));
