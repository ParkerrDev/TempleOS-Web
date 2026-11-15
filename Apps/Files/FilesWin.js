import {WinAdd,WinRaise,WinFind as $} from "../../Adam/WinMgr.js";
import {OsReady,OsDirList,OsFileRead,OsFileWrite} from "../../Adam/Os.js";
import {Icon} from "../../Adam/Icons.js";

WinAdd(`
  #filesWin { display:flex; flex-direction:column; gap:8px; width:min(820px,94vw); height:min(620px,82vh); padding:10px; margin:0; }
  #filesWin input { font:inherit; min-width:0; height:var(--ctlh); padding:3px 6px; border:2px solid var(--blue); background:#fff; color:#000; }
  #filesPath { flex:1; }
  #filesFilter { width:100%; }
  .files-body { display:flex; flex:1; min-height:0; border:2px solid var(--blue); }
  .files-places { display:flex; flex-direction:column; gap:6px; width:140px; flex:none; padding:8px; border-right:2px solid var(--blue); }
  .files-places h3 { color:var(--blue); font:inherit; margin:0 0 6px; }
  .files-places button { display:flex; align-items:center; gap:6px; }
  .files-places button[aria-current] { background:var(--blue); color:#fff; }
  .files-main { display:flex; flex:1; min-width:0; flex-direction:column; background:#fff; }
  .files-columns,.files-entry { display:grid; grid-template-columns:minmax(0,1fr) 90px 80px; gap:8px; align-items:center; }
  .files-columns { padding:7px; background:var(--blue); color:#fff; }
  .files-columns span:last-child,.files-size { text-align:right; }
  #filesList { flex:1; min-height:0; overflow:auto; margin:0; padding:4px; list-style:none; }
  #filesWin .files-entry { width:100%; padding:6px 3px; border:0; outline:0; text-align:left; }
  .files-entry[aria-selected="true"] { background:var(--blue); color:#fff; }
  .files-entry:focus-visible { box-shadow:inset 0 0 0 2px var(--yellow); }
  .files-name { display:flex; align-items:center; gap:8px; min-width:0; }
  .files-name span { overflow:hidden; text-overflow:ellipsis; }
  .files-type,.files-size { font-size:11px; }
  #filesEmpty { margin:auto; padding:20px; text-align:center; color:var(--blue); }
  #filesEmpty[hidden] { display:none; }
  .files-hint { padding:7px; color:var(--blue); border-top:1px solid var(--blue); font-size:11px; }
  #filesDrop.dropping { outline:3px dashed var(--blue); outline-offset:-5px; background:var(--yellow); }
  #filesStatus { min-height:1.3em; color:var(--blue); overflow-wrap:anywhere; }
  @media (max-width:600px) {
    #filesWin { padding:6px; }
    .files-places { width:90px; padding:6px; }
    .files-places .action-icon { display:none; }
    .files-columns,.files-entry { grid-template-columns:minmax(0,1fr) 65px; }
    .files-type { display:none; }
  }
`, `<div id="filesOverlay" class="overlay" role="dialog" aria-modal="true" aria-label="Files">
  <div class="win" id="filesWin" data-title="Files">
    <span class="close" id="filesClose" title="Close">[X]</span>
    <form id="filesLocation" class="action-bar">
      <button id="filesBack" type="button" class="icon-button" title="Back" aria-label="Back">${Icon("back")}</button>
      <button id="filesForward" type="button" class="icon-button" title="Forward" aria-label="Forward">${Icon("forward")}</button>
      <button id="filesUp" type="button" class="icon-button" title="Parent folder" aria-label="Parent folder">${Icon("up")}</button>
      <input id="filesPath" aria-label="Folder path" value="C:/" spellcheck="false" autocomplete="off">
      <button id="filesRefresh" type="button" class="icon-button" title="Refresh folder" aria-label="Refresh folder">${Icon("refresh")}</button>
    </form>
    <div class="action-grid">
      <button id="filesNew" type="button" title="New HolyC program" aria-label="New program">${Icon("file")} New</button>
      <button id="filesImport" type="button">${Icon("upload")} Import</button>
      <button id="filesOpen" type="button">${Icon("edit")} <span>Edit</span></button>
      <button id="filesDownload" type="button">${Icon("download")} Download</button>
    </div>
    <input id="filesFilter" type="search" placeholder="Filter files" aria-label="Filter files">
    <div class="files-body">
      <nav class="files-places" aria-label="Places"><h3>Places</h3>
        <button data-path="C:/" title="TempleOS C: drive">${Icon("folder")} C:</button>
        <button data-path="C:/Home/">${Icon("folder")} Home</button>
        <button data-path="C:/Demo/">${Icon("folder")} Demos</button>
        <button data-path="C:/Apps/">${Icon("folder")} Apps</button>
      </nav>
      <section class="files-main" id="filesDrop" aria-label="Folder contents">
        <div class="files-columns" aria-hidden="true"><span>Name</span><span class="files-type">Kind</span><span>Size</span></div>
        <ul id="filesList" role="listbox" aria-label="Files and folders"></ul>
        <p id="filesEmpty">Waiting for TempleOS…</p>
        <p class="files-hint">Drop files here to import. Double-click to open.</p>
      </section>
    </div>
    <div id="filesStatus" role="status"></div>
  </div>
</div>`);

const overlay=$("filesOverlay"),list=$("filesList");
let directory="C:/",entries=[],selected=null,pending=false,revision=0,
  history=[directory],position=0;
try {directory=Path(sessionStorage.getItem("templeos.files") || directory);}
catch {}
history=[directory];

function Path(text)
{
  const parts=[];
  if (!/^C:\//i.test(text)) throw new Error("Use a folder on C:, such as C:/Home/.");
  for (const part of text.slice(3).split("/")) {
    if (!part || part==".") continue;
    if (part=="..") parts.pop();
    else {NameCheck(part);parts.push(part);}
  }
  return "C:/"+(parts.length?parts.join("/")+"/":"");
}

function NameCheck(name)
{
  if (!name || name.length>37 || name=="." || name==".." || /[\x00-\x1F/\\:\u0100-\uFFFF]/.test(name))
    throw new Error("Use names of at most 37 TempleOS characters, without slashes or a colon.");
}

function Editable(file)
{
  return file && !file.dir && (/\.(HC|HH|IN|DD|TXT|MD|CPP|H|PRJ)$/i.test(file.name) || !file.name.includes("."));
}

function Size(bytes)
{
  return bytes<1024?bytes+" B":bytes<1048576?(bytes/1024).toFixed(1)+" KB":(bytes/1048576).toFixed(1)+" MB";
}

function Controls()
{
  const off=pending || !OsReady();
  for (const button of $("filesWin").querySelectorAll("button")) button.disabled=off;
  $("filesNew").disabled=pending;
  $("filesPath").disabled=off;
  $("filesBack").disabled=off || position==0;
  $("filesForward").disabled=off || position==history.length-1;
  $("filesUp").disabled=off || directory=="C:/";
  $("filesDownload").disabled=off || !selected || selected.dir;
  $("filesOpen").disabled=off || !selected || !(selected.dir || Editable(selected));
  $("filesOpen").innerHTML=Icon(selected?.dir?"folder":"edit")+" <span>"+(selected?.dir?"Open":"Edit")+"</span>";
}

function Say(text) {$("filesStatus").textContent=text;}

async function Work(message,run)
{
  if (pending || !OsReady()) return;
  pending=true;Controls();Say(message);
  try {await run();}
  catch (error) {Say(error.message);}
  finally {pending=false;Controls();}
}

function Select(file)
{
  selected=file;
  for (const button of list.querySelectorAll("button")) {
    const on=button.dataset.name==file?.name;
    button.setAttribute("aria-selected",String(on));
    button.tabIndex=on?0:-1;
  }
  if (!file && list.firstElementChild) list.firstElementChild.firstElementChild.tabIndex=0;
  Say(file?file.name+(file.dir?" · Folder":" · "+Size(file.size)):entries.length+" items");
  Controls();
}

function Render()
{
  const query=$("filesFilter").value.toLowerCase(),shown=entries.filter(file=>file.name.toLowerCase().includes(query));
  list.replaceChildren();
  if (!shown.includes(selected)) selected=null;
  for (const file of shown) {
    const li=document.createElement("li"),button=document.createElement("button"),name=document.createElement("span");
    li.setAttribute("role","presentation");
    button.className="files-entry";button.dataset.name=file.name;button.setAttribute("role","option");
    button.innerHTML='<span class="files-name">'+Icon(file.dir?"folder":"file")+'</span><span class="files-type"></span><span class="files-size"></span>';
    name.textContent=file.name;button.firstElementChild.append(name);
    button.children[1].textContent=file.dir?"Folder":Editable(file)?"Document":"File";
    button.children[2].textContent=file.dir?"":Size(file.size);
    button.addEventListener("click",()=>Select(file));
    button.addEventListener("dblclick",()=>Activate(file));
    li.append(button);list.append(li);
  }
  $("filesEmpty").hidden=shown.length>0;
  $("filesEmpty").textContent=query?"No matching files.":"This folder is empty.";
  Select(selected);
}

async function ReadDirectory(path)
{
  const version=revision,result=await OsDirList(path);
  if (version!=revision) throw new Error("TempleOS restarted. Refresh the folder.");
  if (!result.ok) throw new Error(result.msg);
  if (directory!=path) $("filesFilter").value="";
  directory=path;
  entries=result.files.filter(file=>file.name!="." && file.name!="..").sort((a,b)=>Number(b.dir)-Number(a.dir) || a.name.localeCompare(b.name));
  $("filesPath").value=path;
  for (const button of $("filesWin").querySelectorAll("[data-path]")) {
    if (button.dataset.path==path) button.setAttribute("aria-current","location");
    else button.removeAttribute("aria-current");
  }
  try {sessionStorage.setItem("templeos.files",path);} catch {}
  Render();
}

function Navigate(path,step=0)
{
  return Work("Reading folder…",async function () {
    path=Path(path);
    await ReadDirectory(path);
    if (step) position+=step;
    else if (history[position]!=path) {history=history.slice(0,position+1);history.push(path);position++;}
  });
}

function Activate(file=selected)
{
  if (!file) return;
  if (file.dir) return Navigate(directory+file.name+"/");
  if (!Editable(file)) return Download(file);
  return Work("Opening "+file.name+"…",async function () {
    const path=directory+file.name,result=await OsFileRead(path);
    if (!result.ok) throw new Error(result.msg);
    const {EdFileOpen}=await import("../Editor/EditorWin.js");
    await EdFileOpen(result.bytes,path);
    Say("Opened "+file.name+" in HolyC Editor.");
  });
}

function Download(file=selected)
{
  if (!file || file.dir) return;
  return Work("Reading "+file.name+"…",async function () {
    const result=await OsFileRead(directory+file.name);
    if (!result.ok) throw new Error(result.msg);
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([result.bytes]));a.download=file.name;a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),4000);
    Say("Downloaded "+file.name+".");
  });
}

function Upload(files)
{
  return Work("Choose files to import…",async function () {
    if (!files) files=await new Promise(function (resolve) {
      const input=document.createElement("input");input.type="file";input.multiple=true;
      input.onchange=()=>resolve(Array.from(input.files));input.oncancel=()=>resolve([]);input.click();
    });
    let count=0;
    for (const file of files) {
      NameCheck(file.name);
      if (entries.some(entry=>entry.name==file.name) && !confirm("Replace "+file.name+" in "+directory+"?")) continue;
      Say("Importing "+file.name+"…");
      const result=await OsFileWrite(directory+file.name,await file.arrayBuffer());
      if (!result.ok) throw new Error(result.msg);
      count++;
    }
    if (count) {await ReadDirectory(directory);Say("Imported "+count+" file"+(count==1?"":"s")+" into "+directory);}
    else Say("No files imported.");
  });
}

$("filesLocation").addEventListener("submit",e=>{e.preventDefault();Navigate($("filesPath").value);});
$("filesBack").addEventListener("click",()=>Navigate(history[position-1],-1));
$("filesForward").addEventListener("click",()=>Navigate(history[position+1],1));
$("filesUp").addEventListener("click",()=>Navigate(directory+"../"));
$("filesRefresh").addEventListener("click",()=>Navigate(directory));
$("filesImport").addEventListener("click",()=>Upload());
$("filesDownload").addEventListener("click",()=>Download());
$("filesOpen").addEventListener("click",()=>Activate());
$("filesFilter").addEventListener("input",Render);
$("filesNew").addEventListener("click",async function () {
  try {await (await import("../Editor/EditorWin.js")).EdNew(directory);}
  catch (error) {Say(error.message);}
});
for (const button of $("filesWin").querySelectorAll("[data-path]"))
  button.addEventListener("click",()=>Navigate(button.dataset.path));
list.addEventListener("keydown",function (e) {
  if (e.key=="Enter") {e.preventDefault();Activate(entries.find(file=>file.name==e.target.dataset.name) || selected);}
  if (!["ArrowUp","ArrowDown","Home","End"].includes(e.key)) return;
  e.preventDefault();
  const buttons=[...list.querySelectorAll("button")],i=buttons.indexOf(e.target),
    next=e.key=="Home"?0:e.key=="End"?buttons.length-1:Math.max(0,Math.min(buttons.length-1,i+(e.key=="ArrowDown"?1:-1)));
  buttons[next]?.click();buttons[next]?.focus();
});
$("filesDrop").addEventListener("dragover",function (e) {
  if (e.dataTransfer.types.includes("Files")) {e.preventDefault();e.dataTransfer.dropEffect="copy";this.classList.add("dropping");}
});
$("filesDrop").addEventListener("dragleave",function (e) {
  if (!this.contains(e.relatedTarget)) this.classList.remove("dropping");
});
$("filesDrop").addEventListener("drop",function (e) {
  e.preventDefault();this.classList.remove("dropping");Upload(Array.from(e.dataTransfer.files));
});
addEventListener("osstate",function (e) {
  if (!e.detail.ready) {revision++;entries=[];selected=null;Render();$("filesEmpty").textContent=e.detail.msg || "Waiting for TempleOS…";Say("Waiting for TempleOS…");}
  else if (overlay.classList.contains("open")) Navigate(directory);
  Controls();
});
addEventListener("osfilewrite",function (e) {
  if (overlay.classList.contains("open") && e.detail.path.startsWith(directory)) Navigate(directory);
});
function Close() {overlay.classList.remove("open","free");}
$("filesClose").addEventListener("click",Close);
overlay.addEventListener("pointerdown",e=>{if (e.target==overlay) Close();});

export function Open(path=directory)
{
  overlay.classList.add("open");WinRaise(overlay);Controls();
  if (OsReady()) return Navigate(path);
  try {directory=Path(path);} catch (error) {Say(error.message);return;}
  $("filesPath").value=directory;
  Say("Waiting for TempleOS…");
}
