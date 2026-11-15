import {osMouse} from "../../Adam/Os.js";
// App.js - main-thread controller for the in-browser HolyC IDE.
// Spawns the worker, wires keyboard/mouse into the control SAB, drains the
// sound ring into WebAudio, and shows console output.
import {Icon} from "../../Adam/Icons.js";
import {WinFind} from "../../Adam/WinPopup.js";
import { Speaker } from "../../hemu/holyc-wasm/src/runtime/sound.js";
import {
  CTRL, KB_BASE, KB_RING, SND_BASE, SND_RING, SND_TONE, SND_NOTE, KEY_STATE_BASE, makeControlSAB, keyPacketPush, keyPacketReset,
} from "../../hemu/holyc-wasm/src/runtime/protocol.js";
import {KEY,KeyBytes,KeyInput} from "../../Adam/Keyboard.js";
import { DEMOS } from "./Demos.js";
import {sourceDocument,sourceString} from "./Source.js";
import { Framebuffer } from "../../hemu/holyc-wasm/src/runtime/graphics.js";

const $=WinFind;
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
let nativeKeys = false;
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

let demoRequest=0,documentSource=sourceDocument(new Uint8Array());
editor.addEventListener("input",function () {demoRequest++;});
function FileLoad(bytes,name,utf8=false,path=null)
{
  demoRequest++;
  documentSource=sourceDocument(bytes,utf8);
  window.__holycEditor.file={name,path};
  editor.value=documentSource.original;
  editor.dispatchEvent(new Event("input"));
}
function FileBytes()
{
  return documentSource.encode(editor.value);
}
async function loadDemo(path) {
  const request=++demoRequest;
  setStatus("fetching " + path + " …");
  try {
    const response=await fetch(new URL(path,import.meta.url));
    if (!response.ok) throw new Error("HTTP "+response.status);
    const bytes=await response.arrayBuffer();
    if (request!==demoRequest) return;
    FileLoad(bytes,path.split("/").pop());
    setStatus("loaded "+path);
  } catch (error) {
    if (request===demoRequest) setStatus("Could not load "+path+": "+error.message);
  }
}
demoSel.addEventListener("change", () => { if (demoSel.value) loadDemo(demoSel.value); });

function setStatus(s) { statusEl.textContent = s; }
function clearConsole() { consoleEl.textContent = ""; }
function appendConsole(text) {
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

let nativeResetting=false;
const nativeInput=KeyInput(sendNative);
const legacyInput=KeyInput((bytes,key,down)=>{
  if(ctrl)Atomics.store(ctrl,KEY_STATE_BASE+(key&127),Number(down));
});
const screenKeys={
  down(source,key){
    if(!legacyInput.down(source,key&127))return false;
    const shift=legacyInput.held().some(key=>key===KEY.ShiftLeft||key===KEY.ShiftRight);
    const ch=key===KEY.Escape?(shift?28:27):key===KEY.Space?(shift?31:32):
      key===KEY.Enter?10:key===KEY.Tab?9:key===KEY.Backspace?8:0;
    if(ch)pushKey(ch);
    return true;
  },
  up:source=>legacyInput.up(source),
  tap(key){const source=Symbol();this.down(source,key);this.up(source);},
  text(ch){
    if(!legacyInput.text(ch))return false;
    pushKey(ch.charCodeAt(0));return true;
  },
};
function clearNative(){
  nativeResetting=true;nativeInput.reset();nativeResetting=false;
}
function sendNative(bytes) {
  if(!ctrl || !nativeKeys || nativeResetting || !bytes.length)return;
  if(!keyPacketPush(ctrl,bytes)){clearNative();dispatchEvent(new Event('preview-input-reset'));}
  worker?.postMessage({type:"input"});
}

function keyToChar(e) {
  if (e.key === "Enter") return 10;
  if (e.key === "Escape") return e.shiftKey?0x1c:0x1b;
  if (e.key === " " && e.shiftKey) return 0x1f;
  if (e.key === "Backspace") return 8;
  if (e.key === "Tab") return 9;
  if (e.key.length === 1) return e.key.charCodeAt(0);
  //The legacy character stream has no arrow characters.
  return 0;
}

let captureWanted=false, manualCapture=false, hybridMouse=false, wasMouseLocked=false, hybridTracking=false;
const isMouseCaptured=()=>curCanvas.closest(".win-pass-owned")?osMouse.isMouseCaptured():curCanvas.ownerDocument.pointerLockElement===curCanvas;
const mouseStateChanged=()=>window.dispatchEvent(new Event('game-mouse-change'));
const scanKeys={KeyW:0x11,KeyA:0x1e,KeyS:0x1f,KeyD:0x20,KeyR:0x13,KeyF:0x21,KeyJ:0x24,KeyL:0x26,KeyI:0x17,KeyK:0x25,KeyP:0x19,Space:0x39,
  ArrowUp:0x48,ArrowLeft:0x4b,ArrowRight:0x4d,ArrowDown:0x50};   // TempleOS merged scan codes
const hasInputFocus=()=>curCanvas.ownerDocument.activeElement===curCanvas || curCanvas.ownerDocument.pointerLockElement===curCanvas;
function releaseInput(){
  hybridTracking=false;
  clearNative();legacyInput.reset();
  dispatchEvent(new Event('preview-input-reset'));
  if(!ctrl)return;
  if(nativeKeys){keyPacketReset(ctrl);worker?.postMessage({type:"input"});}
  for(let i=0;i<128;i++)Atomics.store(ctrl,KEY_STATE_BASE+i,0);
  for(const i of [CTRL.MS_DX,CTRL.MS_DY,CTRL.MS_LB,CTRL.MS_RB])Atomics.store(ctrl,i,0);
  Atomics.store(ctrl,CTRL.MS_PRESSED,0);Atomics.add(ctrl,CTRL.INPUT_RESET,1);
  Atomics.store(ctrl,CTRL.MS_X,320);Atomics.store(ctrl,CTRL.MS_Y,240);
}
function InputWindow(win)
{
  const doc=win.document;
  win.addEventListener('keydown',e=>{
    if(!running||curCanvas.closest(".win-pass-owned")||!hasInputFocus())return;
    if(e.code==='Escape'&&isMouseCaptured()){releaseMouse();return;}
    if(nativeKeys){
      const key=KEY[e.code];
      if(key!==undefined){
        if(!nativeInput.down(e.code,key) && e.repeat)sendNative(KeyBytes(key,true));
        e.preventDefault();
      }
      return;
    }
    const sc=KEY[e.code];if(sc!==undefined){legacyInput.down(e.code,sc&127);e.preventDefault();}
    const c=keyToChar(e);if(c){if(!e.repeat || scanKeys[e.code]===undefined)pushKey(c);e.preventDefault();}
  });
  win.addEventListener('keyup',e=>{nativeInput.up(e.code);legacyInput.up(e.code);});
  win.addEventListener('blur',()=>{releaseInput();if(curCanvas.ownerDocument.pointerLockElement===curCanvas)curCanvas.ownerDocument.exitPointerLock();});
  doc.addEventListener('visibilitychange',()=>{if(doc.hidden){releaseInput();if(curCanvas.ownerDocument.pointerLockElement===curCanvas)curCanvas.ownerDocument.exitPointerLock();}});
  doc.addEventListener('pointerlockchange',()=>{
    const locked=curCanvas.ownerDocument.pointerLockElement===curCanvas;
    if(wasMouseLocked&&!locked){hybridMouse=true;manualCapture=false;}
    wasMouseLocked=locked;releaseInput();
    curCanvas.ownerDocument.body.classList.toggle('mouse-locked',!!curCanvas.ownerDocument.pointerLockElement);
    mouseStateChanged();
  });
  doc.addEventListener('pointerdown',e=>{if(!curCanvas.closest('.win-pass-owned')&&e.target!==curCanvas&&!e.target?.closest?.('#keysbar,#touchui'))releaseInput();},true);
  doc.addEventListener('mousemove',e=>{
    if(!running)return;
    if(curCanvas.ownerDocument.pointerLockElement!==curCanvas){
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

  doc.addEventListener('mouseup',e=>{
    if(curCanvas.closest('.win-pass-owned'))return;
    if(e.button===0||e.button===2)setButton(e.button===2?CTRL.MS_RB:CTRL.MS_LB,false);
  },true);
}
InputWindow(window);
addEventListener('winpopup',event=>InputWindow(event.detail.window));

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
  if(curCanvas.closest(".win-pass-owned")) {
    curCanvas.dispatchEvent(new CustomEvent("guicapture",{bubbles:true,detail:{on:true}}));return true;
  }
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
  if(curCanvas.closest(".win-pass-owned")) {
    curCanvas.dispatchEvent(new CustomEvent("guicapture",{bubbles:true,detail:{on:false}}));releaseInput();return;
  }
  hybridMouse=true;manualCapture=false;releaseInput();
  if(isMouseCaptured())curCanvas.ownerDocument.exitPointerLock();
}
function attachInput(target) {
  target.dataset.nativeInput="1";
  target.addEventListener("nativeinput",function (e) {
    if (!running || target!==curCanvas || !ctrl) return;
    const m=e.detail,key=(m.arg2&127)|((m.arg2&128)?256:0),source="guest-"+key;
    if (m.kind==11 || m.kind==13) {releaseInput();return;}
    if (m.kind==12) {
      Atomics.add(ctrl,CTRL.MS_DX,Math.round(m.arg1));
      Atomics.add(ctrl,CTRL.MS_DY,Math.round(m.arg2));return;
    }
    if (m.kind==7 || m.kind==8) {
      const input=nativeKeys?nativeInput:legacyInput;
      if (m.kind==8) input.up(source);
      else {
        const first=input.down(source,key);
        if (nativeKeys && !first) sendNative(KeyBytes(key,true));
        if (!nativeKeys && m.arg1) pushKey(m.arg1);
      }
    } else if (m.kind==1 || m.kind==2 || m.kind==3) {
      if (m.captured) {
        if (m.kind!=3) setButton(CTRL.MS_LB,m.kind==1);
        return;
      }
      if (captureWanted) {
        Atomics.add(ctrl,CTRL.MS_DX,Math.round(m.dx));
        Atomics.add(ctrl,CTRL.MS_DY,Math.round(m.dy));
      } else {
        Atomics.store(ctrl,CTRL.MS_X,Math.max(0,Math.min(639,Math.round(m.x))));
        Atomics.store(ctrl,CTRL.MS_Y,Math.max(0,Math.min(479,Math.round(m.y))));
      }
      if (m.kind!=3) setButton(CTRL.MS_LB,m.kind==1);
      speaker.resume();
    }
  });
  target.addEventListener("blur",event=>{if(target===curCanvas&&!isMouseCaptured()&&!event.relatedTarget?.closest?.("#touchui"))releaseInput();});
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
      if(!curCanvas.ownerDocument.pointerLockElement)try{target.setPointerCapture?.(e.pointerId);}catch{}
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
  if(curCanvas.closest(".win-pass-owned")) releaseMouse();
  cancelAnimationFrame(rafId);rafId=0;
  releaseInput();captureWanted=false;manualCapture=false;if(curCanvas.ownerDocument.pointerLockElement===curCanvas)curCanvas.ownerDocument.exitPointerLock();
  if (ctrl) { Atomics.store(ctrl, CTRL.RUNNING, 0); Atomics.notify(ctrl, CTRL.SLEEP_FUTEX); }
  if (worker) { worker.terminate(); worker = null; }
  if (sndTimer) { clearInterval(sndTimer); sndTimer = null; }
  running = false;nativeKeys=false;
  mouseStateChanged();
  speaker.tone(0);
  $("runBtn").innerHTML = Icon("play")+" Run";
}

async function run(source,project={}) {
  if (source===undefined) {
    try {source=sourceString(FileBytes(),documentSource.utf8);}
    catch (error) {setStatus(error.message);return;}
  }
  if (running) { stop(); return; }
  clearConsole();
  speaker.resume();

  const sab = makeControlSAB();
  ctrl = new Int32Array(sab);
  Atomics.store(ctrl, CTRL.MS_X, 320);
  Atomics.store(ctrl, CTRL.MS_Y, 240);

  //A synchronous HolyC program blocks its worker; the page presents its completed frames.
  const fbSAB = new SharedArrayBuffer(640 * 480),paletteSAB=new SharedArrayBuffer(256*4);
  const fresh = curCanvas.cloneNode(false);
  curCanvas.parentNode.replaceChild(fresh, curCanvas);
  curCanvas = fresh;
  reattachCanvas(fresh);
  mainFb = new Framebuffer(fresh.getContext("2d"), 640, 480, SCALE, new Uint8Array(fbSAB),new Uint32Array(paletteSAB));
  const sequence=ctrl.subarray(CTRL.FRAME,CTRL.FRAME+1);
  let lastFrame=0,rateFrames=0,rateStart=performance.now();
  const present = () => {
    if (!running) return;
    const frame=Atomics.load(ctrl,CTRL.FRAME)>>>0;
    if(frame!==lastFrame && mainFb.present(sequence)){rateFrames++;lastFrame=frame;}
    const now = performance.now();
    if(now-rateStart>=1000){window.__nativeFps=Math.round(rateFrames*1000/(now-rateStart));setStatus('running · '+window.__nativeFps+' fps (native)');rateFrames=0;rateStart=now;}
    rafId = requestAnimationFrame(present);
  };

  worker = new Worker(new URL("../../hemu/holyc-wasm/src/runtime/worker.js", import.meta.url), { type: "module" });
  const startedWorker=worker;
  worker.onmessage = (e) => {
    if(worker!==startedWorker)return;
    const m = e.data;
    if(m.type === 'keyboardMode'){
      nativeKeys=!!m.native;releaseInput();
    }
    else if(m.type === 'inputMode'){
      captureWanted=!!m.capture;releaseInput();
      if(captureWanted)setStatus(hybridMouse?'Hybrid mouse. Use Capture mouse or Shift+click to capture again.':'Click the screen to capture the mouse. Esc releases.');
      else if(!manualCapture&&isMouseCaptured())curCanvas.ownerDocument.exitPointerLock();
    }
    else if (m.type === "text") appendConsole(m.text);
    else if (m.type === "compiled") setStatus(`compiled ${m.size} bytes` + (m.warnings && m.warnings.length ? `, ${m.warnings.length} warnings` : ""));
    else if (m.type === "done") { if (mainFb) mainFb.present(sequence); setStatus("done"); stop(); }
    else if (m.type === "error") { if (mainFb) mainFb.present(sequence); appendConsole("\n[error] " + m.error + "\n"); setStatus(m.nativeGame?'HolyC-WASM could not run this source. See Console for the native compatibility error.':'error'); stop(); }
  };

  running = true;
  mouseStateChanged();
  $("runBtn").innerHTML = Icon("stop")+" Stop";
  setStatus("running…");
  worker.onerror=event=>{
    if(worker!==startedWorker)return;
    event.preventDefault();
    appendConsole("\n[error] "+(event.message||"The program worker could not start.")+"\n");setStatus("error");stop();
  };
  worker.postMessage({ type: "run", source, controlSAB: sab, fbSAB, paletteSAB, ...project });
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
function runIn(canvasEl, source, project={}) {
  if (running) stop();
  curCanvas = canvasEl;
  return run(source,project);
}
$("stopBtn")?.addEventListener("click", stop);  // optional second button; the overlay uses just runBtn

if (!self.crossOriginIsolated) {
  setStatus("WARNING: not cross-origin isolated - SharedArrayBuffer unavailable. Use the dev server (npm run serve).");
} else {
  setStatus("ready");
}

window.__holycEditor = { FileLoad,FileBytes,file:{name:"MyProgram.HC",path:null},FileName:()=>window.__holycEditor.file.name,run, stop, isRunning: () => running, runIn, captureMouse, releaseMouse, isMouseCaptured, hasInputFocus, keyInput:()=>running?(nativeKeys?nativeInput:screenKeys):null,
  inputCanvas:()=>running?curCanvas:null,
  touchMouse:{
    position:()=>ctrl?[Atomics.load(ctrl,CTRL.MS_X),Atomics.load(ctrl,CTRL.MS_Y)]:[320,240],
    move(x,y){
      if(!running||!ctrl)return;
      Atomics.add(ctrl,CTRL.MS_DX,x-Atomics.exchange(ctrl,CTRL.MS_X,x));
      Atomics.add(ctrl,CTRL.MS_DY,y-Atomics.exchange(ctrl,CTRL.MS_Y,y));
    },
    buttons(mask){if(running){setButton(CTRL.MS_LB,!!(mask&1));setButton(CTRL.MS_RB,!!(mask&2));}},
  },
};
