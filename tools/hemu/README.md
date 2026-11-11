# Engine checks

Run from the site root with Node. `hemu` points at HEMU and `holyc-wasm`
at the matching compiler checkout. Fixtures read the tracked compressed RAM
snapshot and disk; no `/tmp` image is needed. `LIVE` and `RAW` can explicitly
select other images. Disk writes stay in each test's private sector overlay.

```
node tools/hemu/check.mjs
node tools/hemu/check.mjs --full
node tools/hemu/check.mjs --desktop
```

The default suite checks CPU/JIT/device primitives, emulated atomic instructions
on four actual worker threads, clocks,
input, completed captures, barriers and snapshot validation. `--full` also
builds both engines and runs native raster/video, guest API, saved-machine,
production worker, welcome and God Tools acceptance checks. `--desktop` adds
real Chromium window tests on one and four cores; flags can be combined. Each
check runs in a fresh process and any error stops the runner. Timed worker
checks should run without competing benchmarks. The runner prints the actual
compiler path: use the same pinned compiler and HEMU source as the site build.

The full suite reads `god/Tools.HC`. A separated engine worktree can supply
`GOD_TOOLS_SOURCE=/path/to/site/god/Tools.HC` explicitly. The God Tools test
executes the stock native Doodle algorithm on a deterministic bit record and
accepts both native Song forms and timer menus. It verifies exact FAT32
filenames/readback, saved DolDoc sprite/song payloads, live View ownership
after temporary allocations are freed, and clean Escape exits.

Old one-off probes with fixed RAM addresses, deleted `/tmp` inputs or a second
worker loop were removed. `GuestHarness.mjs` provides native source/call access;
`WorkerHost.mjs` exercises the production loop. Instruction-code recycling,
real x86 conversion fixtures, and QEMU snapshot capture tools remain.

- Clock checks exercise fractional elapsed time, PIT reload/latch/IRQ behavior,
  read-only RDTSC and independent core instruction budgets.
  A production-worker test blocks the worker for 450 ms, verifies that capped
  steps retain the elapsed backlog, and separately excludes paused wall time.
  It also measures actual deferred disk/document-patch initialization through
  recovery. Rate checks start after this initialization; they print TSC, PIT,
  supplied time and wall lag before asserting their unchanged thresholds.
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
- JIT loop checks compare complete CPU and memory state after the reported
  instruction count, including zero iterations, exact device dispatch budgets,
  the iteration cap, writes to the loop's own instructions, and second-iteration
  faults that must retain interpreter exits.
- Forward-branch checks compare each executed prefix with the interpreter for
  all conditions and operand widths, partial/deferred flags, wrapped x87 stacks,
  unmasked conversion fallback, modified later code segments, and dispatch
  budgets. A fused fall-through retains a byte guard at every original boundary.

These are bounded checks, not proof that every program or CPU instruction is
correct on bare metal. Raster expectations run the original TempleOS code in
HEMU; an independent hardware or QEMU oracle is needed for CPU semantics.
Random dither depends on TSC and is not claimed to have identical pixels.
VGA hardware read-plane behavior and non-VGA text modes are not fully covered.

For readable Node CPU profiles, preload `tools/hemu/Profile.mjs` before a
headless fixture:

```sh
node --import ./tools/hemu/Profile.mjs --cpu-prof --cpu-prof-dir=/tmp tools/hemu/guestcheck.mjs
```

The preload appends only WASM name metadata; it does not instrument function
bodies or enter the production worker. Guest block names contain the absolute
WASM-memory address of their first byte guard (`guest-host-...`), so subtract
the fixture's guest base before matching a native symbol. Sampled profiles
include initialization and are diagnostic evidence, not a renderer benchmark.

`mem-native.mjs` compiles the actual HEMU memory module under original V5.03
and compares its 324 outputs with the WASM build. The fixture exercises byte
widths, unaligned and boundary accesses, RAM aliases and the existing saved
guest MMIO/IPI contract. It verifies native source compatibility and preserves
that contract; it does not establish a complete hardware APIC/HPET model.
Set `HOLYC_QEMU_ORACLE` to the compiler's `tests/oracle/Qemu.mjs` and use
`--record` to refresh its source-hashed native fixture. The test host supplies
core IDs and maps atomic exchange to native `LXchgI64`.

`dev-native.mjs` runs the extracted port devices, clock and keyboard source
through original V5.03 and the current WASM compiler: 519 output records cover
PIC selection/EOI, CMOS, PS/2 replies, speaker/DAC, ATA transfers and reset.
The fixture supplies explicit host callbacks; it verifies source semantics,
not complete physical-device emulation. Device reset also has a public-port
regression: a partial ATA command, PS/2 reply and speaker tone must not survive.
`snapregs.test.mjs` compiles regenerated one/four-core QEMU register fixtures
against the actual CPU layout and requires V5.03's 1192-count PIT period.

`cpu-native.mjs` requires a source-hashed original V5.03 compile/run of the
entire interpreter and its unchanged instruction battery. The native host
adapter provides a core ID, serialized atomics and explicit headless callbacks;
it supplies neither a desktop, disk nor native JIT. The same 31 checks execute
with zero badops in both builds; instruction totals exclude HLT time budgets. Use
`HOLYC_QEMU_ORACLE=/path/to/tests/oracle/Qemu.mjs node tools/hemu/cpu-native.mjs --record`
to refresh this evidence after interpreter changes. This is a bounded native
source test, not proof of complete x86 coverage or a native TempleOS host app.

`atomic.test.mjs` runs 71 contending guest programs on four emulator workers:
implicit-lock XCHG protects an ordinary counter, LOCK arithmetic and unary
operations modify shared operands, and CMPXCHG/8B retries retain each increment.
Unaligned fields sharing a 64-bit CAS word preserve each other and adjacent native byte atomics.
Every supported width is exercised. `atomic-flags.test.mjs` compares 42,930
locked, ordinary, immediate and compiled memory-RMW cases with 6,768 actual
x86-64 instruction results; 8,982 comparisons execute compiled blocks. It
includes 10,152 contained unaligned placements, all architecturally defined
flags and register writeback. The stored source/output hashes and CPU/compiler metadata bind the hardware evidence;
`node tools/hemu/atomic-flags.test.mjs --record` regenerates it on x86-64.

Aligned RAM, contained unaligned fields and the TempleOS RAM alias are
supported atomic operands. Invalid LOCK forms, cross-word and MMIO atomics
retain an explicit fault without changing operands. This deliberately rejects unsupported x86 bus-lock cases;
it does not emulate their hardware behavior or architectural exception
delivery. CMPXCHG16B is not implemented. LOCK prefixes always end a JIT
block so that the interpreter owns their atomic operation.

`bit.test.mjs` compares 2,112 bit-string operations (264 compiled) with exact
x86 opcodes: signed register offsets and width-masked encoded immediates,
including neighboring bytes and defined CF/ZF. `cmpxchg8b.test.mjs` compares
384 memory/register/flag cases, covering success/failure, high register halves,
aligned LOCK and ordinary unaligned operands. Both use `OpcodeOracle.mjs` to
record source-hashed native fixtures with CPU/compiler metadata; add `--record`
on x86-64 to regenerate them. Reserved forms and unsupported CMPXCHG16B must
retain faults without writing operands.

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

`fpu-compare-oracle.txt` retains 784 actual Intel i9-14900HX comparisons,
including masked and unmasked invalid operands. `fpu-compare.test.mjs` tests
both execution engines at three stack tops and two operand slots, preserving
C0/C2/C3 and clearing C1. The corrected FUCOMI encodings are DB/DF E8+i;
FCOMI is DB/DF F0+i. The stream regression also checks that NaN interpreter
fallbacks preserve earlier cached stack values and pending integer flags.

The exception contract follows Intel SDM revision 089, volume 2A pp. 3-320–321:
OF/SF/AF clear even for invalid operands; an unmasked invalid comparison
retains ZF/PF/CF, sets IE/ES/B, and suppresses the stack pop. The recorded Intel
CPU instead sets unordered ZF/PF/CF before exception delivery. Of the 52
unmasked-invalid fixture rows, 26 have flags different from the documented
contract. These raw results are retained, counted and explicitly separated
from the architecture expectations, never rewritten as matching hardware.

`FpuFlags.HC` executes those exact raw opcodes under original TempleOS, seeds
EFLAGS immediately before comparison and captures flags and nonwaiting FNSTSW
before FNINIT clears the pending exception. QEMU/KVM matches the Intel CPU;
QEMU/TCG 11.1.2 also sets unordered flags but additionally pops on unmasked
FCOMIP. Both 16-case recordings are retained in `fpu-flags-{kvm,tcg}.json`.
To repeat them, set `HOLYC_QEMU_ORACLE` to HolyC-wasm's `tests/oracle/Qemu.mjs`
and run `ORACLE_ACCEL=kvm node tools/hemu/fpu-flags-native.mjs` (or `tcg`).
`--record` deliberately refreshes a fixture. The original C fixture builds
with `cc -O2 -mno-red-zone tools/hemu/fpu-compare-oracle.c -o /tmp/fpu-compare`.
Do not erase its CPU/compiler metadata when recording another processor.

The full x87 tag model, 80-bit precision, pending #MF delivery and every
floating exception are not implemented. These tests establish the stated
comparison behavior, not full x87 conformance. The authoritative instruction
reference is [Intel SDM revision 089](https://cdrdv2-public.intel.com/868137/325462-089-sdm-vol-1-2abcd-3abcd-4.pdf).

FPU dispatch reports whether it handled an encoding. Unsupported forms stop
with `BADOPX87` and both opcode bytes; reserved forms and unsupported native
instructions cannot silently pass a coverage gate. The former low-64-bit
80-bit operand approximation is rejected. The valid FFREE operation still
uses the documented tag-less approximation needed by TempleOS's FFREE /
FINCSTP discard sequence; success is not a claim of complete stack-tag checks.

`fpu-ops-oracle.c` records 108 additional real x86 results: all eight FCMOV
conditions against all CF/PF/ZF combinations, FNSTSW/FNCLEX at eight stack
positions, and signed 16/32-bit FICOM/FICOMP comparisons. The 494-check gate
repeats them through both execution engines, checks memory-store width and
register/flag preservation, then requires 22 unsupported cases to stop
without changing their operands. FNSTSW now includes TOP in both interpreter
and JIT results. The old integer-memory compare path incorrectly dispatched
those encodings as arithmetic; it now updates status and pops as required.

`CpuFault(0)` reports the first stopped CPU as `(core<<8)|reason`, or zero;
`CpuFault(1)` reports its instruction pointer. Hosts do not read CPU structure
offsets to discover a fault. Reasons 2 and 3 are unsupported instruction and
integer divide faults. `RunCore` retains the fault on every later call; the
old one-time automatic recovery has been removed. HLT remains normal idle.

CPU fault messages have `retained:true`; BSP errors also carry `paused:true`,
while AP errors identify `core`. Boot/instantiation errors stay unflagged so
the page can distinguish a retained stopped machine from a failed boot.
The BSP reports an actionable `error`, publishes `paused:true`, and keeps all
APs in the capture barrier. AP workers also report errors and stop executing
that core. The real worker regression compiles native faulting child tasks on
core0 and core1, then verifies frozen registers, RIP, frames and all barrier
acknowledgements. Older saved engines without `CpuFault` retain the BSP
`GuestInfo` fallback; their AP `error` messages should also pause the BSP in
the page host. Their embedded instruction implementation is unchanged.

`worker-legacy-fault.test.mjs` boots the tracked historical four-core engine
in `fixtures/legacy-smp.wasm`, exports a real full save embedding it, then
restores that save under the current host. Native UD2 on AP1 verifies the
retained error, page-style BSP pause, frozen state/frames and held AP barrier.
The old module intentionally has no CpuFault export and contains the former
first-fault recovery behavior. Its compiler/source refs, hash and IPI address
are recorded alongside it. `legacy-engine.mjs ENGINE_REF COMPILER_REF` rebuilds
that fixture explicitly using the matching compiler checkout; normal tests
consume the pinned bytes and never regenerate their reference.

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

Allocator ABI is recorded separately from the container version. Missing ABI
metadata denotes the original bump allocator (0). Current allocator sessions
use ABI1 with their block/free-list metadata inside saved memory. Restore
selects the matching host allocator before executing the embedded engine;
legacy sessions retain ABI0 on subsequent saves. Unknown ABIs fail explicitly.
Stock RAM images always initialize a fresh current allocator.

To check compatibility with an actual older compiled engine, generate a private
fixture while `holyc-wasm` points at the old compiler/runtime, then restore it
after switching to the current pinned build:

```
node tools/hemu/snapshot-legacy.test.mjs save /path/legacy.hemu
node engine/build.mjs
node tools/hemu/snapshot-legacy.test.mjs restore /path/legacy.hemu
```

The two stages retain the saved pixel hash/palette beside the fixture and
check native disk readback, resume and resave. The normal full suite covers
new one- and four-core snapshots. Large generated machine images are not
checked into source control.

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

Video checks run the original V5.03 assembly with acceleration disabled, then
compare the generic planar/line implementations and their actual named HLE
entry points. They cover cache hits/misses, flush writes, destination guards,
pointer increments, registers and flags. The full framebuffer matches the
native planar decoder; native 2x zoom is checked pixel by pixel; DCScrnCapture
returns a populated desktop image. Completed presentation now follows the
actual GrUpdateVGAGraphics call, preserving the native image and zoom updates.
Pause force-sends that completed frame before its acknowledgement even when
older frames are waiting for the page, so a paused restore shows identical
pixels. worker-pause.test deliberately fills the presentation queue to cover
this case.

`shift.test.mjs` compares the interpreter and supported compiled shifts with
3,808 real x86-64 cases recorded by `shift-oracle.c`. It covers ROL/ROR/RCL/RCR,
SHL/SHR/SAR, all operand widths, both carry inputs, zero/masked counts and the
architecturally defined flags. Regenerate the fixture on x86-64 with
`cc -O2 -mno-red-zone tools/hemu/shift-oracle.c -o /tmp/shift-oracle`, then
`/tmp/shift-oracle > tools/hemu/shift-oracle.txt`. Undefined flag bits are not
used as an oracle. `jitdiff1.mjs` is deterministic parity coverage and fails
its process when a comparison fails; it is not an independent CPU oracle.

`menu-clip.test.mjs` checks 288 completed frames against independent QEMU/KVM
pixels: the stock Ctrl+M Titanium sprite at six native scrollbar positions,
with raster/video acceleration enabled and disabled. The reference generator
`menu-clip-oracle.mjs` first records 48 unmodified V5.03 frames, which alternate
between blank and visible tails, then verifies 24 corrected native refreshes
at every position. Set `HOLYC_QEMU_ORACLE` to the compiler checkout's
`tests/oracle/Qemu.mjs` to regenerate it. Fixture hashes bind both HolyC probe
and correction source; the fast test also verifies that incremental frames
reuse cached bounds rather than doing a full document pass every frame.

This is an intentional correction of an original TempleOS bug. DocRecalc's
incremental stopping condition used the text anchor row and ignored sprite
artwork extending above it. `engine/patches/DocClip.HC` caches the largest
upward extent during existing full passes and extends only the required
incremental range. The bounded cache handles reused document addresses and
uses a native atomic lock; it does not attach private data to application
CDoc fields. The correction covers static 2D sprites. Rotating 3D mesh bounds
are unchanged and are not claimed as fixed by this check.

Stock boots compile the corrected routine from the installed native source
once the disk is ready. Its complete source fingerprint and entry instructions
must match the supported V5.03 routine. Installation holds the all-core
barrier and leaves the original frame-setup instructions intact; tasks already
suspended before or after stack allocation still have a valid continuation.
`patch.test.mjs` checks those entry states, invalid addresses/signatures and
all four CPU slots. A failed application is reported as `guestPatch` with an
error message; the original routine remains active.

Full session metadata records `guestPatches: ["doc-sprite-clip-v1"]`, checks it
against restored guest code, and preserves the patch and its cache in RAM.
Old saves default to an empty patch list and resume without being silently
modified. Disk-only export retains the original disk source: this live RAM
correction is not an on-disk TempleOS installation. The same HolyC file has a
native single-core installer, verified in original QEMU/KVM; native SMP entry
replacement is not claimed. The production HEMU path uses its four-core
barrier and passes full snapshot roundtrips in both supported topologies.
