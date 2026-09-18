# engine/ - HEMU in the browser

[HEMU](https://github.com/ParkerrDev/HEMU) is a TempleOS x86-64 emulator written in plain HolyC; its whole
interface to the outside world is `HEMU/src/host.HC`. This directory is the WebAssembly side of that
contract - what turns the HolyC source (cloned at build time into `../hemu`) into the engine this site runs,
using the [HolyC-wasm](https://github.com/ParkerrDev/HolyC-wasm) compiler (cloned into `../holyc-wasm`).

| File | What |
|---|---|
| `compile.js` | `compileHemu()`: the one way HEMU is compiled - strict mode plus the exports the host calls back into. Reads `../hemu/src` (`HEMU_SRC` overrides) |
| `build.mjs` | `node engine/build.mjs [outDir]` → `hemu.wasm`, `hemu-smp.wasm` (the shared-memory SMP engine) and `hemu-smp.json` (the CCpuState offsets the SMP workers wire APs with). `netlify.toml` runs it right after cloning, into `build/`; nothing compiled is committed |
| `host.js` | `createHemuHost()`: holyc-wasm's `createHost()` plus every import `host.HC` declares - the snapshot / present / disk / palette adapters and default stubs for input, pacing and the JIT hooks. Runners override `env.__host_*` and `env.__jit_*` before instantiating |
| `jit.js` | the x86-64 → WASM block JIT: decodes guest code out of hemu's memory and emits one native function per hot block with holyc-wasm's emitter. Guest registers live in WASM locals for a block's duration, flags are computed lazily, and a native dispatch module chains blocks without returning to JS |
| `guestexec.js` | the backend guest-execution API over `HEMU/src/guestcall.HC`: resolves kernel functions and class layouts from the running OS's symbol tables and exposes `exec`, `include`, `mkdir`, `writeFile` and `launch`, with request IDs and queued / running / done / failed states |
| `guestinput.js` | the keyboard bitmap and mouse state, resolved through `guestexec.js` metadata: relative mouse deltas, held-key sync around each emulation slice, capture hints |
| `qcow2.js` | the C: disk: qcow2 and raw readers, RedSea and FAT32 listing, upload and read |
| `hemu-worker.js` | the engine as the site runs it: one Worker, single core (the shipping path); also the BSP of the SMP engine |
| `hemu-smp-worker.js` | experimental: one Worker per emulated core over one shared `WebAssembly.Memory` (`hemu-smp.html`, `?smp=N`) |

## Build and check

From the site root (the repos cloned or symlinked as `holyc-wasm`, `hemu`, `holyc-fmt`):

```sh
node engine/build.mjs build                    # what the site deploys
node tools/hemu/measure.mjs                    # HEMU's own instruction battery (src/test.HC, 31 checks)
node tools/hemu/boot-test.mjs                  # HEMU/src/boot.HC draws its framebuffer
node tools/hemu/host.selftest.mjs              # the disk adapter
node tools/hemu/diskio-check.mjs               # ATA + VGA DAC, no guest needed
node tools/hemu/fpu-check.mjs                  # x87 FTST / FNSTSW + 432 arithmetic cases, interpreter and JIT
```

The guest harnesses need the booted RAM image and a raw disk: decompress `hemu/live.bin.gz`, and gunzip
then `qemu-img convert -O raw` `vendor/images/templeos-hd.qcow2.gz`. They default to `/tmp/live.bin` and
`/tmp/templeos.raw`; `LIVE` and `RAW` override. They are memory-hungry:

```sh
node --max-old-space-size=3072 tools/hemu/guestcheck.mjs     # the guest-execution API: 14 checks, including a game launch
node --max-old-space-size=3072 tools/hemu/input-check.mjs    # HolyCraft input: spawn, look, held keys, a 200-event burst
node --max-old-space-size=3072 tools/hemu/jitrecycle.mjs     # recompilation into reused guest addresses
node --max-old-space-size=3072 tools/hemu/jitboot.mjs        # JIT off vs on: identical desktop, and the speedup
node --max-old-space-size=3072 tools/hemu/deploycheck.mjs    # build/hemu.wasm exactly as hemu-worker.js runs it (HEMU_WASM overrides; NOJIT=1 = interpreter)
node --max-old-space-size=3072 tools/hemu/game-suite.mjs Talons   # or --all: every catalog game, screenshots + JSON under OUT
```

The other files in `tools/hemu/` are one-off investigations of the same shape - `compileHemu()`,
`createHemuHost({...})`, boot, measure one thing: `gamecheck` fps, `smp*` the multi-core engine, `f6*` /
`whoat` / `asksym` / `getsrc` / `evalq` guest introspection. Read one and you can read all of them; there
is no runner.

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

`guestinput.js` applies relative mouse deltas once from the guest's current position, respecting games that
call MsSet to recenter. The browser's held-key set is synchronized around each emulation slice, using atomic
byte operations for shared memory. Capture hints follow the foreground task's mouse visibility and input
ownership; hosts forward them to the UI, and pointer lock still requires a user gesture. Frame input polling
stops when the 64-entry keyboard FIFO fills, leaving the remaining events in the host queue. `input-check.mjs`
checks HolyCraft's neutral spawn, idle camera, relative look, held movement, release and a 200-event burst in
the live guest.

## Snapshots

HEMU boots by resuming a RAM image, not from disk. `tools/snapshot/` holds the recipes that produce
`hemu/live*.bin.gz` and `hemu/src/snapregs*.HC`: `capture-snapshot.py` boots TempleOS under QEMU (TCG), lets
the desktop settle, pauses and dumps guest RAM and registers; `parse-migration.mjs` flattens a QEMU migration
stream into `live.bin`; `bake-regs.mjs` turns the register dump into `snapregs.HC` (re-bake after every
capture so the registers match the RAM). `smp-capture.py` and `bake-regs-smp.mjs` are the four-core
equivalents; `find-delta.mjs` locates the code relocation between the two snapshots.

## Keeping the pieces together

`jit.js` learns the engine's CPU-state addresses at runtime (`__jit_state`, `__jit_seg`), so there are no
offsets to keep in sync by hand - but the JIT, the compiler runtime and the engine still have to come from
one build. The site compiles `build/hemu*.wasm` at deploy and serves `engine/`, `build/`, `hemu/` and
`holyc-wasm/` uncached, so a browser never pairs an old JIT or snapshot with a new engine.
