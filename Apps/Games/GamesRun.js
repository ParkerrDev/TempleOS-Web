import {Icon} from "../../Adam/Icons.js";
import {gameProject,gameProgram} from './GameSrc.js';
import {GAMES} from './GameCatalog.js';
import {WinFind,WinRaise,WinRestore,WinTitle,WinOrigin,WinRoute} from '../../Adam/WinMgr.js';
import {HelpGame} from '../Help/HelpWin.js';
import {os_game,OsCaptureSet,OsFileWrite,OsGen,OsHold,OsInputRelease,OsInputReset,OsLaunch} from '../../Adam/Os.js';
import {EdLoad,EdDraftRestore,ed_game,ed_view} from '../Editor/EditorWin.js';

import {Close as closeGames,QuitNote} from "./GamesWin.js";
import {Gate,Unchecked} from "../Programs.js";
let packageLaunchBusy=false;
const ovE=WinFind("editorOverlay");
async function gameSrc(g) {
  const project=await gameProject(g);
  return (await project.open(project.entry)).text;
}
let curGame = null;
const setStatus = (s) => {
  WinFind("status").textContent=s;
};
let editorGame=null,editorProject=null,editorPath=null,editorLoading=false,editorToken=0,editorRequest=0;
const editor=WinFind('editor'),fileSelect=WinFind('gameFile'),draft=WinFind('gameDraft');
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
WinFind('gameRestore').addEventListener('click',async()=>{
  try{await editorProject.reset(editorPath);await selectSource(editorPath);draft.textContent='Original source restored.';}
  catch(e){setStatus(e.message);}
});
ed_game.leave=()=>{
  const project=editorProject;
  ed_game.stop?.();++editorToken;
  editorGame=editorProject=editorPath=null;editorLoading=false;
  editor.disabled=fileSelect.disabled=false;ed_game.file=null;
  if(project)EdDraftRestore();
  ovE.classList.remove('gameproject');
  WinFind('editorRuntimeInfo').textContent='Click the screen for keyboard, mouse and sound. Direct HolyC to WebAssembly.';
};
async function editGame(g,{origin=WinOrigin()}={}){
  const request=++editorRequest;
  closeGameWin();closeGames();OsInputRelease();
  ovE.classList.add('open');WinRaise(ovE);WinRoute(WinFind('editorWin'),origin);setStatus('Loading '+g.name+' source...');
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
    WinFind('gameTitle').textContent=g.name;
    WinFind('gameRun').title='Run the latest edits in the preview. Run again to restart with new edits.';
    ovE.classList.add('gameproject');
    WinFind('editorRuntimeInfo').textContent='Edit, Run and play here. Capture mouse above the preview; Esc returns to hybrid mode. Run again to apply edits.';
    WinFind('gamePreviewStatus').textContent='Ready. Preview compiles with HolyC-WASM.';
    const screen=WinFind('screen');screen.getContext('2d').clearRect(0,0,screen.width,screen.height);
    WinFind('console').textContent='';
    ed_game.file={filename:()=>(editorPath||project.entry).split('/').pop(),bytes:()=>project.bytes(editorPath||project.entry)};
    await selectSource(project.entry);setStatus(g.name+' source');
  }catch(e){setStatus('Could not open source: '+e.message);}
}
ed_game.cancel=()=>{++editorRequest;++editorToken;editorLoading=false;editor.disabled=false;fileSelect.disabled=false;};
WinFind('gameRun').addEventListener('click',()=>{if(editorGame&&!editorLoading)runInBrowser(editorGame,{inEditor:true});});
WinFind('gameStop').addEventListener('click',()=>{closeGameWin();WinFind('gamePreviewStatus').textContent='Stopped. Edit the source and Run to try again.';});
WinFind('gameToDisk').addEventListener('click',()=>{if(editorGame)runInTempleOS(editorGame);});
WinFind('gameWinEdit').addEventListener('click',()=>{if(curGame)editGame(curGame);});
WinFind('gameWinRun').addEventListener('click',()=>{if(curGame)runInBrowser(curGame);});

function GameKey(game)
{
  return game.packageId || game.file || [game.group,game.folder,game.entry].join('/');
}
WinRestore('game',async function ({key}) {
  const game=GAMES.find(game=>GameKey(game)===key);
  if (game) await runInBrowser(game,{start:false});
});


let releaseDesktop=null,nativeStatus=null,launchToken=0,runnerTarget=null;
const runnerStatus=()=>WinFind(runnerTarget==='editor'?'gamePreviewStatus':'gameWinStatus');
const previewCapture=[WinFind('gameCapture'),WinFind('gameWinCapture')];
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
async function Blocked(g,runner,overrides=null)
{//Why g's play check keeps it from runner ("browser" or "templeos"), or "" when
//it may run. Edited sources have no check: they compile first, and say so.
  if((overrides ?? await (await gameProject(g)).overrides()).size){
    toast(Unchecked("Running your edited "+g.name.replace(/[<>&]/g,"")+"."));
    return "";
  }
  return (await Gate(g))[runner];
}
async function runInBrowser(g,{inEditor=false,start=true,origin=WinOrigin()}={}) {
  const why=start && await Blocked(g,"browser");
  if(why){toast(why.replace(/[<>&]/g,""));setStatus(why);return;}
  ed_game.cancel();
  const view=WinFind(inEditor?'editorWin':'gameWin');
  closeGameWin({keepFullscreen:ed_view.isWithin(view)});const token=launchToken;curGame=g;closeGames();
  HelpGame(g);
  runnerTarget=inEditor?'editor':'window';
  if(!inEditor)ovE.classList.remove('open','free');
  OsInputRelease();
  if(start&&!origin.native&&!view.classList.contains('win-pass-owned'))releaseDesktop=OsHold();
  const overlay=WinFind('gameWinOverlay'),win=WinFind('gameWin');
  const slot=inEditor?WinFind('editorWin').querySelector('.ed-screenwrap'):WinFind('gameWinSlot'),status=runnerStatus();
  if(inEditor){
    WinFind('gameStop').disabled=false;
    WinFind('gameRun').innerHTML=Icon('play')+' Run again';
  }else{
    win._restore={kind:'game',data:{key:GameKey(g)}};
    WinTitle(win,g.name);
    WinFind('gameWinRun').innerHTML=Icon('play')+(start?' Run again':' Run');
    overlay.classList.add('open');WinRaise(overlay);WinRoute(win,origin);
  }
  status.textContent=start?'Compiling with HolyC-WASM...':'Ready. Run starts a new game.';
  try{
    const project=start?await (await gameProject(g)).native():null;
    await EdLoad();
    if(token!==launchToken)return;
    if(!inEditor)ed_game.leave();
    const screen=WinFind('screen');slot.append(screen);
    if(!inEditor)win.append(WinFind('console'));
    if(!start){updatePreviewMouse();return;}
    const sourceStatus=WinFind('status');
    nativeStatus=new MutationObserver(()=>{status.textContent='HolyC-WASM: '+sourceStatus.textContent;});
    nativeStatus.observe(sourceStatus,{childList:true,characterData:true,subtree:true});
    const {source,...options}=project;
    await os_game.ed.runIn(screen,source,options);
    WinFind('screen').focus();
  }catch(e){if(token!==launchToken)return;status.textContent='HolyC-WASM could not run this game: '+e.message;releaseDesktop?.();releaseDesktop=null;}
}

function closeGameWin({keepFullscreen=false}={}) {
  HelpGame(null);
  ++launchToken;
  if(!keepFullscreen){
    ed_view.exitWithin(WinFind('gameWin'));
    ed_view.exitWithin(WinFind('editorWin'));
  }
  if(previewMouse()?.isMouseCaptured())previewMouse().releaseMouse();
  nativeStatus?.disconnect();nativeStatus=null;
  os_game.ed?.stop();
  const screen=WinFind('screen'),home=WinFind('editorWin').querySelector('.ed-screenwrap');
  if(screen&&home&&screen.parentNode!==home)home.append(screen);
  const output=WinFind('console'),outputHome=WinFind('editorWin').querySelector('.ed-pane:last-child');
  if(output&&outputHome&&output.parentNode!==outputHome)outputHome.append(output);
  WinFind('gameStop').disabled=true;
  WinFind('gameRun').innerHTML=Icon('play')+' Run';
  runnerTarget=null;
  updatePreviewMouse();
  if(!keepFullscreen)WinFind('gameWinOverlay').classList.remove('open','free');
  releaseDesktop?.();releaseDesktop=null;
}
ed_game.stop=()=>{if(runnerTarget==='editor')closeGameWin();};
ed_game.prepare=()=>{if(runnerTarget!=='editor')closeGameWin();};
WinFind('gameWinClose').addEventListener('click',closeGameWin);
WinFind('gameWinOverlay').addEventListener('mousedown',e=>{if(e.target.id==='gameWinOverlay')closeGameWin();});

// a small TempleOS-styled toast - the game loop rewrites #status every second,
// so the "how to run it" instruction needs its own durable, dismissable home.
function toast(html, ms = 11000) {
  let t = WinFind("gmToast");
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
  WinFind("gmToastBody").innerHTML = html;
  clearTimeout(t._timer); t._timer = setTimeout(() => t.remove(), ms);
}

// Install byte-preserved upstream packages through the guest filesystem, then launch
// them in a new TempleOS task. Custom games compile from their edited source.
os_game.launchFail = (message) => {
  if(!/A game is busy:/.test(message)){os_game.active=false;OsCaptureSet(false);}
  setStatus("Launch failed: "+message);toast(String(message).replace(/[<>&]/g,""),15000);
};
async function runInTempleOS(g) {
  if (packageLaunchBusy) { toast("A game is already being prepared. Please wait."); return; }
  closeGameWin();
  packageLaunchBusy = true;
  const generation=OsGen(),current=()=>{
    if(OsGen()!==generation)throw new Error("OS restarted while preparing this game.");
  };
  try {
  curGame = g;
  const overrides=await (await gameProject(g)).overrides(),
    why=await Blocked(g,"templeos",overrides);
  if (why) {toast(why.replace(/[<>&]/g,""));setStatus(why);return;}
  let opts;
  if (g.packageId) {
    try {
      const {installGame} = await import("./GamePkgs.js");
      const writeCurrent=(path,bytes)=>{current();return OsFileWrite(path,bytes.slice(0));};
      opts = await installGame(g.packageId,writeCurrent,setStatus,overrides,OsGen);
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
    opts = { src: gameProgram(raw), name: g.name };
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
