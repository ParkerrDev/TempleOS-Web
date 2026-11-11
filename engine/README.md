# engine/ - HEMU in the browser

[HEMU](https://github.com/ParkerrDev/HEMU) is a TempleOS x86-64 emulator written in plain HolyC; its whole
interface to the outside world is `HEMU/src/host.HC`. This directory is the WebAssembly side of that
contract - what turns the HolyC source (cloned at build time into `../hemu`) into the engine this site runs,
using the [HolyC-wasm](https://github.com/ParkerrDev/HolyC-wasm) compiler (cloned into `../holyc-wasm`).

| File | What |
|---|---|
| `compile.js` | `compileHemu()`: the one way HEMU is compiled - strict mode plus the exports the host calls back into. Reads `../hemu/src` (`HEMU_SRC` overrides) |
| `build.mjs` | `node engine/build.mjs [outDir]` → `hemu.wasm`, `hemu-smp.wasm` (the shared-memory SMP engine) and `hemu-smp.json` (the shared IPI mailbox address). `netlify.toml` runs it right after cloning, into `build/`; nothing compiled is committed |
| `host.js` | `createHemuHost()`: holyc-wasm's `createHost()` plus every import `host.HC` declares - the snapshot / present / disk / palette adapters and default stubs for input, pacing and the JIT hooks. Runners override `env.__host_*` and `env.__jit_*` before instantiating |
| `jit.js` | the x86-64 → WASM block JIT: decodes guest code out of hemu's memory and emits one native function per hot block with holyc-wasm's emitter. Guest registers live in WASM locals for a block's duration, flags are computed lazily, and a native dispatch module chains blocks without returning to JS |
| `guestexec.js` | the backend guest-execution API over `HEMU/src/guestcall.HC`: resolves kernel functions and class layouts from the running OS's symbol tables and exposes `exec`, `include`, `mkdir`, `writeFile` and `launch`, with request IDs and queued / running / done / failed states |
| `guestinput.js` | mouse state resolved through `guestexec.js` metadata: relative deltas and capture hints; raw keyboard bytes use `KeyQueue.js` and HEMU IRQ1 |
| `qcow2.js` | qcow2/raw sector I/O and host FAT32 listing, upload and read |
| `Stock.js` | capture manifest, RAM/engine identity checks, bounded inflation and paired disk overlays shared by page, desktop and worker |
| `hemu-worker.js` | the engine as the site runs it: one Worker, single core (the shipping path); also the BSP of the SMP engine |
| `hemu-smp-worker.js` | application cores over shared `WebAssembly.Memory`; the BSP always uses the production worker |

## Build and check

From the site root (the repos cloned or symlinked as `holyc-wasm`, `hemu`, `holyc-fmt`, `holycraft`):

```sh
node tools/hemu/check.mjs                  # CPU/JIT/device/clock/input primitives
node tools/hemu/check.mjs --full           # build both engines, then native and worker checks
node tools/hemu/check.mjs --desktop        # installed Chromium, one and four cores
```

The runner stops on any failed assertion or timeout and prints the actual compiler
path. Guest checks read tracked compressed RAM and disk fixtures; `LIVE` and `RAW`
can override them. See [the check list](../tools/hemu/README.md) for coverage,
God Tools source selection and limits. Each guest needs several hundred MiB.
`GuestHarness.mjs` provides native source/call access; `WorkerHost.mjs` exercises
the production worker and APs, including clock, presentation and snapshot events.

Game-specific acceptance remains in the game catalog checks and each game's
renderer/input harness. A successful launch alone does not prove a playthrough
or hardware-equivalent performance.

## What guestexec.js and guestinput.js guarantee

Games start in a fresh Servant task through a short Adam job calling PopUp. No command typing or
character-by-character TaskMsg injection is involved. FileWrite receives raw bytes staged above the guest
allocator's RAM, preserving embedded DolDoc sprites. Already-compressed .Z uploads use FOpen/FBlkWrite so
FileWrite cannot recompress them. Launches reject a second active game, report compile and runtime
exceptions, and release their slot when the task ends. A running event means the task started; compilation
can still fail afterwards. `guestcheck.mjs` exercises execution, failure reporting, directory creation, binary
upload, independent persisted-sector readback, disk inclusion, launch cleanup, animation and busy refusal.
`jitrecycle.mjs` checks repeated compilation into reused guest addresses; each cached JIT block validates its
decoded bytes at entry, including native dispatch-table calls, before executing.

`jitState` attaches one CPU owner to this module. Attachment discards compiled
blocks, the dispatch module and optional CPU bindings from the previous owner;
the caller then supplies its own `jitX87`, `jitSeg` and `jitChain` bindings when
available. Omitted bindings use unconfigured defaults instead of earlier
addresses. An unregistered FS/GS base ends the compiled prefix so the
interpreter owns the instruction; a registered base whose value is zero remains
a valid compiled operand. `jitReset` alone
clears code caches while retaining the current owner. `jit-owner.test.mjs`
checks that missing handlers and setup cannot access a previous owner's memory.

`guestinput.js` applies relative mouse deltas once from the guest's current position, respecting games that
call MsSet to recenter. Keyboard state reaches TempleOS only through set-1 make/break bytes and IRQ1.
The optional BIOS repeat follows the guest PS/2 typematic configuration. Capture hints follow the foreground task's mouse visibility and input
ownership; hosts forward them to the UI, and pointer lock still requires a user gesture. Frame input polling
stops when the 64-entry keyboard FIFO fills, leaving the remaining events in the host queue. `input-check.mjs`
checks HolyCraft's neutral spawn, idle camera, relative look, held movement, release and a 200-event burst in
the live guest.

## Snapshots

HEMU starts from a paired RAM/register/disk capture. The native QEMU capture,
strict FPU/XMM parser and disk-overlay packaging commands are documented in
[tools/snapshot/README.md](../tools/snapshot/README.md). `hemu/stock.json` binds
these inputs; the compiled engine carries matching `hemu.stock` metadata.
Page, desktop and worker loaders reject unknown RAM-only imports before
execution. Full saved-machine images use their embedded engine and state.

The browser and standalone desktop window both resume that already booted
64-bit guest. They do not execute TempleOS's 16-bit DVD/BIOS loader or perform
a fresh installation. The small embedded framebuffer kernel in `boot-test.mjs`
is a CPU/device fixture, not a TempleOS cold boot. The native HolyC adapter is
currently a headless test host; a native desktop/JIT backend remains separate
work.

## Keeping the pieces together

`jit.js` learns the engine's CPU-state addresses at runtime (`__jit_state`, `__jit_seg`), so there are no
offsets to keep in sync by hand - but the JIT, the compiler runtime and the engine still have to come from
one build. Build both `build/hemu*.wasm` artifacts with the pinned source/compiler
and deploy their matching host and JIT. Full saves embed their exact engine.

Full machine saves, their versioned format and worker startup protocol are documented
in [tools/hemu/README.md](../tools/hemu/README.md#full-machine-snapshots).
