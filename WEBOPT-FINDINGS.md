# TempleOS-wasm performance: hybrid native-display variant + the 60fps investigation

## What shipped (ParkerrDev/TempleOS-wasm, live)

- **Original / 🖥 Hybrid (native display) / 🚀 Native chooser.** Each emulated
  variant has its own RedSea disk + instant-boot snapshot, selected via `?webopt`.
- **Hybrid "native-display" build** (640×480 / 16-color unchanged) — the full OS
  runs emulated, but three changes are recompiled into TempleOS:
  - `Adam/Gr/GrScrn.HC` `GrUpdateScrn`: **native display hypercall**. The planar
    pack + emulated VGA plane writes are replaced by `OutU32(0xEB, gr.dc2->body)`.
    A custom port handler in qemu `hw/display/vga.c` reads the guest's composited
    8-bit 640×480 frame straight from guest RAM and palette-blits it to the display
    surface **natively** (on the display thread; the OUT just records the address so
    the vCPU thread never touches the surface). QEMU's own VGA draw is suppressed.
  - `Adam/Gr/GrScrn.HC` `DCBlotColor8`: **SWAR screen compositing** (8 bytes/word).
  - `Adam/WinMgr.HC`: **90fps WinMgr cap** (was ~30).
- **Honest result: not a speedup.** Measured, settled (snapshot-restored, then let
  it stabilize — the FPS counter spikes to 99 during the restore gap, ignore that):
  - **Idle desktop: ~27 fps Hybrid vs ~27 fps Original** — statistically identical.
    Below the old 30 fps cap, so cap90 never even binds; the desktop is loop-bound on
    the emulated re-render, which SWAR (composite) and the hypercall (flush) don't touch.
  - **Full-screen repaint (a game redrawing everything): ~8–9 fps** (the `WVscr`
    worst case: `DCFill`+`GrUpdateScrn` ×100 ≈ 117 ms; hypercall 111 ms).
  The hybrid is a cleaner, genuinely-native display path and the architecture the
  user asked for — but it is **performance-neutral**. See "The wall (corrected)":
  the hypercall *empirically disproved* the framebuffer-write hypothesis.
- **🚀 Native (HolyC→WASM) is the only 60fps path — and it clears it.** No emulation:
  HolyC compiled straight to WASM, run in a worker, presented via rAF. Measured
  (Plasma, vsync off so the render rate shows): **median 84 fps, peak 106 fps** —
  i.e. it renders *above* 60 and is merely vsync-capped to the display's 60 fps in
  normal use. A visible "N fps (native)" counter is in the toolbar. This is *the*
  web-optimized TempleOS (compiled FOR the web); it is the games, not the full desktop.

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

### The wall (corrected by the hypercall experiment)
The display **hypercall** is the clean experiment that settles the root cause: it
removes the planar pack **and** every emulated VGA framebuffer write, replacing
them with one cheap port OUT + a native host blit. If framebuffer writes were the
bottleneck, fps should jump. **It didn't** — `GrUpdateScrn` went 117ms → 111ms
(~6ms saved, ~1.05×), and TempleOS's own counter still reads ~7 fps.

So the framebuffer-write store path (the "~5.8µs/write" hypothesis above) is **not**
the dominant cost. The real per-frame cost is the **emulated screen build itself**:
`GrUpdateScrn` blits every window's DC into `gr.dc` (`GrUpdateTasks`) and composites
`gr.dc→gr.dc2` (`DCBlotColor8`) — ~600KB of byte-pushing through the x86→WASM
emulator every frame at ~32M ops/sec. SWAR speeds the *composite* pass; the
window-blit pass is unoptimized; either way ~110–120ms/full-repaint remains. Even
SWAR-ing every byte-push caps the full emulated OS near **~15–20 fps**, not 60.

Conclusion: **for the full emulated OS, the limit is the emulator, not the display
or the OS.** The hybrid ships as a correct, clean native-display architecture, not a
performance fix. Real 60fps lives only on the non-emulated Native (HolyC→WASM) path.

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
