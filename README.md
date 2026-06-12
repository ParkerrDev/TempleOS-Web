# TempleOS‑wasm

**The real, complete TempleOS V5.03 running in your browser** — on **HEMU**, a clean‑room
x86‑64 emulator written almost entirely in **HolyC** and compiled to WebAssembly by the
bundled from‑scratch HolyC→WASM compiler ([`holyc-wasm/`](./holyc-wasm)). The actual
TempleOS kernel, HolyC JIT, graphics, games, keyboard and mouse — not a reimplementation,
not a screenshot. It boots to the installed desktop **in a few seconds**, and the 3D games
run at their designed 30 fps thanks to an x86‑64→WASM block JIT and native HLE of the
hottest render routines.

> This is a static site. Drop it on any static host (with cross‑origin isolation — see
> *Deploying*) and it runs entirely client‑side.

## Try it

- The desktop boots automatically — restored from a RAM snapshot in ~4 s.
- **Click the screen** to capture mouse + keyboard. **Ctrl+Alt+G** releases the mouse
  (QEMU's combo); **Esc goes to the OS** (exits games and menus). Fullscreen captures
  *every* key for the OS, including Esc.
- **Ctrl+M** opens the personal menu — click a game sprite (Varoom, BlackDiamond, …) to play.
- **↻ Restart** reloads the clean snapshot any time the OS gets into a weird state.
- **⌨ HolyC Editor** — write & run TempleOS HolyC compiled *natively* to WASM (no emulation).
  Save/open `.HC` files, or write your source straight into `C:/Home` for the OS to run.
- **⏸ Pause** — freeze and resume the OS (guest time stops too).
- **💾 Disk & Save** — export a **snapshot** (the whole running OS — reload it later to resume
  exactly where you were) or your **C: disk image** (including files you saved in TempleOS);
  import either one back; or upload any file straight into `C:/Home`. This is how you save your
  progress, share programs/games, or boot a custom/modified TempleOS disk.
- **✞ God Words** — TempleOS's divine word oracle on the page itself: GodBits/GodPick
  compiled in‑browser by holyc-wasm, entropy from your keystroke timing.
- On phones: an on‑screen joystick + L/R mouse buttons + a keyboard summon button appear,
  and the function/modifier key bar works by touch.

### URL options
| URL | What it does |
|-----|--------------|
| `/` | Installed desktop, restored instantly from a snapshot (~4 s) |
| `/?single` | Force the single‑threaded in‑page engine (no worker) |
| `/?b=N` | Pin the guest instruction budget per frame (debug) |

## How it works

TempleOS is 64‑bit‑only and is its own self‑hosting compiler, so it can't be cross‑compiled
to WASM directly. HEMU takes the emulation route, TempleOS‑style: a **TempleOS‑only x86‑64
emulator written in HolyC** (`hemu-wasm/src/cpu.HC` + `snapshot.HC`, ~1.3k lines), compiled
to WebAssembly by **holyc-wasm**, a from‑scratch HolyC compiler in JavaScript. It resumes a
live RAM snapshot of the booted desktop, emulates just the hardware TempleOS touches
(PIC/PIT/HPET/PS‑2/ATA/VGA‑DAC), and pulls input from the host each frame.

Performance comes from three layers:
- an **x86‑64 → WASM block JIT** (`jit.js`) that compiles hot guest code to native WASM at
  runtime — the same trick TempleOS's own JIT plays, one level up;
- **HLE** of the hottest render routines (the window compositor blit and the games' span
  fillers), each shadow‑verified bit‑exact against the emulated version before activation;
- a worker engine that runs the emulator off the main thread.

The guest clock is paced to real time (the OS clock ticks at 1.00× and the games run at
their designed ~30 fps), and keystroke timing feeds the OS's God apps with real entropy,
exactly like the TSC sampling on real hardware.

### What's in `vendor/`
| Path | Size | What |
|------|------|------|
| `vendor/images/templeos-hd.qcow2.gz` | 41 MB | the installed TempleOS hard disk (RedSea on C:), read on demand |
| `hemu-wasm/live.bin.gz` | 5 MB | booted‑desktop RAM snapshot (instant boot) |
| `hemu-wasm/snapshot.wasm` | 55 KB | the compiled emulator |

The desktop appears after the 5 MB snapshot loads; the disk image streams in the background
for file I/O. (The `.gz` assets are decompressed in the browser.)

## Running locally

```bash
# 1) the bundled zero-dependency server (sets COOP/COEP for you)
node server.mjs            # → http://localhost:8080

# 2) any static server — the bundled coi-serviceworker.js adds the headers itself
python3 -m http.server 8080   # then open http://localhost:8080
```

## Deploying

It's all static files; the only requirement is cross‑origin isolation.

- **Netlify / Cloudflare Pages / Vercel** — the included [`_headers`](./_headers) sets
  `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`.
- **GitHub Pages / any host without header control** — handled automatically by the bundled
  [`coi-serviceworker.js`](./coi-serviceworker.js) (registers a service worker that injects
  the headers and reloads once on first visit). Paths are deployment‑relative, so it works at
  a domain root *or* a project subpath like `/TempleOS-wasm/`.

## Credits & licenses

- **TempleOS** — created by **Terry A. Davis**. Public domain. The disk image and snapshot
  contain TempleOS V5.03.
- **holyc-wasm, HEMU, the JIT** — written for this project; same repository.
- **coi-serviceworker** — © Guido Zuidhof and contributors, **MIT**.
- **Theme & assets** — the TempleOS‑desktop look (cursor, the Terry GIF) is from
  [afterdavis](https://github.com/ParkerrDev/afterdavis); the TempleOS font and the window
  chrome styling (vertical border titles, scrolling title marquee, blinking MENU chip) are
  adopted from [TempleOS-tribute](https://github.com/del-Real/TempleOS-tribute) by
  Alberto del Real (MIT).
