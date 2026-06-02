// worker.js — runs a compiled HolyC program with TempleOS-style blocking
// semantics inside a Web Worker.
//
// Key trick: HolyC programs use synchronous infinite loops with Sleep()/ScanChar.
// In a worker we can block with Atomics.wait, so Sleep() really suspends the
// thread and the UI stays responsive (the worker isn't the UI thread). Graphics
// go straight to an OffscreenCanvas; sound commands are pushed to a ring the
// main thread drains into WebAudio; keyboard/mouse come in through the same SAB.
import { compileHolyC } from "./src/compiler.js";
import { createHost } from "./src/runtime/host.js";
import { Framebuffer } from "./src/runtime/graphics.js";
import { CTRL, KB_BASE, KB_RING, SND_BASE, SND_RING, SND_TONE, SND_NOTE } from "./src/runtime/protocol.js";

let ctrl = null;       // Int32Array view over the control SAB
let fb = null;         // Framebuffer over OffscreenCanvas
let lastFlip = 0;

function nowMs() { return performance.now(); }

// --- input ---
function scanChar() {
  // peek without consuming
  const head = Atomics.load(ctrl, CTRL.KB_HEAD);
  const tail = Atomics.load(ctrl, CTRL.KB_TAIL);
  if (head === tail) return 0;
  return Atomics.load(ctrl, KB_BASE + (tail % KB_RING));
}
function getChar() {
  // blocking: wait until a char is available, then consume it
  while (Atomics.load(ctrl, CTRL.RUNNING) === 1) {
    const head = Atomics.load(ctrl, CTRL.KB_HEAD);
    const tail = Atomics.load(ctrl, CTRL.KB_TAIL);
    if (head !== tail) {
      const ch = Atomics.load(ctrl, KB_BASE + (tail % KB_RING));
      Atomics.store(ctrl, CTRL.KB_TAIL, tail + 1);
      return ch;
    }
    // sleep briefly waiting for input
    Atomics.wait(ctrl, CTRL.SLEEP_FUTEX, 0, 16);
  }
  return 0x1b; // ESC if stopped
}
function consumeChar() {
  const head = Atomics.load(ctrl, CTRL.KB_HEAD);
  const tail = Atomics.load(ctrl, CTRL.KB_TAIL);
  if (head === tail) return 0;
  const ch = Atomics.load(ctrl, KB_BASE + (tail % KB_RING));
  Atomics.store(ctrl, CTRL.KB_TAIL, tail + 1);
  return ch;
}

// --- timing ---
function sleep(ms) {
  if (Atomics.load(ctrl, CTRL.RUNNING) !== 1) return;
  if (ms <= 0) { presentMaybe(true); return; }
  presentMaybe(true);
  // block the worker thread; wake early if stop requested via notify
  let remain = ms;
  const step = 50;
  while (remain > 0 && Atomics.load(ctrl, CTRL.RUNNING) === 1) {
    Atomics.wait(ctrl, CTRL.SLEEP_FUTEX, 0, Math.min(step, remain));
    remain -= step;
  }
}

// --- sound ring (worker -> main) ---
function pushSnd(type, arg) {
  const head = Atomics.load(ctrl, CTRL.SND_HEAD);
  const slot = SND_BASE + (head % SND_RING) * 2;
  Atomics.store(ctrl, slot, type);
  Atomics.store(ctrl, slot + 1, Math.round(arg));
  Atomics.store(ctrl, CTRL.SND_HEAD, head + 1);
}

// --- graphics present throttling ---
function presentMaybe(force) {
  const t = nowMs();
  if (force || t - lastFlip > 16) {
    lastFlip = t;
    Atomics.add(ctrl, CTRL.FRAME, 1);   // signal the main-thread presenter
  }
}

// --- mouse mirror into wasm memory ---
function updateMouseMemory(host) {
  // host.state.mem holds the wasm memory; ms struct lives at MS_ADDR
  // CMouse { CD3I32 pos{ I32 x,y,z }, I32 lb, I32 rb } -> see prelude
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === "run") {
    const { source, controlSAB, fbSAB } = msg;
    ctrl = new Int32Array(controlSAB);
    // Draw into the SHARED index buffer; the main thread presents it. (A worker
    // blocked in a synchronous program loop never composites its own canvas.)
    fb = new Framebuffer(null, 640, 480, 1, new Uint8Array(fbSAB));

    let outBuf = "";
    const flush = () => { if (outBuf) { self.postMessage({ type: "text", text: outBuf }); outBuf = ""; } };

    let host;
    try {
      const { bytes, warnings } = compileHolyC(source, { filename: "program.HC", lenient: true, resilient: true });
      self.postMessage({ type: "compiled", size: bytes.length, warnings });

      host = createHost({
        ansi: false,
        onText: (s) => { outBuf += s; if (outBuf.length > 256 || s.includes("\n")) flush(); },
        gfx: {
          width: 640, height: 480,
          plot: (x, y, c) => fb.plot(x, y, c),
          line: (x1, y1, x2, y2, c, t) => fb.line(x1, y1, x2, y2, c, t),
          rect: (x, y, w, h, c) => fb.rect(x, y, w, h, c),
          circle: (x, y, r, c, fl) => fb.circle(x, y, r, c, fl),
          text: (x, y, c, s) => fb.text(x, y, c, s),
          sprite: (x, y, w, h, px, scale) => fb.sprite(x, y, w, h, px, scale),
          fill: (c) => { fb.fill(c); },
          flip: () => presentMaybe(true),
        },
        snd: {
          tone: (f) => pushSnd(SND_TONE, f),
          note: (f, ms) => { pushSnd(SND_NOTE, f); sleep(ms); pushSnd(SND_TONE, 0); },
        },
        sleep: (ms) => sleep(ms),
        yield: () => presentMaybe(false),
        scanChar: () => scanChar(),
        getChar: (echo, scan) => { const ch = getChar(); return ch; },
        timeMs: () => nowMs(),
      });

      const mod = await WebAssembly.compile(bytes);
      const inst = await WebAssembly.instantiate(mod, { env: host.env });
      host.attach(inst);

      // mirror the mouse SAB into the wasm `ms` struct on every tick
      const MS_ADDR = 64;
      host.state.onTick = () => {
        const dv = new DataView(inst.exports.memory.buffer);
        dv.setInt32(MS_ADDR + 0, Atomics.load(ctrl, CTRL.MS_X), true);
        dv.setInt32(MS_ADDR + 4, Atomics.load(ctrl, CTRL.MS_Y), true);
        dv.setInt32(MS_ADDR + 8, Atomics.load(ctrl, CTRL.MS_Z), true);
        dv.setInt32(MS_ADDR + 12, Atomics.load(ctrl, CTRL.MS_LB), true);
        dv.setInt32(MS_ADDR + 16, Atomics.load(ctrl, CTRL.MS_RB), true);
      };

      Atomics.store(ctrl, CTRL.RUNNING, 1);
      host.state.onTick();
      inst.exports.__main();
      flush();
      fb.present();
      Atomics.store(ctrl, CTRL.DONE, 1);
      self.postMessage({ type: "done" });
    } catch (err) {
      flush();
      Atomics.store(ctrl, CTRL.DONE, 1);
      self.postMessage({ type: "error", error: String(err && err.stack || err) });
    }
  }
};
