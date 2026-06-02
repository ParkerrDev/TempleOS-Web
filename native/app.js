// app.js — main-thread controller for the in-browser HolyC IDE.
// Spawns the worker, wires keyboard/mouse into the control SAB, drains the
// sound ring into WebAudio, and shows console output.
import { Speaker } from "./src/runtime/sound.js";
import {
  CTRL, KB_BASE, KB_RING, SND_BASE, SND_RING, SND_TONE, SND_NOTE, makeControlSAB,
} from "./src/runtime/protocol.js";
import { DEMOS } from "./demos.js";
import { Framebuffer } from "./src/runtime/graphics.js";
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
    // bundle — fetch the .HC on demand instead of bloating every page load.
    setStatus("fetching " + path + " …");
    try { const r = await fetch(path); if (r.ok) src = await r.text(); } catch (e) {}
  }
  if (src != null) { editor.value = src; setStatus("loaded " + path); }
  else { editor.value = "// missing source: " + path; setStatus("load failed"); }
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

window.addEventListener("keydown", (e) => {
  if (!running) return;
  // let typical browser shortcuts through when not focused on canvas
  const c = keyToChar(e);
  if (c) { pushKey(c); e.preventDefault(); }
});

// ---- pointer (mouse + touch + pen) -> control SAB ----
// One handler set, reused for the canvas (it gets swapped on each Run, so we
// (re)attach via attachInput()). Touch and mouse both map to the single
// TempleOS mouse cursor + left button, so finger taps act like clicks.
function setMousePos(target, clientX, clientY) {
  if (!ctrl) return;
  const r = target.getBoundingClientRect();
  const x = Math.round((clientX - r.left) * (640 / r.width));
  const y = Math.round((clientY - r.top) * (480 / r.height));
  Atomics.store(ctrl, CTRL.MS_X, Math.max(0, Math.min(639, x)));
  Atomics.store(ctrl, CTRL.MS_Y, Math.max(0, Math.min(479, y)));
}
function setButton(which, down) {
  if (!ctrl) return;
  Atomics.store(ctrl, which, down ? 1 : 0);
  Atomics.notify(ctrl, CTRL.SLEEP_FUTEX); // wake a blocked GetChar/Sleep loop
}

function attachInput(target) {
  // Pointer Events cover mouse, touch, and pen in one API where supported.
  if (window.PointerEvent) {
    target.addEventListener("pointermove", (e) => { setMousePos(target, e.clientX, e.clientY); });
    target.addEventListener("pointerdown", (e) => {
      target.setPointerCapture?.(e.pointerId);
      setMousePos(target, e.clientX, e.clientY);
      setButton(e.button === 2 ? CTRL.MS_RB : CTRL.MS_LB, true);
      speaker.resume();
      target.focus?.();
      e.preventDefault();
    });
    target.addEventListener("pointerup", (e) => { setButton(e.button === 2 ? CTRL.MS_RB : CTRL.MS_LB, false); e.preventDefault(); });
    target.addEventListener("pointercancel", () => { setButton(CTRL.MS_LB, false); setButton(CTRL.MS_RB, false); });
  } else {
    // Fallback for older browsers: explicit mouse + touch.
    target.addEventListener("mousemove", (e) => setMousePos(target, e.clientX, e.clientY));
    target.addEventListener("mousedown", (e) => { setMousePos(target, e.clientX, e.clientY); setButton(e.button === 2 ? CTRL.MS_RB : CTRL.MS_LB, true); speaker.resume(); });
    target.addEventListener("mouseup", (e) => setButton(e.button === 2 ? CTRL.MS_RB : CTRL.MS_LB, false));
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
  if (ctrl) { Atomics.store(ctrl, CTRL.RUNNING, 0); Atomics.notify(ctrl, CTRL.SLEEP_FUTEX); }
  if (worker) { worker.terminate(); worker = null; }
  if (sndTimer) { clearInterval(sndTimer); sndTimer = null; }
  running = false;
  speaker.tone(0);
  $("runBtn").textContent = "▶ Run";
}

async function run() {
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
  // present + an HONEST fps counter: count only frames where the framebuffer
  // actually changed (real animation frames), capped at the display refresh — so a
  // static screen reads 0, not a misleading 60. This is the *visible* native fps.
  let _ph = 0, _rf = 0, _t0 = performance.now();
  const fbBytes = new Uint8Array(fbSAB);
  const present = () => {
    if (!running) return;
    mainFb.present();
    // full-coverage change detection: a single changed pixel must register, so
    // sparse-update demos (Bounce, RandDemo) are counted honestly, not skipped.
    let h = 0; for (let i = 0; i < fbBytes.length; i++) h = (h * 33 + fbBytes[i]) | 0;
    if (h !== _ph) { _rf++; _ph = h; }
    const now = performance.now();
    if (now - _t0 >= 1000) { window.__nativeFps = _rf; setStatus("running · " + _rf + " fps (native)"); _rf = 0; _t0 = now; }
    rafId = requestAnimationFrame(present);
  };

  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "text") appendConsole(m.text);
    else if (m.type === "compiled") setStatus(`compiled ${m.size} bytes` + (m.warnings && m.warnings.length ? `, ${m.warnings.length} warnings` : ""));
    else if (m.type === "done") { if (mainFb) mainFb.present(); setStatus("done"); stop(); }  // present the FINAL frame (fast finite demos finish before the first rAF)
    else if (m.type === "error") { if (mainFb) mainFb.present(); appendConsole("\n[error] " + m.error + "\n"); setStatus("error"); stop(); }
  };

  running = true;
  $("runBtn").textContent = "■ Stop";
  setStatus("running…");
  worker.postMessage({ type: "run", source: editor.value, controlSAB: sab, fbSAB });
  rafId = requestAnimationFrame(present);

  sndTimer = setInterval(pumpSound, 16);
}

function reattachCanvas(c) {
  c.width = 640 * SCALE; c.height = 480 * SCALE;
  c.tabIndex = 0;             // focusable so it can receive key events
  attachInput(c);            // mouse + touch + pen, unified
  window._canvas = c;
}

$("runBtn").addEventListener("click", run);
$("stopBtn").addEventListener("click", stop);

// check cross-origin isolation
if (!self.crossOriginIsolated) {
  setStatus("WARNING: not cross-origin isolated — SharedArrayBuffer unavailable. Use the dev server (npm run serve).");
} else {
  setStatus("ready");
}

// load a default GRAPHICS demo on open (so the Screen shows graphics, not console)
// and auto-run it, so opening the page immediately shows live, solid-60fps graphics.
{
  const def = SOURCES["Demo/Graphics/Lines.HC"] ? "Demo/Graphics/Lines.HC" : DEMOS[0].items[0].path;
  demoSel.value = def;
  loadDemo(def);
  if (self.crossOriginIsolated) setTimeout(run, 150);  // compile+run the default demo on open
}
