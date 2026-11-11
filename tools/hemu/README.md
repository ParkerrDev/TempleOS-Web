# Engine checks

Run from the site root with Node. `hemu` points at HEMU and `holyc-wasm`
at the matching compiler checkout. Fixtures read the tracked compressed RAM
snapshot and disk; no `/tmp` image is needed. `LIVE` and `RAW` can explicitly
select other images. Disk writes stay in each test's private sector overlay.

```
node engine/build.mjs build
node tools/hemu/time.test.mjs
node tools/hemu/capture.test.mjs
node tools/hemu/barrier.test.mjs
node --max-old-space-size=2048 tools/hemu/raster.test.mjs
node --max-old-space-size=3072 tools/hemu/worker.test.mjs
node tools/hemu/guestcheck.mjs
node tools/hemu/jitdiff1.mjs
node tools/hemu/fpu-check.mjs
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
