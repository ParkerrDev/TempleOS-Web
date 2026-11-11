//The page's side of TempleOS: it boots the engine in workers, draws its
//frames and sends it the keyboard, mouse, touch and sound. The windows the
//Menu opens import what they need from here.
import {createFrameBlitter,screenFit,PALETTE} from "./framebuffer.js";
import {createGuestFpsMeter} from "./guest-fps.js";
import {KEY,KeyInput,KeyBar,KeyRoute} from "./Keyboard.js";
import {MobileInput} from "./MobileInput.js";
import {SnapshotInspect} from "./engine/Snapshot.js";
import {BusStop,BUS_VERSION} from "./engine/CoreBus.js";
import {GuestRequests} from "./GuestRequests.js";
import {BootFileRead,BootFileClear} from "./BootFile.js";
import {Speaker} from "./engine/Speaker.js";
import "./xsel.js";   // TempleOS-style invert-on-select (desktop)

const $ = (id) => document.getElementById(id);
const dbg = (s, err) => (err ? console.warn : console.log)("[hemu] " + s);
dbg("hemu host starting…");
addEventListener("error", (e) => dbg("JS: " + e.message, true));
export const os_game = { active: false, mouse: null, launchFail: null, ed: null };   // games.js and EditorWin.js fill these
export const os_disk = { msg: null };   // DiskWin.js

const pal32 = new Uint32Array(16);
for (let i = 0; i < 16; i++) { const [r,g,b] = PALETTE[i]; pal32[i] = (255<<24)|(b<<16)|(g<<8)|r; }

const canvas = $("canvas");
const ctx = canvas.getContext("2d");
const updatePalette=(index,rgb)=>{if(index>=0&&index<16)pal32[index]=(0xff000000|((rgb&255)<<16)|(rgb&0xff00)|((rgb>>>16)&255))>>>0;};
const drawFrame = createFrameBlitter(ctx, pal32);
const ld = $("loadui"), ldtext = $("ldtext"), ldbar = $("ldbar");
const tbFps = $("tb-fps"), tbKey = $("tb-key");
const fpsMeter = createGuestFpsMeter();
tbFps.title = 'The FPS text on the last complete TempleOS frame. A dash means the label is covered.';
const updateFps = () => { const text=fpsMeter.text(); if(tbFps.textContent!==text)tbFps.textContent=text; };

const setLoad = (s, pct) => { ldtext.textContent = s; if (pct != null) ldbar.style.width = pct + "%"; };

function OsNotice(message="")
{
  $("osNoticeText").textContent=message;
  $("osNotice").hidden=!message;
}
$("osNoticeClose").addEventListener("click",function () {OsNotice();});

// ---- sizes the screen: whole blocks per guest pixel, smoothed the rest of the way (see framebuffer.js) ----
// The CSS decides how much room there is, so the size set here comes off to measure it.
const fitScreen = () => {
  canvas.style.width = canvas.style.height = "";
  let room = canvas.getBoundingClientRect();
  if (canvas.parentElement.dataset.sized)
    room={width:canvas.parentElement.clientWidth-10,
      height:canvas.parentElement.clientHeight-10};
  if (!room.width) return;
  const fit = screenFit(room.width, room.height, devicePixelRatio);
  canvas.style.width = fit.cssWidth + "px"; canvas.style.height = fit.cssHeight + "px";
  canvas.style.imageRendering = fit.smooth ? "auto" : "pixelated";
  drawFrame.resize(fit.width, fit.height);
};
fitScreen();
addEventListener("resize", fitScreen);
canvas.parentElement.addEventListener("winsize",fitScreen);
{ const watchScale = () => matchMedia(`(resolution:${devicePixelRatio}dppx)`).addEventListener("change", () => { fitScreen(); watchScale(); }, { once: true });
  watchScale();   // moving to a monitor with another scale need not change the size in CSS pixels
}

// ---- live topbar clock (the OS RTC is synced to the host clock, so this matches the OS) ----
{ const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"], p2 = (n) => String(n).padStart(2, "0");
  const tick = () => { const t = new Date();
    $("tb-date").textContent = `${days[t.getDay()]} ${p2(t.getMonth()+1)}/${p2(t.getDate())}`;
    $("tb-time").textContent = `${p2(t.getHours())}:${p2(t.getMinutes())}:${p2(t.getSeconds())}`; };
  tick(); setInterval(tick, 1000); }

// ---- "Visitors" in the topbar. Not awaited: the OS never waits on it ----
import("./presence.js").then(({createPresence}) => {
  const tb = $("tb-people");
  const presence = createPresence((people) => {
    tb.classList.toggle("off", people === null);
    if (people !== null) tb.lastElementChild.textContent = people;
  });
  presence.wake();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) presence.wake(); });
  addEventListener("online", presence.wake);
}).catch((e) => dbg("presence: " + e.message, true));

function blit(idx, w, h, immutable = false, stats = null) {
  drawFrame(idx,w,h,immutable);
  if(stats) {
    fpsMeter.sample(stats.fps,stats.updates);
    updateFps();
  }
}
let started = false;
export function OsReady()
{
  return started;
}
function firstFrame()
{
  if (started) return;
  started=true;
  ld.style.display="none";
  dbg("TempleOS desktop up");
  dispatchEvent(new CustomEvent("osstate",{detail:{ready:true}}));
  if (bootFile) {
    BootFileClear(bootFile).catch(function (e) {
      dbg("Could not clear the imported boot file: "+e.message,true);
    });
    bootFile=null;
  }
}
let notifyInput = () => {};
const FIXED_B = +((new URLSearchParams(location.search)).get("b")) || 0;
setInterval(updateFps,500);
// one-time banner shown when a heavy game freezes the single-core engine -> 1-click switch to multi-core

// ---- input: a host-owned cursor + a set-1 scancode queue, pulled by snapshot.HC each frame ----
let msX = 320, msY = 240, msB = 0, wheelZ = 0;
const keyq = [];
let keysUp=false,pasteGen=0;
const keyboard=KeyInput(function (bytes) {
  keyq.push(...bytes);
  notifyInput();
});
const previewInput=()=>os_game.ed?.inputCanvas() && !$("frame").classList.contains('fsmode') &&
  (os_game.ed.hasInputFocus() || !focused)?os_game.ed:null;
const keyTarget=()=>previewInput()?.keyInput()||keyboard;
const resetKeyBar=KeyBar($("keysbar"),KeyRoute(keyTarget));

addEventListener('preview-input-reset',resetKeyBar);

function FrameMenu()
{//The screen's MENU sends Ctrl+M, as a click on a window's MENU does in
//WinMgrTask (Adam/WinMgr.HC).
  keyboard.chord(KEY.KeyM,KEY.ControlLeft);
}
$("frame").querySelector(".wmenu").addEventListener("click",FrameMenu);

// The OS reports when its foreground task owns mouse input. Pointer lock
// requires a user click; movement then follows the guest cursor so MsSet
// recentering works without an off-center host position fighting the game.
let focused=false, mouseDX=0, mouseDY=0, resetInput=false;
let guestCapture=false, explicitCapture=false, hybridMouse=false, wasMouseLocked=false, hybridTracking=false;
const locked=()=>document.pointerLockElement===canvas;
const captureWanted=()=>!hybridMouse && (guestCapture || explicitCapture);
const relativeMouse=()=>locked() || (hybridMouse && guestCapture);
const btnBit=e=>e.button===0?1:e.button===2?2:0;
const captureButton=$('captureBtn'), captureLabel=$('captureLabel');
const updateFocusText=()=>{
  const captured=!!document.pointerLockElement||!!os_game.mouse?.isMouseCaptured();
  captureLabel.textContent=captured?'Release mouse':'Capture mouse';
  captureButton.setAttribute('aria-pressed',String(captured));
  document.body.classList.toggle('mouse-locked',captured);
  tbKey.textContent=locked()?'mouse captured · Esc releases':captureWanted()?'click the screen to capture the mouse':focused?'hybrid mouse · keys → OS · Ctrl+V pastes':'click the screen to use the OS';
};
const releaseHeld=()=>{
  pasteGen++;keyboard.reset();resetKeyBar();keysUp=true;
  dispatchEvent(new Event('os-input-reset'));
  msB=0;mouseDX=mouseDY=0;hybridTracking=false;msX=320;msY=240;resetInput=true;notifyInput();
};
const setFocused=on=>{if(focused && !on)releaseHeld();focused=on;updateFocusText();};
const releaseOSInput=()=>{
  setFocused(false);releaseHeld();
  if(locked())document.exitPointerLock();
};
const setGameCapture=on=>{explicitCapture=!!on;releaseHeld();if(!captureWanted()&&locked())document.exitPointerLock();updateFocusText();};
const guestInputMode=state=>{
  guestCapture=!!state.capture;
  if(!state.game && os_game.active){os_game.active=false;explicitCapture=false;releaseHeld();}
  if(!captureWanted()&&locked())document.exitPointerLock();
  updateFocusText();
};
const requestCapture=()=>{
  canvas.focus({preventScroll:true});
  setFocused(true);releaseHeld();
  try{const request=canvas.requestPointerLock();request?.catch(()=>{tbKey.textContent='Mouse capture unavailable. Click the screen to retry.';});}
  catch{tbKey.textContent='Mouse capture unavailable in this browser.';}
};
const osMouse={
  captureMouse:()=>{hybridMouse=false;explicitCapture=true;requestCapture();return true;},
  releaseMouse:()=>{hybridMouse=true;explicitCapture=false;releaseHeld();if(locked())document.exitPointerLock();},
  isMouseCaptured:locked,
  isRunning:()=>true,
};
dispatchEvent(new Event('game-mouse-change'));
addEventListener('game-mouse-change',updateFocusText);
captureButton.addEventListener('click',()=>{
  if(os_game.mouse?.toggle())return;
  if(document.pointerLockElement){
    hybridMouse=true;explicitCapture=false;
    os_game.ed?.releaseMouse?.();document.exitPointerLock();return;
  }
  if(os_game.ed?.captureMouse?.())return;
  osMouse.captureMouse();
});
document.addEventListener('pointerlockchange',()=>{
  // Releasing capture is a user preference, not another request to capture.
  // Guest hints and focus changes cannot undo it; the Capture button can.
  if(wasMouseLocked && !locked()){hybridMouse=true;explicitCapture=false;}
  wasMouseLocked=locked();
  releaseHeld();focused=locked();
  document.body.classList.toggle('mouse-locked',!!document.pointerLockElement);updateFocusText();
  dispatchEvent(new Event('game-mouse-change'));
});
document.addEventListener('pointerlockerror',()=>{tbKey.textContent='Mouse capture unavailable. Click the screen to retry.';});
const overCanvas=e=>{const r=canvas.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<r.right&&e.clientY>=r.top&&e.clientY<r.bottom?r:null;};
const mapAbs=(e,r)=>{msX=Math.max(0,Math.min(639,Math.round((e.clientX-r.left)/r.width*640)));msY=Math.max(0,Math.min(479,Math.round((e.clientY-r.top)/r.height*480)));};
const keepsFocus=t=>t&&(t.closest('#frame')||t.closest('.keyswin')||t.closest('#keysbar')||(t.tagName==='BUTTON'&&t.closest('.toolbar')));
const releasesFocus=t=>t&&(t.tagName==='TEXTAREA'||t.tagName==='INPUT'||t.tagName==='SELECT'||t.closest('.overlay'));
$("frame").addEventListener('mousedown',e=>{
  if(e.target!==canvas && (e.target!==e.currentTarget ||
    !e.currentTarget.classList.contains('fsmode')))return;
  if(document.body.classList.contains('touch'))return;
  e.preventDefault();canvas.focus({preventScroll:true});setFocused(true);
  if(captureWanted()&&!locked()){requestCapture();return;} // Capture click must not fire a weapon.
  if(!relativeMouse())mapAbs(e,canvas.getBoundingClientRect());
  msB|=btnBit(e);notifyInput();
});
document.addEventListener('mouseup',e=>{if(msB){msB&=~btnBit(e);notifyInput();}});
document.addEventListener('mousemove',e=>{
  if(document.body.classList.contains('touch'))return;
  if(locked()){mouseDX+=e.movementX;mouseDY+=e.movementY;notifyInput();return;}
  if(captureWanted())return; // A released mouse cannot steer a waiting game.
  if(e.target!==canvas){hybridTracking=false;return;}
  const r=overCanvas(e);if(r){
    if(relativeMouse()){
      if(!focused){hybridTracking=false;return;}
      if(hybridTracking){mouseDX+=e.movementX;mouseDY+=e.movementY;}
      hybridTracking=true;
    }
    else mapAbs(e,r);
    notifyInput();
  }
});
document.addEventListener('mousedown',e=>{if(releasesFocus(e.target)||!keepsFocus(e.target))setFocused(false);},true);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{if(!focused)return;wheelZ+=e.deltaY>0?1:-1;e.preventDefault();notifyInput();},{passive:false});
const keysToOS=e=>{
  if(e?.target?.closest?.('textarea,input,select,button,[role=button],[contenteditable=true]'))return false;
  if(document.querySelector('.overlay.open:not(.free)'))return false;
  return focused||document.body.classList.contains('touch');
};
addEventListener('keydown',e=>{
  if(!keysToOS(e))return;
  if((e.ctrlKey||e.metaKey)&&e.code==='KeyV')return;
  if(e.code==='Escape'){
    if(locked()){hybridMouse=true;explicitCapture=false;document.exitPointerLock();releaseHeld();return;}
    if(!e.repeat)keyboard.tap(KEY.Escape);e.preventDefault();return;
  }
  if(e.ctrlKey&&e.code==='BracketLeft'){if(!e.repeat)keyboard.tap(KEY.Escape);e.preventDefault();return;}
  const sc=KEY[e.code];if(sc!==undefined){if(!e.repeat)keyboard.down(e.code,sc);e.preventDefault();}
});
addEventListener('keyup',e=>{
  if(KEY[e.code]===undefined||e.code==='Escape')return;
  keyboard.up(e.code);
  if(keysToOS(e))e.preventDefault();
});
addEventListener('blur',releaseOSInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseOSInput();});
setInterval(()=>{if(os_game.active)notifyInput();},250);
const inputMessage=()=>{
  const message={cmd:'input',x:msX,y:msY,b:msB,wheel:wheelZ,keys:keyq.splice(0),held:keyboard.held(),keysUp,relative:relativeMouse(),dx:mouseDX,dy:mouseDY,reset:resetInput};
  mouseDX=mouseDY=0;resetInput=keysUp=false;return message;
};

let pasting=false;
async function pasteToOS(text)
{
  if (!text || pasting)
    return;
  releaseHeld();
  let generation=pasteGen;
  pasting=true;
  try {
    await new Promise(resolve=>setTimeout(resolve,250));
    for (let ch of text.replace(/\r\n?/g,"\n")) {
      if (generation!=pasteGen)
        break;
      keyboard.text(ch);
      //The guest line editor and AutoComplete consume keys asynchronously.
      await new Promise(resolve=>setTimeout(resolve,110));
    }
  } finally {
    pasting=false;
  }
}
addEventListener("paste",function (e) {
  if (!keysToOS(e))
    return;
  let text=e.clipboardData?.getData("text");
  if (text) {
    e.preventDefault();
    pasteToOS(text);
  }
});

// ---- fullscreen, mobile included. Real Fullscreen API where available; iPhone Safari has
//      none for elements, so we pin the frame over the viewport ("fakefs"). In either mode
//      the touch controls stay (they live inside #frame) and the keys bar floats on top. ----
{ const frame = $("frame");
  let fake = false;
  //VisualViewport excludes the phone keyboard; keep the exit button above it.
  const vv = window.visualViewport;
  const layoutFs = () => {
    const onFs = document.body.classList.contains("touch") && frame.classList.contains("fsmode");
    if (!onFs) { frame.style.removeProperty("--fsx-top"); frame.classList.remove("fsx-mid"); return; }
    const kb = vv ? Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop)) : 0;   // ≈ keyboard height
    const kbTop = innerHeight - kb, cr = canvas.getBoundingClientRect();
    // [X] stays OUT of the OS AND clear of the right-side buttons. Portrait: there's a black
    // letterbox below the canvas → center it there (.fsx-mid), just under the OS but never under
    // the keyboard. Landscape: the canvas fills the height → no room below, so it sits top-left
    // in the side bar (.fsx-mid off).
    const belowOS = innerHeight - cr.bottom >= 44;
    frame.classList.toggle("fsx-mid", belowOS);
    const top = belowOS ? Math.min(cr.bottom + 6, kbTop - 44) : 6;
    frame.style.setProperty("--fsx-top", Math.max(6, Math.round(top)) + "px");
  };
  const fsUi = (on) => {
    frame.classList.toggle("fsmode", on);
    if (on) {
      if (frame.dataset.floating) {                  // a dragged frame has inline pos that fights fullscreen
        frame._fsSaved = { left: frame.style.left, top: frame.style.top, width: frame.style.width, height: frame.style.height };
        frame.style.left = frame.style.top = frame.style.width = frame.style.height = "";
      }
    } else if (frame.dataset.floating && frame._fsSaved) {
      Object.assign(frame.style, frame._fsSaved); frame._fsSaved = null;
    }
    fitScreen();
    layoutFs(); dispatchEvent(new Event("input-view-change")); requestAnimationFrame(layoutFs);     // position controls/[X]; recompute once the layout settles
  };
  const fauxOn = () => { fake = true; document.body.classList.add("fakefs"); fsUi(true); scrollTo(0, 0); };
  const fauxOff = () => { fake = false; document.body.classList.remove("fakefs"); fsUi(false); };
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  const fsExitReal = () => (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  $("fsBtn").addEventListener("click", () => {
    if (fsEl()) { fsExitReal(); return; }
    if (fake) { fauxOff(); return; }
    const req = frame.requestFullscreen || frame.webkitRequestFullscreen;
    if (req) { try { const p = req.call(frame); if (p && p.catch) p.catch(() => fauxOn()); } catch { fauxOn(); } }
    else fauxOn();
  });
  $("fsExit").addEventListener("click", () => {
    if (fsEl()) fsExitReal();
    else fauxOff();
  });
  const onFsChange = async () => {
    const el = document.fullscreenElement || document.webkitFullscreenElement;
    if (el === frame) {
      fsUi(true);
      try { await navigator.keyboard?.lock?.(); dbg("keyboard locked (Esc stays in the OS)"); } catch {}
      if (!document.body.classList.contains("touch")) setFocused(true);   // route keys to the OS in fullscreen
    } else if (!fake) { fsUi(false); try { navigator.keyboard?.unlock?.(); } catch {} }
  };
  document.addEventListener("fullscreenchange", onFsChange);
  document.addEventListener("webkitfullscreenchange", onFsChange);
  vv?.addEventListener("resize", layoutFs);          // keyboard open/close, URL-bar show/hide
  vv?.addEventListener("scroll", layoutFs);
  addEventListener("orientationchange", () => setTimeout(layoutFs, 80));
}

// ---- touch controls: direct touch = absolute cursor + tap-to-click; joystick = fine relative
//      moves; L/R = holdable mouse buttons (drags); ⌨ opens the device keyboard. ----
const touchDevice=matchMedia("(pointer:coarse)");
function TouchMode(e)
{
  if (e)
    releaseHeld();
  document.body.classList.toggle("touch",touchDevice.matches);
  $("touchBtn").setAttribute("aria-pressed",String(touchDevice.matches));
  dispatchEvent(new Event("input-view-change"));
}
TouchMode();
touchDevice.addEventListener("change",TouchMode);
$("touchBtn").addEventListener("click",function () {
  let on=document.body.classList.toggle("touch");
  $("touchBtn").setAttribute("aria-pressed",String(on));
  dispatchEvent(new Event("input-view-change"));
  releaseHeld();
});
{ // The mouse: the real TempleOS pointer. The cursor.png arrow (recolored white) rides the
  // pointer and mix-blend-mode:difference inverts the pixels under it - the browser equivalent
  // of the OS's ROP_XOR mouse. On automatically for desktop (mice); touch keeps its own UI.
  const xc = $("xcursor");
  const xcOn = matchMedia("(pointer:fine)").matches;
  document.body.classList.toggle("xcursor", xcOn);
  const hideCursor=()=>{xc.style.visibility='hidden';};
  const moveCursor=(e,frame=null)=>{
    if(!xcOn||e.pointerType==='touch')return;
    const rect=frame?.getBoundingClientRect();
    xc.style.transform=`translate(${e.clientX+(rect?.left||0)}px,${e.clientY+(rect?.top||0)}px)`;
    xc.style.visibility=e.target?.id==='canvas' ||
      e.target?.closest('.wszr,.wszb,.wszcorner')?'hidden':'visible';
  };
  window.__desktopCursor={enabled:xcOn,move:moveCursor,hide:hideCursor};
  if (xcOn) {
    addEventListener('pointermove',e=>moveCursor(e),{capture:true,passive:true});
    document.addEventListener('mouseleave',hideCursor);
    addEventListener('blur',hideCursor);
  }
}
const touchMouse={
  position:()=>[msX,msY],
  move(x,y) {mouseDX+=x-msX;mouseDY+=y-msY;msX=x;msY=y;notifyInput();},
  buttons(mask) {msB=mask;notifyInput();},
};
document.addEventListener('pointerdown',e=>{
  if(e.target===canvas)setFocused(true);
  else if(e.target===os_game.ed?.inputCanvas())setFocused(false);
},true);
MobileInput({frame:$("frame"),target:()=>{
  const ed=previewInput();
  if(ed)return {canvas:ed.inputCanvas(),mouse:ed.touchMouse,keys:ed.keyInput};
  return {canvas,mouse:touchMouse,keys:()=>keyboard};
}});

const speaker=Speaker();
function SoundStart() {speaker.Resume().catch(error=>dbg("speaker: "+error.message,true));}
addEventListener("pointerdown",SoundStart);
addEventListener("keydown",SoundStart);

//Desktop uses four guest CPUs. Only a stock boot failure can fall back to one;
//running faults retain their stopped machine until restart.
const isMobileDev = (navigator.maxTouchPoints > 1) || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "");
let useSMP = self.crossOriginIsolated && !/[?&](single|nosmp)\b/.test(location.search)
             && (/[?&]smp\b/.test(location.search) || !isMobileDev);
const SMP_N=4;
let snapshotInfo=null,bootFile=null;

// ---- load the compressed RAM snapshot (imported, or the default; the SMP snapshot when ?smp) ----
let gzBytes;
async function downloadSnapshot(smp=useSMP,generation=osGen) {
  const progress=(text,pct)=>{if(generation===osGen)setLoad(text,pct);};
  progress("downloading the TempleOS RAM snapshot…", 5);
  const gz = await fetch(smp ? "./hemu/live-smp.bin.gz" : "./hemu/live.bin.gz", { cache: "no-cache" });
  if (!gz.ok) { progress("failed to fetch snapshot (" + gz.status + ")"); throw new Error("snapshot fetch"); }
  const total = +gz.headers.get("content-length") || 10300000;   // hemu/live.bin.gz
  const reader = gz.body.getReader(); const chunks = []; let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; progress(`downloading snapshot… ${(got/1048576).toFixed(1)} MB`, 5 + 45 * got / total); }
  const buf = await new Blob(chunks).arrayBuffer();
  if(generation===osGen)dbg(`snapshot downloaded (${(got/1048576).toFixed(1)} MB)`);
  return buf;
}


// ↻ Restart: reload the OS in place - tear down the running engine and re-boot it from the
// snapshot WITHOUT reloading the page, so the user's other windows (videos, search, God Tools)
// are left exactly as they are. A page reload reset the disk to pristine anyway; so does this -
// disk writes still persist only via Export, same as before.
let restarting = false, osGen = 0;
async function restartOS() {
  if (restarting) return; restarting = true;
  try {
    dbg("↻ restarting TempleOS (reloading the OS, keeping your windows)…");
    cancelOSRequests();
    OsNotice();
    dispatchEvent(new CustomEvent("osstate",{detail:{ready:false,
      msg:"TempleOS is restarting."}}));
    osGen++;
    releaseOSInput();guestCapture=false;explicitCapture=false;os_game.active=false;keyq.length=0;updateFocusText();
    engine.stop?.();
    resetPause();
    fpsMeter.reset();updateFps();
    started = false; ld.style.display = "";            // let firstFrame() hide the loader again
    setLoad("restarting TempleOS…", 0);
    if (!gzBytes) gzBytes = await downloadSnapshot();  // phones free the snapshot after boot - re-fetch
    bootEngine();
  } catch (e) { setLoad("restart failed: " + (e.message || e)); dbg("restart failed: " + (e.message || e), true); }
  finally { restarting = false; }
}
$("restartBtn").addEventListener("click", restartOS);

// the running engine, for the Disk window and the guest requests
const engine = { post: () => {}, kind: null };
const guestRequests=GuestRequests((message,transfer)=>engine.post(message,transfer));
const os_cfg=CfgRead();
let cfg_status={ready:false,ok:true,msg:"Settings apply when TempleOS starts."};
let stockBoot=true;

function CfgRead()
{
  let cfg={rate:0,repeat:false},saved;
  try {
    saved=JSON.parse(localStorage.getItem("tos-settings"));
    if ([0,30,60,120].includes(saved?.rate))
      cfg.rate=saved.rate;
    if (typeof saved?.repeat=="boolean")
      cfg.repeat=saved.repeat;
  } catch (e) {
    //Blocked storage leaves settings at their defaults.
  }
  return cfg;
}

export function OsCfg(change)
{
  if (change) {
    if ("rate" in change && [0,30,60,120].includes(change.rate))
      os_cfg.rate=change.rate;
    if (typeof change.repeat=="boolean")
      os_cfg.repeat=change.repeat;
    engine.post({cmd:"set",...os_cfg});
    cfg_status={ready:false,ok:true,msg:"Applying settings…"};
    dispatchEvent(new CustomEvent("ossettings",{detail:cfg_status}));
    try {
      localStorage.setItem("tos-settings",JSON.stringify(os_cfg));
    } catch (e) {
      dbg("Settings work for this visit; browser storage is unavailable.");
    }
  }
  return {...os_cfg};
}

export function OsCfgStatus()
{
  return {...cfg_status};
}

// ---- engine: one worker, or the multi-core one below ----
let importDisk = null;   // a disk image imported before the reload
function engineFail(why) {
  speaker.Stop();
  guestRequests.Fail(String(why));
  started=false;
  ld.style.display = ""; setLoad("The emulator could not start (" + why + "). Tap ↻ Restart.", 0);
  dbg("engine failed: " + why, true);
  dispatchEvent(new CustomEvent("osstate",{detail:{ready:false,msg:String(why)}}));
}
function engineFault(why) {
  osFault=true;
  guestRequests.Fail(String(why)+" Restart TempleOS before running programs or writing files.");
  ++pauseRevision;
  setPaused(true);
  pauseBtn.disabled=true;
  OsNotice(String(why)+" TempleOS is paused. Restart TempleOS to retry.");
  dbg(why,true);
  dispatchEvent(new CustomEvent("osstate",{detail:{ready:false,msg:String(why)}}));
}
function singleCore(why,generation=osGen) {   // multi-core failed before its first frame
  if(generation!==osGen)return;
  if (snapshotInfo) {
    engineFail("Could not restore the saved multi-core machine: "+why);
    return;
  }
  dbg("SMP engine failed (" + why + ") - falling back to single core", true);
  useSMP = false;
  downloadSnapshot().then(b => {
    if(generation!==osGen)return;
    gzBytes=b;bootEngine();
  }).catch(e=>{if(generation===osGen)engineFail(e.message);});
}
function runWorker() {
  const generation=osGen;
  let worker, watchdog, alive = false;
  try { worker = new Worker("./engine/hemu-worker.js", { type: "module" }); } catch (e) { return false; }
  engine.kind = "worker"; engine.post = (m, t) => worker?.postMessage(m, t || []);
  const stop=()=>{clearTimeout(watchdog);worker?.terminate();worker=null;
    if(engine.stop===stop){speaker.Stop();engine.kind=null;notifyInput=()=>{};}};
  engine.stop=stop;
  notifyInput = () => worker?.postMessage(inputMessage());
  const fallback = (why) => {
    if (!worker) return;
    stop();
    if (alive) {
      // The engine ALREADY booted and then died (e.g. iOS reclaimed the worker's memory).
      // Do NOT boot a second 384 MB engine on top - that's a guaranteed tab kill on phones.
      engineFail(why);
      return;
    }
    engineFail(why);
  };
  worker.onerror = (e) => fallback(e.message || "worker error");
  worker.onmessageerror=()=>fallback("The worker sent an unreadable message");
  worker.onmessage = (e) => {
    if (!worker || generation!==osGen) return;
    const m = e.data;
    if (m.cmd === "frame") {
      if (!alive && stockBoot && document.body.classList.contains("touch")) gzBytes = null;
      blit(new Uint8Array(m.buf), m.w, m.h, true, m); worker.postMessage({ cmd: "ack" }); alive = true; firstFrame();
    }
    else if (m.cmd === "snd") speaker.Tone(m.f);
    else if (m.cmd === "progress") { setLoad(m.text, m.pct); dbg(m.text); }
    else if (m.cmd === "error") {
      if (m.retained) engineFault(m.msg);
      else fallback(m.msg);
    }
    else if(m.cmd === "palette")updatePalette(m.index,m.rgb);
    else diskMsg(m);   // paused/exportResult/fileResult/dirList/diskInfo
  };
  worker.postMessage({ cmd: "init", gz: gzBytes, wasmUrl: new URL("./build/hemu.wasm", location.href).href, fixedB: FIXED_B, diskBytes: importDisk,
    ...os_cfg }, importDisk ? [importDisk] : []);
  importDisk = null;
  watchdog = setTimeout(() => { if (!alive) fallback("no frame in 10s"); }, 10000);
  return true;
}

// ---- SMP engine (?smp): the BSP is hemu-worker.js over a SHARED memory + N-1 AP workers running
//      RunCore in parallel. Same BSP message protocol as runWorker, so the whole UI works unchanged. ----
async function runSMP() {
  const generation=osGen;
  let bsp=null,aps=[],ctrl=null,watchdog,alive=false,stopped=false,busFailed=false;
  const current=()=>!stopped&&generation===osGen;
  function stop() {
    stopped=true;clearTimeout(watchdog);
    if(ctrl)BusStop(new Int32Array(ctrl));
    bsp?.terminate();for(const ap of aps)ap.terminate();
    bsp=null;aps=[];
    if(engine.stop===stop){speaker.Stop();engine.kind=null;notifyInput=()=>{};}
  }
  engine.stop=stop;
  function fault(why) {
    if(!current())return;
    busFailed=true;clearTimeout(watchdog);
    if(ctrl)BusStop(new Int32Array(ctrl));
    engineFault(why);
  }
  function fallback(why) {
    if(!current())return;
    if(alive){fault(why);return;}
    stop();singleCore(why,generation);
  }
  try {
    setLoad("starting multi-core engine…", 90);
    let wasmBytes,sc;
    if (snapshotInfo) {
      wasmBytes=snapshotInfo.wasm;
      sc={globals:{g_ipi_pending:snapshotInfo.meta.ipiAddr},
        ncore:snapshotInfo.meta.cores};
    } else {
      [wasmBytes,sc]=await Promise.all([
        fetch("./build/hemu-smp.wasm",{cache:"no-cache"}).then(r=>r.arrayBuffer()),
        fetch("./build/hemu-smp.json",{cache:"no-cache"}).then(r=>r.json()),
      ]);
      sc.ncore=SMP_N;
    }
    if(!current())return false;
    const mem = new WebAssembly.Memory({ initial: 512, maximum: 8192, shared: true });
    ctrl=new SharedArrayBuffer(64);
    bsp = new Worker("./engine/hemu-worker.js", { type: "module" });
    engine.kind="smp";
    engine.post=(m,t)=>{
      if(!current())return;
      if(busFailed&&["exportSnapshot","exportDisk"].includes(m.cmd)) {
        diskMsg({cmd:"exportResult",kind:m.cmd==="exportSnapshot"?"snapshot":"disk",ok:false,
          msg:"Shared RAM coordination failed. This stopped machine cannot be exported; restart TempleOS."});
        return;
      }
      bsp?.postMessage(m,t||[]);
    };
    notifyInput = () => bsp?.postMessage(inputMessage());
    bsp.onerror = (e) => fallback(e.message || "bsp error");
    bsp.onmessageerror=()=>fallback("The main worker sent an unreadable message");
    bsp.onmessage = (e) => {
      if (!bsp || !current()) return; const m = e.data;
      if (m.cmd === "frame") { blit(new Uint8Array(m.buf), m.w, m.h, true, m); bsp.postMessage({ cmd: "ack" }); alive = true; firstFrame(); }
      else if (m.cmd === "snd") speaker.Tone(m.f);
      else if (m.cmd === "progress") { setLoad(m.text, m.pct); dbg(m.text); }
      else if (m.cmd === "smpReady") dbg("SMP: " + m.ncore + " cores running in parallel");
      else if (m.cmd === "error") {
        if (m.retained) {
          if(Atomics.load(new Int32Array(ctrl),1))fault(m.msg);
          else engineFault(m.msg);
        }
        else fallback(m.msg);
      }
      else if(m.cmd === "palette")updatePalette(m.index,m.rgb);
    else diskMsg(m);
    };
    for (let k=1;k<sc.ncore;k++) {
      const ap = new Worker("./engine/hemu-smp-worker.js", { type: "module" });
      ap.onmessage = (e) => {
        if(!current())return;
        const m=e.data;
        if (m.cmd=="error") {
          if (m.retained) {
            if(Atomics.load(new Int32Array(ctrl),1))fault("AP"+k+": "+m.msg);
            else engineFault("AP"+k+": "+m.msg);
          }
          else fallback("AP"+k+": "+m.msg);
        }
        else if (m.cmd=="log") dbg("[smp] "+m.msg);
      };
      ap.onerror = (ev) => fallback("AP"+k+" worker error: "+(ev.message || ""));
      ap.onmessageerror=()=>fallback("AP"+k+" sent an unreadable message");
      aps.push(ap);
      ap.postMessage({ cmd: "init", role: "ap", core: k, mem, ctrl, sc, wasmBytes,
        heapAbi:snapshotInfo?.meta.heapAbi,busProtocol:BUS_VERSION,
        requiredBusProtocol:snapshotInfo?.meta.requiredBusProtocol });
    }
    bsp.postMessage({ cmd: "init", gz: gzBytes, wasmUrl: new URL("./build/hemu-smp.wasm", location.href).href, fixedB: FIXED_B,...os_cfg,
      diskBytes: importDisk, smp: { mem, ctrl, ipiAddr: sc.globals.g_ipi_pending, ncore: sc.ncore,busProtocol:BUS_VERSION } },
      importDisk ? [importDisk] : []);
    importDisk = null;
    watchdog = setTimeout(() => { if (!alive) fallback("no frame in 15s"); }, 15000);
    return true;
  } catch (e) {fallback("SMP init threw: "+(e.message||e));return false;}
}

function bootEngine() {
  speaker.Pause(snapshotInfo?.meta.paused??paused);
  if (useSMP) runSMP();   // BSP + AP workers; falls back to one core itself
  else if (!runWorker()) engineFail("this browser cannot start a module Worker");
}

// ---- Pause / Play ----
let paused = false, pauseRevision = 0, osFault=false;
const pauseBtn = $("pauseBtn");
const pauseShow = () => { pauseBtn.innerHTML = '<span class="ico"><svg><use href="#i-' + (paused ? "play" : "pause") + '"/></svg></span> ' + (paused ? "Play" : "Pause"); };
const setPaused = value => { if (osFault && !value) return; paused = value; speaker.Pause(paused); fpsMeter.setPaused(paused); updateFps(); engine.post({ cmd: "pause", value: paused }); pauseShow(); };
pauseBtn.addEventListener("click", () => { ++pauseRevision; setPaused(!paused); });
const holdOSForGame = () => {
  const previous=paused, revision=pauseRevision;setPaused(true);
  return () => { if(pauseRevision===revision)setPaused(previous); };
};
const resetPause = () => { ++pauseRevision; paused = false; osFault=false; pauseBtn.disabled=false; fpsMeter.setPaused(false); updateFps(); pauseShow(); };

// ---- requests to the guest, matched to their replies by id; the Disk window shows the rest ----
const cancelOSRequests=msg=>guestRequests.Reset(msg);
const diskMsg = (m) => {
  guestRequests.Receive(m);
  if (m.cmd=="guestPatch") {
    if(osFault)return;
    if (m.state=="failed") {
      OsNotice("The game-menu graphics fix could not load. Some icons may "+
        "flicker. Restart TempleOS to retry.");
      dbg(m.msg,true);
    } else if (m.state=="installed") OsNotice();
    return;
  }
  if (m.cmd==="paused") {
    if(osFault&&!m.value)return;
    paused=m.value;
    speaker.Pause(paused);
    fpsMeter.setPaused(paused);
    updateFps();
    pauseShow();
    return;
  }
  if (m.cmd==="restored") {
    if ([0,30,60,120].includes(cfg_status.rate))
      os_cfg.rate=cfg_status.rate;
    os_cfg.repeat=cfg_status.repeat;
    dispatchEvent(new CustomEvent("osrestored",{detail:{...os_cfg}}));
    return;
  }
  if (m.cmd==="settings") {
    cfg_status={...m,ready:true};
    dispatchEvent(new CustomEvent("ossettings",{detail:cfg_status}));
    return;
  }
  if (m.cmd === "inputMode") { guestInputMode(m); return; }
  if (m.cmd === "guestResult" && ["failed","error"].includes(m.state) && m.op === "launch") os_game.launchFail?.(m.msg);
  os_disk.msg?.(m);
};
const osRequest=(message,transfer=[])=>guestRequests.Request(message,transfer);
const listOSDir=dir=>osRequest({cmd:"listDir",dir});
const writeOSFile = (path, bytes) => osRequest({cmd:"osWrite",path,name:path.split("/").pop(),run:false,bytes},[bytes]);
const uploadToHome = (name, text, run) => {
  const bytes = new TextEncoder().encode(text).buffer;
  return osRequest({cmd:"osWrite",name,path:"C:/Home/"+name,run:!!run,bytes},[bytes]);
};
const launchInOS = (opts) => osRequest({cmd:"osLaunch",...opts});


// ---- topbar: last key pressed (focus-state text is owned by setFocused) ----
addEventListener("keydown", (e) => {
  if (focused) return;
  let k = e.key; if (k === " ") k = "SPACE"; else if (k === "Meta") k = "WINDOWS"; else if (k.length === 1) k = k.toUpperCase();
  tbKey.textContent = k;
}, true);

async function OsBoot()
{//Boots from a snapshot imported before the reload, or the stock one.
  const generation=osGen;
  let snap,file,disk,info=null,smp=useSMP,bytes;
  try {
    file=await BootFileRead();
  } catch (e) {
    dbg("Browser storage unavailable; loading the stock machine: "+
      e.message,true);
  }
  if(generation!==osGen)return;
  snap=file?.snapshot;disk=file?.disk;
  if (file?.kind=="snapshot")snap=file.bytes;
  else if (file?.kind=="disk")disk=file.bytes;
  if (snap) {
    setLoad("Checking imported snapshot…",40);
    info=await SnapshotInspect(snap,{busProtocol:BUS_VERSION});
    if(generation!==osGen)return;
    if (info) {
      smp=info.meta.cores>1;
      if (smp && !self.crossOriginIsolated)
        throw new Error("This snapshot needs shared memory for its four CPUs. "+
          "Open the site in a browser that supports cross-origin isolation.");
    }
    bytes=snap;
    setLoad("loading imported snapshot…",50);
  } else
    bytes=await downloadSnapshot(smp);
  if(generation!==osGen)return;
  bootFile=file;importDisk=disk;snapshotInfo=info;stockBoot=!snap;useSMP=smp;gzBytes=bytes;
  bootEngine();
}

function OsGen()
{//Counts restarts, so a game install can tell the OS it began on is gone.
  return osGen;
}

const firstBoot=osGen;
OsBoot().catch(error=>{if(firstBoot===osGen)engineFail(error);});
addEventListener("pagehide",e=>{if(!e.persisted)engine.stop?.();});
export {$,dbg,engine,pal32,OsGen,releaseOSInput as OsInputRelease,releaseHeld as OsInputReset,
  setGameCapture as OsCaptureSet,holdOSForGame as OsHold,writeOSFile as OsFileWrite,listOSDir as OsDirList,
  uploadToHome as OsHomeWrite,launchInOS as OsLaunch};
