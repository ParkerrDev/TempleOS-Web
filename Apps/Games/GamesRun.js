import {gameProject} from './GameSrc.js';



import {WinRaise,WinTitle} from '../../Adam/WinMgr.js';
import {HelpGame} from '../Help/HelpWin.js';
import {os_game,OsCaptureSet,OsFileWrite,OsGen,OsHold,OsInputRelease,OsInputReset,OsLaunch} from '../../Adam/Os.js';
import {EdLoad,ed_game,ed_view} from '../Editor/EditorWin.js';

import {Close as closeGames,QuitNote} from "./GamesWin.js";
let packageLaunchBusy=false;
const ovE=document.getElementById("editorOverlay");
async function gameSrc(g) {
  const project=await gameProject(g);
  return (await project.open(project.entry)).text;
}
let curGame = null;
const setStatus = (s) => {
  document.getElementById("status").textContent=s;
};
let editorGame=null,editorProject=null,editorPath=null,editorLoading=false,editorToken=0,editorRequest=0;
const editor=document.getElementById('editor'),fileSelect=document.getElementById('gameFile'),draft=document.getElementById('gameDraft');
editor.addEventListener('input',()=>{
  if(!editorProject||editorLoading)return;
  const saved=editorProject.change(editorPath,editor.value);
  draft.textContent=saved?'Edits saved on this device.':'Edits kept for this session; browser storage is full or unavailable. Download a copy to keep them.';
});
async function selectSource(path){
  const token=++editorToken,project=editorProject;
  editorLoading=true;editor.disabled=true;fileSelect.disabled=true;
  try{
    const doc=await project.open(path);
    if(token!==editorToken)return;
    editorPath=path;fileSelect.value=path;editor.value=doc.text;editor.dispatchEvent(new Event('input'));
    draft.textContent='Edits apply to both runners.'+(doc.hasSprites?' Embedded sprites are preserved.':'');
  }finally{if(token===editorToken){editorLoading=false;editor.disabled=false;fileSelect.disabled=false;}}
}
fileSelect.addEventListener('change',()=>selectSource(fileSelect.value).catch(e=>setStatus(e.message)));
document.getElementById('gameRestore').addEventListener('click',async()=>{
  try{await editorProject.reset(editorPath);await selectSource(editorPath);draft.textContent='Original source restored.';}
  catch(e){setStatus(e.message);}
});
ed_game.leave=()=>{ed_game.stop?.();++editorToken;editorGame=editorProject=editorPath=null;editorLoading=false;editor.disabled=false;ed_game.file=null;ovE.classList.remove('gameproject');document.getElementById('editorRuntimeInfo').textContent='Click the screen for keyboard, mouse and sound. Direct HolyC to WebAssembly.';};
async function editGame(g){
  const request=++editorRequest;
  closeGameWin();closeGames();OsInputRelease();
  ovE.classList.add('open');WinRaise(ovE);setStatus('Loading '+g.name+' source...');
  try{
    await EdLoad();
    if(request!==editorRequest||!ovE.classList.contains('open'))return;
    os_game.ed.stop();
    const project=await gameProject(g);
    if(request!==editorRequest||!ovE.classList.contains('open'))return;
    ed_game.leave();editorGame=g;editorProject=project;
    fileSelect.replaceChildren(...project.sources.map(file=>{
      const option=document.createElement('option');option.value=file.path;
      option.textContent=file.path.replace(/^C:\/Home\//,'');return option;
    }));
    document.getElementById('gameTitle').textContent=g.name;
    document.getElementById('gameRun').title='Run the latest edits in the preview. Run again to restart with new edits.';
    ovE.classList.add('gameproject');
    document.getElementById('editorRuntimeInfo').textContent='Edit, Run and play here. Capture mouse above the preview; Esc returns to hybrid mode. Run again to apply edits.';
    document.getElementById('gamePreviewStatus').textContent='Ready. Preview compiles with HolyC-WASM.';
    const screen=document.getElementById('screen');screen.getContext('2d').clearRect(0,0,screen.width,screen.height);
    document.getElementById('console').textContent='';
    ed_game.file={filename:()=>(editorPath||project.entry).split('/').pop(),bytes:()=>project.bytes(editorPath||project.entry)};
    await selectSource(project.entry);setStatus(g.name+' source');
  }catch(e){setStatus('Could not open source: '+e.message);}
}
ed_game.cancel=()=>{++editorRequest;++editorToken;editorLoading=false;editor.disabled=false;fileSelect.disabled=false;};
document.getElementById('gameRun').addEventListener('click',()=>{if(editorGame&&!editorLoading)runInBrowser(editorGame,{inEditor:true});});
document.getElementById('gameStop').addEventListener('click',()=>{closeGameWin();document.getElementById('gamePreviewStatus').textContent='Stopped. Edit the source and Run to try again.';});
document.getElementById('gameToDisk').addEventListener('click',()=>{if(editorGame)runInTempleOS(editorGame);});
document.getElementById('gameWinEdit').addEventListener('click',()=>{if(curGame)editGame(curGame);});


let releaseDesktop=null,nativeStatus=null,launchToken=0,runnerTarget=null;
const runnerStatus=()=>document.getElementById(runnerTarget==='editor'?'gamePreviewStatus':'gameWinStatus');
const previewCapture=[document.getElementById('gameCapture'),document.getElementById('gameWinCapture')];
const previewMouse=()=>os_game.ed;
function updatePreviewMouse(){
  const mouse=previewMouse(),captured=!!mouse?.isMouseCaptured();
  for(const button of previewCapture){
    button.disabled=!mouse?.isRunning();
    button.setAttribute('aria-pressed',String(captured));
    button.querySelector('span').textContent=captured?'Release mouse':'Capture mouse';
  }
}
function togglePreviewMouse(){
  const mouse=previewMouse();
  if(!mouse?.isRunning())return;
  if(mouse.isMouseCaptured())mouse.releaseMouse();else mouse.captureMouse();
}
for(const button of previewCapture)button.addEventListener('click',togglePreviewMouse);
addEventListener('game-mouse-change',updatePreviewMouse);
os_game.mouse={
  toggle:()=>{
    if(!runnerTarget&&!ovE.classList.contains('open'))return false;
    togglePreviewMouse();return true;
  },
  isMouseCaptured:()=>!!previewMouse()?.isMouseCaptured(),
};
async function runInBrowser(g,{inEditor=false}={}) {
  ed_game.cancel();
  const view=document.getElementById(inEditor?'editorWin':'gameWin');
  closeGameWin({keepFullscreen:ed_view.isWithin(view)});const token=launchToken;curGame=g;closeGames();
  HelpGame(g);
  runnerTarget=inEditor?'editor':'window';
  if(!inEditor)ovE.classList.remove('open','free');
  OsInputRelease();
  releaseDesktop=OsHold();
  const overlay=document.getElementById('gameWinOverlay'),win=document.getElementById('gameWin');
  const slot=inEditor?document.querySelector('#editorWin .ed-screenwrap'):document.getElementById('gameWinSlot'),status=runnerStatus();
  if(inEditor){
    document.getElementById('gameStop').disabled=false;
    document.getElementById('gameRun').textContent='↻ Run again';
  }else{
    WinTitle(win,g.name);
    overlay.classList.add('open');WinRaise(overlay);
  }
  status.textContent='Compiling with HolyC-WASM...';
  try{
    const project=await (await gameProject(g)).native();
    await EdLoad();
    if(token!==launchToken)return;
    if(!inEditor)ed_game.leave();
    const screen=document.getElementById('screen');slot.append(screen);
    if(!inEditor)win.append(document.getElementById('console'));
    const sourceStatus=document.getElementById('status');
    nativeStatus=new MutationObserver(()=>{status.textContent='HolyC-WASM: '+sourceStatus.textContent;});
    nativeStatus.observe(sourceStatus,{childList:true,characterData:true,subtree:true});
    const {source,...options}=project;
    await os_game.ed.runIn(screen,source,{...options,preserveEditor:inEditor});
    document.getElementById('screen').focus();
  }catch(e){if(token!==launchToken)return;status.textContent='HolyC-WASM could not run this game: '+e.message;releaseDesktop?.();releaseDesktop=null;}
}

function closeGameWin({keepFullscreen=false}={}) {
  HelpGame(null);
  ++launchToken;
  if(!keepFullscreen){
    ed_view.exitWithin(document.getElementById('gameWin'));
    ed_view.exitWithin(document.getElementById('editorWin'));
  }
  if(previewMouse()?.isMouseCaptured())previewMouse().releaseMouse();
  nativeStatus?.disconnect();nativeStatus=null;
  os_game.ed?.stop();
  const screen=document.getElementById('screen'),home=document.querySelector('#editorWin .ed-screenwrap');
  if(screen&&home&&screen.parentNode!==home)home.append(screen);
  const output=document.getElementById('console'),outputHome=document.querySelector('#editorWin .ed-pane:last-child');
  if(output&&outputHome&&output.parentNode!==outputHome)outputHome.append(output);
  document.getElementById('gameStop').disabled=true;
  document.getElementById('gameRun').textContent='▶ Run';
  runnerTarget=null;
  updatePreviewMouse();
  if(!keepFullscreen)document.getElementById('gameWinOverlay').classList.remove('open','free');
  releaseDesktop?.();releaseDesktop=null;
}
ed_game.stop=()=>{if(runnerTarget==='editor')closeGameWin();};
ed_game.prepare=()=>{if(runnerTarget!=='editor')closeGameWin();};
document.getElementById('gameWinClose').addEventListener('click',closeGameWin);
document.getElementById('gameWinOverlay').addEventListener('mousedown',e=>{if(e.target.id==='gameWinOverlay')closeGameWin();});

// a small TempleOS-styled toast - the game loop rewrites #status every second,
// so the "how to run it" instruction needs its own durable, dismissable home.
function toast(html, ms = 11000) {
  let t = document.getElementById("gmToast");
  if (!t) {
    t = document.createElement("div"); t.id = "gmToast";
    t.style.cssText = "position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:99999;"
      + "max-width:min(680px,92vw);background:#fff;color:var(--blue);border:3px double var(--blue);"
      + "padding:10px 34px 11px 14px;font-size:13px;line-height:1.4;";
    const x = document.createElement("button");
    x.textContent = "✕"; x.title = "dismiss";
    x.style.cssText = "position:absolute;top:3px;right:5px;min-width:0;border:0;outline:0;background:transparent;color:var(--blue);font-size:14px;line-height:1;padding:2px 4px;";
    x.addEventListener("click", () => t.remove());
    const body = document.createElement("div"); body.id = "gmToastBody";
    t.appendChild(x); t.appendChild(body); document.body.appendChild(t);
  }
  document.getElementById("gmToastBody").innerHTML = html;
  clearTimeout(t._timer); t._timer = setTimeout(() => t.remove(), ms);
}

// Install byte-preserved upstream packages through the guest filesystem, then launch
// them in a new TempleOS task. Custom games compile from their edited source.
os_game.launchFail = (message) => {
  if(!/A game is busy:/.test(message)){os_game.active=false;OsCaptureSet(false);}
  setStatus("Launch failed: "+message);toast(String(message).replace(/[<>&]/g,""),15000);
};
async function runInTempleOS(g,suppliedOverrides=null) {
  if (packageLaunchBusy) { toast("A game is already being prepared. Please wait."); return; }
  closeGameWin();
  packageLaunchBusy = true;
  const generation=OsGen(),current=()=>{
    if(OsGen()!==generation)throw new Error("OS restarted while preparing this game.");
  };
  try {
  curGame = g;
  let opts;
  if (g.packageId) {
    try {
      const {installGame} = await import("./GamePkgs.js");
      const writeCurrent=(path,bytes)=>{current();return OsFileWrite(path,bytes.slice(0));};
      const project=await gameProject(g);
      opts = await installGame(g.packageId,writeCurrent,setStatus,suppliedOverrides ?? await project.overrides(),OsGen);
    } catch(e) {
      setStatus("Install failed: " + e.message);
      toast("Could not install the game. " + e.message.replace(/[<>&]/g,""));
      return;
    }
  } else if (g.disk) {
    opts = { path:g.disk,name:g.name };
  } else if (g.install) {
    // Bytes, not text: the file's assets follow a NUL after its source.
    const project=await gameProject(g),doc=await project.open(project.entry);
    current();
    setStatus("installing " + g.name + " in TempleOS…");
    const w=await OsFileWrite(g.install,doc.encode(doc.text));
    if (!w?.ok) throw new Error(w?.msg || "The OS could not install " + g.install);
    opts = { path:g.install,name:g.name };
  } else {
    const raw = await gameSrc(g);
    opts = { src: "#define TOS_NATIVE 1\n" + raw, name: g.name };
  }
  current();
  toast("Loading <b>" + g.name + "</b> in TempleOS…", 60000);
  setStatus("launching " + g.name + " in TempleOS…");
  const r=await OsLaunch(opts);
  if (r && r.ok) {
    closeGames();ovE.classList.remove("open","free");
    const how = g.how || "Click the screen, then follow the on-screen instructions.";
    toast("Opening <b>" + g.name + "</b> in a TempleOS task.<br>" + how + "<br>" + QuitNote(g));
    setStatus(g.name + ": TempleOS is compiling or running the game.");
    os_game.active = true;
    HelpGame(g);
    OsCaptureSet(g.name === "HolyCraft");
    OsInputReset();   // clear any stuck keys + recentre the look on spawn
  } else {
    toast("Couldn't launch <b>" + g.name + "</b>: " + (r?.msg || "unknown error"));
    setStatus("Launch failed: " + (r?.msg || "unknown error"));
  }
  } catch(e) { setStatus("Launch failed: "+e.message);toast(e.message.replace(/[<>&]/g,"")); }
  finally { packageLaunchBusy = false; }
}

export {editGame,runInBrowser,runInTempleOS};
