# holyc-wasm — a HolyC → WebAssembly compiler + TempleOS browser runtime

This is a **from-scratch compiler for HolyC** (Terry A. Davis's C dialect, the
language of [TempleOS](https://templeos.org)) that emits **WebAssembly**, together
with a browser runtime that reimplements TempleOS's **graphics and sound** so real
`.HC` programs from this repository run in a web browser — **with no x86 emulation**.

Most "OS in the browser" projects (v86, JSLinux) emulate a whole PC in WASM and
boot a disk image. This does the opposite: it **compiles the HolyC source itself to
WASM** and runs it directly, with a JavaScript runtime standing in for the parts of
TempleOS that talk to hardware (the framebuffer, the PC speaker, the keyboard/mouse).

```
   HolyC source (.HC)                          Browser
        │                                  ┌──────────────────────────┐
        ▼                                  │ main thread              │
  ┌───────────┐   ┌─────────┐   ┌────────┐ │  • editor + demo picker  │
  │  lexer    │──▶│ parser  │──▶│codegen │ │  • WebAudio PC-speaker   │
  └───────────┘   └─────────┘   └────────┘ │  • keyboard/mouse → SAB  │
        │              │            │       └────────┬─────────────────┘
   preprocess     HolyC AST    WASM binary           │ SharedArrayBuffer + Atomics
   (#define/         │         (this repo's          │ (real synchronous Sleep,
    #include/        │          tiny emitter)         │  input ring, sound ring)
    #ifdef)          │              │        ┌────────▼─────────────────┐
        └────────────┴──────────────┘        │ Web Worker               │
              prelude.hc (HolyC stdlib)       │  • runs the WASM module  │
              compiled WITH your program      │  • OffscreenCanvas 640×480│
                                              │  • 16-color framebuffer  │
                                              └──────────────────────────┘
```

## Status (verified)

| Suite | Result |
|---|---|
| WASM emitter self-test | 10/10 |
| Lexer | 18/18 |
| Parser (targeted) | 15/15 |
| Execution semantics (strict) | 49/49 |
| Graphics + sound runtime | 17/17 |
| Worker concurrency protocol (real SAB+Atomics) | 6/6 |
| **`Demo/` corpus → valid WASM** | **203/203 (100%)** |
| **Whole repo → valid WASM** (Kernel/Compiler/Adam/Apps/Demo) | **503/531 (94.7%)** |

Run everything with `npm test`.

## Quick start

```bash
cd holyc-wasm
npm test                      # all suites + coverage report (Node only)

# command-line compiler
node cli/holyc.js run examples/Hello.HC          # compile + run headless (console)
node cli/holyc.js run examples/Mandelbrot.HC
node cli/holyc.js compile ../Demo/Graphics/Lines.HC -o /tmp/lines.wasm

# the browser IDE (graphics + sound)
npm run serve                 # http://localhost:8080  (sets COOP/COEP for SharedArrayBuffer)
```

In the browser: pick a demo (console, graphics, or sound), press **Run**, and the
program compiles to WASM in a worker and runs live on the 640×480 canvas. Click the
screen once to enable audio; keyboard and mouse are forwarded to the running program.

## How it works

### The compiler (`src/`)
- **`wasm/emitter.js`** — a dependency-free WebAssembly binary encoder (types,
  imports, functions with forward references, memory, globals, data segments, the
  full i64/f64 opcode subset, saturating float→int). Self-tested by instantiating
  real modules in Node.
- **`lexer.js`** — HolyC tokenizer: `//` and `/* */` comments, `0x`/`0b`/float/char
  literals, multi-char `'AB'` packing, adjacent string concatenation, `$$`→`$`,
  DolDoc `$...$` skipping in code context, high-byte identifiers.
- **`preprocess.js`** — `#define` (object- and function-like), `#include`,
  `#ifdef/#ifndef/#else/#endif`, `#exe{...}` (skipped), `#help_index`/`#assert`
  (ignored), recursive macro expansion.
- **`parser.js`** — recursive-descent + Pratt expressions. Covers the HolyC
  surface that real code uses: statement-level `"..."` auto-print and `'...'`
  auto-`PutChars`, no-parenthesis calls (`Yield;`), default arguments and skipped
  args (`GetChar(,FALSE)`), **chained range comparisons** (`0<=x<w`),
  `switch` with sub-`start:`/`end:`, empty `case:` auto-numbering and `case a ... b`
  ranges, `try`/`catch`/`throw`, classes/unions with base classes and forward
  declarations, `inline asm{}` (skipped), the `` ` `` power operator.
- **`types.js` / `fold.js`** — HolyC type system (I0..I64/U0..U64/F64, pointers,
  arrays, classes, number-union sub-members like `x.i32[1]`) and constant folding.
- **`codegen.js`** — lowers the AST to WASM. Value model: ints/pointers → `i64`,
  `F64` → `f64`; a linear-memory layout with a shadow stack for addressable locals
  and a bump heap for `MAlloc`. `printf` is implemented without varargs by
  marshalling tagged arguments into a scratch buffer and calling one host import.
- **`prelude.js`** — the HolyC **standard library**, written in HolyC and compiled
  together with your program (`Gr*`, `DCAlias`/`DCFill`, math, `Rand`/`Seed`,
  `Play`/`Snd`/`Note`, `Sleep`/`Yield`, `MAlloc`, string/mem helpers, the `Fs` and
  `ms` globals). This mirrors how TempleOS builds most of its runtime in HolyC over
  a few primitives — and it exercises the compiler on real HolyC.

### The runtime (`src/runtime/`)
- **`graphics.js`** — a 640×480 indexed framebuffer using the **real TempleOS
  16-color palette**, software `plot`/`line`/`rect`/`circle`/`text`, blitting to a
  Canvas/OffscreenCanvas.
- **`font.js`** — the **actual TempleOS 8×8 system font**, extracted from
  `Kernel/FontStd.HC` by `tools/extract-font.mjs`.
- **`sound.js`** — WebAudio square-wave PC-speaker emulation (`tone`/`note`).
- **`console.js`** — the `printf` engine: HolyC format codes (`%d %u %x %X %c %s
  %f %p %b`, width/precision/`,`/`-`/`0` flags, the `%h` aux modifier and repeat
  forms like `%h25c`) plus DolDoc inline color (`$RED$…$FG$`).
- **`host.js`** — assembles the WASM import object backing the `__*` intrinsics;
  parameterized by device adapters so the same core runs headless (Node) or in the
  worker (browser).

### Making blocking OS loops work in a browser (`web/`, `src/runtime/protocol.js`)
HolyC programs run synchronous infinite loops (`while(!ScanChar){ …draw…; Sleep(1); }`).
The program runs in a **Web Worker** so it can block without freezing the UI:
- **OffscreenCanvas** lets the worker draw the framebuffer directly.
- A **SharedArrayBuffer + Atomics** gives a *real* synchronous `Sleep`/`Yield`
  (`Atomics.wait`) and a lock-free keyboard/mouse ring written by the main thread.
- Sound commands are pushed to a ring the main thread drains into WebAudio.
- The dev server sets **COOP/COEP** headers so `SharedArrayBuffer` is available.

This concurrency design is verified end-to-end in `tests/worker-protocol.test.js`
using real Node worker threads, a real `SharedArrayBuffer`, and `Atomics`.

## What is *not* supported (and why)

This compiles and runs HolyC **programs**; it is **not** a port of the TempleOS
kernel. Honest boundaries:

- **Inline x86-64 `asm{}`** is skipped (it would need an x86 assembler + CPU). The
  ~10 demos that are pure assembly compile to a trap. Everything else compiles.
- **Ring-0 / hardware code** — paging, APIC, ATA/PS2, VGA register pokes, the task
  scheduler, the filesystem (RedSea/FAT), `Spawn`/multicore — is not modeled.
  Programs that call into it still compile (see *lenient mode*) but those specific
  operations are no-ops.
- **The self-hosting JIT** — TempleOS's own compiler emits x86-64 at runtime; a
  faithful full port would need that runtime compiler to emit WASM dynamically. Out
  of scope here.
- **DolDoc documents, sprites, the editor/windowing system** are not reimplemented;
  inline color codes in strings *are* honored.

### Strict vs. lenient
- **Strict** (`{lenient:false}`) — every unknown symbol/field/type is an error.
  Used by the execution test suite so real bugs surface. 49/49 programs pass with
  exact expected output.
- **Lenient** (default for the browser and coverage) — unknown kernel symbols become
  zero-valued I64 globals, unknown calls evaluate their arguments and return 0,
  unknown struct fields get synthesized, and unsupported constructs degrade to
  no-ops with a recorded warning. This lets whole programs compile to *valid* WASM
  and run, with unsupported pieces as documented no-ops. Coverage numbers above are
  lenient-mode "compiles to valid WASM"; they are **not** a claim that every program
  is behaviorally complete.

## Layout

```
holyc-wasm/
  src/
    wasm/emitter.js          WASM binary encoder (+ self-test)
    lexer.js parser.js ast.js types.js fold.js preprocess.js
    codegen.js compiler.js abi.js
    prelude.js               HolyC standard library (compiled with your program)
    runtime/
      host.js console.js graphics.js sound.js font.js protocol.js
  cli/holyc.js               Node CLI: compile / run / dump
  web/                       browser IDE: index.html app.js worker.js server.js demos.js style.css
  examples/                  bundled sample programs (console / graphics / sound)
  tools/extract-font.mjs     regenerates src/runtime/font.js from Kernel/FontStd.HC
  tests/                     emitter / lexer / parser / exec / runtime / worker / coverage
```

## License

The compiler and runtime in this directory are MIT-licensed. The surrounding
TempleOS source is Terry A. Davis's public-domain work.
