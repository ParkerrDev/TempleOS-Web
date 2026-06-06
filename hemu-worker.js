// hemu-worker.js — runs the HolyC x86-64 emulator on a dedicated Worker thread.
//
// This is the "multi-core" engine: emulation happens HERE (one CPU core) while the main thread
// palettizes + blits each framebuffer and services input/UI (a second core). The two overlap —
// while the main thread is drawing frame N, this worker is already emulating frame N+1 — so the
// blit cost leaves the critical path. The canvas stays on the main thread (frames are shipped via
// postMessage), so hemu.html can fall back to its in-line single-thread engine if this ever fails.
import { createHost } from "./holyc-wasm/src/runtime/host.js";
import { loadDisk } from "./qcow2.js";

let msX = 320, msY = 240, msB = 0, wheel = 0;   // latest pointer state from the main thread
const keyq = [];                            // set-1 scancodes from the main thread
let curBudget = 1500000, dtMs = 16;         // guest instr/frame + real wall-clock ms/frame
let outstanding = 0, snap = null, loaded = false, disk = null;

onmessage = (e) => {
  const m = e.data;
  if (m.cmd === "init") boot(m).catch(err => postMessage({ cmd: "error", msg: String(err?.message || err) }));
  else if (m.cmd === "input") { msX = m.x; msY = m.y; msB = m.b; if (m.wheel !== undefined) wheel = m.wheel; if (m.keys) for (const k of m.keys) keyq.push(k); }
  else if (m.cmd === "ack") outstanding--;   // main finished a frame — release a flow-control slot
};

async function boot({ gz, wasmUrl, fixedB }) {
  if (fixedB) curBudget = fixedB;
  postMessage({ cmd: "progress", text: "decompressing snapshot (→ 384 MB)…", pct: 60 });
  snap = new Uint8Array(await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
  postMessage({ cmd: "progress", text: "starting hemu core (HolyC → WASM)…", pct: 88 });
  const mod = await WebAssembly.compile(await (await fetch(wasmUrl)).arrayBuffer());
  // Load the C: disk in the BACKGROUND so the desktop appears immediately; TempleOS file I/O
  // (ATA reads) works once it lands. The resumed desktop runs entirely from cached RAM meanwhile.
  loadDisk("./vendor/images/templeos-hd.qcow2.gz").then(d => disk = d).catch(() => disk = null);

  const host = createHost({
    onText: (s) => { if (s && s.indexOf("BADOP") >= 0) console.log("[hemu]", s.trim()); },
    snd: { tone: (f) => postMessage({ cmd: "snd", f: Number(f) }) },   // AudioContext lives on the main thread
    snapLoad: (base, u8) => { u8.set(snap, base); },
    diskRead: (lba, count, u8, dst) => { if (disk) disk.readInto(lba, count, u8, dst); },   // ATA -> real C: sectors
    diskWrite: (lba, count, u8, src) => { if (disk) disk.writeInto(lba, count, u8, src); },  // ATA writes -> in-session overlay
    present: (addr, w, h, u8) => {
      if (outstanding >= 2) return;                       // main hasn't caught up — drop, keep emulating
      const buf = new Uint8Array(w * h);
      buf.set(u8.subarray(addr, addr + w * h));           // copy the finished frame out of WASM memory
      outstanding++;
      postMessage({ cmd: "frame", buf: buf.buffer, w, h }, [buf.buffer]);
    },
  });
  host.env.__host_msx = () => BigInt(msX);
  host.env.__host_msy = () => BigInt(msY);
  host.env.__host_msb = () => BigInt(msB);
  host.env.__host_wheel = () => BigInt(wheel);
  host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n;
  host.env.__host_budget = () => BigInt(curBudget | 0);
  host.env.__host_dt = () => BigInt(dtMs | 0);

  const inst = await WebAssembly.instantiate(mod, { env: host.env });
  host.attach(inst);
  inst.exports.__rt_init();
  postMessage({ cmd: "progress", text: "starting TempleOS…", pct: 100 });

  // Fast yield via MessageChannel: lets the loop run back-to-back (no setTimeout 4 ms clamp) while
  // still draining the input/ack messages between iterations, so this core stays saturated.
  const tick = new MessageChannel();
  let resume = null;
  tick.port1.onmessage = () => { const r = resume; resume = null; r && r(); };
  const yieldTick = () => new Promise(r => { resume = r; tick.port2.postMessage(0); });

  let lastT = performance.now();
  for (;;) {
    const now = performance.now();
    dtMs = Math.max(1, Math.min(100, now - lastT)); lastT = now;   // real wall-clock time this frame represents
    try { inst.exports.__main(); }                                 // emulate one TempleOS frame (+ present via the host)
    catch (err) { postMessage({ cmd: "error", msg: "hemu trap: " + err.message }); return; }
    if (!loaded) { loaded = true; snap = null; }                   // snapshot now in WASM RAM — free the 384 MB copy
    if (!fixedB) {                                                 // size budget to ~one composite/frame (no wasted re-composites)
      const work = performance.now() - now;
      if (work > 15 && curBudget > 900000) curBudget = (curBudget * 0.90) | 0;
      else if (work < 11 && curBudget < 2500000) curBudget = (curBudget * 1.07) | 0;
    }
    await yieldTick();
  }
}
