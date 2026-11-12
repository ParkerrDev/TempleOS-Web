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
production worker, popup-free stock startup and God Tools acceptance checks. `--desktop` adds
real Chromium window tests on one and four cores, current/legacy saved sessions,
and forced page/desktop cancellation and worker failure; flags can be combined. Each
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

`cpuid.test.mjs` checks 528 complete register states across supported core
configurations, including high input halves, ignored subleaf inputs, preserved
flags and the stock cache-line expression. Its saved physical and original
TempleOS probes independently establish the register layout; they do not copy
the physical machine's feature mask into HEMU. The BootDVD capability decision
runs with 32-bit registers in the long-mode interpreter, not through its BIOS
loader. `worker-cpuid.test.mjs` runs the installed native CPUId wrapper on every
guest core, then repeats after one/four-core full-session restoration.

Set `HOLYC_QEMU_ORACLE` to the compiler checkout's `tests/oracle/Qemu.mjs` and
run `node tools/hemu/cpuid.test.mjs --record` on x86-64 to refresh both native
and physical references. `cpu-native.mjs --record` separately verifies the
complete interpreter source under original V5.03, including the synthetic
CPU's results. The register fields follow the
[Intel CPUID specification](https://cdrdv2-public.intel.com/774492/325383-sdm-vol-2abcd.pdf).
Old full sessions retain their embedded engine and its original CPUID answers;
this correction changes newly built engines without changing saved state.

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
  `WorkerShim.mjs` gives the worker a browser `Worker` and cross-origin
  isolation, so it inflates the stock RAM in parts on threads of its own as
  Chromium does; `webWorker:false` runs it as Safari, inflating whole.
  `worker-inflate.test.mjs` boots both ways on both topologies to the desktop
  with the corrections in. `stock-segments.mjs` (in `tools/Test.sh`) inflates
  each snapshot's parts alone, 26 or 27 at once and then 4 and 3, and checks
  each result against the manifest's RAM SHA-256.
- Guest execution checks cover source errors, exceptions, file readback,
  disk include, launch completion/refusal and an animating native game.
  The real worker also holds a command at a native Sleep gate, verifies busy
  refusal and explicit force forwarding, then checks queued command order,
  successor ownership and target reuse on one and four cores. Force permits
  posting to TempleOS's job queue; native input waits may service nested jobs.
  Test-only batch delivery reaches the real message handler twice before its
  promise continuations, making overlapping submission ownership deterministic.
- JIT loop checks compare complete CPU and memory state after the reported
  instruction count, including zero iterations, exact device dispatch budgets,
  the iteration cap, writes to the loop's own instructions, and second-iteration
  faults that must retain interpreter exits.
- JIT owner checks attach separate ordinary/shared memories, with and without
  dispatch chains, and ensure old compiled modules, graphics callbacks and
  optional CPU offsets cannot survive attachment to a new owner.
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

`jit-memory.test.mjs` compares 1,122 explicit memory operands with Step across
RSP/RBP/RIP addressing, signed displacements, RAM aliases and modeled devices.
It checks registers, flags, neighboring bytes and exact device callback counts.
Only an in-range constant RIP-relative address can skip the RAM/device test;
stack and base registers are ordinary dynamic addresses. MOVZX masks a device
callback's U64 result to its actual byte/word operand. These checks preserve
the source-measured memory module contract, not a complete physical MMIO model.
Both memory gates cover operands starting one, two and four bytes before RAM
ends. The current memory module reserves 16 padding bytes and checks the start
address, so these spans continue into that padding. This preserves the existing
model; it is not a claim about physical memory outside installed RAM.

`jit-x87-memory.test.mjs` compares 5,120 x87/FX memory states with Step, including
2,752 exact-prefix fallbacks. It checks integer conversions, arithmetic,
control words and FX save/restore across RAM, aliases and devices, with dirty
integer and floating-point caches. Non-RAM operands leave the compiled block
before touching memory or x87 state; the interpreter performs their operation
once through the memory module. FX save/restore also checks the complete
512-byte span. The prior JIT traps on a device FLD; the regression requires no
speculative host callback and compares registers, flags, FP/XMM state and bytes.

`stack.test.mjs` compares 88 interpreter/JIT states with 44 source-hashed
physical x86-64 results. The witnesses cover old-SP push sources, post-increment
POP destinations, RSP versus R12/indexed/RIP-relative addresses, indirect CALL
targets overlapping the pushed return address, return adjustments, and 16-bit
PUSH/POP/LEAVE with REX.W overrides and extended-register opcodes. Every register, defined flag, target and
640 neighboring bytes must agree. The same hardware vectors run through the
original V5.03 compiler in `cpu-native.mjs`; `--record` refreshes the separate
physical fixture in `stack.test.mjs` on Linux x86-64.

`jit-stack-memory.test.mjs` checks 1,086 implicit stack/device states, including
693 exact-prefix fallbacks, plus 28 reserved POP refusals. Non-RAM stack access
exits before register changes or explicit-operand reads, so a resumed Step
performs device effects once. CALL/RET, LEAVE, flag stack operations and the
existing flat IRET frame are covered, including dirty cached SP/FPU state.
This does not establish privilege transitions, stack/page-fault delivery,
address-size overrides, 16-bit flag-stack semantics or a complete IRET model.

`dev-native.mjs` runs the extracted port devices, clock and keyboard source
through original V5.03 and the current WASM compiler: 519 output records cover
PIC selection/EOI, CMOS, PS/2 replies, speaker/DAC, ATA transfers and reset.
The fixture supplies explicit host callbacks; it verifies source semantics,
not complete physical-device emulation. Device reset also has a public-port
regression: a partial ATA command, PS/2 reply and speaker tone must not survive.
`snapregs.test.mjs` compiles regenerated one/four-core QEMU register fixtures
against the actual CPU layout and requires V5.03's 1192-count PIT period.

`cpu-native.mjs` requires a source-hashed original V5.03 compile/run of the
entire interpreter, its instruction battery and sampled hardware arithmetic
vectors. The native host
adapter provides a core ID, serialized atomics and explicit headless callbacks;
it supplies neither a desktop, disk nor native JIT. The same 31 battery checks
and 707 multiply/divide, 3,829 stack and 861 split-field atomic assertions execute with zero badops in both builds;
instruction totals cover the battery and exclude HLT time budgets. Use
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
supported atomic operands. With exactly one guest core, valid cross-word
RAM operands execute inside one synchronous interpreter instruction. The
address gate excludes MMIO and out-of-range bytes before the read; the operation
cannot deliver an IRQ or call the host between its read and write. Host callers
must retain the existing one-executing-core ownership contract. LOCK and memory
XCHG end a JIT block so the interpreter owns their atomic operation.

`AtomSplit.HC` records 516 original TempleOS cases at offsets 7/15/31/63,
covering arithmetic, logic, unary operations, implicit-lock XCHG, XADD and
CMPXCHG/8B across eight-byte and cache-line boundaries. The separate physical
probe matches all 387 within-line cases, including flags, registers and adjacent
bytes. `atom-split.test.mjs` makes 6,192 single-core and 2,064 coordinated SMP
comparisons across private/shared WASM memory, direct/aliased RAM and
interpreted/JIT prefixes. It requires
no host callback or IRQ delivery during an instruction, checks the valid RAM-end
boundary, and verifies 4,128 uncoordinated multi-core attempts retain faults without writes.
Re-record with `HOLYC_QEMU_ORACLE=.../tests/oracle/Qemu.mjs node
tools/hemu/atom-split.test.mjs --record`.

Multi-core cross-word fields require [coordinated CPU and host ownership](Bus.md),
including ordinary interpreter/JIT readers, host writes and capture handoff.
The page and desktop opt into that protocol; unregistered and legacy embedded
engines retain safe refusal. MMIO and invalid LOCK forms remain
explicitly unsupported, without architectural exception delivery for those
cases. The bounded behavior follows Intel's [locked operation
contract](https://cdrdv2-public.intel.com/835754/253668-sdm-vol-3a.pdf).

`bit.test.mjs` compares 2,112 bit-string operations (264 compiled) with exact
x86 opcodes: signed register offsets and width-masked encoded immediates,
including neighboring bytes and defined CF/ZF. `cmpxchg8b.test.mjs` compares
384 memory/register/flag cases, covering success/failure, high register halves,
aligned LOCK and ordinary unaligned operands. Both use `OpcodeOracle.mjs` to
record source-hashed native fixtures with CPU/compiler metadata; add `--record`
on x86-64 to regenerate them. Reserved forms must
retain faults without writing operands.

`cmpwrite.test.mjs` catches failed unlocked CMPXCHG/CMPXCHG8B operations that
omit their mandatory memory write cycle. It compares 72 physical and original
V5.03 register/RAM results through 384 HEMU executions, observes real write
calls, and checks 32 ICR command/latch side effects. The old engine fails the
actual emulated IPI-mailbox check before any test-only write observation.
An unconditional register write is also rejected: failed CMPXCHG32 preserves
the destination's upper half on real hardware.

Independent evidence includes 40 read-only-page write faults and a native
QEMU/KVM APIC self-IPI probe. The latter sends one interrupt, then a failed
CMPXCHG32 writes the old command back and sends a second interrupt; its saved
IDT entry is restored afterward. This is separate from HEMU's simpler saved-
guest ICR model, whose readback, widths and self-delivery are not claimed as a
complete hardware APIC implementation. Guest page protection and architectural
#PF delivery remain open. Set `HOLYC_QEMU_ORACLE` and pass `--record` to refresh
the native and physical source-bound references.

`mmio-alias.test.mjs` stores VGA pixels at page offsets 0x300 and 0x310 through
the low, uncached and 2^40 aliases, as TempleOS draws through its uncached
alias, and checks that none of them latches an ICR destination or sends an
IPI. The LAPIC ICR, LAPIC version and HPET counter still decode on their own
pages. The old decode, which matched only the page offset, sent IPIs whose
vector was pixel data; an exception vector crashed an AP and left the BSP in
single-user mode, so a game froze while the window manager kept drawing.

`cmpxchg16b.test.mjs` compares 768 original V5.03 results with a separate
physical oracle, then makes 15,360 interpreter/JIT-fallback comparisons across
private/shared RAM, aliases and coordinated core configurations. It checks
both mismatching halves, full registers and defined flags, adjacent bytes,
the complete aligned RAM-end span, and 3,072 uncoordinated LOCK refusals.
Test-only write observation verifies both halves' write cycles even after a
failed comparison. A separate 204-case physical fault record establishes
misalignment #GP, register-form #UD and read-only-page #PF, including mismatches.
The emulator retains stopped diagnostics for invalid operands; these are not
claims of implemented architectural exception delivery or guest page protection.
No host callback or interrupt occurs inside the single-core RAM instruction.
Locked SMP pairs use the existing bus protocol; unlocked pairs make no atomic
promise. CX16 remains unadvertised while these architectural limits remain.

`MulDiv.HC` owns full products, signed/unsigned double-width dividends, byte
AX/AH:AL results and quotient bounds. `muldiv.test.mjs` compares 102,432 register
and unaligned-memory cases with 25,608 independent hardware results. Its 50
compiled encodings include one/two/three-operand multiply, signed immediates,
all operand widths, and 19,360 retained divide-fault comparisons. It checks
every register and the neighboring divisor bytes, plus 884 deferred flag
chains, 30 RIP-relative operands and the MMIO fallback read count. The old engine fails this
gate immediately by incorrectly replacing DL during byte multiplication.

Only CF/OF are hardware-defined for these multiply forms; divide flags are
undefined. HEMU explicitly preserves the other flag bits. Full 128-bit
dividends use the HolyC path when they do not fit the
compiled signed/unsigned 64-bit fast path. MMIO divisors enter that path before
reading the device, avoiding a repeated read on fallback. The contract follows
Intel's [DIV/IDIV/IMUL reference](https://cdrdv2.intel.com/v1/dl/getContent/671199)
and [MUL reference](https://cdrdv2.intel.com/v1/dl/getContent/671241).

`Except.HC` delivers divide-by-zero and quotient-overflow faults through a
validated long-mode ring-zero gate, with IST zero and the current code segment.
It saves the original instruction-prefix RIP, unchanged operands, RF and the
five-word aligned stack frame without an error code. Interrupt gates clear IF;
trap gates retain it. The code-descriptor accessed bit is set as on hardware.
`DivideEntry.HC` and `DivideNative.HC` record 1,536 actual QEMU/KVM entries across
four widths, signed/unsigned division, three fault kinds, every stack alignment,
two gate types and two flag seeds. `divide.test.mjs` compares 3,072 interpreter/
JIT outcomes, 16 deferred-flag prefix chains and 56 valid quotient-limit cases.
It also compares 48 physical-host SIGFPE contexts, gate DPL/selector RPL/accessed
behavior and the original guest's `try`/`catch` of `DivZero`.

Thirty unsupported or malformed delivery cases must retain reason 3 at the
faulting RIP without changing operands or guest RAM. These include invalid
descriptors, addresses outside direct guest RAM, IST/privilege changes and a different code
selector. The same-selector restriction preserves compatibility with the
existing IRET path. Exception cascades, paging, #GP/#DF delivery, CET and general
debug/IRET semantics are outside this measured contract. Re-record the two
independent oracles with `HOLYC_QEMU_ORACLE=.../tests/oracle/Qemu.mjs node
tools/hemu/divide.test.mjs --record`; ordinary runs verify source/evidence hashes.
The bounded entry behavior follows Intel's [System Programming Guide,
sections 6.12–6.15](https://cdrdv2-public.intel.com/812386/253668-sdm-vol-3a.pdf).

`Raster.HC` owns the named native line/polygon acceleration and its shared
span filler. `raster-native.mjs` compares 200 source-hashed original QEMU/KVM
cases with native execution and acceleration in HEMU: horizontal/vertical
lines and triangles, clipping, reversed endpoints, all raster modes, ordered
and probability dithering, recorded extents, nearest distance and draw-disabled
contexts. Pixel/depth storage, changed/collision counts and final RNG state
must agree. Regenerate with `HOLYC_QEMU_ORACLE=... node tools/hemu/raster-native.mjs --record`.

`raster-alias.mjs` adds 30 source-hashed original QEMU/KVM cases in which
pixel or depth storage overlaps the task seed, dither probability or each
other. All three raster operations and both line orientations run with HLE
on and off. `raster-state.test.mjs` forces a real second Worker to change the
seed, task flags, probability or clock at selected draws of an eight-pixel
span in shared memory. Its 16 cases compare pixels, depth, return count and
final seed with the frozen pre-change fixture. This is a controlled-clock
HEMU fixture, separate from the original-QEMU alias oracle; it does not claim
hardware TSC values. A test-only draw boundary permits those interleavings,
with a bounded wait; no callback or state cache is added to production.
Caching probability at span entry fails the forced-write test. One configured
CPU does not prove exclusive access to shared memory.

`raster-fallback.test.mjs` retains two negative witnesses: a valid 5,000-pixel
line previously consumed one RNG value before fallback, and a wide triangle
returned -1 without drawing. Rejection now precedes random sampling, and
unsupported polygon contexts fall back before any triangle starts. Existing
extent/nearest updates before line fallback remain idempotent, matching final
native state; the change does not claim a general transaction for arbitrary
malformed guest pointers. `raster.test.mjs` additionally checks 674 native
triangle/line results, including every pixel/depth value and collision state.

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
an integer divide exception that could not be delivered. `RunCore` retains the fault on every later call; the
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

`init` accepts `rate` (0, 30, 60, 120; default 0) and `repeat` (default false).
`set` changes rate and/or
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

Stock boots resume the installed desktop without opening Welcome. Full machine
saves retain their existing guest windows. The one/four-core startup check
verifies no Welcome job or document appears automatically.

The web and desktop hosts share `Speaker.js`: the current guest tone survives
host pause, but audible output stops until resume. Restart discards the old
tone, including failed SMP boot fallback; retained CPU faults remain silent.
Keyboard and pointer gestures unlock or resume browser audio. The browser
regression measures actual WebAudio samples for those paths and paused full-save
restore. This does not establish guest-timestamped 140Hz tone playback: worker
messages still apply each frequency when the main thread receives it.

`jit-primitives.test.mjs` covers x87 constants, control-word loads/stores,
rounding and deferred integer flags, plus all conditional moves and byte sets
across flag combinations and operand widths. It also checks that an untaken
32-bit CMOV clears the upper half of its destination, as x86 specifies.

## Full machine snapshots

`exportSnapshot` writes a gzip-compressed HEMUSNP1 container. Both versions store
validated JSON metadata, the exact SHA-256-identified engine WASM, every byte
of its linear memory, and the whole current disk. This includes all CPU cores,
x87/SSE registers, device queues, clocks, palette, guest RAM, scratch mailboxes,
and disk writes. Host allocator/input/settings state and a running game's
mailbox are recorded separately. Compiled JIT functions are rebuilt on restore.
Saving stops every core; pending guest commands must finish first. Pause now
stops application cores as well as the display core.

Coordinated four-core saves use mandatory version 2 and `requiredBusProtocol:1`;
older decoders reject them. Version 1 remains readable, including embedded
engines that lack the ownership protocol. See [Bus.md](Bus.md) for the complete
controller and host contract.

Call `SnapshotInspect(gz,{busProtocol:1})` before creating workers in a
coordinated controller. The default protocol 0 refuses a required protocol
before memory changes or AP creation. Inspection returns null for the
RAM-only format; its capture identity must then pass `StockIdentify` and
`StockModuleCheck` before AP creation. Otherwise inspection returns `{meta,wasm}`. For a four-core save,
instantiate APs with that wasm and a shared memory (initial 512, maximum 8192
pages), `busProtocol:1`, `sc.ncore` and the saved `requiredBusProtocol`.
Pass the BSP `smp:{mem,ctrl,ipiAddr:meta.ipiAddr,ncore:meta.cores,busProtocol:1}`.
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
BIOS repeat, refresh rate, session save, open and restart are available in the
toolbar. Restart returns to the last boot session, including an imported full
save. Running CPU faults retain the paused machine; coordination failure stops
all participants and refuses exports of an interrupted instruction.
No internet service is required once the build and bundled images are local.

`node tools/hemu/desktop.test.mjs` drives a real installed Chromium headlessly;
`HEMU_DESKTOP_CORES=4` exercises the parallel path. Both were verified on Linux
x86-64: offline boot, actual frames/FPS, disk readiness, pause/resume and rate
changes, with the screenshot inspected. Mac and Windows executable lookup is
implemented but untested. This is a portable WASM host in a desktop window,
not native-code HEMU, direct hardware access, or a measured memory reduction.

`desktop-lifecycle.test.mjs` additionally checks current one/four-core and
historical embedded version-1 saves, exact restored RGBA/FPS, native faults and
restart. `tools/browser/bus.mjs` forces failure/cancellation while an AP owns a
cross-word instruction and verifies stop-before-termination with no partial
save. `tools/browser/boot-cancel.mjs` checks stale asynchronous boots separately.

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

Stock boots compile the corrected routine from `engine/patches/V5.03/DocRecalc.HC`,
a byte copy of the installed `DocRecalc.HC.Z`, which the host passes as a
HolyC string. The guest checks the copy's size and complete source fingerprint
exactly as it checks its own file (the no-argument call still reads the disk),
so the job needs no disk. Core 0 does not preempt, and a compile there stops
the desktop for most of a second. With four cores the job runs on CPU 1's Seth
task as soon as the application cores run: it swaps in Adam's hash table, so
every name lands where core 0 and the host look for it, and the Seth task's
heap lasts as long as Adam's. Core 0 then runs a short Adam job that checks
and sets the AutoComplete entry jumps. With one core the job runs at the first
frames on core 0 while the page still shows its loader, and those frames do
not wait for the clock. The jobs start before the page's first request and
are background requests: each queues behind whatever the page already asked
of its task, and a page request that comes while one runs queues behind it
instead of being refused as busy (`guest-ready.mjs` writes a file to Adam
while the one-core build holds it). `worker-patch-core.test.mjs` boots both topologies on
the page's bus and checks that four cores build on CPU 1 with no frame gap
over 250 ms. `patch-copy.test.mjs` builds and installs both
corrections from the copies on a guest with no disk, shows that a copy one
byte off is refused before anything compiles, and that AutoComplete built
apart installs without a second build. The entry instructions must
match the supported V5.03 routine. Installation holds the all-core
barrier and leaves the original frame-setup instructions intact; tasks already
suspended before or after stack allocation still have a valid continuation.
`patch.test.mjs` checks those entry states, invalid addresses/signatures and
all four CPU slots. A failed application is reported as `guestPatch` with an
error message; the original routine remains active.

Full session metadata records `guestPatches: ["doc-sprite-clip-v1",
"ac-dbl-buf-v1"]` (the corrections that went in), checks each against restored
guest code, and preserves the patch and its cache in RAM.
Old saves default to an empty patch list and resume without being silently
modified. Disk-only export retains the original disk source: this live RAM
correction is not an on-disk TempleOS installation. The same HolyC file has a
native single-core installer, verified in original QEMU/KVM; native SMP entry
replacement is not claimed. The production HEMU path uses its four-core
barrier and passes full snapshot roundtrips in both supported topologies.

A second correction fixes another original bug: the AutoComplete window
flickered as it updated. ACDocRst cleared the window's show flag, then the list
was rebuilt by prints and dictionary reads that each yield, so the window
manager drew frames with the window missing. `engine/patches/ACDblBuf.HC`
recompiles ACDocRst and the three ACTask routines from the installed
`ACTask.HC.Z` or its byte copy `engine/patches/V5.03/ACTask.HC` (size and
FNV-1a hash bound either way), changed only so the list is filled
in the task's back document and swapped in whole by DocDblBufSwap; the window
moves and swaps under the display document's lock and is never hidden. Its
entry jumps are set in the guest on core 0, where every window task runs and
nothing is preempted, each with interrupts off, keeping the frame-setup
instructions. A wrong source or an entry that is not stock (including a second
install) throws and leaves the original routines active. The scroll bars are
controls drawn from each update, while the screen still shows the text of the
one before, so they are drawn where that text had them; a bar that leaves the
shrunken window is drawn over once from the layer on top.

`ACFlicker.HC` focuses a window holding a word, changes the scan code every
20 ms so AutoComplete refills its list, and counts frames drawn and task
switches taken while the window is hidden, in a listing phase and a StandBy
phase. `ac-flicker-oracle.mjs` runs it in QEMU/KVM on stock V5.03: the window
manager drew 10 and 1 frames without the window and every one of 49 refills
let tasks run with it hidden; corrected, none of 50 refills did.
`ac-flicker.test.mjs` repeats both cases on HEMU and checks the corrected list
text and the second install refusal. Set `HOLYC_QEMU_ORACLE` as above to regenerate the reference.

`stock.test.mjs` validates the hash-bound stock RAM/module identities and
reconstructs every byte of both captured disks from the original base and
small sector overlays. `stock-init.test.mjs` checks native FCW/FSW/TOP before
any guest instruction, then confirms that scheduler context saves retain the
window manager's 037f control word. `snapregs.test.mjs` includes independent
native distinct-XMM/TOP witnesses and rejects unrepresentable or malformed
captures. See `tools/snapshot/README.md` for provenance and the unchanged
synthetic device/80-bit x87 limitations. Historical module tests now restore
self-contained full snapshots, never an old engine paired with new stock RAM.

`speaker.test.mjs` compares275 actual native port0x61 gate reads with original
QEMU/V5.03: all byte writes, both independently held gate bits, read-modify-write
transitions and the original Snd stop/restart path. The pre-fix engine fails
this fixture by returning zero. Only the two output gate bits are modeled;
refresh-clock bit4 and PIT channel2 output bit5 are not yet represented.
[QEMU's speaker implementation](https://github.com/qemu/qemu/blob/v11.1.0/hw/audio/pcspk.c)
also distinguishes the gate and data latch from those changing status bits.
The existing Boolean spk_on remains the tone-enabled state, while spk_ctrl
preserves both gates. Reset clears both, and one/four-core full-save tests
retain the silent data-only state through disk export and snapshot restore.
Regenerate the source-bound independent fixture with
`HOLYC_QEMU_ORACLE=... node tools/hemu/speaker.test.mjs --record`.
