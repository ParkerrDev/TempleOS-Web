//The page's side of TempleOS: it starts HEMU, draws its
//frames and sends it the keyboard, mouse, touch and sound. The windows the
//Menu opens import what they need from here.
import {createFrameBlitter,screenFit,PALETTE} from "./FrameBuf.js";
import {createGuestFpsMeter} from "./GuestFps.js";
import {KEY,KeyInput,KeyBar,KeyRoute} from "./Keyboard.js";
import {MobileInput} from "./MobileInput.js";
import {SnapshotInspect} from "../hemu/holyc-wasm/Apps/HEMU/Kernel/Snapshot.js";
import {StockInspect} from "../hemu/holyc-wasm/Apps/HEMU/Kernel/Stock.js";
import {BUS_VERSION} from "../hemu/holyc-wasm/Apps/HEMU/Kernel/CoreBus.js";
import {MachineShared} from "../hemu/holyc-wasm/Apps/HEMU/Kernel/MachineShared.js";
import {DiskStoreOpen} from "../hemu/holyc-wasm/Apps/HEMU/Kernel/DiskStore.js";
import {WinFind,WinDocuments} from "./WinMgr.js";
import {BootFileRead,BootFileClear} from "./BootFile.js";
import {Speaker} from "../hemu/holyc-wasm/Apps/HEMU/Kernel/Speaker.js";
import "./XSel.js";

const $=WinFind;
const docEvents=[],viewEvents=[];
function DocOn(type,Listener,options)
{
  docEvents.push([type,Listener,options]);
  document.addEventListener(type,Listener,options);
}
function ViewOn(type,Listener,options)
{
  viewEvents.push([type,Listener,options]);
  addEventListener(type,Listener,options);
}
addEventListener("winpopup",function (e) {
  let view=e.detail.window;
  for (let args of docEvents) view.document.addEventListener(...args);
  for (let args of viewEvents) view.addEventListener(...args);
  view.addEventListener("resize",fitScreen);
  view.addEventListener("pointerdown",function () {engine.Claim?.();},true);
});
function LockedDoc()
{
  return WinDocuments().find(doc=>doc.pointerLockElement);
}
const dbg = (s, err) => (err ? console.warn : console.log)("[hemu] " + s);
dbg("hemu host starting…");
addEventListener("error", (e) => dbg("JS: " + e.message, true));
export const os_game = { active: false, mouse: null, launchFail: null, ed: null };   // GamesWin.js and EditorWin.js fill these
export const os_disk = { msg: null,save: null };   // DiskWin.js

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

// ---- sizes the screen: whole blocks per guest pixel, smoothed the rest of the way (see FrameBuf.js) ----
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

//The visitor connection starts after the first desktop frame.
addEventListener("osstate",function PresenceStart(e) {
if(!e.detail.ready)return;
removeEventListener("osstate",PresenceStart);
import("../Apps/Chat/Presence.js").then(({createPresence}) => {
  const tb = $("tb-people");
  const presence = createPresence((people) => {
    tb.classList.toggle("off", people === null);
    if (people !== null) tb.lastElementChild.textContent = people;
  });
  presence.wake();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) presence.wake(); });
  addEventListener("online", presence.wake);
}).catch((e) => dbg("presence: " + e.message, true));
});

function blit(idx, w, h, immutable = false, stats = null) {
  drawFrame(idx,w,h,immutable);
  if(stats) {
    fpsMeter.sample(stats.fps,stats.updates);
    updateFps();
  }
}
let started=false,framed=false;
export function OsReady()
{
  return started && !restarting;
}
function firstFrame()
{
  if (framed) return;
  framed=true;
  OsShow();
}
function OsShow()
{
  if (started || !framed) return;
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
const boot_query=new URLSearchParams(location.search);
const FIXED_B = +(boot_query.get("b")) || 0;
setInterval(updateFps,500);

// ---- input: a host-owned cursor + a set-1 scancode queue, pulled by Snapshot.HC each frame ----
let msX = 320, msY = 240, msB = 0, wheelZ = 0;
let win_slot=-1,win_task=0,win_num=0,win_pass=null,win_pass_load=null,
  win_pass_ready=false,
  win_pass_state=false,win_pass_msg="Window passthrough is off.";
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
const locked=()=>canvas.ownerDocument.pointerLockElement===canvas;
const captureWanted=()=>!hybridMouse && (guestCapture || explicitCapture);
const relativeMouse=()=>locked() || (hybridMouse && guestCapture);
const btnBit=e=>e.button===0?1:e.button===2?2:0;
const captureButton=$('captureBtn'), captureLabel=$('captureLabel');
const updateFocusText=()=>{
  const captured=!!LockedDoc()||!!os_game.mouse?.isMouseCaptured();
  captureLabel.textContent=captured?'Release mouse':'Capture mouse';
  captureButton.setAttribute('aria-pressed',String(captured));
  document.body.classList.toggle('mouse-locked',captured);
  tbKey.textContent=locked()?'mouse captured · Esc releases':captureWanted()?'click the screen to capture the mouse':focused?'hybrid mouse · keys → OS · Ctrl+V pastes':'click the screen to use the OS';
};
const releaseHeld=()=>{
  pasteGen++;keyboard.reset();resetKeyBar();keysUp=true;
  dispatchEvent(new Event('os-input-reset'));
  win_slot=-1;win_task=win_num=0;
  msB=0;mouseDX=mouseDY=0;hybridTracking=false;msX=320;msY=240;resetInput=true;notifyInput();
};
const setFocused=on=>{if(focused && !on)releaseHeld();focused=on;updateFocusText();};
const releaseOSInput=()=>{
  setFocused(false);releaseHeld();
  if(locked())LockedDoc()?.exitPointerLock();
};
const setGameCapture=on=>{explicitCapture=!!on;releaseHeld();if(!captureWanted()&&locked())LockedDoc()?.exitPointerLock();updateFocusText();};
const guestInputMode=state=>{
  guestCapture=!!state.capture;
  if(!state.game && os_game.active){os_game.active=false;explicitCapture=false;releaseHeld();}
  if(!captureWanted()&&locked())LockedDoc()?.exitPointerLock();
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
  releaseMouse:()=>{hybridMouse=true;explicitCapture=false;releaseHeld();if(locked())LockedDoc()?.exitPointerLock();},
  isMouseCaptured:locked,
  isRunning:()=>true,
};
dispatchEvent(new Event('game-mouse-change'));
addEventListener('game-mouse-change',updateFocusText);
captureButton.addEventListener('click',()=>{
  if(os_game.mouse?.toggle())return;
  if(LockedDoc()){
    hybridMouse=true;explicitCapture=false;
    os_game.ed?.releaseMouse?.();LockedDoc()?.exitPointerLock();return;
  }
  if(os_game.ed?.captureMouse?.())return;
  osMouse.captureMouse();
});
DocOn('pointerlockchange',()=>{
  // Releasing capture is a user preference, not another request to capture.
  // Guest hints and focus changes cannot undo it; the Capture button can.
  if(wasMouseLocked && !locked()){hybridMouse=true;explicitCapture=false;}
  wasMouseLocked=locked();
  releaseHeld();focused=locked();
  document.body.classList.toggle('mouse-locked',!!LockedDoc());updateFocusText();
  dispatchEvent(new Event('game-mouse-change'));
});
DocOn('pointerlockerror',()=>{tbKey.textContent='Mouse capture unavailable. Click the screen to retry.';});
const overCanvas=e=>{const r=canvas.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<r.right&&e.clientY>=r.top&&e.clientY<r.bottom?r:null;};
const mapAbs=(e,r)=>{msX=Math.max(0,Math.min(639,Math.round((e.clientX-r.left)/r.width*640)));msY=Math.max(0,Math.min(479,Math.round((e.clientY-r.top)/r.height*480)));};
const keepsFocus=t=>t&&(t.closest('#frame')||t.closest('.win-pass')||t.closest('.keyswin')||t.closest('#keysbar')||(t.tagName==='BUTTON'&&t.closest('.toolbar')));
const releasesFocus=t=>t&&(t.tagName==='TEXTAREA'||t.tagName==='INPUT'||t.tagName==='SELECT'||t.closest('.overlay'));
$("frame").addEventListener('mousedown',e=>{
  if(e.target!==canvas && (e.target!==e.currentTarget ||
    !e.currentTarget.classList.contains('fsmode')))return;
  if(document.body.classList.contains('touch'))return;
  win_slot=-1;win_task=win_num=0;
  e.preventDefault();canvas.focus({preventScroll:true});setFocused(true);
  if(captureWanted()&&!locked()){requestCapture();return;} // Capture click must not fire a weapon.
  if(!relativeMouse())mapAbs(e,canvas.getBoundingClientRect());
  msB|=btnBit(e);notifyInput();
});
DocOn('mouseup',e=>{if(msB){msB&=~btnBit(e);notifyInput();}});
DocOn('mousemove',e=>{
  if(document.body.classList.contains('touch'))return;
  if(locked()){mouseDX+=e.movementX;mouseDY+=e.movementY;notifyInput();return;}
  if(captureWanted())return; // A released mouse cannot steer a waiting game.
  if(e.target!==canvas){hybridTracking=false;return;}
  const r=overCanvas(e);if(r){
    win_slot=-1;win_task=win_num=0;
    if(relativeMouse()){
      if(!focused){hybridTracking=false;return;}
      if(hybridTracking){mouseDX+=e.movementX;mouseDY+=e.movementY;}
      hybridTracking=true;
    }
    else mapAbs(e,r);
    notifyInput();
  }
});
DocOn('mousedown',e=>{
  if(e.target?.closest?.('.win-pass-owned'))return;
  if(releasesFocus(e.target)||!keepsFocus(e.target))setFocused(false);
},true);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{if(!focused)return;wheelZ+=e.deltaY>0?1:-1;e.preventDefault();notifyInput();},{passive:false});
const keysToOS=e=>{
  if(e?.target?.closest?.('.win-pass-owned'))return false;
  if(e?.target?.closest?.('textarea,input,select,button,[role=button],[contenteditable=true]'))return false;
  if((e?.target?.ownerDocument || document).querySelector('.overlay.open:not(.free):not(.win-pass-owned)'))return false;
  return focused||document.body.classList.contains('touch');
};
ViewOn('keydown',e=>{
  if(!keysToOS(e))return;
  if((e.ctrlKey||e.metaKey)&&e.code==='KeyV')return;
  if(e.code==='Escape'){
    if(locked()){hybridMouse=true;explicitCapture=false;LockedDoc()?.exitPointerLock();releaseHeld();return;}
    if(!e.repeat)keyboard.tap(KEY.Escape);e.preventDefault();return;
  }
  if(e.ctrlKey&&e.code==='BracketLeft'){if(!e.repeat)keyboard.tap(KEY.Escape);e.preventDefault();return;}
  const sc=KEY[e.code];if(sc!==undefined){if(!e.repeat)keyboard.down(e.code,sc);e.preventDefault();}
});
ViewOn('keyup',e=>{
  if(KEY[e.code]===undefined||e.code==='Escape')return;
  keyboard.up(e.code);
  if(keysToOS(e))e.preventDefault();
});
ViewOn('blur',releaseOSInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseOSInput();});
setInterval(()=>{if(os_game.active)notifyInput();},250);
const inputMessage=()=>{
  const message={cmd:'input',x:msX,y:msY,b:msB,wheel:wheelZ,keys:keyq.splice(0),held:keyboard.held(),keysUp,relative:win_slot<0 && relativeMouse(),dx:mouseDX,dy:mouseDY,reset:resetInput,winSlot:win_slot,winTask:win_task,winNum:win_num};
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
ViewOn("paste",function (e) {
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
  const fsEl = () => frame.ownerDocument.fullscreenElement || frame.ownerDocument.webkitFullscreenElement;
  const fsExitReal = () => (frame.ownerDocument.exitFullscreen || frame.ownerDocument.webkitExitFullscreen).call(frame.ownerDocument);
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
    const el = frame.ownerDocument.fullscreenElement || frame.ownerDocument.webkitFullscreenElement;
    if (el === frame) {
      fsUi(true);
      try { await navigator.keyboard?.lock?.(); dbg("keyboard locked (Esc stays in the OS)"); } catch {}
      if (!document.body.classList.contains("touch")) setFocused(true);
    } else if (!fake) { fsUi(false); try { navigator.keyboard?.unlock?.(); } catch {} }
  };
  DocOn("fullscreenchange", onFsChange);
  DocOn("webkitfullscreenchange", onFsChange);
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
{ // The mouse: the real TempleOS pointer. The Cursor.png arrow (recolored white) rides the
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
      e.target?.closest('.wszr,.wszb,.wszcorner,[data-native-cursor]') ||
      document.fullscreenElement?.matches('video')?'hidden':'visible';
  };
  window.__desktopCursor={enabled:xcOn,move:moveCursor,hide:hideCursor};
  if (xcOn) {
    addEventListener('pointermove',e=>moveCursor(e),{passive:true});
    document.addEventListener('mouseleave',hideCursor);
    ViewOn('blur',hideCursor);
  }
}
const touchMouse={
  position:()=>[msX,msY],
  move(x,y) {mouseDX+=x-msX;mouseDY+=y-msY;msX=x;msY=y;notifyInput();},
  buttons(mask) {msB=mask;notifyInput();},
};
DocOn('pointerdown',e=>{
  if(e.target===canvas){win_slot=-1;win_task=win_num=0;setFocused(true);}
  else if(e.target===os_game.ed?.inputCanvas())setFocused(false);
},true);
MobileInput({frame:$("frame"),target:()=>{
  const ed=previewInput();
  if(ed)return {canvas:ed.inputCanvas(),mouse:ed.touchMouse,keys:ed.keyInput};
  return {canvas,mouse:touchMouse,keys:()=>keyboard};
}});

const speaker=Speaker();
function SoundStart() {speaker.Resume().catch(error=>dbg("speaker: "+error.message,true));}
ViewOn("pointerdown",SoundStart);
ViewOn("keydown",SoundStart);

//Desktop uses four guest CPUs. Only a stock boot failure can fall back to one;
//running faults retain their stopped machine until restart.
const isMobileDev=self.hemuBoot.mobile;
let useSMP=self.hemuBoot.smp;
const DISK_DELAY=isMobileDev?2500:0;   //phones keep the disk out of the boot's memory peak
let snapshotInfo=null,bootFile=null,resumeSession=false,sessionRevision=null;

// ---- downloads the compressed RAM snapshot, the four-core one when useSMP ----
let gzBytes;
async function downloadSnapshot(smp=useSMP,generation=osGen) {
  const progress=(text,pct)=>{if(generation===osGen)setLoad(text,pct);};
  progress("downloading the TempleOS RAM snapshot…", 5);
  //The site redirects to a CDN path named by the engine's commit, which never
  //changes, so a cached copy needs no round trip.
  const early=self.hemuBoot;
  self.hemuBoot=null;
  if (early && early.smp!=smp) early.abort.abort();
  const gz=await (early?.smp==smp && early.response?early.response:
    fetch(smp?"./hemu/live-smp.bin.gz":"./hemu/live.bin.gz",{priority:"high"}));
  if (!gz.ok) { progress("failed to fetch snapshot (" + gz.status + ")"); throw new Error("snapshot fetch"); }
  const total = +gz.headers.get("content-length") || 10300000;   // hemu/live.bin.gz
  const reader = gz.body.getReader(); const chunks = []; let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; progress(`downloading snapshot… ${(got/1048576).toFixed(1)} MB`, 5 + 45 * got / total); }
  const buf = await new Blob(chunks).arrayBuffer();
  if(generation===osGen)dbg(`snapshot downloaded (${(got/1048576).toFixed(1)} MB)`);
  return buf;
}

let restarting = false, osGen = 0;
async function restartOS() {
  if (restarting) return; restarting = true;
  try {
    dbg("↻ restarting TempleOS (reloading the OS, keeping your windows)…");
    OsNotice();
    dispatchEvent(new CustomEvent("osstate",{detail:{ready:false,
      msg:"TempleOS is restarting."}}));
    osGen++;
    releaseOSInput();guestCapture=false;explicitCapture=false;os_game.active=false;keyq.length=0;updateFocusText();
    ld.style.display = "";
    setLoad("restarting TempleOS…", 0);
    if (!stockBoot || !gzBytes) gzBytes = await downloadSnapshot();
    snapshotInfo=null;resumeSession=false;sessionRevision=null;stockBoot=true;
    if(await bootEngine(true)) {
      resetPause();fpsMeter.reset();updateFps();started=false;framed=false;
    }
  } catch (e) { setLoad("restart failed: " + (e.message || e)); dbg("restart failed: " + (e.message || e), true); }
  finally {
    restarting=false;
    if (started && framed)
      dispatchEvent(new CustomEvent("osstate",{detail:{ready:true}}));
  }
}
$("restartBtn").addEventListener("click", restartOS);

// the running engine, for the Disk window and the guest requests
const engine=MachineShared({message:EngineMessage,error:EngineError,earlyWorker:self.hemuEarly});
self.hemuEarly=null;
const os_cfg=CfgRead();
let cfg_status={ready:false,ok:true,msg:"Settings apply when TempleOS starts."};
let stockBoot=true;

function CfgRead()
{
  let cfg={rate:0,repeat:false,fast:true,pass:false},saved;
  try {
    saved=JSON.parse(localStorage.getItem("tos-settings"));
    if ([0,30,60,120].includes(saved?.rate))
      cfg.rate=saved.rate;
    if (typeof saved?.repeat=="boolean")
      cfg.repeat=saved.repeat;
    if (typeof saved?.fast=="boolean")
      cfg.fast=saved.fast;
    if (typeof saved?.pass=="boolean")
      cfg.pass=saved.pass;
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
    if (typeof change.fast=="boolean")
      os_cfg.fast=change.fast;
    if (typeof change.pass=="boolean") {
      os_cfg.pass=change.pass;
      WinPassApply();
    }
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

function WinPassInput(state)
{//Detached windows keep the same keyboard and button state as the screen.
  if (state.focus)
    setFocused(true);
  if (state.slot!==undefined) {
    win_slot=state.slot;
    win_task=state.task || 0;
    win_num=state.num || 0;
  }
  if (state.x!==undefined) {
    msX=state.x;
    msY=state.y;
  }
  if (state.buttons!==undefined)
    msB=state.buttons;
  if (state.wheel)
    wheelZ+=state.wheel;
  notifyInput();
}

export function OsWinPassStatus()
{
  return win_pass_msg;
}

export async function OsWinPassReturn()
{
  if (win_pass) await win_pass.Return();
}

async function WinPassApply()
{//Neither passthrough code nor native guest code loads until selected.
  let on=os_cfg.pass && win_pass_ready && !paused && engine.owner!==false;
  if (!on) {
    win_pass_msg="Window passthrough is off.";
    if (os_cfg.pass) {
      win_pass_msg="Window passthrough starts when TempleOS is ready.";
      if (paused)
        win_pass_msg="Windows returned while TempleOS is paused.";
    }
    dispatchEvent(new CustomEvent("winpasssettings",{
      detail:{msg:win_pass_msg}}));
  }
  if (on && !win_pass) {
    if (!win_pass_load)
      win_pass_load=import("./WinPass.js").then(function (m) {
        win_pass=m.WinPass({canvas,pal:pal32,Request:engine.Request,
          Input:WinPassInput,Status:function (msg) {
            win_pass_msg=msg;
            dispatchEvent(new CustomEvent("winpasssettings",{detail:{msg}}));
          }});
      }).catch(function (e) {
        win_pass_load=null;
        win_pass_msg="Window passthrough could not load: "+e.message;
        dispatchEvent(new CustomEvent("winpasssettings",{
          detail:{msg:win_pass_msg}}));
      });
    await win_pass_load;
    on=os_cfg.pass && win_pass_ready && !paused && engine.owner!==false;
  }
  if (win_pass && on!=win_pass_state) {
    win_pass_state=on;
    await win_pass.Enable(on);
  }
}

addEventListener("osstate",function (e) {
  win_pass_ready=e.detail.ready;
  WinPassApply();
});

// ---- engine: one worker, or the multi-core one below ----
let importDisk = null;   // a disk image imported before the reload
function engineFail(why) {
  speaker.Stop();
  started=false;framed=false;engine.Stop(String(why));
  ld.style.display = ""; setLoad("The emulator could not start (" + why + "). Tap ↻ Restart.", 0);
  dbg("engine failed: " + why, true);
  dispatchEvent(new CustomEvent("osstate",{detail:{ready:false,msg:String(why)}}));
}
function engineFault(why) {
  osFault=true;
  ++pauseRevision;
  setPaused(true);
  pauseBtn.disabled=true;
  OsNotice(String(why)+" TempleOS is paused. Restart TempleOS to retry.");
  dbg(why,true);
  dispatchEvent(new CustomEvent("osstate",{detail:{ready:false,msg:String(why)}}));
}
function singleCore(why,generation=osGen) {   // multi-core failed before its first frame
  if(generation!==osGen)return;
  dbg("SMP engine failed (" + why + ") - falling back to single core", true);
  useSMP = false;
  downloadSnapshot().then(b => {
    if(generation!==osGen)return;
    gzBytes=b;bootEngine();
  }).catch(e=>{if(generation===osGen)engineFail(e.message);});
}
function EngineError({msg,retained,started,cores,code})
{
  if (code==="SESSION_STALE") {
    if (resumeSession) restartOS();
    return;
  }
  if(retained)engineFault(msg);
  else if(!started&&cores===4&&stockBoot)singleCore(msg);
  else engineFail(msg);
}
function EngineMessage(m)
{
  if (m.cmd==="bootNeeded") {
    OsBoot().catch(engineFail);
  } else if (m.cmd==="owner") {
    if (!m.value) releaseOSInput();
    WinPassApply();
    dispatchEvent(new CustomEvent("osownership",{detail:{owner:m.value}}));
  } else if (m.cmd==="restarting" || m.cmd==="starting") {
    if ((started || framed) && !restarting) osGen++;
    started=framed=false;
    ld.style.display="";setLoad("Restoring TempleOS…",0);
    resetPause();releaseOSInput();
    dispatchEvent(new CustomEvent("osstate",{detail:{ready:false}}));
  } else if(m.cmd==="frame") {
    if(!framed&&stockBoot&&engine.kind==="worker"&&document.body.classList.contains("touch"))gzBytes=null;
    blit(new Uint8Array(m.buf),m.w,m.h,true,m);firstFrame();
  } else if(m.cmd==="snd")speaker.Tone(m.f,m.ns);
  else if(m.cmd==="progress"){setLoad(m.text,m.pct);dbg(m.text);}
  else if(m.cmd==="palette")updatePalette(m.index,m.rgb);
  else if(m.cmd==="windows")win_pass?.Receive(m);
  else if(m.cmd==="smpReady")dbg("SMP: "+m.ncore+" cores running in parallel");
  else if(m.cmd==="log")dbg(m.msg);
  else diskMsg(m);
}
async function bootEngine(restart=false)
{
  notifyInput=()=>engine.post(inputMessage());
  const boot={gz:gzBytes,cores:useSMP?4:1,saved:snapshotInfo,fixedB:FIXED_B,
    diskBytes:importDisk,diskDelay:DISK_DELAY,sessionRevision,...os_cfg};
  importDisk=null;
  const ready=await (restart?engine.Restart(boot):engine.Start(boot,resumeSession));
  if(ready) {speaker.Stop();speaker.Pause(snapshotInfo?.meta.paused??(restart?false:paused));framed=false;}
  return ready;
}

// ---- Pause / Play ----
let paused = false, pauseRevision = 0, osFault=false;
const pauseBtn = $("pauseBtn");
const pauseShow = () => { pauseBtn.innerHTML = '<span class="ico"><svg><use href="#i-' + (paused ? "play" : "pause") + '"/></svg></span> ' + (paused ? "Play" : "Pause"); };
const setPaused = value => { if (osFault && !value) return; paused = value; speaker.Pause(paused); fpsMeter.setPaused(paused); updateFps(); engine.post({ cmd: "pause", value: paused }); pauseShow(); WinPassApply(); };
pauseBtn.addEventListener("click", () => { ++pauseRevision; setPaused(!paused); });
const holdOSForGame = () => {
  const previous=paused, revision=pauseRevision;setPaused(true);
  return () => { if(pauseRevision===revision)setPaused(previous); };
};
const resetPause = () => { ++pauseRevision; paused = false; osFault=false; pauseBtn.disabled=false; fpsMeter.setPaused(false); updateFps(); pauseShow(); };

// ---- requests to the guest, matched to their replies by id; the Disk window shows the rest ----
const diskMsg = (m) => {
  if (m.cmd=="sessionSave") {
    if (m.state=="saved") {
      try {localStorage.setItem("tos-session-saved",String(m.savedAt));} catch {}
    }
    dispatchEvent(new CustomEvent("sessionsave",{detail:m}));
    if (m.state=="error") OsNotice(m.msg);
  }
  if (m.cmd=="diskSave") {
    os_disk.save=m;
    dispatchEvent(new CustomEvent("disksave",{detail:m}));
    if(m.state=="error") {dbg(m.msg,true);OsNotice(m.msg);}
    return;
  }
  if (m.cmd==="paused") {
    if(osFault&&!m.value)return;
    if (paused!==m.value) pauseRevision++;
    paused=m.value;
    speaker.Pause(paused);
    fpsMeter.setPaused(paused);
    updateFps();
    pauseShow();
    WinPassApply();
    return;
  }
  if (m.cmd==="restored") {
    if ([0,30,60,120].includes(cfg_status.rate))
      os_cfg.rate=cfg_status.rate;
    os_cfg.repeat=cfg_status.repeat;
    if (typeof cfg_status.fast==="boolean")
      os_cfg.fast=cfg_status.fast;
    dispatchEvent(new CustomEvent("osrestored",{detail:{...os_cfg}}));
    return;
  }
  if (m.cmd==="settings") {
    cfg_status={...m,ready:true};
    if(typeof m.fast==="boolean") {
      os_cfg.fast=m.fast;
      if(!m.ok) {
        try {localStorage.setItem("tos-settings",JSON.stringify(os_cfg));}
        catch {dbg("Settings work for this visit; browser storage is unavailable.");}
      }
    }
    dispatchEvent(new CustomEvent("ossettings",{detail:cfg_status}));
    return;
  }
  if (m.cmd === "inputMode") { guestInputMode(m); return; }
  if (m.cmd === "guestResult" && ["failed","error"].includes(m.state) && m.op === "launch") os_game.launchFail?.(m.msg);
  os_disk.msg?.(m);
};
const osRequest=(message,transfer=[])=>engine.Request(message,transfer);
const listOSDir=dir=>osRequest({cmd:"listDir",dir});
export function OsFileRead(path) {return osRequest({cmd:"readFile",path});}
export function OsSessionSave() {return osRequest({cmd:"saveSession"});}
async function writeOSFile(path,bytes)
{
  if (paused)
    return {ok:false,msg:"Resume TempleOS before saving files."};
  return osRequest({cmd:"osWrite",path,name:path.split("/").pop(),run:false,bytes},[bytes]);
}
const uploadToHome = (name, text, run) => {
  const bytes = new TextEncoder().encode(text).buffer;
  return osRequest({cmd:"osWrite",name,path:"C:/Home/"+name,run:!!run,bytes},[bytes]);
};
const launchInOS = (opts) => osRequest({cmd:"osLaunch",...opts});


// ---- topbar: last key pressed (focus-state text is owned by setFocused) ----
ViewOn("keydown", (e) => {
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
  if(generation!==osGen) {
    return;
  }
  const attached=await engine.Connect?.();
  notifyInput=()=>engine.post(inputMessage());
  engine.Visible?.(!document.hidden);
  if (attached && !attached.boot && !file && !boot_query.get("disk")) {
    self.hemuBoot?.abort.abort();self.hemuBoot=null;
    useSMP=attached.cores===4;
    return;
  }
  if (!file && !boot_query.get("disk")) {
    let store=await DiskStoreOpen(function () {},true);
    try {
      const session=await store?.SessionRead();
      if (session) {snap=session.bytes;resumeSession=true;sessionRevision=session.revision;}
    } catch (e) {dbg("Session restore unavailable: "+e.message,true);}
    finally {store?.Close();}
  }
  snap=snap || file?.snapshot;disk=file?.disk;
  if (file?.kind=="snapshot")snap=file.bytes;
  else if (file?.kind=="disk")disk=file.bytes;
  if (!snap && !disk && boot_query.get("disk"))
    disk=await UrlDiskRead(boot_query.get("disk"));
  if (snap) {
    self.hemuBoot?.abort.abort();self.hemuBoot=null;
    setLoad(resumeSession?"Restoring saved session…":"Checking imported snapshot…",40);
    info=await SnapshotInspect(snap,{busProtocol:BUS_VERSION});
    if(generation!==osGen)return;
    if(!info)smp=(await StockInspect(snap)).cores===4;
    if(generation!==osGen)return;
    if (info) {
      smp=info.meta.cores>1;
      if (smp && !self.crossOriginIsolated)
        throw new Error("This snapshot needs shared memory for its four CPUs. "+
          "Open the site in a browser that supports cross-origin isolation.");
    }
    if(smp&&!self.crossOriginIsolated)throw new Error("This captured RAM needs shared memory for its four CPUs.");
    bytes=snap;
    setLoad(resumeSession?"Loading saved session…":"Loading imported snapshot…",50);
  } else {
    engine.Warm(smp?4:1);
    bytes=await downloadSnapshot(smp);
  }
  if(generation!==osGen) {
    return;
  }
  bootFile=file;importDisk=disk;snapshotInfo=info;stockBoot=!snap;useSMP=smp;gzBytes=bytes;
  await bootEngine(!!attached && !attached.boot);
  if (boot_query.get("run"))
    UrlRun(boot_query.get("run"),generation);
}

async function UrlDiskRead(url)
{//?disk= boots a raw or gzipped C: image from this site.
  let res=await fetch(url),body=res.body;
  if (!res.ok)
    throw new Error("Could not fetch the disk "+url);
  if (/\.gz$/i.test(url))
    body=body.pipeThrough(new DecompressionStream("gzip"));
  return new Response(body).arrayBuffer();
}

async function UrlRun(path,generation)
{//?run= runs a program once the guest's prompt takes it.
  let i;
  for (i=0;i<90 && generation===osGen;i++) {
    await new Promise(Resolve=>setTimeout(Resolve,2000));
    if ((await launchInOS({path,name:path.split("/").pop().replace(/\..*$/,""),
	  focus:true})).ok)
      return;
  }
}

function OsGen()
{//Counts restarts, so a game install can tell the OS it began on is gone.
  return osGen;
}

const firstBoot=osGen;
OsBoot().catch(error=>{if(firstBoot===osGen)engineFail(error);});
addEventListener("pointerdown",function () {engine.Claim?.();},true);
addEventListener("focus",function () {engine.Claim?.();});
document.addEventListener("visibilitychange",function () {
  engine.Visible?.(!document.hidden);
  if (!document.hidden) engine.Claim?.();
});
addEventListener("pagehide",function (e) {
  if (engine.Detach) {
    if (e.persisted) engine.Visible(false);
    else engine.Detach();
  } else if (!e.persisted) engine.Stop();
});
addEventListener("pageshow",function (e) {
  if (e.persisted) {engine.Visible?.(true);engine.Claim?.();}
});
export {$,dbg,engine,pal32,OsGen,releaseOSInput as OsInputRelease,releaseHeld as OsInputReset,
  setGameCapture as OsCaptureSet,holdOSForGame as OsHold,writeOSFile as OsFileWrite,listOSDir as OsDirList,
  uploadToHome as OsHomeWrite,launchInOS as OsLaunch};
