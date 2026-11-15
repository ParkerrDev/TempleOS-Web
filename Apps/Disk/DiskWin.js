import {WinAdd,WinRaise} from "../../Adam/WinMgr.js";
import {$,dbg,engine,os_disk,OsReady,
  OsSessionSave} from "../../Adam/Os.js";
import {BootFileSave} from "../../Adam/BootFile.js";
import {SnapshotInspect} from "../../hemu/Kernel/Snapshot.js";
import {StockIdentify,StockModuleCheck} from "../../hemu/Kernel/Stock.js";
import {makeDisk} from "../../hemu/Kernel/QCow2.js";

const CSS='    /* Disk & Save window */\n'+
  '    #diskWin { display:flex; flex-direction:column; width:min(560px,94vw); max-height:88vh; margin:0; padding:10px; }\n'+
  '    .disk-body { overflow:auto; }\n'+
  '    .disk-sec { border-top:2px solid var(--blue); padding:8px 2px; }\n'+
  '    .disk-sec:first-child { border-top:0; }\n'+
  '    .disk-sec h3 { color:var(--red); font-size:12px; font-weight:normal; margin-bottom:3px; }\n'+
  '    .disk-sec p { color:var(--blue); font-size:12px; line-height:1.0; margin-bottom:6px; }\n'+
  '    .disk-sec kbd { background:var(--blue); color:#fff; padding:0 4px; }\n'+
  '    #diskStatus { color:var(--red); font-size:12px; min-height:1.4em; padding:6px 2px 0; }\n';
const HTML='  <div id="diskOverlay" class="overlay" role="dialog" aria-modal="true" aria-label="Disk and Save">\n'+
  '    <div class="win" id="diskWin" data-title="Disk &amp; Save">\n'+
  '      <span class="close" id="diskClose" title="Close">[X]</span>\n'+
  '      <div class="disk-body">\n'+
  '        <div class="disk-sec">\n'+
  '          <h3>Save this session</h3>\n'+
  '          <p>C: saves automatically. Session checkpoints save when idle; use Save session before leaving. Clearing site data removes these saves; export a backup to keep a separate copy.</p>\n'+
  '          <p id="diskSaveStatus" role="status">Waiting for TempleOS…</p>\n'+
  '          <p>A <b>snapshot</b> saves the running machine, its C: disk and settings together. Import it to resume that session. A <b>disk image</b> saves the C: drive by itself.</p>\n'+
  '          <div class="action-bar">\n'+
  '            <button id="saveSession">Save session</button>\n'+
  '            <button id="dlSnap">↑ Export snapshot</button>\n'+
  '            <button id="dlDisk">↑ Export C: disk</button>\n'+
  '          </div>\n'+
  '        </div>\n'+
  '        <div class="disk-sec">\n'+
  '          <h3>Load / import</h3>\n'+
  '          <p>Boot from a snapshot you exported before, or mount a custom / previously-saved C: disk image (raw or qcow2, optionally gzipped). Importing reloads the page.</p>\n'+
  '          <div class="action-bar">\n'+
  '            <button id="ulSnap">↓ Import snapshot</button>\n'+
  '            <button id="ulDisk">↓ Import C: disk</button>\n'+
  '          </div>\n'+
  '        </div>\n'+
  '        <div id="diskStatus" role="status"></div>\n'+
  '      </div>\n'+
  '    </div>\n'+
  '  </div>\n';
WinAdd(CSS,HTML);

const ov=$("diskOverlay"),st=$("diskStatus"),
  actions=["saveSession","dlSnap","dlDisk"],
  imports=["ulSnap","ulDisk"];
let pending=null;

function Say(text)
{
  st.textContent=text;
  dbg("disk: "+text);
}

function Busy(kind=null)
{
  pending=kind;
  for (let id of actions)
    $(id).disabled=!!pending || !OsReady() ||
      (id=="dlSnap" || id=="dlDisk") && !engine.capture.ready;
  for (let id of imports)
    $(id).disabled=!!pending;
}

function Download(bytes,name,type="application/octet-stream")
{
  let a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([bytes],{type}));
  a.download=name;
  a.click();
  setTimeout(function () {URL.revokeObjectURL(a.href);},4000);
}

function PickFile(accept="")
{
  return new Promise(function (Resolve) {
    let input=document.createElement("input");
    input.type="file";
    input.accept=accept;
    input.onchange=function () {Resolve(input.files[0] || null);};
    input.oncancel=function () {Resolve(null);};
    input.click();
  });
}

async function DiskBytes(file)
{
  let bytes=new Uint8Array(await file.arrayBuffer());
  if (bytes[0]==0x1F && bytes[1]==0x8B)
    return new Response(new Blob([bytes]).stream().pipeThrough(
      new DecompressionStream("gzip"))).arrayBuffer();
  return bytes.buffer;
}

os_disk.msg=function (m)
{
  let stamp;
  if (m.cmd=="exportResult") {
    Busy();
    if (!m.ok) {
      Say("Export failed: "+m.msg);
      return;
    }
    stamp=new Date().toISOString().slice(0,16).replace(/[:T]/g,"-");
    if (m.kind=="snapshot") {
      Download(m.buf,"templeos-"+stamp+".hemu.gz","application/gzip");
      Say("Snapshot exported.");
    } else {
      Download(m.buf,"templeos-C-"+stamp+".img.gz","application/gzip");
      Say("C: disk exported.");
    }
  } else if (m.cmd=="captureState") {
    Busy(pending);
    if (!pending) Say(m.msg);
  } else if (m.cmd=="guestResult" &&
      ["failed","error"].includes(m.state) && m.op=="launch")
    Say("Launch failed: "+m.msg);
};

function Export(kind)
{
  if (!OsReady() || !engine.capture.ready || pending) return;
  Busy(kind);
  Say("Saving "+kind+"…");
  try {
    if (kind=="snapshot")
      engine.post({cmd:"exportSnapshot"});
    else
      engine.post({cmd:"exportDisk"});
  } catch (e) {
    Busy();
    Say("Export failed: "+e.message);
  }
}

async function Import(kind)
{
  if (pending) return;
  Busy("import");
  try {
    let accept=".gz,.hemu,application/gzip",file,bytes;
    if (kind=="disk") accept=".img,.raw,.qcow2,.gz";
    file=await PickFile(accept);
    if (!file) return;
    Say("Checking "+kind+"…");
    if (kind=="snapshot") {
      bytes=await file.arrayBuffer();
      if(!await SnapshotInspect(bytes,{busProtocol:1})) {
	const found=await StockIdentify(bytes),response=await fetch(found.capture.cores===4?"./hemu/build/hemu-smp.wasm":"./hemu/build/hemu.wasm",{cache:"no-cache"});
	if(!response.ok)throw Error("Could not read the matching stock engine");
	StockModuleCheck(await WebAssembly.compile(await response.arrayBuffer()),found.capture,found.manifest);
      }
    } else {
      bytes=await DiskBytes(file);
      await makeDisk(new Uint8Array(bytes));
    }
    Say("Storing "+kind+"…");
    await BootFileSave(kind,bytes);
    Say("Stored. Reloading…");
    location.reload();
  } catch (e) {
    Say("Import failed: "+e.message);
  } finally {
    Busy();
  }
}

$("saveSession").addEventListener("click",async function SessionSave() {
  if (!OsReady() || pending) return;
  Busy("session");
  Say("Saving session…");
  try {
    let result=await OsSessionSave();
    if (!result.ok) throw new Error(result.msg);
    Say("Session saved in this browser.");
  } catch (error) {
    Say("Session save failed: "+error.message);
  } finally {
    Busy();
  }
});
$("dlSnap").addEventListener("click",function () {Export("snapshot");});
$("dlDisk").addEventListener("click",function () {Export("disk");});
$("ulSnap").addEventListener("click",function () {Import("snapshot");});
$("ulDisk").addEventListener("click",function () {Import("disk");});
addEventListener("sessionsave",function (e) {
  $("diskSaveStatus").textContent=e.detail.msg;
});
addEventListener("osstate",function (e) {
  Busy(e.detail.ready?pending:null);
  if (!e.detail.ready) {
    Say(e.detail.msg);
  }
});

export function Open()
{
  navigator.storage?.persist?.().catch(function () {});
  ov.classList.add("open");
  WinRaise(ov);
  Busy(pending);
  if (!engine.capture.ready)
    Say(engine.capture.msg);
}

function Close()
{
  ov.classList.remove("open","free");
}
$("diskClose").addEventListener("click",Close);
ov.addEventListener("pointerdown",function (e) {
  if (e.target==ov) Close();
});

addEventListener("disksave",function (e) {
  $("diskSaveStatus").textContent=e.detail.msg;
});
if (os_disk.save) $("diskSaveStatus").textContent=os_disk.save.msg;
