//The page's side of TempleOS: it boots the engine in workers, draws its
//frames and sends it the keyboard, mouse, touch and sound. The windows the
//Menu opens import what they need from here.
import {createFrameBlitter,screenFit} from "./framebuffer.js";
import {createGuestFpsMeter} from "./guest-fps.js";
import "./xsel.js";   // TempleOS-style invert-on-select (desktop)

const $ = (id) => document.getElementById(id);
const dbg = (s, err) => (err ? console.warn : console.log)("[hemu] " + s);
dbg("hemu host starting…");
addEventListener("error", (e) => dbg("JS: " + e.message, true));
export const os_game = { active: false, mouse: null, launchFail: null, ed: null };   // games.js and EditorWin.js fill these
export const os_disk = { msg: null };   // DiskWin.js

const PALETTE = [
  [0x00,0x00,0x00],[0x00,0x00,0xaa],[0x00,0xaa,0x00],[0x00,0xaa,0xaa],
  [0xaa,0x00,0x00],[0xaa,0x00,0xaa],[0xaa,0x55,0x00],[0xaa,0xaa,0xaa],
  [0x55,0x55,0x55],[0x55,0x55,0xff],[0x55,0xff,0x55],[0x55,0xff,0xff],
  [0xff,0x55,0x55],[0xff,0x55,0xff],[0xff,0xff,0x55],[0xff,0xff,0xff],
];
const pal32 = new Uint32Array(16);
for (let i = 0; i < 16; i++) { const [r,g,b] = PALETTE[i]; pal32[i] = (255<<24)|(b<<16)|(g<<8)|r; }

const canvas = $("canvas");
const ctx = canvas.getContext("2d");
const updatePalette=(index,rgb)=>{if(index>=0&&index<16)pal32[index]=(0xff000000|((rgb&255)<<16)|(rgb&0xff00)|((rgb>>>16)&255))>>>0;};
const drawFrame = createFrameBlitter(ctx, pal32);
const ld = $("loadui"), ldtext = $("ldtext"), ldbar = $("ldbar");
const tbFps = $("tb-fps"), tbKey = $("tb-key");
const fpsMeter = createGuestFpsMeter();
tbFps.title = 'TempleOS window-manager FPS. Zero when paused or rendering has stopped.';
const updateFps = () => { const text=fpsMeter.text(); if(tbFps.textContent!==text)tbFps.textContent=text; };
document.addEventListener('visibilitychange',()=>{if(!document.hidden){fpsMeter.reset();updateFps();}});
const setLoad = (s, pct) => { ldtext.textContent = s; if (pct != null) ldbar.style.width = pct + "%"; };

// ---- sizes the screen: whole blocks per guest pixel, smoothed the rest of the way (see framebuffer.js) ----
// The CSS decides how much room there is, so the size set here comes off to measure it.
const fitScreen = () => {
  canvas.style.width = canvas.style.height = "";
  const room = canvas.getBoundingClientRect();
  if (!room.width) return;
  const fit = screenFit(room.width, room.height, devicePixelRatio);
  canvas.style.width = fit.cssWidth + "px"; canvas.style.height = fit.cssHeight + "px";
  canvas.style.imageRendering = fit.smooth ? "auto" : "pixelated";
  drawFrame.resize(fit.width, fit.height);
};
fitScreen();
addEventListener("resize", fitScreen);
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

let presentCount = 0;
function blit(idx, w, h, immutable = false, stats = null) {
  presentCount++;
  drawFrame(idx,w,h,immutable);
  if(stats)fpsMeter.sample(stats.fps,stats.updates);
}
let started = false;
function firstFrame() { if (started) return; started = true; ld.style.display = "none"; dbg("TempleOS desktop up"); }
let notifyInput = () => {};
const FIXED_B = +((new URLSearchParams(location.search)).get("b")) || 0;
{ let staleBlits = 0;
  setInterval(() => {
    updateFps();
    // beep watchdog: if the guest froze mid-tone (e.g. a game that hangs on launch), the PC-speaker
    // oscillator is stuck on with no Snd(0) coming - mute it after ~1.5s of no new frames.
    if (presentCount === 0 && !fpsMeter.paused && !document.hidden) { if (++staleBlits >= 3 && gain && gain.gain.value > 0) gain.gain.value = 0; }
    else staleBlits = 0;
    presentCount = 0; }, 500); }
// one-time banner shown when a heavy game freezes the single-core engine -> 1-click switch to multi-core

// ---- input: a host-owned cursor + a set-1 scancode queue, pulled by snapshot.HC each frame ----
let msX = 320, msY = 240, msB = 0, wheelZ = 0;
const held = new Set();        // scancodes currently down (for hold-to-move + simultaneous keys while a game is active)
const keyq = [];
const SC = {
  Escape:0x01,
  Digit1:0x02,Digit2:0x03,Digit3:0x04,Digit4:0x05,Digit5:0x06,Digit6:0x07,Digit7:0x08,
  Digit8:0x09,Digit9:0x0A,Digit0:0x0B,Minus:0x0C,Equal:0x0D,Backspace:0x0E,Tab:0x0F,
  KeyQ:0x10,KeyW:0x11,KeyE:0x12,KeyR:0x13,KeyT:0x14,KeyY:0x15,KeyU:0x16,KeyI:0x17,KeyO:0x18,KeyP:0x19,
  BracketLeft:0x1A,BracketRight:0x1B,Enter:0x1C,ControlLeft:0x1D,ControlRight:0x1D,
  KeyA:0x1E,KeyS:0x1F,KeyD:0x20,KeyF:0x21,KeyG:0x22,KeyH:0x23,KeyJ:0x24,KeyK:0x25,KeyL:0x26,
  Semicolon:0x27,Quote:0x28,Backquote:0x29,ShiftLeft:0x2A,Backslash:0x2B,
  KeyZ:0x2C,KeyX:0x2D,KeyC:0x2E,KeyV:0x2F,KeyB:0x30,KeyN:0x31,KeyM:0x32,
  Comma:0x33,Period:0x34,Slash:0x35,ShiftRight:0x36,AltLeft:0x38,AltRight:0x38,Space:0x39,
  CapsLock:0x3A,F1:0x3B,F2:0x3C,F3:0x3D,F4:0x3E,F5:0x3F,F6:0x40,F7:0x41,F8:0x42,F9:0x43,F10:0x44,F11:0x57,F12:0x58,
  Home:0x47,PageUp:0x49,End:0x4F,PageDown:0x51,Insert:0x52,Delete:0x53,
  ArrowUp:0x48,ArrowLeft:0x4B,ArrowRight:0x4D,ArrowDown:0x50,
};
// Bits 8+ of each queued scancode carry real keystroke-timing entropy: TempleOS feeds GetTSC
// samples at key IRQs to its God apps (GodBitsIns), and the emulated tsc alone is deterministic.
const ent = () => ((((performance.now() * 1000) >>> 0) ^ (Math.random() * 0x10000)) & 0xFFFF) * 256;
const pushKey = (sc) => { keyq.push(sc | ent()); notifyInput(); };

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
  const released=[...held];held.clear();
  for(const s of released)keyq.push((s|0x80)|ent());
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
canvas.addEventListener('mousedown',e=>{
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
  if(e?.target?.closest?.('textarea,input,select,[contenteditable=true]'))return false;
  if(document.querySelector('.overlay.open:not(.free)'))return false;
  return focused||document.body.classList.contains('touch');
};
addEventListener('keydown',e=>{
  if(!keysToOS(e))return;
  if((e.ctrlKey||e.metaKey)&&e.code==='KeyV')return;
  if(e.code==='Escape'){
    if(locked()){hybridMouse=true;explicitCapture=false;document.exitPointerLock();releaseHeld();return;}
    if(!e.repeat){pushKey(0x01);pushKey(0x81);}e.preventDefault();return;
  }
  if(e.ctrlKey&&e.code==='BracketLeft'){pushKey(0x01);pushKey(0x81);e.preventDefault();return;}
  const sc=SC[e.code];if(sc!==undefined){held.add(sc);if(!e.repeat)pushKey(sc);e.preventDefault();}
});
addEventListener('keyup',e=>{
  const sc=SC[e.code];if(sc===undefined||e.code==='Escape')return;
  if(held.delete(sc))pushKey(sc|0x80);
  if(keysToOS(e))e.preventDefault();
});
addEventListener('blur',releaseOSInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseOSInput();});
setInterval(()=>{if(os_game.active)notifyInput();},250);
const inputMessage=()=>{
  const message={cmd:'input',x:msX,y:msY,b:msB,wheel:wheelZ,keys:keyq.splice(0),held:[...held],relative:relativeMouse(),dx:mouseDX,dy:mouseDY,reset:resetInput};
  mouseDX=mouseDY=0;resetInput=false;return message;
};

// ---- paste INTO the OS (Ctrl/Cmd+V): convert clipboard text to US-layout set-1 scancodes and feed
//      the key queue. This types each char EXACTLY (incl. ~, ", etc.) regardless of the user's real
//      keyboard layout - the fix for "~ comes out as a quote" and for pasting commands/code. ----
const CHAR2SC = (() => {
  const m = {}, L = { a:0x1E,b:0x30,c:0x2E,d:0x20,e:0x12,f:0x21,g:0x22,h:0x23,i:0x17,j:0x24,k:0x25,l:0x26,m:0x32,n:0x31,o:0x18,p:0x19,q:0x10,r:0x13,s:0x1F,t:0x14,u:0x16,v:0x2F,w:0x11,x:0x2D,y:0x15,z:0x2C };
  for (const c in L) { m[c] = [L[c], 0]; m[c.toUpperCase()] = [L[c], 1]; }                 // letters (+ Shift for caps)
  const DSC = [0x0B,0x02,0x03,0x04,0x05,0x06,0x07,0x08,0x09,0x0A], DSH = ")!@#$%^&*(";      // digits + their shifted symbols
  for (let i = 0; i < 10; i++) { m[String(i)] = [DSC[i], 0]; m[DSH[i]] = [DSC[i], 1]; }
  Object.assign(m, { "-":[0x0C,0],"_":[0x0C,1],"=":[0x0D,0],"+":[0x0D,1],"[":[0x1A,0],"{":[0x1A,1],"]":[0x1B,0],"}":[0x1B,1],
    ";":[0x27,0],":":[0x27,1],"'":[0x28,0],'"':[0x28,1],"`":[0x29,0],"~":[0x29,1],"\\":[0x2B,0],"|":[0x2B,1],
    ",":[0x33,0],"<":[0x33,1],".":[0x34,0],">":[0x34,1],"/":[0x35,0],"?":[0x35,1]," ":[0x39,0],"\t":[0x0F,0] });
  return m;
})();
let pasting = false;
async function pasteToOS(text) {
  if (!text || pasting) return;
  pasting = true;
  keyq.push(0x9D | ent(), 0xAA | ent(), 0xB6 | ent()); notifyInput();   // release Ctrl/Shift held from the Ctrl+V chord
  await new Promise((r) => setTimeout(r, 250));            // let the prompt/AutoComplete settle before the first key
  for (const ch of text) {
    if (ch === "\n" || ch === "\r") keyq.push(0x1C | ent(), 0x9C | ent());   // newline -> Enter
    else { const e = CHAR2SC[ch]; if (!e) continue;        // skip anything we can't map
      const sc = e[0];
      if (e[1]) keyq.push(0x2A | ent());                   // Shift down
      keyq.push(sc | ent()); notifyInput();                // key DOWN
      await new Promise((r) => setTimeout(r, 45));         // hold the key a human-ish moment before release
      keyq.push((sc | 0x80) | ent());                      // key UP
      if (e[1]) keyq.push(0xAA | ent()); }                 // Shift up
    notifyInput();
    await new Promise((r) => setTimeout(r, 65));           // gap between chars - a scancode burst overruns the OS line-editor/AutoComplete ("#include"->"slude")
  }
  pasting = false;
}
addEventListener("paste", (e) => {
  if (!keysToOS(e)) return;                                 // only when keystrokes are routed to the OS (not the editor/search box)
  const cd = e.clipboardData || window.clipboardData;
  const text = cd && cd.getData("text");
  if (!text) return;
  e.preventDefault();
  pasteToOS(text);
});

// ---- fullscreen, mobile included. Real Fullscreen API where available; iPhone Safari has
//      none for elements, so we pin the frame over the viewport ("fakefs"). In either mode
//      the touch controls stay (they live inside #frame) and the keys bar floats on top. ----
{ const frame = $("frame");
  let fake = false;
  // Touch fullscreen layout: keep the controls above the on-screen keyboard and the [X] out of
  // the OS view. VisualViewport reports the keyboard height (it shrinks the visual viewport on
  // both iOS and Android) - so tapping the joystick/buttons while typing stays usable.
  const vv = window.visualViewport;
  const layoutFs = () => {
    const onFs = document.body.classList.contains("touch") && frame.classList.contains("fsmode");
    if (!onFs) { frame.style.removeProperty("--kbinset"); frame.style.removeProperty("--fsx-top"); frame.classList.remove("fsx-mid"); return; }
    const kb = vv ? Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop)) : 0;   // ≈ keyboard height
    const lift = Math.min(kb, Math.max(0, innerHeight - 140));        // keep the 124px joystick fully on-screen
    frame.style.setProperty("--kbinset", lift + "px");               // lifts joystick + L/R + ⌨ above the keyboard
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
    layoutFs(); requestAnimationFrame(layoutFs);     // position controls/[X]; recompute once the layout settles
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

// ---- on-screen function/modifier keys (desktop + mobile). Modifiers latch until the next
//      non-modifier key from this bar; Win is the E0-extended pull-down-menu key. ----
{ const bar = $("keysbar");
  const E0 = "E0";   // marker: extended scancode
  const KEYS = {Esc:[0x01],F1:[0x3B],F2:[0x3C],F3:[0x3D],F4:[0x3E],F5:[0x3F],F6:[0x40],F7:[0x41],
                F8:[0x42],F9:[0x43],F10:[0x44],F11:[0x57],F12:[0x58],
                Enter:[0x1C],Space:[0x39],   // many games wait on Enter/Space at a title/setup screen - reachable on touch too
                Tab:[0x0F],Ctrl:[0x1D,"mod"],Alt:[0x38,"mod"],Shift:[0x2A,"mod"],Win:[0x5B,"mod",E0],
                Ins:[0x52],Del:[0x53],Home:[0x47],End:[0x4F],PgUp:[0x49],PgDn:[0x51]};   // index.html has the buttons
  const latched = new Map();   // sc -> {e0}
  const mk = (sc, e0) => { if (e0) pushKey(0xE0); pushKey(sc); };
  const br = (sc, e0) => { if (e0) pushKey(0xE0); pushKey(sc | 0x80); };
  for (const b of bar.children) {
    const [sc, mod, e0] = KEYS[b.textContent];
    b.addEventListener("pointerdown", (e) => { e.preventDefault();
      if (mod) {
        if (latched.has(sc)) { latched.delete(sc); b.classList.remove("on"); br(sc, e0); }
        else { latched.set(sc, { e0, btn: b }); b.classList.add("on"); mk(sc, e0); }
      } else {
        mk(sc, e0); setTimeout(() => { br(sc, e0);
          for (const [m, info] of latched) { br(m, info.e0); info.btn.classList.remove("on"); }
          latched.clear(); }, 80);
      } });
  }
}

// ---- touch controls: direct touch = absolute cursor + tap-to-click; joystick = fine relative
//      moves; L/R = holdable mouse buttons (drags); ⌨ opens the device keyboard. ----
if (navigator.maxTouchPoints > 0 || "ontouchstart" in window) document.body.classList.add("touch");
$("touchBtn").addEventListener("click", () => document.body.classList.toggle("touch"));
{ // The mouse: the real TempleOS pointer. The cursor.png arrow (recolored white) rides the
  // pointer and mix-blend-mode:difference inverts the pixels under it - the browser equivalent
  // of the OS's ROP_XOR mouse. On automatically for desktop (mice); touch keeps its own UI.
  const xc = $("xcursor");
  const xcOn = !document.body.classList.contains("touch");
  document.body.classList.toggle("xcursor", xcOn);
  const hideCursor=()=>{xc.style.visibility='hidden';};
  const moveCursor=(e,frame=null)=>{
    if(!xcOn||e.pointerType==='touch')return;
    const rect=frame?.getBoundingClientRect();
    xc.style.transform=`translate(${e.clientX+(rect?.left||0)}px,${e.clientY+(rect?.top||0)}px)`;
    xc.style.visibility=e.target?.id==='canvas'?'hidden':'visible';
  };
  window.__desktopCursor={enabled:xcOn,move:moveCursor,hide:hideCursor};
  if (xcOn) {
    addEventListener('pointermove',e=>moveCursor(e),{capture:true,passive:true});
    document.addEventListener('mouseleave',hideCursor);
    addEventListener('blur',hideCursor);
  }
}
{ // direct canvas touch: move cursor absolutely; quick tap = left click; long-press = right click
  let t0 = 0, moved = 0, lpTimer = 0;
  const pos = (t) => { const r = canvas.getBoundingClientRect();
    return [Math.max(0, Math.min(639, (t.clientX - r.left) * 640 / r.width)) | 0,
            Math.max(0, Math.min(479, (t.clientY - r.top) * 480 / r.height)) | 0]; };
  canvas.addEventListener("touchstart", (e) => { if (!document.body.classList.contains("touch")) return;
    e.preventDefault(); const t = e.changedTouches[0]; [msX, msY] = pos(t); notifyInput();
    t0 = performance.now(); moved = 0;
    lpTimer = setTimeout(() => { msB |= 2; notifyInput(); setTimeout(() => { msB &= ~2; notifyInput(); }, 120); navigator.vibrate?.(20); }, 480);
  }, { passive: false });
  canvas.addEventListener("touchmove", (e) => { if (!document.body.classList.contains("touch")) return;
    e.preventDefault(); const t = e.changedTouches[0]; const [nx, ny] = pos(t);
    moved += Math.abs(nx - msX) + Math.abs(ny - msY); msX = nx; msY = ny; notifyInput();
    if (moved > 14) { clearTimeout(lpTimer); lpTimer = 0; }
  }, { passive: false });
  canvas.addEventListener("touchend", (e) => { if (!document.body.classList.contains("touch")) return;
    e.preventDefault(); clearTimeout(lpTimer);
    if (performance.now() - t0 < 260 && moved < 14) { msB |= 1; notifyInput(); setTimeout(() => { msB &= ~1; notifyInput(); }, 90); }
  }, { passive: false });
}
{ // joystick: velocity-based fine control (float accumulator, INTEGER store - the host
  //   BigInt()s the cursor, and a fractional msX is a TypeError trap on Safari)
  const joy = $("joy"), knob = $("joyk");
  let vx = 0, vy = 0, active = false, raf = 0, fx = 0, fy = 0;
  const integ = () => { if (!active && !vx && !vy) { raf = 0; return; }
    fx = Math.max(0, Math.min(639, fx + vx)); fy = Math.max(0, Math.min(479, fy + vy));
    msX = fx | 0; msY = fy | 0;
    notifyInput(); raf = requestAnimationFrame(integ); };
  const setv = (t) => { const r = joy.getBoundingClientRect();
    let dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2);
    const m = Math.hypot(dx, dy), max = r.width / 2 - 8;
    if (m > max) { dx *= max / m; dy *= max / m; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    vx = dx / max * 7; vy = dy / max * 7; };
  joy.addEventListener("touchstart", (e) => { e.preventDefault(); fx = msX; fy = msY; active = true; setv(e.changedTouches[0]); if (!raf) raf = requestAnimationFrame(integ); }, { passive: false });
  joy.addEventListener("touchmove", (e) => { e.preventDefault(); setv(e.changedTouches[0]); }, { passive: false });
  joy.addEventListener("touchend", (e) => { e.preventDefault(); active = false; vx = vy = 0; knob.style.transform = ""; }, { passive: false });
  const bind = (el, bit) => { el.addEventListener("touchstart", (e) => { e.preventDefault(); el.classList.add("on"); msB |= bit; notifyInput(); }, { passive: false });
    el.addEventListener("touchend", (e) => { e.preventDefault(); el.classList.remove("on"); msB &= ~bit; notifyInput(); }, { passive: false }); };
  bind($("tL"), 1); bind($("tR"), 2);
}
{ // ⌨: summon the device keyboard; typed characters become scancode sequences
  const inp = $("mobInput");
  $("tKb").addEventListener("touchstart", (e) => { e.preventDefault(); inp.focus({ preventScroll: true }); }, { passive: false });
  const CH = { a:0x1E,b:0x30,c:0x2E,d:0x20,e:0x12,f:0x21,g:0x22,h:0x23,i:0x17,j:0x24,k:0x25,l:0x26,m:0x32,n:0x31,o:0x18,p:0x19,q:0x10,r:0x13,s:0x1F,t:0x14,u:0x16,v:0x2F,w:0x11,x:0x2D,y:0x15,z:0x2C,
    "0":0x0B,"1":0x02,"2":0x03,"3":0x04,"4":0x05,"5":0x06,"6":0x07,"7":0x08,"8":0x09,"9":0x0A,
    " ":0x39,"=":0x0D,";":0x27,",":0x33,".":0x34,"/":0x35,"-":0x0C,"'":0x28,"[":0x1A,"]":0x1B,"\\":0x2B,"`":0x29 };
  const SHIFTED = { "*":"8","(":"9",")":"0","&":"7","_":"-","+":"=",":":";","\"":"'","{":"[","}":"]","|":"\\","<":",",">":".","?":"/","!":"1","@":"2","#":"3","$":"4","%":"5","^":"6","~":"`" };
  const typeChar = (ch) => {
    const up = ch >= "A" && ch <= "Z", base = SHIFTED[ch] !== undefined ? SHIFTED[ch] : (up ? ch.toLowerCase() : ch);
    const sc = CH[base]; if (sc === undefined) return;
    const sh = up || SHIFTED[ch] !== undefined;
    if (sh) pushKey(0x2A);
    pushKey(sc); pushKey(sc | 0x80);
    if (sh) pushKey(0x2A | 0x80);
  };
  inp.addEventListener("beforeinput", (e) => {
    if (e.inputType === "insertText" && e.data) for (const ch of e.data) typeChar(ch);
    else if (e.inputType === "deleteContentBackward") { pushKey(0x0E); pushKey(0x8E); }
    else if (e.inputType === "insertLineBreak") { pushKey(0x1C); pushKey(0x9C); }
    e.preventDefault();
  });
  inp.addEventListener("keydown", (e) => {   // physical-style keys some soft keyboards still report
    if (e.key === "Enter") { pushKey(0x1C); pushKey(0x9C); e.preventDefault(); }
    else if (e.key === "Backspace") { pushKey(0x0E); pushKey(0x8E); e.preventDefault(); }
  });
}

// ---- optional PC-speaker sound ----
let actx = null, osc = null, gain = null;
function snd(freq) { if (!actx) return; if (freq > 0) { osc.frequency.value = freq; gain.gain.value = 0.04; } else gain.gain.value = 0; }
addEventListener("pointerdown", () => {
  if (actx) return;
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); osc = actx.createOscillator(); gain = actx.createGain();
        osc.type = "square"; gain.gain.value = 0; osc.connect(gain).connect(actx.destination); osc.start(); } catch {}
});

// ---- one-shot import handoff (IndexedDB survives the reload an import triggers) ----
const idb = {
  open: () => new Promise((res, rej) => { const r = indexedDB.open("hemu", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }),
  get: async (k) => { const db = await idb.open(); return new Promise((res) => { const t = db.transaction("kv").objectStore("kv").get(k); t.onsuccess = () => res(t.result || null); t.onerror = () => res(null); }); },
  set: async (k, v) => { const db = await idb.open(); return new Promise((res) => { const t = db.transaction("kv", "readwrite").objectStore("kv").put(v, k); t.onsuccess = res; t.onerror = res; }); },
  del: async (k) => { const db = await idb.open(); return new Promise((res) => { const t = db.transaction("kv", "readwrite").objectStore("kv").delete(k); t.onsuccess = res; t.onerror = res; }); },
};

// Real multi-core is the DEFAULT on desktop (so Talons/Varoom just work when clicked). Reliability
// nets: present-sync handshake gives consistent frames (fixed the games white-screen), AP faults
// auto-recover, and ANY SMP failure (no frame in 15s, instantiate error) auto-falls-back to single
// core. Mobile stays single-core (phone memory/perf); ?nosmp / ?single force single-core; ?smp forces on.
const isMobileDev = (navigator.maxTouchPoints > 1) || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "");
let useSMP = self.crossOriginIsolated && !/[?&](single|nosmp)\b/.test(location.search)
             && (/[?&]smp\b/.test(location.search) || !isMobileDev);
const SMP_N = Math.max(2, Math.min(8, +((new URLSearchParams(location.search)).get("smp")) || 4));

// ---- load the compressed RAM snapshot (imported, or the default; the SMP snapshot when ?smp) ----
let gzBytes;
async function downloadSnapshot() {                    // reused by ↻ Restart when gzBytes was freed (phones)
  setLoad("downloading the TempleOS RAM snapshot…", 5);
  const gz = await fetch(useSMP ? "./hemu/live-smp.bin.gz" : "./hemu/live.bin.gz", { cache: "no-cache" });
  if (!gz.ok) { setLoad("failed to fetch snapshot (" + gz.status + ")"); throw new Error("snapshot fetch"); }
  const total = +gz.headers.get("content-length") || 10300000;   // hemu/live.bin.gz
  const reader = gz.body.getReader(); const chunks = []; let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; setLoad(`downloading snapshot… ${(got/1048576).toFixed(1)} MB`, 5 + 45 * got / total); }
  const buf = await new Blob(chunks).arrayBuffer();
  dbg(`snapshot downloaded (${(got/1048576).toFixed(1)} MB)`);
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
    osGen++;
    releaseOSInput();guestCapture=false;explicitCapture=false;os_game.active=false;keyq.length=0;updateFocusText();
    engine.stop?.();
    resetPause();
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

// ---- engine: one worker, or the multi-core one below ----
let importDisk = null;   // a disk image imported before the reload
function engineFail(why) {
  ld.style.display = ""; setLoad("The emulator could not start (" + why + "). Tap ↻ Restart.", 0);
  dbg("engine failed: " + why, true);
}
function singleCore(why) {   // multi-core failed before its first frame
  dbg("SMP engine failed (" + why + ") - falling back to single core", true);
  useSMP = false;
  downloadSnapshot().then(b => { gzBytes = b; if (!runWorker()) engineFail(why); }).catch(e => engineFail(e.message));
}
function runWorker() {
  let worker, watchdog, alive = false;
  try { worker = new Worker("./engine/hemu-worker.js", { type: "module" }); } catch (e) { return false; }
  engine.kind = "worker"; engine.post = (m, t) => worker?.postMessage(m, t || []);
  engine.stop = () => { try { clearTimeout(watchdog); } catch {} try { worker?.terminate(); } catch {} worker = null; notifyInput = () => {}; };
  notifyInput = () => worker?.postMessage(inputMessage());
  const fallback = (why) => {
    if (!worker) return;
    clearTimeout(watchdog); try { worker.terminate(); } catch {} worker = null; notifyInput = () => {};
    if (alive) {
      // The engine ALREADY booted and then died (e.g. iOS reclaimed the worker's memory).
      // Do NOT boot a second 384 MB engine on top - that's a guaranteed tab kill on phones.
      dbg("engine crashed after boot (" + why + ")", true);
      ld.style.display = ""; setLoad("The emulator stopped (" + why + "). Tap ↻ Restart.", 0);
      return;
    }
    engineFail(why);
  };
  worker.onerror = (e) => fallback(e.message || "worker error");
  worker.onmessage = (e) => {
    if (!worker) return;
    const m = e.data;
    if (m.cmd === "frame") {
      if (!alive && document.body.classList.contains("touch")) gzBytes = null;   // phones: free the 10 MB; Restart fetches it again
      blit(new Uint8Array(m.buf), m.w, m.h, true, m); worker.postMessage({ cmd: "ack" }); alive = true; firstFrame();
    }
    else if (m.cmd === "snd") snd(m.f);
    else if (m.cmd === "progress") { setLoad(m.text, m.pct); dbg(m.text); }
    else if (m.cmd === "error") fallback(m.msg);
    else if(m.cmd === "palette")updatePalette(m.index,m.rgb);
    else diskMsg(m);   // paused/exportResult/fileResult/dirList/diskInfo
  };
  worker.postMessage({ cmd: "init", gz: gzBytes, wasmUrl: new URL("./build/hemu.wasm", location.href).href, fixedB: FIXED_B, diskBytes: importDisk }, importDisk ? [importDisk] : []);
  importDisk = null;
  watchdog = setTimeout(() => { if (!alive) fallback("no frame in 10s"); }, 10000);
  return true;
}

// ---- SMP engine (?smp): the BSP is hemu-worker.js over a SHARED memory + N-1 AP workers running
//      RunCore in parallel. Same BSP message protocol as runWorker, so the whole UI works unchanged. ----
async function runSMP() {
  let bsp = null, aps = [], watchdog, alive = false;
  try {
    setLoad("starting multi-core engine…", 90);
    const [wasmBytes, sc] = await Promise.all([
      fetch("./build/hemu-smp.wasm", { cache: "no-cache" }).then(r => r.arrayBuffer()),
      fetch("./build/hemu-smp.json", { cache: "no-cache" }).then(r => r.json()),
    ]);
    sc.ncore = SMP_N;
    const mem = new WebAssembly.Memory({ initial: 512, maximum: 8192, shared: true });
    const ctrl = new SharedArrayBuffer(64);
    bsp = new Worker("./engine/hemu-worker.js", { type: "module" });
    engine.kind = "smp"; engine.post = (m, t) => bsp?.postMessage(m, t || []);
    engine.stop = () => { try { clearTimeout(watchdog); } catch {} try { const c = new Int32Array(ctrl); Atomics.store(c, 1, 1); Atomics.notify(c, 1); } catch {} try { bsp?.terminate(); } catch {} for (const a of aps) { try { a.terminate(); } catch {} } bsp = null; aps = []; notifyInput = () => {}; };
    notifyInput = () => bsp?.postMessage(inputMessage());
    const fallback = (why) => {
      if (!bsp && !aps.length) return;
      engine.stop();
      if (alive) { dbg("SMP engine crashed after boot (" + why + ")", true); ld.style.display = ""; setLoad("The emulator stopped (" + why + "). Tap ↻ Restart.", 0); return; }
      singleCore(why);
    };
    bsp.onerror = (e) => fallback(e.message || "bsp error");
    bsp.onmessage = (e) => {
      if (!bsp) return; const m = e.data;
      if (m.cmd === "frame") { blit(new Uint8Array(m.buf), m.w, m.h, true, m); bsp.postMessage({ cmd: "ack" }); alive = true; firstFrame(); }
      else if (m.cmd === "snd") snd(m.f);
      else if (m.cmd === "progress") { setLoad(m.text, m.pct); dbg(m.text); }
      else if (m.cmd === "smpReady") dbg("SMP: " + m.ncore + " cores running in parallel");
      else if (m.cmd === "error") fallback(m.msg);
      else if(m.cmd === "palette")updatePalette(m.index,m.rgb);
    else diskMsg(m);
    };
    for (let k = 1; k < SMP_N; k++) {                  // AP workers: share `mem`, barrier-wait on `ctrl`, RunCore in parallel
      const ap = new Worker("./engine/hemu-smp-worker.js", { type: "module" });
      ap.onmessage = (e) => { const m = e.data; if (m.cmd === "error") dbg("[smp] AP" + k + ": " + m.msg, true); else if (m.cmd === "log") { dbg("[smp] " + m.msg); console.log("[smp]", m.msg); } };
      ap.onerror = (ev) => dbg("[smp] AP" + k + " worker error: " + (ev.message || ""), true);
      ap.postMessage({ cmd: "init", role: "ap", core: k, mem, ctrl, sc, wasmBytes });
      aps.push(ap);
    }
    bsp.postMessage({ cmd: "init", gz: gzBytes, wasmUrl: new URL("./build/hemu-smp.wasm", location.href).href, fixedB: FIXED_B,
      diskBytes: importDisk, smp: { mem, ctrl, ipiAddr: sc.globals.g_ipi_pending, ncore: SMP_N } },
      importDisk ? [importDisk] : []);
    importDisk = null;
    watchdog = setTimeout(() => { if (!alive) fallback("no frame in 15s"); }, 15000);
    return true;
  } catch (e) { engine.stop?.(); singleCore("SMP init threw: " + (e.message || e)); return false; }
}

function bootEngine() {
  if (useSMP) runSMP();   // BSP + AP workers; falls back to one core itself
  else if (!runWorker()) engineFail("this browser cannot start a module Worker");
}

// ---- Pause / Play ----
let paused = false, pauseRevision = 0;
const pauseBtn = $("pauseBtn");
const pauseShow = () => { pauseBtn.innerHTML = '<span class="ico"><svg><use href="#i-' + (paused ? "play" : "pause") + '"/></svg></span> ' + (paused ? "Play" : "Pause"); };
const setPaused = value => { paused = value; fpsMeter.setPaused(paused); updateFps(); engine.post({ cmd: "pause", value: paused }); pauseShow(); };
pauseBtn.addEventListener("click", () => { ++pauseRevision; setPaused(!paused); });
const holdOSForGame = () => {
  const previous=paused, revision=pauseRevision;setPaused(true);
  return () => { if(pauseRevision===revision)setPaused(previous); };
};
const resetPause = () => { ++pauseRevision; paused = false; fpsMeter.setPaused(false); updateFps(); pauseShow(); };   // Restart boots unpaused

// ---- requests to the guest, matched to their replies by id; the Disk window shows the rest ----
const uploadWaiters = new Map();
let nextRequestId = 1;
const cancelOSRequests = () => {
  for (const [id,finish] of uploadWaiters) finish({id,ok:false,msg:"OS restarted during the request."});
  uploadWaiters.clear();
};
const diskMsg = (m) => {
  if (m.cmd === "inputMode") { guestInputMode(m); return; }
  if (m.cmd === "guestResult" && ["failed","error"].includes(m.state) && m.op === "launch") os_game.launchFail?.(m.msg);
  if (m.cmd === "fileResult") { const w = uploadWaiters.get(m.id); if (w) { uploadWaiters.delete(m.id); w(m); } }
  os_disk.msg?.(m);
};
// Match each OS reply to its request; a late reply cannot satisfy a later operation.
const osRequest = (msg, transfer = []) => new Promise((resolve) => {
  if (!engine.kind) { resolve({ok:false,msg:"engine not ready yet"}); return; }
  const id = nextRequestId++;
  const timeout = setTimeout(() => {
    uploadWaiters.delete(id);
    resolve({id,ok:false,msg:"The OS request timed out. Check the guest before trying again."});
  }, 120000);
  uploadWaiters.set(id, (result) => { clearTimeout(timeout); resolve(result); });
  try { engine.post({...msg,id},transfer); }
  catch (e) { clearTimeout(timeout); uploadWaiters.delete(id); resolve({id,ok:false,msg:e.message}); }
});
const writeOSFile = (path, bytes) => osRequest({cmd:"osWrite",path,name:path.split("/").pop(),run:false,bytes},[bytes]);
const uploadToHome = (name, text, run) => {
  const bytes = new TextEncoder().encode(text).buffer;
  return osRequest({cmd:"osWrite",name,path:"C:/Home/"+name,run:!!run,bytes},[bytes]);
};
const launchInOS = (opts) => osRequest({cmd:"osLaunch",...opts});

import("./terry-sprite.js").then(({playTerrySprite}) => playTerrySprite($("terrySprite"))).catch(console.error);

// ---- topbar: last key pressed (focus-state text is owned by setFocused) ----
addEventListener("keydown", (e) => {
  if (focused) return;
  let k = e.key; if (k === " ") k = "SPACE"; else if (k === "Meta") k = "WINDOWS"; else if (k.length === 1) k = k.toUpperCase();
  tbKey.textContent = k;
}, true);

async function OsBoot()
{//Boots from a snapshot imported before the reload, or the stock one.
  let snap=await idb.get("importSnap").catch(NullGet);
  importDisk=await idb.get("importDisk").catch(NullGet);
  if (snap) {
    await idb.del("importSnap");
    gzBytes=snap;
    setLoad("loading imported snapshot…",50);
  } else
    gzBytes=await downloadSnapshot();
  if (importDisk)
    await idb.del("importDisk");
  bootEngine();
}

function NullGet()
{
  return null;
}

function OsGen()
{//Counts restarts, so a game install can tell the OS it began on is gone.
  return osGen;
}

OsBoot().catch(engineFail);
export {$,dbg,engine,idb,pal32,OsGen,releaseOSInput as OsInputRelease,releaseHeld as OsInputReset,
  setGameCapture as OsCaptureSet,holdOSForGame as OsHold,writeOSFile as OsFileWrite,
  uploadToHome as OsHomeWrite,launchInOS as OsLaunch};
