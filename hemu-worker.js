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

const BLKDEV = 0xBC18;                       // CBlkDevGlbls in this snapshot (verified live: cache_ctrl@+48 is the LRU-ring sentinel)
// Make a host-side disk write visible to the running OS: mark every cached block "unowned" (dv=NULL)
// so the next guest read of any block MISSES the cache (DskCacheFind compares dv) and re-reads from
// disk. We walk the LRU ring from cache_ctrl and touch ONLY dv@+32 — we do NOT rewrite the hash
// chains, hash buckets, or LRU links, so the cache structure can't be corrupted (an earlier version
// rebuilt those by hand and broke `Dir`/file reads). CCacheBlk: next_lru@0, ..., dv@32.
function invalidateGuestCache(lbas) {
  if (!instRef || !disk) return 0;
  const want = (lbas && lbas.length) ? new Set(lbas) : null;   // a set of changed sectors -> refresh ONLY those; null -> all (importDisk)
  const dvw = new DataView(instRef.exports.memory.buffer), cap = dvw.byteLength;
  const rd = (a) => (a >= 0 && gBase + a + 8 <= cap) ? Number(dvw.getBigUint64(gBase + a, true)) : 0;
  const clr = (a) => { if (a >= 0 && gBase + a + 8 <= cap) dvw.setBigUint64(gBase + a, 0n, true); };
  const ctrl = rd(BLKDEV + 48);                            // cache_ctrl (LRU ring sentinel)
  if (!ctrl) return 0;
  let p = rd(ctrl), n = 0, cleared = 0; const sample = [];
  while (p && p !== ctrl && n < (1 << 20)) {               // walk the LRU ring
    const blk = rd(p + 40);                                // this block's disk block# (CCacheBlk.blk @ +40)
    if (rd(p + 32) && sample.length < 8) sample.push(blk); // sample a few in-use blocks' block#s (diag)
    if (!want || want.has(blk)) { clr(p + 32); cleared++; } // dv=NULL only on the sectors we changed
    p = rd(p); n++;
  }
  if (want) console.log("[hemu] cacherefresh: changedLBAs=[" + [...want].slice(0, 6) + "] sampleCachedBlks=[" + sample + "] cleared=" + cleared + "/" + want.size);
  return cleared;
}

// ---- type a command into the running OS (used by osWrite to drive FileWrite + #include) ----
// Push set-1 scancodes onto keyq, paced in wall-clock time; the main loop runs __main frames
// concurrently (it awaits each iteration) and consumes them via __host_key. Pacing matters: a
// scancode BURST overruns the line-editor/AutoComplete and drops keys ("#include"->"slude").
const _SC = {a:0x1E,b:0x30,c:0x2E,d:0x20,e:0x12,f:0x21,g:0x22,h:0x23,i:0x17,j:0x24,k:0x25,l:0x26,m:0x32,n:0x31,o:0x18,p:0x19,q:0x10,r:0x13,s:0x1F,t:0x14,u:0x16,v:0x2F,w:0x11,x:0x2D,y:0x15,z:0x2C,"0":0x0B,"1":0x02,"2":0x03,"3":0x04,"4":0x05,"5":0x06,"6":0x07,"7":0x08,"8":0x09,"9":0x0A," ":0x39,"=":0x0D,";":0x27,",":0x33,".":0x34,"/":0x35,"-":0x0C,"'":0x28,"[":0x1A,"]":0x1B,"\\":0x2B};
const _SH = {"*":"8","(":"9",")":"0","&":"7","_":"-","+":"=",":":";","\"":"'","{":"[","}":"]","|":"\\","<":",",">":".","?":"/","!":"1","@":"2","#":"3","$":"4","%":"5","^":"6"};
const _wait = (ms) => new Promise(r => setTimeout(r, ms));
async function _typeInto(s, perKeyMs = 55) {
  for (const ch of s) {
    if (ch === "\n" || ch === "\r") keyq.push(0x1C, 0x9C);                 // Enter
    else if (ch === "\x1b") keyq.push(0x01, 0x81);                          // Esc
    else {
      const sh = _SH[ch] !== undefined || (ch >= "A" && ch <= "Z");
      const base = _SH[ch] !== undefined ? _SH[ch] : ch.toLowerCase();
      const code = _SC[base]; if (code === undefined) continue;
      if (sh) keyq.push(0x2A);
      keyq.push(code, code | 0x80);
      if (sh) keyq.push(0x2A | 0x80);
    }
    await _wait(perKeyMs);
  }
}

// Write a file to C:/Home THROUGH THE OS's own filesystem. The bytes are staged in a high scratch
// region of guest RAM, then we type a FileWrite() call at the shell prompt. Because the OS does the
// write itself, the disk image AND the guest's disk cache stay consistent — unlike the host-side
// fat32Upload + cache-poke (uploadFile), which corrupted Dir/file reads. run=true then #includes it.
// We capture FileWrite's return value (the file's first cluster — non-zero on success, 0 on failure)
// in a mailbox and read it back: the OS's own verdict. (Don't verify with fat32List — TempleOS's disk
// cache is WRITE-BACK, so a just-written file isn't on the disk image yet, only in the cache.)
const OSW_SCRATCH = 0x16800000;                 // ~360 MB into the 384 MB guest RAM — free scratch (proven in the headless rig)
const OSW_MBOX    = 0x16700000;                 // FileWrite's return value lands here so the host can read it
async function osWrite({ name, bytes, run }) {
  if (!instRef) throw new Error("engine not ready");
  if (!disk) throw new Error("disk not loaded yet — wait a moment after boot");
  const data = new Uint8Array(bytes);
  const dvw = new DataView(instRef.exports.memory.buffer);
  if (gBase + OSW_SCRATCH + data.length > dvw.byteLength) throw new Error("file too large to stage");
  new Uint8Array(instRef.exports.memory.buffer).set(data, gBase + OSW_SCRATCH);   // 1. stage bytes in guest RAM
  await _typeInto("\x1b", 120); await _wait(250);                                  // 2. clear any AutoComplete popup / leave a menu
  const path = "C:/Home/" + name, hx = "0x" + OSW_SCRATCH.toString(16).toUpperCase(), mb = "0x" + OSW_MBOX.toString(16).toUpperCase();
  dvw.setBigUint64(gBase + OSW_MBOX, 0n, true);                                    // 3. drive the OS's own FileWrite, capturing its return
  await _typeInto(`*(${mb})(I64*)=FileWrite("${path}",${hx},${data.length});\n`);
  await _wait(1800);
  const ok = dvw.getBigInt64(gBase + OSW_MBOX, true) !== 0n;                       // non-zero first cluster == success
  postMessage({ cmd: "fileResult", ok, msg: ok
    ? `wrote ${name} to C:/Home via the OS (${data.length} b)`
    : `the OS did not write ${name} — make sure TempleOS is at a shell prompt, then try again` });
  if (ok && run) { await _wait(300); await _typeInto(`#include "${path}";\n`); }   // 4. run it
}

onmessage = (e) => {
  const m = e.data;
  if (m.cmd === "init") boot(m).catch(err => postMessage({ cmd: "error", msg: String(err?.message || err) }));
  else if (m.cmd === "input") { msX = m.x; msY = m.y; msB = m.b; if (m.wheel !== undefined) wheel = m.wheel; if (m.keys) for (const k of m.keys) keyq.push(k); }
  else if (m.cmd === "osWrite") osWrite(m).catch(err => postMessage({ cmd: "fileResult", ok: false, msg: String(err?.message || err) }));
  else if (m.cmd === "ack") outstanding--;   // main finished a frame — release a flow-control slot
  else if (m.cmd === "pause") { paused = m.value; postMessage({ cmd: "paused", value: paused }); }
  else if (m.cmd === "exportSnapshot") exportSnapshot();
  else if (m.cmd === "exportDisk") exportDisk();
  else if (m.cmd === "importDisk") { try { disk = makeDisk(new Uint8Array(m.bytes)); invalidateGuestCache(); postMessage({ cmd: "diskInfo", ok: true, msg: "disk imported (" + (m.bytes.byteLength / 1048576).toFixed(0) + " MB)" }); } catch (err) { postMessage({ cmd: "diskInfo", ok: false, msg: String(err.message || err) }); } }
  else if (m.cmd === "uploadFile") {
    try { if (!disk) throw new Error("disk not loaded yet — wait a moment after boot");
      const before = new Set(disk.overlay.keys());                       // which sectors are already overlaid
      const r = fat32Upload(disk, m.name, new Uint8Array(m.bytes), m.dir || "Home");
      const changed = []; for (const k of disk.overlay.keys()) if (!before.has(k)) changed.push(k);   // sectors this write touched
      const cleared = invalidateGuestCache(changed);                     // refresh ONLY those in the guest cache
      postMessage({ cmd: "fileResult", ok: true, msg: `wrote ${m.name} to /${m.dir || "Home"} (${r.clusters} clusters; ${changed.length} sectors, ${cleared} cached refreshed)` });
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

// `smp` (optional) = { mem: shared WebAssembly.Memory, ctrl: SharedArrayBuffer, ipiAddr, ncore } — when
// present this worker is the SMP BSP (core 0): it instantiates the shared-memory engine over `mem`, and
// after the desktop settles it releases the AP workers (which run RunCore over the same memory) so games
// that spawn parallel jobs (Talons, Varoom) actually complete. No `smp` => the original single-core path,
// byte-for-byte unchanged.
let smpCfg = null, apsReleased = false, bootFrames = 0;
async function boot({ gz, wasmUrl, fixedB, diskBytes, smp }) {
  smpCfg = smp || null;
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
      // SMP: stop-the-world for the frame copy. Pause the AP cores via an atomic handshake, which (a) stops
      // concurrent writes so the captured frame isn't torn, and (b) makes the BSP ACQUIRE the APs' writes
      // (seq-cst) so the frame isn't a stale/blank buffer (the white-screen race). Timeout -> never hangs.
      let pc = null;
      if (smpCfg) { pc = new Int32Array(smpCfg.ctrl); Atomics.store(pc, 2, 1);   // PAUSE_REQ
        const dl = performance.now() + 6;
        while (Atomics.load(pc, 3) < smpCfg.ncore - 1 && performance.now() < dl) { /* spin until APs ack (or timeout) */ } }
      const buf = new Uint8Array(w * h);
      buf.set(u8.subarray(addr, addr + w * h));           // copy the finished frame out of WASM memory
      if (pc) { Atomics.store(pc, 3, 0); Atomics.store(pc, 2, 0); Atomics.notify(pc, 2); }   // resume APs
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

  if (smpCfg) host.env.mem = smpCfg.mem;                          // SMP BSP: instantiate over the shared memory (snapshot-smp.wasm imports env.mem)
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
    if (smpCfg && !apsReleased && ++bootFrames > 120) {            // desktop settled -> release the AP workers (parallel from here)
      const dvm = new DataView(smpCfg.mem.buffer);
      for (let k = 1; k < smpCfg.ncore; k++) dvm.setBigUint64(smpCfg.ipiAddr + k * 8, 0n, true);   // drop stale boot-IPIs
      const c = new Int32Array(smpCfg.ctrl); Atomics.store(c, 0, 1); Atomics.notify(c, 0);          // CTRL.READY = 1
      apsReleased = true; postMessage({ cmd: "smpReady", ncore: smpCfg.ncore });
    }
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
