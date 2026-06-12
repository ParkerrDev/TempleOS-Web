// hemu-worker.js — runs the HolyC x86-64 emulator on a dedicated Worker thread.
//
// This is the "multi-core" engine: emulation happens HERE (one CPU core) while the main thread
// palettizes + blits each framebuffer and services input/UI (a second core). The two overlap —
// while the main thread is drawing frame N, this worker is already emulating frame N+1 — so the
// blit cost leaves the critical path. The canvas stays on the main thread (frames are shipped via
// postMessage), so hemu.html can fall back to its in-line single-thread engine if this ever fails.
import { createHost } from "./holyc-wasm/src/runtime/host.js";
import { loadDisk, makeDisk, fat32Upload, fat32List } from "./hemu-wasm/qcow2.js";
import * as jit from "./hemu-wasm/jit.js";             // x86-64 -> WASM block JIT (the speed: interp ~6fps -> JIT 30-65fps games)

let msX = 320, msY = 240, msB = 0, wheel = 0;   // latest pointer state from the main thread
const keyq = [];                            // set-1 scancodes from the main thread
let curBudget = 1500000, dtMs = 16;         // guest instr/frame + real wall-clock ms/frame
let outstanding = 0, snap = null, loaded = false, disk = null, gBase = 0, instRef = null;
let paused = false;
const NOJIT = /[?&]nojit/.test(self.location ? self.location.search : "");   // ?nojit -> pure interpreter (debug/fallback)
// JIT segment/TSC addresses now flow from the guest at runtime via __jit_seg (per-core CCpuState) — no hardcoded offsets to drift.

const BLKDEV = 0xBC18;                       // CBlkDevGlbls in this snapshot (stable; see qcow2.js/git history)
// Relink the guest disk cache to empty (DskCacheInvalidate2) so a host-side disk write is seen live.
function invalidateGuestCache() {
  if (!instRef || !disk) return;
  const m = new DataView(instRef.exports.memory.buffer);
  const u64 = (a) => Number(m.getBigUint64(gBase + a, true));
  const w64 = (a, v) => m.setBigUint64(gBase + a, BigInt(v), true);
  const base = u64(BLKDEV + 40), ht = u64(BLKDEV + 56), size = u64(BLKDEV + 64);
  if (!base || !ht || !size) return;
  const cnt = Math.floor(size / 560);        // sizeof(CCacheBlk) = 560
  for (let i = 0; i < cnt; i++) { const e = base + i * 560; w64(e + 16, e); w64(e + 24, e); w64(e + 32, 0); w64(e + 40, 0); }
  for (let k = 0; k < 0x2000; k++) { const bkt = ht + k * 16; w64(bkt, bkt); w64(bkt + 8, bkt); }
}

onmessage = (e) => {
  const m = e.data;
  if (m.cmd === "init") boot(m).catch(err => postMessage({ cmd: "error", msg: String(err?.message || err) }));
  else if (m.cmd === "input") { msX = m.x; msY = m.y; msB = m.b; if (m.wheel !== undefined) wheel = m.wheel; if (m.keys) for (const k of m.keys) keyq.push(k); }
  else if (m.cmd === "ack") outstanding--;   // main finished a frame — release a flow-control slot
  else if (m.cmd === "pause") { paused = m.value; postMessage({ cmd: "paused", value: paused }); }
  else if (m.cmd === "exportSnapshot") exportSnapshot();
  else if (m.cmd === "exportDisk") exportDisk();
  else if (m.cmd === "importDisk") { try { disk = makeDisk(new Uint8Array(m.bytes)); invalidateGuestCache(); postMessage({ cmd: "diskInfo", ok: true, msg: "disk imported (" + (m.bytes.byteLength / 1048576).toFixed(0) + " MB)" }); } catch (err) { postMessage({ cmd: "diskInfo", ok: false, msg: String(err.message || err) }); } }
  else if (m.cmd === "uploadFile") {
    try { if (!disk) throw new Error("disk not loaded yet — wait a moment after boot");
      const r = fat32Upload(disk, m.name, new Uint8Array(m.bytes), m.dir || "Home");
      invalidateGuestCache();
      postMessage({ cmd: "fileResult", ok: true, msg: `wrote ${m.name} to /${m.dir || "Home"} (${r.clusters} clusters)` });
    } catch (err) { postMessage({ cmd: "fileResult", ok: false, msg: String(err.message || err) }); }
  }
  else if (m.cmd === "listDir") { try { postMessage({ cmd: "dirList", ok: true, dir: m.dir, files: disk ? fat32List(disk, m.dir || "Home").map(e => ({ name: e.name, size: e.size, dir: !!(e.attr & 0x10) })) : [] }); } catch (err) { postMessage({ cmd: "dirList", ok: false, msg: String(err.message || err) }); } }
};

// Export the live guest RAM as a gzipped .hemu snapshot (resumes exactly where you are).
async function exportSnapshot() {
  if (!instRef) { postMessage({ cmd: "exportResult", kind: "snapshot", ok: false, msg: "not ready" }); return; }
  const ram = new Uint8Array(instRef.exports.memory.buffer, gBase, 402653184);
  const gz = await new Response(new Blob([ram]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  postMessage({ cmd: "exportResult", kind: "snapshot", ok: true, buf: gz }, [gz]);
}
// Export the whole C: drive (base image + this session's writes) as a gzipped raw image.
async function exportDisk() {
  if (!disk) { postMessage({ cmd: "exportResult", kind: "disk", ok: false, msg: "disk not loaded yet" }); return; }
  const total = disk.virtualSize || 0x4000000;
  const stream = new ReadableStream({
    start(c) { const SEC = 512, CH = 2048; const secs = Math.ceil(total / SEC);
      for (let lba = 0; lba < secs; lba += CH) { const n = Math.min(CH, secs - lba); const b = new Uint8Array(n * SEC); disk.readInto(lba, n, b, 0); c.enqueue(b); }
      c.close(); }
  });
  const gz = await new Response(stream.pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  postMessage({ cmd: "exportResult", kind: "disk", ok: true, buf: gz }, [gz]);
}

// Stream-decompress into ONE preallocated buffer: Response.arrayBuffer() would hold all the
// inflate chunks AND the assembled copy at once (~2x peak) — phones live or die on this.
async function gunzipInto(gz, size) {
  const out = new Uint8Array(size);
  const rd = new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
  let off = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break;
    if (off + value.length > size) throw new Error("snapshot larger than expected");
    out.set(value, off); off += value.length; }
  return out;
}

async function boot({ gz, wasmUrl, fixedB, diskBytes }) {
  if (fixedB) curBudget = fixedB;
  postMessage({ cmd: "progress", text: "decompressing snapshot (→ 384 MB)…", pct: 60 });
  snap = await gunzipInto(gz, 402653184);
  gz = null;                                   // free the 10 MB clone — boot() never returns
  if (diskBytes) { try { disk = makeDisk(new Uint8Array(diskBytes)); } catch (e) { console.warn("imported disk failed:", e); } }
  postMessage({ cmd: "progress", text: "starting hemu core (HolyC → WASM)…", pct: 88 });
  const mod = await WebAssembly.compile(await (await fetch(wasmUrl, { cache: "no-cache" })).arrayBuffer());

  const host = createHost({
    onText: (s) => { if (s && s.indexOf("BADOP") >= 0) console.log("[hemu]", s.trim()); },
    snd: { tone: (f) => postMessage({ cmd: "snd", f: Number(f) }) },   // AudioContext lives on the main thread
    snapLoad: (base, u8) => { gBase = base; u8.set(snap, base); },   // capture gBase for the JIT
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
  // |0 on every BigInt crossing: a fractional value (trackpad movementX, joystick velocity)
  // throws "Not an integer" in BigInt() and traps the whole emulator.
  host.env.__host_msx = () => BigInt(msX | 0);
  host.env.__host_msy = () => BigInt(msY | 0);
  host.env.__host_msb = () => BigInt(msB | 0);
  host.env.__host_wheel = () => BigInt(wheel | 0);
  host.env.__host_key = () => keyq.length ? BigInt(keyq.shift() | 0) : -1n;
  host.env.__host_budget = () => BigInt(curBudget | 0);
  host.env.__host_dt = () => BigInt(dtMs | 0);
  // ---- JIT wiring: blocks read hemu's shared state at the offsets passed via __jit_state/__jit_x87/__jit_chain;
  //      __jit_state returns 1 to ENABLE (return 0n / ?nojit -> pure interpreter). See jit.js + JIT-DESIGN.md. ----
  let inst;
  if (!NOJIT) {
    host.env.__jit_state = (rg, fl, rp) => { jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem, inst.exports.RasterHLE); return 1n; };
    host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip)));
    host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
    host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c);
    host.env.__jit_dispatch = (b) => BigInt(jit.jitDispatch(Number(b)));
    host.env.__jit_chain = (a, b) => jit.jitChain(a, b);
    host.env.__jit_seg = (...a) => jit.jitSeg(...a.map(Number));
    jit.jitReset();
    console.log("[hemu] JIT enabled (x86-64 -> WASM)");
  } else console.log("[hemu] JIT disabled (?nojit) — pure interpreter");

  inst = await WebAssembly.instantiate(mod, { env: host.env });
  instRef = inst;
  host.attach(inst);
  inst.exports.__rt_init();
  postMessage({ cmd: "progress", text: "starting TempleOS…", pct: 100 });

  // Fast yield via MessageChannel: drains input/ack messages between iterations without the
  // setTimeout 4 ms clamp (used when the frame already ran long and there's nothing to sleep).
  const tick = new MessageChannel();
  let resume = null;
  tick.port1.onmessage = () => { const r = resume; resume = null; r && r(); };
  const yieldTick = () => new Promise(r => { resume = r; tick.port2.postMessage(0); });
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Pace the loop at ~60 __main/s. Pre-JIT, emulation was slow enough to self-pace near 60; the JIT
  // made __main fast, so the unthrottled loop spun 150-220+/s and every per-refresh animation (title
  // marquee, window wiggle, cursor) ran that much faster — the "everything ~2x speed" bug. The guest's
  // own refresh gate now paces drawing at ~31fps (snapshot.HC); 60Hz here keeps input/present snappy.
  // dt carries a fractional accumulator so integer ms truncation doesn't slow the guest clock (~12%
  // at 240Hz, ~4% at 60Hz — jiffies/tS now track wall-clock exactly).
  const FRAME_MS = 1000 / 60;
  let lastT = performance.now(), dtAcc = 0;
  for (;;) {
    const now = performance.now();
    dtAcc += now - lastT; lastT = now;
    if (dtAcc > 100) dtAcc = 100;                                  // tab was backgrounded — don't fast-forward
    dtMs = Math.max(1, Math.min(100, Math.floor(dtAcc)));
    dtAcc -= dtMs;                                                 // carry the sub-ms remainder to the next frame
    if (paused) { await sleep(80); lastT = performance.now(); dtAcc = 0; continue; }   // ⏸ freeze guest time too
    try { inst.exports.__main(); }                                 // emulate one TempleOS frame (+ present via the host)
    catch (err) { postMessage({ cmd: "error", msg: "hemu trap: " + err.message }); return; }
    if (!loaded) { loaded = true; snap = null;                     // snapshot now in WASM RAM — free the 384 MB copy
      // Load the C: disk AFTER boot settles (file I/O works once it lands; the desktop runs from
      // cached RAM). Deferring it keeps the disk decompress out of the boot memory spike — the
      // difference between living and dying on iOS Safari's per-tab memory budget.
      if (!disk) setTimeout(() => loadDisk("./vendor/images/templeos-hd.qcow2.gz").then(d => disk = d).catch(() => disk = null), 2500);
    }
    const work = performance.now() - now;
    if (!fixedB) {                                                 // size budget to fill the frame (games need the MIPS;
      if (work > 15 && curBudget > 900000) curBudget = (curBudget * 0.90) | 0;        // slow machines auto-shrink)
      else if (work < 11 && curBudget < 24000000) curBudget = (curBudget * 1.07) | 0;
    }
    const wait = FRAME_MS - (performance.now() - now);
    if (wait > 1) await sleep(wait); else await yieldTick();
  }
}
