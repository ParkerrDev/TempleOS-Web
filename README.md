# TempleOS‑wasm

**The real, complete TempleOS V5.03 running in your browser** — a full 64‑bit PC
emulated by [QEMU](https://www.qemu.org/) compiled to WebAssembly. The actual TempleOS
kernel, HolyC JIT, graphics, sound, keyboard and mouse — not a reimplementation, not a
screenshot. It boots to the installed desktop **in a few seconds**.

> This is a static site. Drop it on any static host (with cross‑origin isolation — see
> *Deploying*) and it runs entirely client‑side.

## Try it

- **Boot TempleOS** — restores the installed hard‑disk desktop instantly from a snapshot.
- **↻ Restart (clean desktop)** — reloads the clean snapshot in ~4 s. Use it any time the
  OS gets into a weird state. (A mistyped command drops you into TempleOS's built‑in
  debugger — that's authentic TempleOS, and Restart clears it.)
- **🧭 Take the Tour** — opens TempleOS's built‑in *Welcome* guide (navigable, with links).
- **Click a window, then type.** TempleOS routes keys to the focused window. Capital
  letters and the mouse work.

### URL options
| URL | What it does |
|-----|--------------|
| `/` | Default — installed desktop, restored instantly from a snapshot (~4 s) |
| `/?nosnap` | Cold boot the installed hard disk (watch the ~30–90 s self‑compile) |
| `/?tour` | Boot straight into the Welcome guide |

## How it works

TempleOS is 64‑bit‑only and is its own self‑hosting compiler, so it can't be cross‑compiled
to WASM directly. Instead, a **graphical build of `qemu-system-x86_64` is compiled to
WebAssembly** (from the [ktock/qemu‑wasm](https://github.com/ktock/qemu-wasm) fork, whose
TCG backend JIT‑translates the guest's x86‑64 to WASM at runtime). It runs in a Web Worker
with `SharedArrayBuffer`, an SDL software framebuffer blitted to a `<canvas>`, and PS/2
keyboard + USB‑tablet mouse.

Cold boot is slow because TempleOS **recompiles its entire system on every boot**
(~30–90 s under emulation). So the default experience restores a **QEMU migration snapshot**
of the already‑booted desktop (`-incoming`), skipping the compile entirely — boot is ~4 s.

### What's in `vendor/`
| Path | Size | What |
|------|------|------|
| `vendor/qemu-sdl/` | ~13 MB | the graphical `qemu-system-x86_64.wasm` + loader + worker |
| `vendor/qemu/load-rom.data` | 0.5 MB | packed BIOS / VGA option ROMs |
| `vendor/images/templeos-hd.qcow2.gz` | 41 MB | the installed TempleOS hard disk (RedSea on C:) |
| `vendor/images/snapshot.bin.gz` | 4.8 MB | booted‑desktop RAM snapshot (instant boot) |
| `vendor/images/tour-snapshot.bin.gz` | 5.2 MB | desktop with the Welcome guide open (`?tour`) |

First load is ~64 MB, cached afterward. (The `.gz` assets are decompressed in the browser.)

## Running locally

A plain file server isn't enough — the page needs **cross‑origin isolation** for
`SharedArrayBuffer`. Two options:

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

## Performance

Boot is ~4 s (snapshot) and the desktop runs at roughly **30–45 fps** — near the practical
ceiling for emulating a 64‑bit PC in a browser. The cost is single‑core CPU emulation
(x86‑64 → WASM JIT); the canvas is already GPU‑composited by the browser, and a GPU can't
accelerate sequential CPU emulation. Multi‑core (`-smp` + MTTCG) was measured at ~8× *slower*
here (thread‑sync overhead), so the build deliberately uses a single vCPU.

## Credits & licenses

- **TempleOS** — created by **Terry A. Davis**. Public domain. The disk image and snapshots
  contain TempleOS V5.03.
- **QEMU** — licensed **GPLv2**. The `qemu-system-x86_64.wasm` here is built from QEMU via
  the [ktock/qemu‑wasm](https://github.com/ktock/qemu-wasm) fork; see that project for the
  corresponding source.
- **coi-serviceworker** — © Guido Zuidhof and contributors, **MIT**.
- **Theme & assets** — the TempleOS‑desktop look (DOS VGA bitmap font, cursor, the Terry GIF)
  is from [afterdavis](https://github.com/ParkerrDev/afterdavis), a Terry Davis tribute.

Because the bundled QEMU WebAssembly is GPLv2, this distribution as a whole is governed by
the GPLv2 with respect to that component (source is available upstream as noted above).
