# hemu-wasm — the Holy Emulator

A clean-room, **debloated, TempleOS-only x86-64 emulator**, written almost
entirely in **HolyC** and compiled to WebAssembly by holyc-wasm
(`../TempleOS/holyc-wasm`). It replaces qemu-wasm.

Where QEMU is a generic, multi-architecture, every-device hypervisor (~6,900
C/H files, ~24 CPU targets), hemu emulates exactly one machine: the PC that
TempleOS V5.03 runs on — x86-64 + VGA + ATA + PS/2 + PIC/PIT/RTC — and nothing
else.

## Goals / constraints
- **x86-64 only**, **TempleOS's graphics format only**, everything else deleted.
- **< 100,000 lines** total.
- **>= 91% of the code is HolyC.** Only the irreducible host boundary (canvas,
  keyboard/mouse, disk image, and—if/when we JIT—WebAssembly instantiation) is JS.
- **Native where possible:** the core runs as real compiled WASM (holyc-wasm),
  and TempleOS's own hot routines are recognized and run natively (HLE) instead
  of being emulated instruction-by-instruction.

## Layout
- `src/`      — the emulator, in HolyC (CPU, memory, decode/execute, devices)
- `host/`     — the thin JS shim (display/input/disk/loop), on holyc-wasm's runtime
- `tools/`    — build + measurement scripts
- `examples/` — hand-assembled x86-64 test programs for the core

## Roadmap
1. [x] Debloat qemu-wasm -> bare bones (see DEBLOAT.md).
2. [x] x86-64 CPU in HolyC -- full integer ISA + SSE2/F64 + **x87 FPU** + string/bit/LOOP
       ops + CMPXCHG/XADD, validated vs real clang code, 31/31 tests.
3. [x] Memory model sized for TempleOS (384 MiB MAlloc'd), identity-mapped, flat segments.
4. [x] Devices: PIC (8259x2), PIT (IRQ0 scheduler tick), CMOS RTC (advancing clock),
       LAPIC/HPET MMIO, PS/2 keyboard (IRQ1) + mouse (IRQ12); VGA presented by HLE
       (read gr.dc2->body) instead of planar emulation.
5. [x] System/long-mode: control regs, MSRs (FS/GS base), IDT/GDT, INT/IRETQ, CPUID,
       RDTSC/RDMSR/WRMSR, HLT-idle + IRQ wake.
6. [x] **Boot real TempleOS V5.03 from a VM-paused qemu snapshot** (tools/bootdump6.py
       -> tools/bake-regs.mjs -> src/snapregs.HC). hemu runs it **continuously and
       stably** -- 64M+ instructions, ~3200 timer IRQs, jiffies/RTC advancing, no faults
       -- renders the desktop, and the real `GrUpdateScrn` composite pipeline runs (HLE-called).
7. [x] Input path: injected PS/2 keyboard/mouse events deliver IRQs whose handlers wake
       the focus task (verified: a keypress triggers ~35k-390k guest instrs of processing).

### Known limitations (honest)
- The snapshot captures the content tasks (clock, shell, WinMgr) blocked in TempleOS
  IPC message-waits, so they don't redraw -> the on-screen content is static even though
  the system is fully live (timer/scheduler/input all run). Waking them needs either a
  cleaner capture point or delivering the IPC messages they await.
- **Sound** (PC speaker via PIT ch.2 / port 0x61) is not yet wired; it only fires from a
  running task, which hits the same blocked-task limitation.
- Optional HolyC JIT (reuse holyc-wasm's WASM emitter as the backend) -- future.

## Run
- `node tools/measure.mjs`  -- the 31-check CPU battery.
- `node --max-old-space-size=3072 tools/snap-run.mjs`  -- boot the TempleOS snapshot
  headless; writes the rendered desktop to /tmp/hemusnap/screen.ppm.
