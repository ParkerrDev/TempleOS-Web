# Engine checks

Run from the site root with Node. `hemu` points at HEMU and `holyc-wasm`
at the matching compiler checkout. Fixtures read the tracked compressed RAM
snapshot and disk; no `/tmp` image is needed. `LIVE` and `RAW` can explicitly
select other images. Disk writes stay in each test's private sector overlay.

```
node engine/build.mjs build
node tools/hemu/time.test.mjs
node tools/hemu/keyboard.test.mjs
node tools/hemu/rate.test.mjs
node tools/hemu/capture.test.mjs
node tools/hemu/barrier.test.mjs
node tools/hemu/snapshot-format.test.mjs
node --max-old-space-size=3072 tools/hemu/worker-snapshot.test.mjs
node --max-old-space-size=2048 tools/hemu/raster.test.mjs
node --max-old-space-size=3072 tools/hemu/worker.test.mjs
node --max-old-space-size=3072 tools/hemu/worker-rate.test.mjs
node --max-old-space-size=3072 tools/hemu/welcome.test.mjs
node tools/hemu/guestcheck.mjs
node tools/hemu/jitdiff1.mjs
node tools/hemu/jit-primitives.test.mjs
node tools/hemu/fpu-check.mjs
node tools/hemu/fpu-convert.test.mjs
```

- Clock checks exercise fractional elapsed time, PIT reload/latch/IRQ behavior,
  read-only RDTSC and independent core instruction budgets.
- Capture checks reject unfinished frames, keep the captured pixels immutable,
  and decode FPS only when the actual top-line glyphs are readable.
- Barrier checks reject stale acknowledgements and hold application-core writes
  for the duration of each capture.
- Raster checks compare pixels, depth, returned pixel counts and collision state
  against the guest's original compiled V5.03 functions with their HLE disabled.
  They cover horizontal and vertical clipping, degenerate triangles, depth,
  normal/XOR/collision colors, ordered dithering, and seeded triangle samples.
- Worker checks run the production worker and AP workers with one and four
  cores. They independently read every sampled top row, compare its displayed
  FPS to the frame message, check clock/refresh pacing, and verify pause.
- Guest execution checks cover source errors, exceptions, file readback,
  disk include, launch completion/refusal and an animating native game.

These are bounded checks, not proof that every program or CPU instruction is
correct on bare metal. Raster expectations run the original TempleOS code in
HEMU; an independent hardware or QEMU oracle is needed for CPU semantics.
Random dither depends on TSC and is not claimed to have identical pixels.
Legacy screenshot/VGA skips and the standalone SMP BSP host still need work.

## Frame protocol

`frame` carries `buf`, `w`, `h`, integer-or-null `fps`, `updates`, and `top`.
`updates` counts completed frames sent to the page. `fps` is decoded from the
same captured pixels; a fullscreen window or covered digit makes it `null`.
The page should update the label while blitting that frame, retain it while
paused, and show an unknown value when `fps` is null.

The HolyC host contract adds `__host_ns` (integer nanoseconds elapsed in this
iteration), `__capture_lock` and `__capture_unlock`. The stock host uses an
always-successful capture lock for one core; the production worker uses a
per-generation shared-memory barrier when its AP workers are running.

`fpu-oracle.txt` records 816 masked FISTP/FISTTP operations on real x86
hardware. `fpu-convert.test.mjs` checks the interpreter and JIT against it,
including status flags, integer widths, rounding ties, NaN and overflow.
Regenerate on x86 with `cc -O2 tools/hemu/fpu-oracle.c -o /tmp/hemu-fpu-oracle`
and redirect that executable's output to the fixture. The independent
QEMU/KVM TempleOS conversion probe agrees on 64-bit invalid conversions.
This does not cover 80-bit extended intermediates or every FPU exception.

## Settings and keyboard

`init` accepts `rate` (0, 30, 60, 120; default 0), `repeat` (default false),
and `welcome` (true only for the stock snapshot). `set` changes rate and/or
repeat at runtime. The worker reports `settings` with `ok`, applied `rate`
and `repeat`; an unrecognized guest timing layout keeps its current behavior.
Uncapped removes the display refresh cap using the guest timer's 1 ms quantum;
the host still sends at most about 60 completed frames per second. Games that
advance on each Refresh naturally run faster above the stock rate.

`input.keys` contains plain set-1 bytes including E0/E1 prefixes. No event
entropy is packed into a scan code or added to TSC. `input.keysUp` or a
`keysUp` command releases every tracked physical key. Held state reaches the
guest only through IRQ1 make/break bytes; the bridge no longer writes the
OS keyboard bitmap. Repeat is implemented in HolyC using the guest's PS/2
0xF3 delay/rate, and excludes modifier/lock/PrintScreen/Pause sequences.

Welcome is the guest's PopUp/Ed of ::/Doc/Welcome.DD, queued once after the
native execution API and disk are ready. Restored sessions omit welcome.

`jit-primitives.test.mjs` covers x87 constants, control-word loads/stores,
rounding and deferred integer flags, plus all conditional moves and byte sets
across flag combinations and operand widths. It also checks that an untaken
32-bit CMOV clears the upper half of its destination, as x86 specifies.

## Full machine snapshots

`exportSnapshot` writes a gzip-compressed HEMUSNP1 container. Version 1 stores
validated JSON metadata, the exact SHA-256-identified engine WASM, every byte
of its linear memory, and the whole current disk. This includes all CPU cores,
x87/SSE registers, device queues, clocks, palette, guest RAM, scratch mailboxes,
and disk writes. Host allocator/input/settings state and a running game's
mailbox are recorded separately. Compiled JIT functions are rebuilt on restore.
Saving stops every core; pending guest commands must finish first. Pause now
stops application cores as well as the display core.

Call `SnapshotInspect(gz)` before creating workers. It returns null for the
original stock RAM-only format; otherwise `{meta,wasm}`. For a four-core save,
instantiate APs with that wasm and a shared memory (initial 512, maximum 8192
pages), and pass the BSP `smp:{mem,ctrl,ipiAddr:meta.ipiAddr,ncore:meta.cores}`.
The BSP's existing `init.gz` detects and restores either format. Full saves
supply their own disk/settings and retain pause; `restored` signals success.
Every AP must finish instantiating before the BSP writes restored memory.

Validation checks version, dimensions, module hash, metadata and full gzip
integrity/length before a restored CPU runs. Disk restore retains nonzero
128 KiB chunks so empty disk space does not become resident host memory.
This remains a large machine: 384 MiB of guest RAM plus emulator state; a test
save with the bundled 256 MiB disk compresses to about 53.5 MB. It is not a
small-memory guarantee for every phone. The tests compare CPU/device bytes
and the saved frame across fresh one- and four-core workers, verify disk
readback, game exclusivity and saved 120 Hz settings returning to stock 30 Hz.

## Desktop window

From this checkout, after `node engine/build.mjs build`:

```
node tools/hemu/desktop.mjs
node tools/hemu/desktop.mjs --cores 4
node tools/hemu/desktop.mjs --snapshot /path/to/session.hemu
```

This starts a loopback-only server and opens an application window in an
installed Chromium, Chrome or Edge. `--browser PATH` selects one explicitly;
`--no-open` prints a local URL for another WebAssembly-capable browser. No
Electron package or second browser runtime is bundled. Closing the browser
process or pressing Ctrl+C stops the local server; its temporary browser
profile is separate from the user's normal profile. Save sessions before
closing to retain guest changes. The launcher can boot a configured full
snapshot, including its original one- or four-core topology and current disk.

The canvas uses the production worker/JIT, native palette, speaker and shared
Keyboard.js mapping. Click it to type; Full screen offers keyboard capture.
Pointer-lock games acquire the mouse on a click; Escape releases it. Pause,
BIOS repeat, refresh rate, session save and open are available in the toolbar.
No internet service is required once the build and bundled images are local.

`node tools/hemu/desktop.test.mjs` drives a real installed Chromium headlessly;
`HEMU_DESKTOP_CORES=4` exercises the parallel path. Both were verified on Linux
x86-64: offline boot, actual frames/FPS, disk readiness, pause/resume and rate
changes, with the screenshot inspected. Mac and Windows executable lookup is
implemented but untested. This is a portable WASM host in a desktop window,
not native-code HEMU, direct hardware access, or a measured memory reduction.

Both disk-only and full-machine exports hold the shared core barrier until
compression finishes and defer incoming mutations. Disk-only export is a
point-in-time block image; full-machine saves also retain the CPU state needed
to resume an interrupted filesystem operation. The legacy SMP demo's BSP now
adapts to the same production worker; APs no longer import a second BSP or the
site's game catalog.
