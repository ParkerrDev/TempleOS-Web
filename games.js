import {gameProject} from './game-source.js';
import {gameCredits} from './game-credits.js';
import {EXTRA_GAMES} from './game-library.js';
import {setupGameViews} from './game-view.js';
window.__gameView=setupGameViews();

const submission=new URL('https://github.com/ParkerrDev/TempleOS-Web/issues/new');
submission.searchParams.set('title','Game submission: ');
submission.searchParams.set('body',`## Game name

## About the game

## Author name and credit link

## Original source code URL

## How to run
Include the TempleOS or HolyC version, entry file, dependencies and controls.

## Screenshots or gameplay clip

## License or permission to share
Cover both the source code and any game assets.
`);
for(const link of document.querySelectorAll('[data-game-submit]'))link.href=submission.href;

export const GAMES = [
  // custom dual-target games (run in the browser bypass OR the real OS; your edits are cached)
  { file: "HolyCraft.HC", name: "HolyCraft", blurb: "A 3D voxel sandbox - walk a blocky world, break & place blocks. A real-time raycaster in HolyC.",
    how: "W/S move · A/D strafe · R/F up/down · move MOUSE or J/L/I/K to look · LEFT-click break · RIGHT-click place · 1-9 pick block · Esc quit" },
  { file: "Snake.HC", name: "Snake", blurb: "The classic. Eat the apples, don't bite your tail.",
    how: "W/A/S/D to steer · Esc to quit" },
  // Both source collections use HolyC-WASM for browser play; TempleOS is explicit.
  { name: "Varoom",        disk: "C:/Home/Games/TinkerOS/Varoom.HC", packageId: "tinker-Varoom",        blurb: "Top-down racing - keep your foot down and hold the track." },
  { name: "Talons",        disk: "C:/Home/Games/TinkerOS/Talons.HC", packageId: "tinker-Talons",        blurb: "Joust-style aerial combat: flap above your foe and skewer them." },
  { name: "BlackDiamond",  disk: "C:/Home/Games/TinkerOS/BlackDiamond.HC", packageId: "tinker-BlackDiamond",  blurb: "Downhill skiing - carve the slope and dodge the trees." },
  { name: "FlatTops",      disk: "C:/Home/Games/TinkerOS/FlatTops.HC", packageId: "tinker-FlatTops",      blurb: "WWII Pacific aircraft-carrier warfare." },
  { name: "Halogen",       disk: "C:/Home/Games/TinkerOS/Halogen.HC", packageId: "tinker-Halogen",       blurb: "A fast top-down arena shooter." },
  { name: "CastleFrankenstein", disk: "C:/Home/Games/TinkerOS/CastleFrankenstein.HC", packageId: "tinker-CastleFrankenstein", blurb: "Sneak through the castle - a Castle Wolfenstein homage." },
  { name: "BattleLines",   disk: "C:/Home/Games/TinkerOS/BattleLines.HC", packageId: "tinker-BattleLines",   blurb: "A tactical battle along the front lines." },
  { name: "BigGuns",       disk: "C:/Home/Games/TinkerOS/BigGuns.HC", packageId: "tinker-BigGuns",       blurb: "Artillery duel - pick your angle and power." },
  { name: "BomberGolf",    disk: "C:/Home/Games/TinkerOS/BomberGolf.HC", packageId: "tinker-BomberGolf",    blurb: "Golf, with bombs." },
  { name: "FlapBat",       disk: "C:/Home/Games/TinkerOS/FlapBat.HC", packageId: "tinker-FlapBat",       blurb: "Flap through the gaps - a Flappy-Bird-like." },
  { name: "Maze",          disk: "C:/Home/Games/TinkerOS/Maze.HC", packageId: "tinker-Maze",          blurb: "Find your way out of the maze." },
  { name: "TreeCheckers",  disk: "C:/Home/Games/TinkerOS/TreeCheckers.HC", packageId: "tinker-TreeCheckers",  blurb: "Checkers (draughts) against the computer." },
  { name: "TicTacToe",     disk: "C:/Home/Games/TinkerOS/TicTacToe.HC", packageId: "tinker-TicTacToe",     blurb: "Classic noughts and crosses." },
  { name: "Whap",          disk: "C:/Home/Games/TinkerOS/Whap.HC", packageId: "tinker-Whap",          blurb: "Protect your base - whack the attackers." },
  { name: "Wenceslas",     disk: "C:/Home/Games/TinkerOS/Wenceslas.HC", packageId: "tinker-Wenceslas",     blurb: "A wintry arcade romp." },
  { name: "RawHide",       disk: "C:/Home/Games/TinkerOS/RawHide.HC", packageId: "tinker-RawHide",       blurb: "An arcade game from the TempleOS collection." },
  { name: "TheDead",       disk: "C:/Home/Games/TinkerOS/TheDead.HC", packageId: "tinker-TheDead",       blurb: "Survive against the dead." },
  { name: "Squirt",        disk: "C:/Home/Games/TinkerOS/Squirt.HC", packageId: "tinker-Squirt",        blurb: "An arcade game from the TempleOS collection." },
  { name: "Zing",          disk: "C:/Home/Games/TinkerOS/Zing.HC", packageId: "tinker-Zing",          blurb: "A fast reflex arcade game." },
  { name: "ZoneOut",       disk: "C:/Home/Games/TinkerOS/ZoneOut.HC", packageId: "tinker-ZoneOut",       blurb: "A block-busting arcade game." },
  { name: "RocketScience", disk: "C:/Home/Games/TinkerOS/RocketScience.HC", packageId: "tinker-RocketScience", blurb: "Rocket flight, the hard way." },
  { name: "Rocket",        disk: "C:/Home/Games/TinkerOS/Rocket.HC", packageId: "tinker-Rocket",        blurb: "Lunar-lander-style rocket physics." },
  { name: "DunGen",        disk: "C:/Home/Games/TinkerOS/DunGen.HC", packageId: "tinker-DunGen",        blurb: "A procedural dungeon generator." },
  // ---- graphics / physics demos that live in the Games folder ----
  { name: "MassSpring",    disk: "C:/Home/Games/TinkerOS/MassSpring.HC", packageId: "tinker-MassSpring",    blurb: "Mass-and-spring physics sandbox - left-click to place masses." },
  { name: "Collision",     disk: "C:/Home/Games/TinkerOS/Collision.HC", packageId: "tinker-Collision",     blurb: "An elastic-collision physics demo." },
  { name: "RainDrops",     disk: "C:/Home/Games/TinkerOS/RainDrops.HC", packageId: "tinker-RainDrops",     blurb: "A falling-raindrops graphics demo." },
  { name: "CircleTrace",   disk: "C:/Home/Games/TinkerOS/CircleTrace.HC", packageId: "tinker-CircleTrace",   blurb: "A spirograph-style circle-tracing demo." },
  { name: "ElephantWalk",  disk: "C:/Home/Games/TinkerOS/ElephantWalk.HC", packageId: "tinker-ElephantWalk",  blurb: "An animated walk-cycle demo." },
  { name: "CharDemo",      disk: "C:/Home/Games/TinkerOS/CharDemo.HC", packageId: "tinker-CharDemo",      blurb: "A character-set and font demo." },
  { name: "Digits",        disk: "C:/Home/Games/TinkerOS/Digits.HC", packageId: "tinker-Digits",        blurb: "A rainbow-digits graphics demo." },
  { name: "Stadium", disk: "C:/Home/Games/TinkerOS/Stadium/Stadium.HC", packageId: "tinker-Stadium", blurb: "A stadium ball game with the original sprite background." },
  { name: "TOOM", disk: "C:/Home/TOOM/BrowserStart.HC", packageId: "toom", blurb: "The DOOM engine in TempleOS, bundled with Freedoom.", how: "TOOM may take a minute or two to open. Wait for its menu, then choose New Game, episode and difficulty. WASD or arrows move, mouse looks, left click fires, Space opens doors, Tab opens the map." },
];
GAMES.push(...EXTRA_GAMES);
const featured=['HolyCraft','TOOM','Snake'];
GAMES.sort((a,b)=>(featured.includes(a.name)?featured.indexOf(a.name):featured.length)-(featured.includes(b.name)?featured.indexOf(b.name):featured.length));
const spriteOverlay = document.getElementById("spritesOverlay"), spriteFrame = document.getElementById("spritesFrame");
spriteFrame.addEventListener("load", () => {
  spriteFrame.contentDocument?.addEventListener("pointerdown", () => window.__winChrome?.raise(spriteOverlay));
});
const openSprites = () => {
  if (!spriteFrame.getAttribute("src")) spriteFrame.src = "sprites.html?embedded";
  spriteOverlay.classList.add("open"); window.__winChrome?.raise(spriteOverlay);
  window.__releaseOSInput?.();
};
const closeSprites = () => {
  spriteOverlay.classList.remove("open", "free");
  spriteFrame.contentWindow?.dispatchEvent(new Event("studio-close"));
};
document.getElementById("spritesBtn").addEventListener("click", openSprites);
document.getElementById("spritesClose").addEventListener("click", closeSprites);
spriteOverlay.addEventListener("mousedown", e => { if (e.target === spriteOverlay) closeSprites(); });
if (location.hash === "#sprites") history.replaceState(null, "", location.pathname + location.search);
let packageLaunchBusy = false;
const ovG = document.getElementById("gamesOverlay");
const ovE = document.getElementById("editorOverlay");
const grid = document.getElementById("gmGrid");
async function gameSrc(g) {
  const project=await gameProject(g);
  return (await project.open(project.entry)).text;
}
const cards = [];
for (const g of GAMES) {
  const c = document.createElement("div"); c.className = "gm-card";
  c.innerHTML = `<h3>${g.name}</h3><p>${g.blurb}</p>`;
  const credit=gameCredits(g),by=document.createElement('p');by.className='gm-credit';
  const link=(text,url)=>{const a=document.createElement('a');a.textContent=text;a.href=url;a.target='_blank';a.rel='noopener';return a;};
  by.append('By ',link(credit.author,credit.authorUrl),'. '+credit.note+' ',link('Original source code',credit.source));
  c.append(by);
  const row = document.createElement("div"); row.className = "gm-btns";
  const bB=document.createElement("button");bB.className="gm-play";bB.textContent="Run in Browser";
  bB.title="Compile HolyC directly to WebAssembly";
  bB.addEventListener("click",()=>runInBrowser(g));row.append(bB);
  const bT=document.createElement("button");bT.className="gm-play";bT.textContent="Run in TempleOS";
  bT.addEventListener("click",()=>runInTempleOS(g));row.append(bT);
  const edit=document.createElement("button");edit.textContent="Edit source";
  edit.addEventListener("click",()=>editGame(g));row.append(edit);
  c.appendChild(row);grid.appendChild(c);
  cards.push({ el: c, hay: (g.name + " " + g.blurb+' '+credit.author).toLowerCase() });
}
// ---- live search: filter the cards by name/description as you type ----
const gmSearch = document.getElementById("gmSearch"), gmNone = document.getElementById("gmNone");
const filterGames = () => {
  const q = gmSearch.value.trim().toLowerCase(); let shown = 0;
  for (const { el, hay } of cards) { const ok = !q || hay.includes(q); el.classList.toggle("gm-hide", !ok); if (ok) shown++; }
  gmNone.hidden = shown > 0;
};
gmSearch.addEventListener("input", filterGames);
gmSearch.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (gmSearch.value) { gmSearch.value = ""; filterGames(); e.stopPropagation(); } } });
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
window.__leaveGameEditor=()=>{window.__stopGamePreview?.();++editorToken;editorGame=editorProject=editorPath=null;editorLoading=false;editor.disabled=false;delete window.__gameEditor;ovE.classList.remove('gameproject');document.getElementById('editorRuntimeInfo').textContent='Click the screen for keyboard, mouse and sound. Direct HolyC to WebAssembly.';};
async function editGame(g){
  const request=++editorRequest;
  closeGameWin();closeGames();window.__releaseOSInput?.();
  ovE.classList.add('open');window.__winChrome?.raise(ovE);setStatus('Loading '+g.name+' source...');
  try{
    await window.__loadEditorApp();
    if(request!==editorRequest||!ovE.classList.contains('open'))return;
    window.__holycEditor.stop();
    const project=await gameProject(g);
    if(request!==editorRequest||!ovE.classList.contains('open'))return;
    window.__leaveGameEditor();editorGame=g;editorProject=project;
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
    window.__gameEditor={filename:()=>(editorPath||project.entry).split('/').pop(),bytes:()=>project.bytes(editorPath||project.entry)};
    await selectSource(project.entry);setStatus(g.name+' source');
  }catch(e){setStatus('Could not open source: '+e.message);}
}
window.__cancelGameEditorLoad=()=>{++editorRequest;++editorToken;editorLoading=false;editor.disabled=false;fileSelect.disabled=false;};
document.getElementById('gameRun').addEventListener('click',()=>{if(editorGame&&!editorLoading)runInBrowser(editorGame,{inEditor:true});});
document.getElementById('gameStop').addEventListener('click',()=>{closeGameWin();document.getElementById('gamePreviewStatus').textContent='Stopped. Edit the source and Run to try again.';});
document.getElementById('gameToDisk').addEventListener('click',()=>{if(editorGame)runInTempleOS(editorGame);});
document.getElementById('gameWinEdit').addEventListener('click',()=>{if(curGame)editGame(curGame);});
function openGames() { ovG.classList.add("open"); window.__releaseOSInput?.(); if (window.__winChrome) window.__winChrome.raise(ovG);   // browsing games -> stop capturing the mouse
  setTimeout(() => { try { gmSearch.focus(); gmSearch.select(); } catch {} }, 0); }   // ready to type a search immediately
function closeGames() { ovG.classList.remove("open"); }
document.getElementById("gamesBtn").addEventListener("click", openGames);
document.getElementById("gamesClose").addEventListener("click", closeGames);
ovG.addEventListener("mousedown", (e) => { if (e.target === ovG) closeGames(); });

let releaseDesktop=null,nativeStatus=null,launchToken=0,runnerTarget=null;
const runnerStatus=()=>document.getElementById(runnerTarget==='editor'?'gamePreviewStatus':'gameWinStatus');
const previewCapture=[document.getElementById('gameCapture'),document.getElementById('gameWinCapture')];
const previewMouse=()=>window.__holycEditor;
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
window.__gameMouse={
  toggle:()=>{
    if(!runnerTarget&&!ovE.classList.contains('open'))return false;
    togglePreviewMouse();return true;
  },
  isMouseCaptured:()=>!!previewMouse()?.isMouseCaptured(),
};
async function runInBrowser(g,{inEditor=false}={}) {
  window.__cancelGameEditorLoad();
  const view=document.getElementById(inEditor?'editorWin':'gameWin');
  closeGameWin({keepFullscreen:window.__gameView.isWithin(view)});const token=launchToken;curGame=g;closeGames();
  runnerTarget=inEditor?'editor':'window';
  if(!inEditor)ovE.classList.remove('open','free');
  window.__releaseOSInput?.();
  releaseDesktop=window.__holdOSForGame?.();
  const overlay=document.getElementById('gameWinOverlay'),win=document.getElementById('gameWin');
  const slot=inEditor?document.querySelector('#editorWin .ed-screenwrap'):document.getElementById('gameWinSlot'),status=runnerStatus();
  if(inEditor){
    document.getElementById('gameStop').disabled=false;
    document.getElementById('gameRun').textContent='↻ Run again';
  }else{
    win._title=g.name;
    if(!win.querySelector(':scope > .wbar')){win.dataset.title=g.name;window.__winChrome?.dress(win);}
    overlay.classList.add('open');window.__winChrome?.raise(overlay);
  }
  status.textContent='Compiling with HolyC-WASM...';
  try{
    const project=await (await gameProject(g)).native();
    await window.__loadEditorApp();
    if(token!==launchToken)return;
    if(!inEditor)window.__leaveGameEditor();
    const screen=document.getElementById('screen');slot.append(screen);
    if(!inEditor)win.append(document.getElementById('console'));
    const sourceStatus=document.getElementById('status');
    nativeStatus=new MutationObserver(()=>{status.textContent='HolyC-WASM: '+sourceStatus.textContent;});
    nativeStatus.observe(sourceStatus,{childList:true,characterData:true,subtree:true});
    const {source,...options}=project;
    await window.__holycEditor.runIn(screen,source,{...options,preserveEditor:inEditor});
    document.getElementById('screen').focus();
  }catch(e){if(token!==launchToken)return;status.textContent='HolyC-WASM could not run this game: '+e.message;releaseDesktop?.();releaseDesktop=null;}
}

function closeGameWin({keepFullscreen=false}={}) {
  ++launchToken;
  if(!keepFullscreen){
    window.__gameView.exitWithin(document.getElementById('gameWin'));
    window.__gameView.exitWithin(document.getElementById('editorWin'));
  }
  if(previewMouse()?.isMouseCaptured())previewMouse().releaseMouse();
  nativeStatus?.disconnect();nativeStatus=null;
  window.__holycEditor?.stop();
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
window.__stopGamePreview=()=>{if(runnerTarget==='editor')closeGameWin();};
window.__prepareEditorWindow=()=>{if(runnerTarget!=='editor')closeGameWin();};
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
      + "box-shadow:0 6px 26px rgba(0,0,0,.45);padding:10px 34px 11px 14px;font-size:13px;line-height:1.4;";
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
window.__gameLaunchFailure = (message) => {
  if(!/A game is busy:/.test(message)){window.__gameActive=false;window.__setGameCapture?.(false);}
  setStatus("Launch failed: "+message);toast(String(message).replace(/[<>&]/g,""),15000);
};
async function runInTempleOS(g,suppliedOverrides=null) {                                            // ▤ install + #include in the OS (HEMU)
  if (packageLaunchBusy) { toast("A game is already being prepared. Please wait."); return; }
  closeGameWin();
  packageLaunchBusy = true;
  try {
  curGame = g;
  if (!window.__launchInOS) {
    toast("The TempleOS engine isn't ready yet - open the <b>Disk</b> window and let the OS finish booting, then try again.");
    setStatus("OS engine not ready"); return;
  }
  // The engine dispatches a guest job and reports its startup state by request ID.
  let opts;
  if (g.packageId) {
    try {
      const {installGame} = await import("./game-packages.js");
      const writeWhenReady = async (path,bytes) => {
        for(let attempt=0;attempt<20;attempt++) {
          const result=await window.__writeOSFile(path,bytes.slice(0));
          if(result?.ok || !/not ready|not loaded|not up|booting/i.test(result?.msg || "") || attempt===19)return result;
          await new Promise(resolve=>setTimeout(resolve,1500));
        }
      };
      const project=await gameProject(g);
      opts = await installGame(g.packageId,writeWhenReady,setStatus,suppliedOverrides ?? await project.overrides());
    } catch(e) {
      setStatus("Install failed: " + e.message);
      toast("Could not install the game. " + e.message.replace(/[<>&]/g,""));
      return;
    }
  } else if (g.disk) {
    opts = { path:g.disk,name:g.name };
  } else {
    const raw = await gameSrc(g);
    opts = { src: "#define TOS_NATIVE 1\n" + raw, name: g.name };
  }
  // The C: disk mounts a few seconds AFTER boot, so retry while the launcher isn't ready yet.
  toast("Loading <b>" + g.name + "</b> in TempleOS…", 60000);
  setStatus("launching " + g.name + " in TempleOS…");
  let r, tries = 0;
  do {
    r = await window.__launchInOS(opts);
    if (r && r.ok) break;
    if (!/not ready|not loaded|not up|booting/i.test((r && r.msg) || "")) break;
    await new Promise((res) => setTimeout(res, 1500));
  } while (++tries < 20);
  if (r && r.ok) {
    closeGames();ovE.classList.remove("open","free");
    const how = g.how || "Click the screen, then follow the on-screen instructions.";
    toast("Opening <b>" + g.name + "</b> in a TempleOS task.<br>" + how + "<br>Press <b>Esc</b> to quit.");
    setStatus(g.name + ": TempleOS is compiling or running the game.");
    window.__gameActive = true;
    window.__setGameCapture?.(g.name === "HolyCraft" || g.name === "TOOM");
    if (window.__resetGameInput) window.__resetGameInput();   // clear any stuck keys + recentre the look on spawn
  } else {
    toast("Couldn't launch <b>" + g.name + "</b>: " + ((r && r.msg) || "unknown error")
      + "<br>The OS may still be booting - give it a few seconds and try again.");
    setStatus("Launch failed: " + (r?.msg || "unknown error"));
  }
  } catch(e) { setStatus("Launch failed: "+e.message);toast(e.message.replace(/[<>&]/g,"")); }
  finally { packageLaunchBusy = false; }
}
