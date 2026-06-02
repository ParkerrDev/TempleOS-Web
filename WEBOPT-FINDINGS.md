# TempleOS-wasm performance: web-optimized variant + the 60fps investigation

## What shipped (ParkerrDev/TempleOS-wasm, live)

- **Original / ⚡ Web-Optimized chooser.** Two boot buttons; each variant has its
  own RedSea disk + instant-boot snapshot, selected via `?webopt`. Restart stays
  on the chosen variant.
- **Web-optimized build** (640×480 / 16-color unchanged), two Adam-level changes
  recompiled into TempleOS:
  - `Adam/Gr/GrScrn.HC` `DCBlotColor8`: **SWAR screen compositing** — composite
    8 bytes/word, skip all-transparent words, copy all-opaque words, byte-wise
    only on mixed words. Replaces a 307K-iteration scalar byte loop.
  - `Adam/WinMgr.HC`: **90fps WinMgr period** (was ~30).
- Honest result: **modest** (desktop idle ~31 vs ~30 fps). The cap turned out
  near-moot because the desktop is *loop-bound* (~28ms WinMgr loop), not cap-bound.

## Infrastructure built (the durable asset)

- **In-OS source patcher**: cold-boot TempleOS in qemu-wasm (Playwright), splice
  modified `.HC` into RedSea via typed HolyC (`FileRead`/`StrFind`/`MemCpy`/
  `FileWrite`), reboot to recompile, extract the qcow2, snapshot. Tools in
  `tools/patch-*.mjs`, `tools/webopt-snap*.mjs`.
  (The obvious path — mounting an ISO9660 CD — does **not** work: this qemu-wasm
  build only detects the primary-master IDE disk; a 2nd CD/HD never appears.)
- **qemu-wasm rebuild loop**: edit `build/src/qemu/...`, `make-qemu.sh` (~32s
  incremental), `restage.sh` (strip + BigInt/JS patches). Verified working.
- **In-guest microbenchmarks** via `GetTSC` routed to debugcon 0xE9.

## Why 60fps games is blocked (full root-cause trace)

Measured: a full-screen-redraw frame is **~117ms (~8.5fps)**; the desktop/clean
frame is ~23ms. The delta is NOT TempleOS's fault:

1. **The emulator core is interpreter/early-JIT class (~32M guest-ops/sec).**
   `tcg/wasm32.c` is a TCI interpreter + a wasm-TB JIT (threshold lowered to 1 in
   `wasm32.h`). Game *logic* alone is slow at this speed.
2. **Framebuffer writes are ~5.8µs each while the display scans them** (vs 54ns
   idle). Every guest store goes `tci_qemu_st → tlb_load`; a clean TLB hit writes
   directly, but `TLB_NOTDIRTY` (or MMIO) diverts to `helper_st*_mmu`. The
   actively-scanned framebuffer keeps the slow path hot.

### Dead ends (all tried + measured)
- OS graphics: SWAR composite + a **linear 8bpp framebuffer** (runtime Bochs-VBE/
  DISPI switch from ring-0 Adam; LFB at PCI BAR0 0xFD000000, already identity-
  mapped). Linear is **worse** — 8bpp writes 2× the bytes of 4-bit planar, and the
  write cost (not the planar *pack*) dominates. Reverted.
- qemu `vga.c`: disabling `DIRTY_MEMORY_VGA` logging + forcing full-surface
  refresh — **no net win** (full refresh adds display-thread contention; and with
  logging off, `notdirty_write`'s `is_clean` check leaves `TLB_NOTDIRTY` armed, so
  writes stay slow). Reverted.

### The wall
Pinning the *dominant* per-write cost (helper dispatch vs `notdirty_write`
bookkeeping vs `tb_invalidate_phys_range_fast` page-collection lock vs display
contention) needs a **working profiler inside the vCPU worker thread** —
`fprintf`/`console.log` from that pthread don't surface to the page under
`PROXY_TO_PTHREAD`, and a `WROPT` store counter via stderr produced nothing.

## Roadmap for a future 60fps effort (in order)
1. **Profiling first**: get counters out of the vCPU worker (write to the shared
   MEMFS, or a proxied callback, or a custom debug MMIO region the guest reads).
   Confirm the exact dominant store-path cost before touching code.
2. **Targeted store-path fix** in `tci_qemu_st`/`cputlb.c`: make `TLB_NOTDIRTY`
   writes to a non-code framebuffer page fast (inline write + minimal dirty mark,
   skipping the TB-collection lock that's pointless for code-free pages) **without
   breaking SMC** — TempleOS's HolyC JIT self-modifies real code pages, so the
   fast path must apply only to code-free RAM.
3. Pair with a **comparison-based (non-trap) dirty** display path so writes never
   re-arm `TLB_NOTDIRTY`.
4. If game *logic* still limits fps, that's the wasm-TB JIT itself (TB-as-module
   transition overhead) — a much larger undertaking.

This is multi-session emulator-core engineering, not an OS tweak.
