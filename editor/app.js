// app.js - main-thread controller for the in-browser HolyC IDE.
// Spawns the worker, wires keyboard/mouse into the control SAB, drains the
// sound ring into WebAudio, and shows console output.
import { Speaker } from "../holyc-wasm/src/runtime/sound.js";
import {
  CTRL, KB_BASE, KB_RING, SND_BASE, SND_RING, SND_TONE, SND_NOTE, KEY_STATE_BASE, makeControlSAB,
} from "../holyc-wasm/src/runtime/protocol.js";
import { DEMOS } from "./demos.js";
import { Framebuffer } from "../holyc-wasm/src/runtime/graphics.js";
import { SOURCES } from "./demo-sources.js";

const $ = (id) => document.getElementById(id);
const editor = $("editor");
const consoleEl = $("console");
const canvas = $("screen");
const statusEl = $("status");
const demoSel = $("demoSelect");

const speaker = new Speaker();
let worker = null;
let ctrl = null;
let sndTimer = null;
let running = false;
let mainFb = null;     // main-thread presenter over the shared framebuffer
let curCanvas = canvas;
let rafId = 0;

const SCALE = 1;
canvas.width = 640 * SCALE;
canvas.height = 480 * SCALE;

// ---- populate demos ----
for (const group of DEMOS) {
  const og = document.createElement("optgroup");
  og.label = group.label;
  for (const d of group.items) {
    const o = document.createElement("option");
    o.value = d.path; o.textContent = d.name;
    og.appendChild(o);
  }
  demoSel.appendChild(og);
}

async function loadDemo(path) {
  let src = SOURCES[path];
  if (src == null) {
    // Large demos (e.g. the Terry sprite, ~600 KB) aren't in the always-loaded
    // bundle - fetch the .HC on demand instead of bloating every page load.
    setStatus("fetching " + path + " …");
    // resolve relative to THIS module (works whether app.js is the page or is
    // loaded as an overlay from the main site at a different base URL).
    try { const r = await fetch(new URL(path, import.meta.url)); if (r.ok) src = await r.text(); } catch (e) {}
  }
  if (src != null) { editor.value = src; setStatus("loaded " + path); }
  else { editor.value = "// missing source: " + path; setStatus("load failed"); }
  editor.dispatchEvent(new Event("input"));   // refresh the host page's syntax highlighting
}
demoSel.addEventListener("change", () => { if (demoSel.value) loadDemo(demoSel.value); });

function setStatus(s) { statusEl.textContent = s; }
function clearConsole() { consoleEl.textContent = ""; }
function appendConsole(text) {
  // strip ANSI (worker sends raw text); keep newlines
  consoleEl.textContent += text;
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

// ---- keyboard -> control SAB ring ----
function pushKey(code) {
  if (!ctrl) return;
  const head = Atomics.load(ctrl, CTRL.KB_HEAD);
  Atomics.store(ctrl, KB_BASE + (head % KB_RING), code);
  Atomics.store(ctrl, CTRL.KB_HEAD, head + 1);
  // wake any worker blocked in getChar/sleep
  Atomics.notify(ctrl, CTRL.SLEEP_FUTEX);
}

function keyToChar(e) {
  if (e.key === "Enter") return 10;
  if (e.key === "Escape") return 0x1b;
  if (e.key === "Backspace") return 8;
  if (e.key === "Tab") return 9;
  if (e.key.length === 1) return e.key.charCodeAt(0);
  // arrows -> TempleOS-ish scan placeholders (kept simple)
  return 0;
}

let captureWanted=false, manualCapture=false, hybridMouse=false, wasMouseLocked=false, hybridTracking=false;
const isMouseCaptured=()=>document.pointerLockElement===curCanvas;
const mouseStateChanged=()=>window.dispatchEvent(new Event('game-mouse-change'));
const scanKeys={KeyW:0x11,KeyA:0x1e,KeyS:0x1f,KeyD:0x20,KeyR:0x13,KeyF:0x21,KeyJ:0x24,KeyL:0x26,KeyI:0x17,KeyK:0x25};
const hasInputFocus=()=>document.activeElement===curCanvas || document.pointerLockElement===curCanvas;
function releaseInput(){
  hybridTracking=false;
  if(!ctrl)return;
  for(let i=0;i<128;i++)Atomics.store(ctrl,KEY_STATE_BASE+i,0);
  for(const i of [CTRL.MS_DX,CTRL.MS_DY,CTRL.MS_LB,CTRL.MS_RB])Atomics.store(ctrl,i,0);
  Atomics.store(ctrl,CTRL.MS_PRESSED,0);Atomics.add(ctrl,CTRL.INPUT_RESET,1);
  Atomics.store(ctrl,CTRL.MS_X,320);Atomics.store(ctrl,CTRL.MS_Y,240);
}
addEventListener('keydown',e=>{
  if(!running||!hasInputFocus())return;
  if(e.code==='Escape'&&isMouseCaptured()){releaseMouse();return;}
  const sc=scanKeys[e.code];if(sc!==undefined)Atomics.store(ctrl,KEY_STATE_BASE+sc,1);
  const c=keyToChar(e);if(c){if(!e.repeat || sc===undefined)pushKey(c);e.preventDefault();}
});
addEventListener('keyup',e=>{const sc=scanKeys[e.code];if(ctrl&&sc!==undefined)Atomics.store(ctrl,KEY_STATE_BASE+sc,0);});
addEventListener('blur',()=>{releaseInput();if(document.pointerLockElement===curCanvas)document.exitPointerLock();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){releaseInput();if(document.pointerLockElement===curCanvas)document.exitPointerLock();}});
document.addEventListener('pointerlockchange',()=>{
  const locked=document.pointerLockElement===curCanvas;
  if(wasMouseLocked&&!locked){hybridMouse=true;manualCapture=false;}
  wasMouseLocked=locked;releaseInput();
  document.body.classList.toggle('mouse-locked',!!document.pointerLockElement);
  mouseStateChanged();
});
document.addEventListener('pointerdown',e=>{if(e.target!==curCanvas)releaseInput();},true);
document.addEventListener('mousemove',e=>{
  if(!running)return;
  if(document.pointerLockElement!==curCanvas){
    if(!captureWanted||!hybridMouse||!hasInputFocus()||e.target!==curCanvas){hybridTracking=false;return;}
    const r=curCanvas.getBoundingClientRect();
    if(e.clientX<r.left||e.clientX>=r.right||e.clientY<r.top||e.clientY>=r.bottom){hybridTracking=false;return;}
    if(!hybridTracking){hybridTracking=true;return;}
  }
  Atomics.add(ctrl,CTRL.MS_DX,Math.round(e.movementX));Atomics.add(ctrl,CTRL.MS_DY,Math.round(e.movementY));
  if(isMouseCaptured()&&!captureWanted){
    const r=curCanvas.getBoundingClientRect();
    Atomics.store(ctrl,CTRL.MS_X,Math.max(0,Math.min(639,Atomics.load(ctrl,CTRL.MS_X)+Math.round(e.movementX*640/r.width))));
    Atomics.store(ctrl,CTRL.MS_Y,Math.max(0,Math.min(479,Atomics.load(ctrl,CTRL.MS_Y)+Math.round(e.movementY*480/r.height))));
  }
});

// ---- pointer (mouse + touch + pen) -> control SAB ----
// One handler set, reused for the canvas (it gets swapped on each Run, so we
// (re)attach via attachInput()). Touch and mouse both map to the single
// TempleOS mouse cursor + left button, so finger taps act like clicks.
function setMousePos(target, clientX, clientY) {
  if (!ctrl || captureWanted || isMouseCaptured()) return;
  const r = target.getBoundingClientRect();
  const x = Math.round((clientX - r.left) * (640 / r.width));
  const y = Math.round((clientY - r.top) * (480 / r.height));
  Atomics.store(ctrl, CTRL.MS_X, Math.max(0, Math.min(639, x)));
  Atomics.store(ctrl, CTRL.MS_Y, Math.max(0, Math.min(479, y)));
}
function setButton(which, down) {
  if (!ctrl) return;
  const previous=Atomics.exchange(ctrl, which, down ? 1 : 0);
  if(down&&!previous)Atomics.or(ctrl,CTRL.MS_PRESSED,which===CTRL.MS_LB?1:2);
  Atomics.notify(ctrl, CTRL.SLEEP_FUTEX); // wake a blocked GetChar/Sleep loop
}

function captureMouse({automatic=false}={}) {
  if(!running)return false;
  manualCapture=!automatic;hybridMouse=false;curCanvas.focus({preventScroll:true});releaseInput();speaker.resume();
  const requestedCanvas=curCanvas;
  const failed=error=>{
    if(!running||curCanvas!==requestedCanvas)return;
    hybridMouse=true;manualCapture=false;
    console.warn('Mouse capture failed:',error.name,error.message);
    setStatus('Mouse capture unavailable. Hybrid mouse is active; click the game to play.');
    mouseStateChanged();
  };
  try{curCanvas.requestPointerLock()?.catch(failed);}
  catch(error){failed(error);}
  return true;
}
function releaseMouse() {
  hybridMouse=true;manualCapture=false;releaseInput();
  if(isMouseCaptured())document.exitPointerLock();
}
function attachInput(target) {
  const mouseDown=e=>{
    if(!running||target!==curCanvas||![0,2].includes(e.button))return;
    if(((captureWanted&&!hybridMouse)||e.shiftKey)&&!isMouseCaptured()){
      captureMouse({automatic:!e.shiftKey});e.preventDefault();return;
    }
    setMousePos(target,e.clientX,e.clientY);
    setButton(e.button===2?CTRL.MS_RB:CTRL.MS_LB,true);
    speaker.resume();target.focus({preventScroll:true});e.preventDefault();
  };
  // Mouse events report each button in a chord. Pointerdown/up only report the
  // first press and final release. Pointer lock also forbids setPointerCapture.
  target.addEventListener('mousedown',mouseDown);
  // Pointer Events cover mouse, touch, and pen in one API where supported.
  if (window.PointerEvent) {
    target.addEventListener("pointermove", (e) => { setMousePos(target, e.clientX, e.clientY); });
    target.addEventListener("pointerdown", (e) => {
      if(e.pointerType==='mouse'||!running||target!==curCanvas)return;
      if(!document.pointerLockElement)try{target.setPointerCapture?.(e.pointerId);}catch{}
      setMousePos(target, e.clientX, e.clientY);
      setButton(e.button === 2 ? CTRL.MS_RB : CTRL.MS_LB, true);
      speaker.resume();
      target.focus?.();
      e.preventDefault();
    });
    target.addEventListener("pointerup", (e) => { if(e.pointerType==='mouse')return;setButton(e.button === 2 ? CTRL.MS_RB : CTRL.MS_LB, false); e.preventDefault(); });
    target.addEventListener("pointercancel", releaseInput);
  } else {
    // Fallback for older browsers: explicit mouse + touch.
    target.addEventListener("mousemove", (e) => setMousePos(target, e.clientX, e.clientY));
    const touch = (e, down) => {
      if (e.touches && e.touches[0]) setMousePos(target, e.touches[0].clientX, e.touches[0].clientY);
      if (down !== null) setButton(CTRL.MS_LB, down);
      speaker.resume();
      e.preventDefault();
    };
    target.addEventListener("touchstart", (e) => touch(e, true), { passive: false });
    target.addEventListener("touchmove", (e) => touch(e, null), { passive: false });
    target.addEventListener("touchend", (e) => { setButton(CTRL.MS_LB, false); e.preventDefault(); }, { passive: false });
  }
  target.addEventListener("contextmenu", (e) => e.preventDefault());
  target.style.touchAction = "none"; // stop the page scrolling/zooming on canvas touches
}
// Release even when an uncaptured press is dragged outside the canvas.
document.addEventListener('mouseup',e=>{
  if(e.button===0||e.button===2)setButton(e.button===2?CTRL.MS_RB:CTRL.MS_LB,false);
},true);
attachInput(canvas);

// ---- sound pump: drain worker's SND ring into WebAudio ----
function pumpSound() {
  if (!ctrl) return;
  let tail = Atomics.load(ctrl, CTRL.SND_TAIL);
  const head = Atomics.load(ctrl, CTRL.SND_HEAD);
  while (tail !== head) {
    const slot = SND_BASE + (tail % SND_RING) * 2;
    const type = Atomics.load(ctrl, slot);
    const arg = Atomics.load(ctrl, slot + 1);
    if (type === SND_TONE) speaker.tone(arg);
    else if (type === SND_NOTE) speaker.note(arg, 150);
    tail++;
  }
  Atomics.store(ctrl, CTRL.SND_TAIL, tail);
}

// ---- run / stop ----
function stop() {
  cancelAnimationFrame(rafId);rafId=0;
  releaseInput();captureWanted=false;manualCapture=false;if(document.pointerLockElement===curCanvas)document.exitPointerLock();
  if (ctrl) { Atomics.store(ctrl, CTRL.RUNNING, 0); Atomics.notify(ctrl, CTRL.SLEEP_FUTEX); }
  if (worker) { worker.terminate(); worker = null; }
  if (sndTimer) { clearInterval(sndTimer); sndTimer = null; }
  running = false;
  mouseStateChanged();
  speaker.tone(0);
  $("runBtn").textContent = "▶ Run";
}

async function run(source=editor.value,project={}) {
  if (running) { stop(); return; }
  clearConsole();
  speaker.resume();

  // fresh control block + canvas transfer
  const sab = makeControlSAB();
  ctrl = new Int32Array(sab);
  Atomics.store(ctrl, CTRL.MS_X, 320);
  Atomics.store(ctrl, CTRL.MS_Y, 240);

  // Shared framebuffer: the worker draws into it (even while blocked in a
  // synchronous program loop); the MAIN thread presents it via rAF, because a
  // blocked worker never composites its own canvas. NO OffscreenCanvas transfer.
  const fbSAB = new SharedArrayBuffer(640 * 480);
  const fresh = curCanvas.cloneNode(false);
  curCanvas.parentNode.replaceChild(fresh, curCanvas);
  curCanvas = fresh;
  reattachCanvas(fresh);
  mainFb = new Framebuffer(fresh.getContext("2d"), 640, 480, SCALE, new Uint8Array(fbSAB));
  // The worker already signals frame boundaries. Reading that sequence avoids a
  // full-frame hash on every browser refresh, and skips uploads while it sleeps.
  let lastFrame=0,rateFrames=0,rateStart=performance.now();
  const present = () => {
    if (!running) return;
    const frame=Atomics.load(ctrl,CTRL.FRAME)>>>0;
    if(frame!==lastFrame){mainFb.present();rateFrames+=(frame-lastFrame)>>>0;lastFrame=frame;}
    const now = performance.now();
    if(now-rateStart>=1000){window.__nativeFps=Math.round(rateFrames*1000/(now-rateStart));setStatus('running · '+window.__nativeFps+' fps (native)');rateFrames=0;rateStart=now;}
    rafId = requestAnimationFrame(present);
  };

  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (e) => {
    const m = e.data;
    if(m.type === 'inputMode'){
      captureWanted=!!m.capture;releaseInput();
      if(captureWanted)setStatus(hybridMouse?'Hybrid mouse. Use Capture mouse or Shift+click to capture again.':'Click the screen to capture the mouse. Esc releases.');
      else if(!manualCapture&&isMouseCaptured())document.exitPointerLock();
    }
    else if (m.type === "text") appendConsole(m.text);
    else if (m.type === "compiled") setStatus(`compiled ${m.size} bytes` + (m.warnings && m.warnings.length ? `, ${m.warnings.length} warnings` : ""));
    else if (m.type === "done") { if (mainFb) mainFb.present(); setStatus("done"); stop(); }  // present the FINAL frame (fast finite demos finish before the first rAF)
    else if (m.type === "error") { if (mainFb) mainFb.present(); appendConsole("\n[error] " + m.error + "\n"); setStatus(m.nativeGame?'HolyC-WASM could not run this source. See Console for the native compatibility error.':'error'); stop(); }
  };

  running = true;
  mouseStateChanged();
  $("runBtn").textContent = "■ Stop";
  setStatus("running…");
  worker.postMessage({ type: "run", source, controlSAB: sab, fbSAB, ...project });
  rafId = requestAnimationFrame(present);

  sndTimer = setInterval(pumpSound, 16);
}

function reattachCanvas(c) {
  c.width = 640 * SCALE; c.height = 480 * SCALE;
  c.tabIndex = 0;             // focusable so it can receive key events
  attachInput(c);            // mouse + touch + pen, unified
  window._canvas = c;
}

$("runBtn").addEventListener("click", () => { if (!running) curCanvas = $("screen"); run(); });   // editor Run targets the editor screen

// Run a source snapshot in the game popup or editor preview. Keeping the textarea
// separate lets the user edit another file or prepare the next run while playing.
function runIn(canvasEl, source, {preserveEditor=false,...project}={}) {
  if (running) stop();
  curCanvas = canvasEl;
  if(!preserveEditor){
    editor.value = source;
    editor.dispatchEvent(new Event("input"));
  }
  return run(source,project);
}
$("stopBtn")?.addEventListener("click", stop);  // optional second button; the overlay uses just runBtn

// check cross-origin isolation
if (!self.crossOriginIsolated) {
  setStatus("WARNING: not cross-origin isolated - SharedArrayBuffer unavailable. Use the dev server (npm run serve).");
} else {
  setStatus("ready");
}

// load a default GRAPHICS demo so the editor opens with something to run.
{
  const def = SOURCES["Demo/Graphics/Lines.HC"] ? "Demo/Graphics/Lines.HC" : DEMOS[0].items[0].path;
  demoSel.value = def;
  loadDemo(def);
}
// Expose run/stop so the host page (the overlay opener) can drive the editor:
// run the default demo when the window opens, stop it when the window closes.
window.__holycEditor = { run, stop, isRunning: () => running, runIn, captureMouse, releaseMouse, isMouseCaptured };
