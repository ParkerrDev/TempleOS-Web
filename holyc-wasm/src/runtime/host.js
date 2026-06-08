// host.js — builds the WebAssembly import object backing the __xxx intrinsics.
//
// It is parameterized by "devices" so the same core works in three contexts:
//   - Node headless (console only; graphics/sound/input are stubs or buffers)
//   - Browser worker (real OffscreenCanvas graphics, SAB sleep/input, sound ring)
// Pass in adapters; sensible no-op defaults are used otherwise.
import { format, readCStr, bytesToLatin1 } from "./console.js";
import { HEAP_BASE, MS_ADDR, MS } from "../abi.js";

export const MS_FIELDS = MS; // re-export for callers

export function createHost(opts = {}) {
  const state = {
    mem: null,            // WebAssembly.Memory (set after instantiate)
    heapPtr: HEAP_BASE,
    out: opts.onText || ((s) => process.stdout.write(s)),
    ansi: opts.ansi !== false,
    gfx: opts.gfx || null,        // {plot,line,rect,circle,text,fill,flip,width,height}
    snd: opts.snd || null,        // {tone(freq), note(freq,ms)}
    sleep: opts.sleep || null,    // (ms) => void  (may block via Atomics)
    yield: opts.yield || null,    // () => void
    scanChar: opts.scanChar || (() => 0),  // () => int (nonblocking)
    getChar: opts.getChar || (() => 0),    // (echo,scan) => int (blocking)
    timeMs: opts.timeMs || (() => Date.now()),
    onFlip: opts.onFlip || null,
    onTick: opts.onTick || null,           // called before scan/sleep/yield (e.g. mouse mirror)
    present: opts.present || null,         // (addr,w,h,u8) => void — raw framebuffer blit (hemu)
    snapLoad: opts.snapLoad || null,       // (memBase,u8) => void — load a RAM snapshot (hemu)
    diskRead: opts.diskRead || null,       // (lba,count,u8,dst) => void — stage disk sectors into guest mem (hemu ATA)
    hostIn: opts.hostIn || null,           // (port) => int
    hostOut: opts.hostOut || null,         // (port,val) => void
  };

  function mem() { return state.mem; }
  function u8() { return new Uint8Array(state.mem.buffer); }

  const imports = {
    __printf(fmtAddr, nargs) {
      const fb = readCStr(mem(), Number(fmtAddr));
      state.out(format(fb, mem(), Number(nargs), { ansi: state.ansi }));
    },
    __print_bytes(addr, n) {
      const a = Number(addr), len = Number(n);
      const bytes = u8().subarray(a, a + len);
      // stop at first NUL (PutChars semantics)
      let end = 0; while (end < bytes.length && bytes[end] !== 0) end++;
      state.out(bytesToLatin1(bytes.subarray(0, end)));
    },
    __putc(ch) { state.out(String.fromCharCode(Number(ch) & 0xff)); },

    __gr_plot(x, y, c) { state.gfx?.plot(Number(x), Number(y), Number(c)); },
    __gr_line(x1, y1, x2, y2, c, t) { state.gfx?.line(Number(x1), Number(y1), Number(x2), Number(y2), Number(c), Number(t)); },
    __gr_rect(x, y, w, h, c) { state.gfx?.rect(Number(x), Number(y), Number(w), Number(h), Number(c)); },
    __gr_circle(x, y, r, c, fill) { state.gfx?.circle(Number(x), Number(y), Number(r), Number(c), Number(fill)); },
    __gr_text(x, y, c, addr) {
      const s = bytesToLatin1(readCStr(mem(), Number(addr)));
      state.gfx?.text(Number(x), Number(y), Number(c), s);
    },
    __gr_fill(c) { state.gfx?.fill(Number(c)); },
    __gr_flip() { state.gfx?.flip(); state.onFlip?.(); },
    __gr_width() { return BigInt(state.gfx?.width ?? 640); },
    __gr_height() { return BigInt(state.gfx?.height ?? 480); },
    // Blit an 8-bit indexed sprite (TempleOS DCBlot format: one palette index per
    // pixel, 0xFF = transparent), reading w*h bytes from wasm memory at addr.
    __gr_sprite(x, y, w, h, addr, scale) {
      const W = Number(w), H = Number(h);
      if (W <= 0 || H <= 0) return;
      const a = Number(addr);
      state.gfx?.sprite?.(Number(x), Number(y), W, H, u8().subarray(a, a + W * H), Number(scale) || 1);
    },
    // Blit a raw 8-bit indexed framebuffer (w*h palette-index bytes at addr) — used
    // by hemu to present its guest VGA/linear framebuffer to a canvas.
    __present(addr, w, h) { state.present?.(Number(addr), Number(w), Number(h), u8()); },
    __snap_load(base) { state.snapLoad?.(Number(base), u8()); },
    __host_disk(lba, count, buf) { state.diskRead?.(Number(lba), Number(count), u8(), Number(buf)); },
    __host_disk_wr(lba, count, buf) { state.diskWrite?.(Number(lba), Number(count), u8(), Number(buf)); },
    __host_in(port) { return BigInt(state.hostIn ? state.hostIn(Number(port)) | 0 : 0); },
    __host_out(port, val) { state.hostOut?.(Number(port), Number(val)); },
    // hemu input/pacing hooks — default stubs; real runners (snap-run, web/hemu.html) override env.*
    __host_msx() { return 0n; }, __host_msy() { return 0n; }, __host_msb() { return 0n; },
    __host_key() { return -1n; }, __host_budget() { return 1000000n; }, __host_prof(_rip) {},
    __host_dt() { return 16n; },
    // JIT hooks — default stubs (no JIT). A JIT-aware runner overrides __jit_compile/__jit_run and
    // uses the offsets from __jit_state. With these no-ops, hemu's g_jit_on stays 0 and nothing changes.
    __jit_state(_r, _f, _p) { return 0n; }, __jit_compile(_rip) { return 0n; }, __jit_run(rip) { return rip; }, __jit_x87(_a, _b, _c) {}, __jit_dispatch(_b) { return 0n; }, __jit_chain(_a, _b) {},
    // CMOS RTC fields from the host wall clock, so the guest's Now() tracks real date/time
    // (not the snapshot's frozen clock). idx = CMOS register the guest selected via OUT 0x70.
    __host_time(idx) {
      const d = new Date(); idx = Number(idx);
      if (idx === 0) return BigInt(d.getSeconds());
      if (idx === 2) return BigInt(d.getMinutes());
      if (idx === 4) return BigInt(d.getHours());
      if (idx === 6) return BigInt(d.getDay());           // 0=Sun..6=Sat
      if (idx === 7) return BigInt(d.getDate());          // day of month 1..31
      if (idx === 8) return BigInt(d.getMonth() + 1);     // month 1..12
      if (idx === 9) return BigInt(d.getFullYear() - 2000); // kernel adds 2000
      return 0n;
    },
    __host_wheel() { return 0n; },   // cumulative mouse-wheel position -> ms.pos.z (browser overrides)

    __snd(freq) { state.snd?.tone(freq); },
    __play_note(freq, ms) {
      if (state.snd?.note) state.snd.note(freq, Number(ms));
      else { state.snd?.tone(freq); state.sleep?.(Number(ms)); state.snd?.tone(0); }
    },

    __sleep(ms) { if (state.onTick) state.onTick(); if (state.sleep) state.sleep(Number(ms)); },
    __yield() { if (state.onTick) state.onTick(); if (state.yield) state.yield(); },
    __scan_char() { if (state.onTick) state.onTick(); return BigInt(state.scanChar() | 0); },
    __get_char(echo, scan) { if (state.onTick) state.onTick(); return BigInt(state.getChar(Number(echo), Number(scan)) | 0); },
    __time_ms() { return state.timeMs(); },

    __malloc(size) {
      const sz = Number(size);
      const aligned = (state.heapPtr + 15) & ~15;
      state.heapPtr = aligned + sz;
      // grow memory if needed
      const need = state.heapPtr;
      const have = state.mem.buffer.byteLength;
      if (need > have) {
        const pages = Math.ceil((need - have) / 65536);
        try { state.mem.grow(pages); } catch (e) { /* OOM */ return 0n; }
      }
      return BigInt(aligned);
    },
    __free(_p) { /* bump allocator: no-op */ },

    __sin: (x) => Math.sin(x), __cos: (x) => Math.cos(x), __tan: (x) => Math.tan(x),
    __asin: (x) => Math.asin(x), __acos: (x) => Math.acos(x), __atan: (x) => Math.atan(x),
    __atan2: (y, x) => Math.atan2(y, x), __pow: (x, y) => Math.pow(x, y),
    __log: (x) => Math.log(x), __log10: (x) => Math.log10(x), __exp: (x) => Math.exp(x),
  };

  return {
    env: imports,
    attach(instance) {
      state.mem = instance.exports.memory;
      // initialize Fs pointer + pix dims and ms struct defaults
      return state;
    },
    state,
  };
}
