# TempleOS‑wasm

**The real, complete TempleOS V5.03 running in your browser** - on **HEMU**, a clean‑room
x86‑64 emulator written almost entirely in **HolyC** and compiled to WebAssembly by the
bundled from‑scratch HolyC→WASM compiler ([`holyc-wasm/`](./holyc-wasm)). The actual
TempleOS kernel, HolyC JIT, graphics, games, keyboard and mouse - not a reimplementation,
not a screenshot. It boots to the installed desktop **in a few seconds**, and the 3D games
run at their designed 30 fps thanks to an x86‑64→WASM block JIT and native HLE of the
hottest render routines.

> This is a static site. Drop it on any static host (with cross‑origin isolation - see
> *Deploying*) and it runs entirely client‑side.

## Try it

- The desktop boots automatically - restored from a RAM snapshot in ~4 s.
- **Click the screen** for keyboard and mouse input. **Esc** releases mouse capture;
  use the Keys window's Esc button to send Escape to a captured game.
- **Ctrl+M** opens the personal menu - click a game sprite (Varoom, BlackDiamond, …) to play.
- **↻ Restart** reloads the clean snapshot any time the OS gets into a weird state.
- **⌨ HolyC Editor** - write & run TempleOS HolyC compiled *natively* to WASM (no emulation).
  Save/open `.HC` files, or write your source straight into `C:/Home` for the OS to run.
- **Games** - every game has Run in Browser, Run in TempleOS and Edit source. Browser play
  uses direct compilation for HolyCraft and Snake and an isolated HEMU session for the
  32 upstream packages. The main desktop pauses during browser play and resumes on close.
  Edit source keeps the code and playable preview together, with Run again to apply edits.
- **⏸ Pause** - freeze and resume the OS (guest time stops too).
- **💾 Disk & Save** - export a **snapshot** (the whole running OS - reload it later to resume
  exactly where you were) or your **C: disk image** (including files you saved in TempleOS);
  import either one back; or upload any file straight into `C:/Home`. This is how you save your
  progress, share programs/games, or boot a custom/modified TempleOS disk.
- **✞ God Words** - TempleOS's divine word oracle on the page itself: GodBits/GodPick
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
  runtime - the same trick TempleOS's own JIT plays, one level up;
- **HLE** of the hottest render routines (the window compositor blit and the games' span
  fillers), each shadow‑verified bit‑exact against the emulated version before activation;
- a worker engine that runs the emulator off the main thread.

The guest clock is paced to real time (the OS clock ticks at 1.00× and the games run at
their designed ~30 fps), and keystroke timing feeds the OS's God apps with real entropy,
exactly like the TSC sampling on real hardware.

### What's in `vendor/`
| Path | Size | What |
|------|------|------|
| `vendor/images/templeos-hd.qcow2.gz` | 41 MB | the installed TempleOS hard disk (FAT32 on C:), read on demand |
| `hemu-wasm/live.bin.gz` | 5 MB | booted‑desktop RAM snapshot (instant boot) |
| `hemu-wasm/snapshot.wasm` | ~77 KB | the compiled emulator |

The desktop appears after the 5 MB snapshot loads; the disk image streams in the background
for file I/O. (The `.gz` assets are decompressed in the browser.)

## Repository layout (4 repos)

| repo | what | consumed how |
|---|---|---|
| **TempleOS-web** (this) | the site: pages, search, video windows, converter, assets | deployed on Netlify |
| [holyc-wasm](https://github.com/ParkerrDev/HolyC-wasm) | HolyC→WASM compiler + runtime + the editor app | cloned into `./holyc-wasm` at build time |
| [hemu-wasm](https://github.com/ParkerrDev/Hemu-wasm) | the emulator: `snapshot.wasm`, the JIT, disk plumbing, engine harnesses | cloned into `./hemu-wasm` at build time |
| [TerryADavis-archive-transcriber](https://github.com/ParkerrDev/TerryADavis-archive-transcriber) | Whisper transcription pipeline | offline - its output is baked into `assets/transcripts/` by `build-transcripts.mjs` |

`netlify.toml`'s build command `git clone --depth 1`s the two sibling repos, so **every
deploy ships their latest main** - no submodule pins, no packages. To auto-redeploy when
*they* change, create one Netlify build hook (Site settings → Build & deploy → Build hooks)
and add its URL as a plain push webhook on both repos.

## Running locally

```bash
git clone https://github.com/ParkerrDev/TempleOS-Web && cd TempleOS-web
git clone --depth 1 https://github.com/ParkerrDev/HolyC-wasm holyc-wasm   # same layout the build creates
git clone --depth 1 https://github.com/ParkerrDev/Hemu-wasm hemu-wasm
node server.mjs               # → http://localhost:8080  (zero-dependency)
```

(For hacking on the engine/compiler, clone them as siblings and symlink instead:
`ln -s ../holyc-wasm ../hemu-wasm .`)

## Credits & licenses

- **TempleOS** - created by **Terry A. Davis**. Public domain. The disk image and snapshot
  contain TempleOS V5.03.
- **holyc-wasm, HEMU, the JIT** - written for this project; same repository.
- **ffmpeg.wasm** (`vendor/ffmpeg/`, powers the in-browser video converter) - FFmpeg (GPL) compiled
  to WebAssembly by the [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) project (MIT wrapper).
- **Transcripts** - Whisper (large-v3-turbo) transcriptions of the
  [TerryADavis_TempleOS_Archive](https://archive.org/details/TerryADavis_TempleOS_Archive) item.
- **Theme & assets** - the TempleOS‑desktop look (cursor, the Terry GIF) is from
  [afterdavis](https://github.com/ParkerrDev/afterdavis); the TempleOS font and the window
  chrome styling (vertical border titles, scrolling title marquee, blinking MENU chip) are
  adopted from [TempleOS-tribute](https://github.com/del-Real/TempleOS-tribute) by
  Alberto del Real (MIT).

## Sprite Studio and current game packages

Open Sprite Studio from the desktop menu to convert PNG/JPEG/WebP images, GIFs, or video clips to the TempleOS palette. It stays closed on arrival, including visits through old `/#sprites` links. It opens in a draggable desktop window and keeps the current conversion when closed and reopened. Exports include transparent .GR frames, a PNG sheet, an animated GIF, and a ZIP with .GR frames and Play.HC. Clips default to 25 fps, with options up to 50 fps, 600 frames and 20 million pixels. Conversion runs locally using the vendored FFmpeg for GIF/video decoding and a separate palette worker. The uncompressed .GR codec was checked against TempleOS's CDC layout and a PNG2GR fixture.

Natural shading is the default. It fits the unmodified source color with up to three nearby-hue entries from the stock palette, balancing display-RGB error against the contrast of the resulting pattern. There is no saturation boost or penalty for choosing gray. A fixed blue-noise mask keeps the same pattern across animation frames. Local source smoothing removes isolated compression flecks, with exact palette artwork and transparency preserved. Dither strength defaults to 35%; lower values reduce texture and 0% selects solid colors. Reconvert after changing it. The mask is reproducible with `node tools/build-sprite-noise.mjs`. Error diffusion and nearest-color matching remain selectable. Playback caches ImageData and uses elapsed time to recover after late frames; GIF exports distribute fractional delays across frames to preserve the clip duration.

The desktop Terry animation uses 251 palette-indexed .GR frames at 176 pixels tall, preserving the original 25 fps timing. Run `node tools/build-terry-sprites.mjs` with FFmpeg and ffprobe installed to regenerate `assets/terry-sprites.gr.gz` from the original GIFs.

Games request mouse capture through the guest input bridge. Click the game screen to capture the mouse; Esc releases it. Use the Keys window's Esc button to send Esc to TempleOS. The Capture mouse button also allows manual capture. Focus loss, window changes and OS restarts clear held keys and mouse buttons. HolyCraft uses relative mouse movement and explicit held-key state in both execution paths.

The Games menu puts HolyCraft, TOOM and Snake first. Every description credits the author and links to the original source. It installs pinned, checksum-verified TinkerOS game packages and TOOM with Freedoom. See [games/README.md](games/README.md) for sources and refresh instructions.

Developers can propose a game from the submission section at the bottom of the Games window. It opens a GitHub issue draft asking for the game's source, author credit, launch instructions, screenshots and permission to share its code and assets.

Edit source opens the selected game's project in HolyC Editor. The source selector includes all HolyC files in a package, including TOOM's renderer and weapons. Edits save on the current device and apply to both launch destinations. Save downloads the selected file with its embedded sprites; Restore file restores its original source. Drafts for upstream files belong to their pinned file revision so an upstream update cannot attach old source to different sprite records.

Run plays the game beside its source using the same runner as Run in Browser. You can keep editing or switch source files during play. Run again restarts the whole project with a snapshot of all current edits; Stop ends the preview. On narrow screens, scroll inside the editor to move between source and preview. Closing the editor or returning to Games also stops its preview.

Browser sessions use their own temporary TempleOS disk and memory. Closing one ends that session; the main desktop and its disk stay separate. Source drafts persist, but in-game saves in a browser session do not survive closing it. Use Run in TempleOS and Disk & Save when retaining guest progress matters. Browser compatibility sessions run the same guest kernel and input controller as the desktop; they do not claim direct HolyC-to-WASM support for missing TempleOS APIs.

`node tools/game-source.test.mjs` checks all 100 source files, byte preservation for the 23 files with embedded sprites, draft persistence, edited installations, restoration, partial-write recovery and OS restarts.

```sh
node tools/sprite-codec.test.mjs
node tools/sprite-player.test.mjs
node tools/holycraft-input.test.mjs
node tools/framebuffer.test.mjs
node tools/verify-games.mjs
python3 tools/check-text.py
```
