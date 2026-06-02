// os-qemu.js — boot real 64-bit TempleOS on QEMU-WASM, HEAVILY INSTRUMENTED so
// we can see exactly where it stalls. Every step logs to an on-page console + a
// main-thread heartbeat proves whether the UI thread is alive or blocked.
const $ = (id) => document.getElementById(id);
const canvas = $("canvas");

// Resolve every asset relative to wherever this static site is deployed, so it
// works at a domain root (Netlify / Cloudflare / Vercel) OR a GitHub Pages project
// subpath (e.g. https://user.github.io/TempleOS-wasm/). document.baseURI is the
// page URL; new URL("./", …) is its directory (with trailing slash).
const BASE = new URL("./", document.baseURI).href;
const QEMU_BASE = BASE + "vendor/qemu-sdl";
// Cache-buster: bump this whenever the QEMU build changes. A fresh ?v= makes the
// URLs distinct and forces a clean fetch past any immutable caching.
const V = "v=20260602c";
const ROM_BASE = `${BASE}vendor/qemu/load-rom.data?${V}`;
const ISO_URL = `${BASE}vendor/images/TempleOS.ISO?${V}`;
const WASM_URL = `${QEMU_BASE}/qemu-system-x86_64.wasm?${V}`;
// INSTANT BOOT: a pre-baked post-boot snapshot (QEMU migration stream of the
// RAM + device state, gzipped). Restoring it with `-incoming file:/snapshot.bin`
// skips the ~30–90s self-compile AND the install prompts — boot is ~1–2s.
// `?nosnap` forces a full cold boot (and the guided prompts).
// hemu runs the UNMODIFIED TempleOS V5.03 (RedSea install on C:) — nothing patched.
const SNAP_URL = `${BASE}vendor/images/snapshot.bin.gz?${V}`;
// The DEFAULT experience is the real INSTALLED TempleOS: it boots from a
// pre-installed hard-disk image (RedSea on C:), restored instantly from a
// post-boot snapshot. `?nosnap` = cold hard-drive boot (the ~30–90s self-compile).
const DISK_URL = `${BASE}vendor/images/templeos-hd.qcow2.gz?${V}`;
// `?install` is one-time TOOLING: blank disk + live CD so TempleOS's VM installer
// formats it and copies ::/ → C:/ — we extract that to make the shipped disk.
const INSTALL = /[?&]install/.test(location.search);
const INSTALL_DISK_MB = 100;          // blank disk size; DskPrt splits it 50% C: / 50% D:
const HD = !INSTALL;                  // boot the installed hard disk (everything except ?install)
// NOTE: multi-core (`-smp N` + MTTCG) was measured and is ~8× SLOWER here (≈5 fps
// vs ≈40) — per-vCPU thread sync (BQL + WASM Atomics + ASYNCIFY) dwarfs any
// parallelism, and the desktop redraw is single-threaded anyway. So: single vCPU.
const USE_SNAP = !/[?&]nosnap/.test(location.search) && !INSTALL;

const ROM_FILES = [
  ["/pack-rom/bios-256k.bin", 0, 262144],
  ["/pack-rom/efi-virtio.rom", 262144, 422912],
  ["/pack-rom/kvmvapic.bin", 422912, 432128],
  ["/pack-rom/linuxboot_dma.bin", 432128, 433664],
  ["/pack-rom/vgabios-stdvga.bin", 433664, 473088],
];

let booted = false, t0 = performance.now();

// ---- on-page debug log (so you can read/paste what happened) ----
function ts() { return ((performance.now() - t0) / 1000).toFixed(2) + "s"; }
function log(msg, cls) {
  const el = $("dbg");
  if (el) {
    const line = document.createElement("div");
    if (cls) line.className = cls;
    line.textContent = `[${ts()}] ${msg}`;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
  }
  (cls === "err" ? console.error : console.log)(`[os-qemu ${ts()}] ${msg}`);
}
function setStatusLine(s) { const el = $("ldtext"); if (el) el.textContent = s; }
function setBar(pct) { const b = $("ldbar"); if (b) b.style.width = Math.max(2, Math.min(100, pct)) + "%"; }

// ---- MAIN-THREAD HEARTBEAT: a rAF loop. If it stops counting, the main thread
// is genuinely BLOCKED (frozen). If it keeps counting, the main thread is alive
// and any slowness is elsewhere. This is the key diagnostic. ----
let beats = 0, lastBeat = performance.now(), maxGap = 0;
function heartbeat() {
  const now = performance.now();
  const gap = now - lastBeat; lastBeat = now;
  if (gap > maxGap) maxGap = gap;
  beats++;
  const hb = $("hb");
  if (hb) hb.textContent = `main-thread alive: ${beats} beats · worst stall ${maxGap.toFixed(0)}ms`;
  requestAnimationFrame(heartbeat);
}
requestAnimationFrame(heartbeat);

// ---- catch EVERYTHING ----
window.addEventListener("error", (e) => log("window.error: " + (e.message || e.error || e), "err"));
window.addEventListener("unhandledrejection", (e) => log("unhandledrejection: " + (e.reason && (e.reason.stack || e.reason.message) || e.reason), "err"));

function fmtMB(b) { return (b / 1048576).toFixed(1) + "MB"; }

// Decompress a fetched .gz, but only if it's actually still gzipped. Some static
// hosts serve .gz with `Content-Encoding: gzip`, so the browser already
// decompressed it (no gzip magic left) — in that case use the bytes as-is.
// Keeps the loader working on Netlify / Cloudflare Pages / GitHub Pages alike.
async function gunzipMaybe(bytes) {
  if (!(bytes[0] === 0x1f && bytes[1] === 0x8b)) return bytes;
  const ds = new DecompressionStream("gzip");
  return new Uint8Array(await new Response(new Response(bytes).body.pipeThrough(ds)).arrayBuffer());
}

async function fetchProgress(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks = []; let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; onProgress && onProgress(got, total); }
  const out = new Uint8Array(got); let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

async function boot() {
  if (booted) return;
  booted = true; t0 = performance.now();
  $("bootBtn").disabled = true;
  $("dbg").style.display = "block";

  log("crossOriginIsolated = " + window.crossOriginIsolated);
  log("SharedArrayBuffer = " + (typeof SharedArrayBuffer !== "undefined"));
  log("Atomics.waitAsync = " + (typeof Atomics !== "undefined" && typeof Atomics.waitAsync === "function"));
  log("hardwareConcurrency = " + navigator.hardwareConcurrency);
  log("OffscreenCanvas = " + (typeof OffscreenCanvas !== "undefined") + ", canvas.transferControlToOffscreen = " + (typeof canvas.transferControlToOffscreen === "function"));
  if (typeof SharedArrayBuffer === "undefined") { setStatusLine("SharedArrayBuffer unavailable — must run via the dev server (COOP/COEP)."); log("ABORT: no SharedArrayBuffer", "err"); return; }

  // ---- download (rom + wasm always; ISO only for the live-CD install mode) ----
  setStatusLine("Downloading (cached after first run)…"); setBar(3);
  let rom, iso = null;
  try {
    const dl = { rom: [0,0], iso: [0,0], wasm: [0,0] };
    const paint = () => { const g = dl.rom[0]+dl.iso[0]+dl.wasm[0], t = (dl.rom[1]+dl.iso[1]+dl.wasm[1])||1; setBar((g/t)*100); setStatusLine(`Downloading ${fmtMB(g)} / ${fmtMB(t)}…`); };
    log("download start (rom + wasm" + (INSTALL ? " + iso" : "") + ")");
    const tasks = [
      fetchProgress(ROM_BASE, (g,t)=>{dl.rom=[g,t||dl.rom[1]];paint();}).then(b=>{rom=b;}),
      fetchProgress(WASM_URL, (g,t)=>{dl.wasm=[g,t||dl.wasm[1]];paint();}),
    ];
    if (INSTALL) tasks.push(fetchProgress(ISO_URL, (g,t)=>{dl.iso=[g,t||dl.iso[1]];paint();}).then(b=>{iso=b;}));
    await Promise.all(tasks);
    log(`download done: rom ${fmtMB(rom.length)}${iso ? ", iso " + fmtMB(iso.length) : ""}`);
  } catch (e) { log("download FAILED: " + e.message, "err"); setStatusLine("Download failed: " + e.message); return; }

  // ---- installed hard-disk image (default + ?nosnap) ----
  let diskBytes = null;
  if (HD) {
    try {
      setStatusLine("Downloading TempleOS hard disk…"); setBar(2);
      const gz = await fetchProgress(DISK_URL, (g, t) => { if (t) setBar((g / t) * 100); setStatusLine(`Downloading TempleOS hard disk ${fmtMB(g)}${t ? " / " + fmtMB(t) : ""}…`); });
      diskBytes = await gunzipMaybe(gz);
      log(`hard disk ready: ${fmtMB(diskBytes.length)}`);
    } catch (e) { log("disk download FAILED: " + e.message, "err"); setStatusLine("Disk download failed: " + e.message); return; }
  }

  // ---- instant-boot snapshot (optional) ----
  let snapBytes = null;
  if (USE_SNAP) {
    try {
      setStatusLine("Downloading saved TempleOS desktop (instant boot)…"); setBar(2);
      const gz = await fetchProgress(SNAP_URL, (g, t) => { if (t) setBar((g / t) * 100); setStatusLine(`Downloading saved desktop ${fmtMB(g)}${t ? " / " + fmtMB(t) : ""}…`); });
      setStatusLine("Decompressing saved desktop…");
      snapBytes = await gunzipMaybe(gz);
      log(`snapshot ready: ${fmtMB(snapBytes.length)} → instant boot via -incoming`);
    } catch (e) {
      log("snapshot unavailable (" + e.message + ") — falling back to full cold boot", "err");
      snapBytes = null;
    }
  }

  setStatusLine(snapBytes ? "Restoring saved desktop…" : "Loading QEMU module…"); setBar(100);
  log("importing out.js…");

  const Module = {
    canvas,
    // FLICKER fix: QEMU's SDL creates a window (mapped to our single canvas) for
    //   console index 0 even when it's a TEXT console (the monitor/serial/parallel
    //   "vc"), so a text console and TempleOS's VGA console fought over the canvas,
    //   flickering between the desktop and a "parallel…console" screen. We route
    //   ALL the text consoles to non-display backends (-serial/-parallel/-monitor
    //   none) so VGA is the only graphical console. (NOT -nodefaults — that also
    //   removed the keyboard.)
    // INPUT — the key fix: TempleOS has NO USB keyboard driver. Its keyboard
    //   driver (Kernel/SerialDev/Keyboard.HC) reads the PS/2 i8042 directly
    //   (port 0x60/0x64, IRQ1). Adding `-device usb-kbd` made QEMU route SDL key
    //   events to the USB HID keyboard, which TempleOS never reads → keystrokes
    //   vanished ("can't type"). So we DON'T add usb-kbd: keys go to the default
    //   PS/2 keyboard TempleOS reads natively. We DO keep usb-tablet — it gives
    //   an absolute pointer (cursor tracks the browser 1:1) and reaches TempleOS
    //   via the BIOS's USB-legacy PS/2 emulation, which is why the mouse works.
    // Same machine config for cold boot and snapshot-restore (the migration
    // stream is tied to the device set); snapshot mode just appends -incoming,
    // which restores RAM+devices from the file instead of running the BIOS boot.
    arguments: INSTALL
      // Build mode: live-boot the CD with a blank disk for TempleOS to install onto.
      ? ["-machine","pc","-m","384M","-accel","tcg,tb-size=128","-L","/pack-rom/",
         "-cdrom","/templeos.iso","-boot","d",
         "-vga","std","-display","sdl",
         "-usb","-device","usb-tablet",
         "-serial","none","-parallel","none","-monitor","none","-nic","none",
         "-drive","file=/disk.img,format=raw,if=ide,index=0"]
      // Default: boot the INSTALLED hard disk (HARDDRV mode). Same device set as
      // the snapshot was made with; snapshot mode just appends -incoming.
      : ["-machine","pc","-m","384M","-accel","tcg,tb-size=128","-L","/pack-rom/",
         "-drive","file=/disk.qcow2,format=qcow2,if=ide,index=0","-boot","c",
         "-vga","std","-display","sdl",
         "-usb","-device","usb-tablet",
         "-serial","file:/serial.out","-debugcon","file:/dbg.out","-parallel","none","-monitor","none","-nic","none",
         ...(snapBytes ? ["-incoming","file:/snapshot.bin"] : [])],
    locateFile: (p) => `${QEMU_BASE}/${p}?${V}`,
    mainScriptUrlOrBlob: `${QEMU_BASE}/out.js?${V}`,
    print: (s) => log("QEMU: " + s),
    printErr: (s) => log("QEMU.err: " + s),
    preRun: [(mod) => {
      // Force SDL to use its SOFTWARE renderer instead of WebGL/GLES2. The GL
      // path can't work here: with OffscreenCanvas the worker's GL needs a
      // context the main thread holds (createShader on undefined), and EGL
      // proxies getContext to a transferred canvas (InvalidStateError). The
      // software renderer blits pixels to the 2D canvas — no GL, no conflict.
      if (mod.ENV) {
        mod.ENV.SDL_RENDER_DRIVER = "software";
        mod.ENV.SDL_FRAMEBUFFER_ACCELERATION = "0";
        mod.ENV.SDL_HINT_RENDER_DRIVER = "software";
        log("preRun: forced SDL software renderer");
      }
      log("preRun: writing ROM + ISO into MEMFS…");
      const FS = mod.FS;
      try { FS.mkdir("/pack-rom"); } catch {}
      for (const [name, start, end] of ROM_FILES) FS.writeFile(name, rom.subarray(start, end));
      if (iso) FS.writeFile("/templeos.iso", iso);
      if (diskBytes) { FS.writeFile("/disk.qcow2", diskBytes); log("preRun: installed disk written (" + fmtMB(diskBytes.length) + ")"); }
      if (snapBytes) { FS.writeFile("/snapshot.bin", snapBytes); log("preRun: snapshot written to MEMFS (" + fmtMB(snapBytes.length) + ")"); }
      if (INSTALL) {
        FS.writeFile("/disk.img", new Uint8Array(INSTALL_DISK_MB * 1024 * 1024));  // blank raw disk to install onto
        log("preRun: blank " + INSTALL_DISK_MB + "MB disk created at /disk.img");
      }
      log("preRun: MEMFS ready");
    }],
    onAbort: (e) => log("onAbort: " + e, "err"),
    onRuntimeInitialized: () => log("onRuntimeInitialized (runtime up, about to run main)"),
    setStatus: (s) => { if (s) log("emscripten.setStatus: " + s); },
    instantiateWasm: undefined, // let emscripten do it (async)
  };

  // log every pthread spawn so we see worker creation timing
  Module.print = (s) => log("QEMU: " + s);

  canvas.addEventListener("click", () => canvas.focus());
  $("fsBtn").disabled = false;
  $("fsBtn").addEventListener("click", () => canvas.requestFullscreen && canvas.requestFullscreen());

  try {
    log("calling import()…");
    const mod = await import(`${QEMU_BASE}/out.js?${V}`);
    log("import() resolved, default fn type = " + typeof mod.default);
    setStatusLine("Compiling & starting QEMU (watch the heartbeat below)…");
    log("calling initQemu(Module)… (if heartbeat stalls now, the main thread is blocked here)");
    const inst = await mod.default(Module);
    window.__qemu = inst; // expose for snapshot create/extract tooling
    log("initQemu RESOLVED — QEMU running. Watching the screen for boot…");
    setStatusLine("Booting TempleOS… (the screen will appear when the kernel switches to graphics)");
    // Watch the canvas: in snapshot mode the restored desktop appears in ~1–2s
    // (reveal immediately); on a cold boot, keep the honest "compiling" overlay
    // up through the self-compile, then reveal + guide the user to press N.
    watchBoot(!!snapBytes);
  } catch (e) {
    log("initQemu THREW: " + (e && (e.stack || e.message) || e), "err");
    setStatusLine("Boot error — see log below.");
  }
}

// Watch the boot: keep an honest "compiling" overlay up through TempleOS's slow
// self-compile, then REVEAL the screen and GUIDE the user to answer the two boot
// prompts. We deliberately do NOT auto-press keys.
//
// What happens on a CD/DVD boot (see repo Once.HC + StrB.HC): TempleOS's HolyC
// JIT recompiles its whole system (~1s on real HW, ~30–90s emulated — the
// "loading compiler" phase, NOT a hang). Then Once.HC asks "Install onto hard
// drive (y or n)?" then "Take Tour (y or n)?" — both via YorN, which only
// accepts Y/N.
//
// Why no auto-answer: pressing 'n' is only safe while a YorN prompt is actually
// waiting. We can't detect that instant reliably across machine speeds, and a
// keystroke that lands a moment too early gets typed into the boot's command
// line ("Cd;#include Once;"), corrupting it — the HolyC lexer then faults into
// the debugger ("Still in boot phase… Type Fix;"). So instead we just hide the
// loading overlay once the compile settles and show a banner telling the user to
// press N. The keyboard works (PS/2), so pressing N when you SEE the prompt is
// perfectly safe (well-timed = YorN consumes it).
function watchBoot(snap) {
  const probe = document.createElement("canvas");
  probe.width = 640; probe.height = 480;
  const pctx = probe.getContext("2d", { willReadFrequently: true });
  const ld = $("loadui");
  const guide = $("guide");

  // Sample the framebuffer on a coarse grid, EXCLUDING the top 16px (the 1 Hz
  // clock) so the clock ticking doesn't read as activity.
  const TOP_SKIP = 16 * 640 * 4;
  const POLL = 800;               // ms between samples
  const BUSY = 60;                // >this many changed samples = screen still churning (compiling)
  const SETTLED = 5;              // ~4s calm after activity = compile done / a prompt is waiting
  const MIN_AFTER_RENDER = 6000;  // ignore brief calm in the first few seconds after first render
  const HIDE_MAX = 120000;        // hard cap so the overlay never stays up "forever"

  const sample = () => {
    pctx.drawImage(canvas, 0, 0, 640, 480);
    const d = pctx.getImageData(0, 0, 640, 480).data;
    const out = new Uint16Array((d.length - TOP_SKIP) >> 6);
    let j = 0, nz = 0;
    for (let p = TOP_SKIP; p < d.length; p += 64) { const s = d[p] + d[p+1] + d[p+2]; if (s) nz++; out[j++] = s; }
    return { out, nz };
  };
  const changed = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 48) n++; return n; };

  let prev = null, stable = 0, firstRenderAt = 0, sawBusy = false, revealed = false;
  const startedAt = performance.now();

  const reveal = (note) => {
    if (revealed) return; revealed = true;
    window.__abDone = true;
    if (ld) ld.style.display = "none";
    canvas.focus();
    // Recovery control is usable once the desktop is up.
    $("restartBtn").disabled = false;
    if (guide) {
      guide.innerHTML = snap
        ? "<b>TempleOS is ready</b> — the real installed OS, restored instantly from a snapshot. " +
          "<b>Click a window, then type</b> — capital letters work. Try a command at the <kbd>C:/Home&gt;</kbd> prompt. " +
          "Mistyped command? TempleOS pops up its debugger — just click <b>↻ Restart</b> for a clean desktop (~4s)."
        : INSTALL
        ? "<b>Building the install disk.</b> At <kbd>Install onto hard drive (y or n)?</kbd> press <kbd>Y</kbd>, " +
          "then <kbd>Y</kbd> (in a VM), a key, and let it copy."
        : "<b>Cold-booting the installed hard disk</b> (~30–90s self-compile). At the boot menu press " +
          "<kbd>1</kbd> (Drive C); at <kbd>Take Tour (y or n)?</kbd> click the screen and press <kbd>N</kbd>. " +
          "You’ll land at <kbd>C:/Home&gt;</kbd> — then type normally (capital letters work). " +
          "(Tip: reload without <kbd>?nosnap</kbd> for the instant snapshot boot.)";
      guide.style.display = "block";
    }
    log(note);
  };

  const iv = setInterval(() => {
    if (revealed) { clearInterval(iv); return; }
    let cur, nz;
    try { ({ out: cur, nz } = sample()); } catch (e) { return; } // canvas not ready

    if (nz < 200) return;   // still black — kernel hasn't switched to VGA yet
    if (!firstRenderAt) {
      firstRenderAt = performance.now();
      if (ld) ld.classList.add("dim");
      if (snap) {
        log("restoring saved desktop — appears in ~1–2s…");
        setStatusLine("Restoring saved TempleOS desktop…");
      } else {
        log("screen is rendering — TempleOS is compiling its system on boot (~30–90s)…");
        setStatusLine("TempleOS is compiling its own system on boot — ~30–90s in the browser. The screen below is live; please wait…");
      }
      setBar(100);
    }

    // SNAPSHOT mode: no compile, no prompts — reveal once the restored desktop
    // has painted (a brief moment after first render).
    if (snap) {
      if ((performance.now() - firstRenderAt) > 1500) reveal("saved desktop restored — ready to use.");
      return;
    }

    const diff = prev ? changed(cur, prev) : 999;
    prev = cur;
    if (diff > BUSY) { sawBusy = true; stable = 0; return; } // compiling/scrolling
    stable++;

    // Reveal as soon as the compile settles (a prompt is waiting), or after a
    // hard cap so the overlay is never stuck up. NO keystrokes are sent.
    if (sawBusy && stable >= SETTLED && (performance.now() - firstRenderAt) > MIN_AFTER_RENDER)
      reveal("compile settled — desktop revealed; press N at the install & tour prompts.");
    else if ((performance.now() - startedAt) > HIDE_MAX)
      reveal("revealing the desktop — press N at any (y or n)? prompt.");
  }, POLL);
}

// NOTE: we intentionally do NOT synthesize key/mouse events to auto-answer the
// boot prompts — mistimed synthetic keys corrupt TempleOS's boot command line
// and fault it into the debugger ("Still in boot phase… Type Fix;"). The user
// presses N at the prompts instead (see watchBoot + the on-page guide banner).
// Real keyboard/mouse work via the PS/2 path + usb-tablet.

// Single emulated build: UNMODIFIED TempleOS on hemu.
$("bootBtn").addEventListener("click", boot);
// NATIVE — not the emulator at all: TempleOS HolyC graphics compiled straight to WASM
// and run directly (the holyc-wasm compiler + a JS framebuffer/sound/input runtime).
$("bootNativeBtn").addEventListener("click", () => { location.href = BASE + "native/index.html"; });

// RESTART — the robust "it got weird" button. Because the snapshot boot is ~4s,
// the most reliable recovery from ANY messy guest state (TempleOS debugger popup
// from a typo, a maximized/empty window, a stuck prompt) is to reload the clean
// desktop (of the SAME variant). A one-shot autoboot flag means the user doesn't
// press Boot again.
$("restartBtn").addEventListener("click", () => {
  try { sessionStorage.setItem("tos_autoboot", "1"); } catch {}
  location.href = location.pathname;   // reload the clean desktop
});
try {
  if (sessionStorage.getItem("tos_autoboot")) {
    sessionStorage.removeItem("tos_autoboot");
    setTimeout(boot, 50);
  }
} catch {}

log("page loaded. crossOriginIsolated=" + window.crossOriginIsolated + " — press Boot.");
