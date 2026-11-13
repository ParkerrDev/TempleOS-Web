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
  uses HolyC-WASM exclusively, including editor previews. Unsupported native APIs are
  reported as compilation errors; only Run in TempleOS invokes the emulator. The main desktop pauses during browser play and resumes on close.
  Edit source keeps the code and playable preview together, with Run again to apply edits.
- **⏸ Pause** - freeze and resume the OS (guest time stops too).
- **💾 Disk & Save** - export a **snapshot** (the whole running OS - reload it later to resume
  exactly where you were) or your **C: disk image** (including files you saved in TempleOS);
  import either one back; or upload any file straight into `C:/Home`. This is how you save your
  progress, share programs/games, or boot a custom/modified TempleOS disk.
- **✞ God Tools** - God's words and Bible passages on the page itself, picked in the timing-bit
  order of Adam/God and seeded by the browser, and Terry's God Song and God Doodle opened in TempleOS.
- **Chat** - talk with everyone else on the site. It opens in the corner without darkening the
  desktop, so the OS stays usable beside it, and the Menu counts new messages while it is shut.
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
emulator written in HolyC** ([HEMU](https://github.com/ParkerrDev/HEMU): `hemu/src/cpu.HC` + `snapshot.HC`, ~1.7k lines), compiled
to WebAssembly by **holyc-wasm**, a from‑scratch HolyC compiler in JavaScript. It resumes a
live RAM snapshot of the booted desktop, emulates just the hardware TempleOS touches
(PIC/PIT/HPET/PS‑2/ATA/VGA‑DAC), and pulls input from the host each frame.

Performance comes from three layers:
- an **x86‑64 → WASM block JIT** (`engine/jit.js`) that compiles hot guest code to native WASM at
  runtime - the same trick TempleOS's own JIT plays, one level up;
- **HLE** of the hottest render routines (the window compositor blit and the games' span
  fillers), each shadow‑verified bit‑exact against the emulated version before activation;
- a worker engine that runs the emulator off the main thread.

The guest clock is paced to real time (the OS clock ticks at 1.00× and the games run at
their designed ~30 fps), and keystroke timing feeds the OS's God apps with real entropy,
exactly like the TSC sampling on real hardware.

The top FPS counter reads TempleOS's own `winmgr.fps`, resolved once from the guest's
symbol metadata. Its update sequence detects stalls even if the host repeats an old
frame. Two scalar reads travel with existing frame messages; the label checks twice
per second and writes to the DOM only when the displayed value changes. Pausing shows
zero and resuming waits for a fresh sample. Native editor previews use the worker's
frame sequence for their separate FPS label, avoiding full-screen pixel hashing.

The screen is always a whole number of device pixels per 8x8 character cell, so one letter has one
shape everywhere. `framebuffer.js` scales each frame itself with integer maths and hands the browser
only whole-number zooms: at a scale like 1.25, `image-rendering:pixelated` puts some GPU sample
points exactly between two guest rows, and the same letter comes out in up to 15 shapes by position,
wobbling as it moves. Only rows that changed are expanded and uploaded, and scaling in JS stops at 15
pixels per cell, so the cost per frame stays bounded on any screen.

### What's in `vendor/`
| Path | Size | What |
|------|------|------|
| `vendor/images/templeos-hd.qcow2.gz` | 41 MB | the installed TempleOS hard disk (FAT32 on C:), read on demand |
| `hemu/live.bin.gz` | 10 MB | booted‑desktop RAM snapshot (instant boot) |
| `build/hemu.wasm` | ~77 KB | the compiled emulator, built at deploy by `engine/build.mjs` |

The desktop appears after the 10 MB snapshot loads; the disk image streams in the background
for file I/O. (The `.gz` assets are decompressed in the browser.)

## Repository layout (6 repos)

| repo | what | consumed how |
|---|---|---|
| **TempleOS-web** (this) | the site: pages, search, video windows, converter, assets | deployed on Netlify |
| [holyc-wasm](https://github.com/ParkerrDev/HolyC-wasm) | the HolyC→WASM compiler and its browser runtime | cloned into `./holyc-wasm` at build time |
| [HEMU](https://github.com/ParkerrDev/HEMU) | the emulator itself - plain HolyC - and the booted-RAM snapshots | cloned into `./hemu` at build time and compiled into `./build` by `engine/build.mjs` |
| [HolyC-fmt](https://github.com/ParkerrDev/HolyC-fmt) | the HolyC formatter, written in HolyC (the Format button, `/format.html`) | cloned into `./holyc-fmt` at build time |
| [HolyCraft](https://github.com/ParkerrDev/HolyCraft) | the HolyCraft voxel game, in HolyC, for the browser and for TempleOS | cloned into `./holycraft` at build time |
| [TerryADavis-archive-transcriber](https://github.com/ParkerrDev/TerryADavis-archive-transcriber) | Whisper transcription pipeline | offline - its output is baked into `assets/transcripts/` by `tools/build-transcripts.mjs` |

`Siblings.txt` pins each sibling repo to a commit. Netlify's build, `tools/NetlifyBuild.sh`, fetches
each one at its commit, runs the fast tests (`tools/Test.sh`), compiles the emulator into `build/`,
writes the CDN redirects, and publishes only the files the site serves (`node server.mjs Site`).
A sibling's new work reaches the site when its commit in `Siblings.txt` is moved.

The heavy files never come from Netlify: the build's last step, `tools/offload-redirects.mjs`, writes
`_redirects` that send the disk image, the RAM snapshots, the games, Terry Search's shards, Terry's
sprites and ffmpeg's wasm to `templeosweb-files`, a Cloudflare Worker over an R2 bucket (`cdn/`),
pinned to the commits they came from. The Worker copies a pinned file in from raw GitHub on its first
request, and the build HEADs every file first, so a bad pin or host fails the build instead of the
site. Deploy the Worker with `cd cdn && npx wrangler deploy`; a new file or folder to offload goes
in `cdn/Offload.js`, which both the Worker (`cdn/Files.js`) and `tools/offload-redirects.mjs` read.

"Visitors" in the top bar comes from `templeosweb-presence` (`presence/`), a separate Worker with one
Durable Object. Each open page holds a WebSocket to it, the number goes out when it changes, and the
bar shows nothing if it cannot be reached. A random id in localStorage stops one person's tabs
counting twice. It is held only while the socket is open, and nothing about a visitor is stored.
Only the main page connects. Deploy it with `cd presence && npx wrangler deploy`.

Chat comes from `templeosweb-chat` (`chat/`), another Worker with one Durable Object, kept apart so
that presence still stores nothing. A page connects the first time someone opens Chat and stays
connected so the Menu can count what arrives. The room keeps the last 100 messages in its SQLite
storage: time, name, text and a four-digit tag after the name, made from a salted hash of the
browser's id, so two people called Guest can be told apart. The id itself and the sender's IP are
never stored. Each sender (one IP, or one IPv6 /64) gets a burst of 5 messages and then one every
3 seconds, may not repeat a message within 30 seconds, and may hold 8 sockets. That limit is kept
in storage under a salted hash of the address, because a hibernating room forgets its memory, and
each row goes a minute after the sender's last message. `chat/rules.js` holds the limits and the
cleaning (bidi overrides, control characters and piled-up combining marks are removed), shared by
the Worker and the page, and the page only ever puts a message on screen as text. Deploy with
`cd chat && npx wrangler deploy`.

To moderate, set a secret once with `cd chat && npx wrangler secret put ADMIN_TOKEN`, then:

```sh
curl -X POST https://templeosweb-chat.parkerrhunt.workers.dev/admin -H "Authorization: Bearer $TOKEN" -d '{"list":true}'
curl -X POST https://templeosweb-chat.parkerrhunt.workers.dev/admin -H "Authorization: Bearer $TOKEN" -d '{"delete":42}'
curl -X POST https://templeosweb-chat.parkerrhunt.workers.dev/admin -H "Authorization: Bearer $TOKEN" -d '{"clear":true}'
```

`list` shows each message's number `n`; `delete` removes one from the room and from every open
page; `clear` empties the room. Without the secret, `/admin` does not exist.

To work on Chat locally, run the Worker with `cd chat && npx wrangler dev --var ORIGINS:http://localhost:8080`
and open `http://localhost:8080/?chat=ws://127.0.0.1:8787/`. The page takes `?chat=` only when it
is served from localhost itself.

### What's where in this repo

| Path | What |
|---|---|
| `index.html`, `*.js`, `*.html` | the desktop UI and its pages and modules (search, converter, games, sprites) |
| `engine/` | HEMU in the browser - the WASM host for HEMU: `build.mjs`, `compile.js`, `host.js`, the x86→WASM JIT (`jit.js`), guest execution and input, the disk reader, and the two emulator workers (see `engine/README.md`) |
| `editor/` | the in-browser HolyC editor app: compiles with `holyc-wasm/src` and runs programs in its own worker |
| `tools/` | tests and dev scripts (run from this directory); `tools/hemu/` the emulator harnesses, `tools/snapshot/` the QEMU recipes that produce HEMU's boot snapshots |
| `build/` | gitignored: `hemu.wasm`, `hemu-smp.wasm`, `hemu-smp.json`, compiled at deploy |
| `vendor/` | committed binary assets: the TempleOS disk image, fonts |
| `cdn/` | the Cloudflare Worker that serves the heavy files from R2 (`Files.js`, its list `Offload.js`, `wrangler.toml`) |
| `presence/` | the Cloudflare Worker that counts the people on the site (`Room.js`, the room both Workers are built on, `wrangler.toml`), and `RoomGlbls.js`, what the rooms and the pages agree on |
| `chat/` | the Cloudflare Worker behind the Chat window (`ChatRoom.js`, `wrangler.toml`) and the rules it shares with the page (`rules.js`) |
| `holyc-wasm/`, `hemu/`, `holyc-fmt/`, `holycraft/` | the sibling repos, cloned here at build time (gitignored) |

## Running locally

```bash
git clone https://github.com/ParkerrDev/TempleOS-Web && cd TempleOS-Web
while read dir url sha; do git clone -q $url $dir && git -C $dir checkout -q $sha; done <Siblings.txt
node engine/build.mjs build   # compile the emulator into build/
sh tools/Test.sh              # the fast tests
node server.mjs               # http://localhost:8080, with _headers (and _redirects, if written)
```

(For work on the engine or the compiler, clone the repos side by side and symlink them instead:
`ln -s ../HolyC-wasm holyc-wasm`, and the same for `hemu`, `holyc-fmt` and `holycraft`.)

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
- **Easter egg** - click Terry five times. The parrot, the voice clips and the TempleOS theme
  that sometimes plays under them are from
  [afterdavis](https://github.com/ParkerrDev/afterdavis); the glowie pictures were supplied by
  the site's owner, and the moving one is a
  [Tenor clip](https://tenor.com/view/cia-the-simpsons-glowie-meme-memes-2023-gif-1991881542871699456)
  cropped to the glowie (`assets/glowies/provenance.json`).
- **Menu icons** - [pixelarticons](https://github.com/halfmage/pixelarticons) by Gerrit Halfmann
  (MIT, `assets/pixelarticons-LICENSE.txt`), inline in `index.html`. The cross is its `cross-sharp`
  with the bar raised.

## Sprite Studio and current game packages

Open Sprite Studio from the desktop menu to convert PNG/JPEG/WebP images, GIFs, or video clips to the TempleOS palette. It stays closed on arrival, including visits through old `/#sprites` links. It opens in a draggable desktop window and keeps the current conversion when closed and reopened. Exports include transparent .GR frames, a PNG sheet, an animated GIF, and a ZIP with .GR frames and Play.HC. Clips default to 25 fps, with options up to 50 fps, 600 frames and 20 million pixels. Conversion runs locally: videos use the browser decoder and bounded canvas frame extraction; GIFs and browsers without video-frame callbacks still use the vendored FFmpeg, and palette mapping runs in a separate worker. Supported browsers do not download the 31 MB FFmpeg module for video conversion. The editor visibly credits greg0-4's PNG2GR for the conversion inspiration and format reference. The uncompressed standard-palette .GR reader and writer are shared HolyC in `sprites/Gr.HC`, compiled for Sprite Studio and the Terry player. Native QEMU checks compare them with TempleOS's own `DCLoad` and `DCSave`; `npm run test:sprites` checks the browser preview, downloads, MP4/WebM frame selection, cancellation and cleanup (Python and FFmpeg are needed for its independent fixtures). Exported `Play.HC` restores native window settings and cleans up images on exit or load failure; `node sprites/Play.test.mjs --native` verifies the actual package in TempleOS under QEMU.

Natural shading is the default. It fits the unmodified source color with up to three nearby-hue entries from the stock palette, balancing display-RGB error against the contrast of the resulting pattern. There is no saturation boost or penalty for choosing gray. A fixed blue-noise mask keeps the same pattern across animation frames. Local source smoothing removes isolated compression flecks, with exact palette artwork and transparency preserved. Dither strength defaults to 35%; lower values reduce texture and 0% selects solid colors. Reconvert after changing it. The mask is reproducible with `node tools/build-sprite-noise.mjs`. Error diffusion and nearest-color matching remain selectable. Playback caches ImageData and uses elapsed time to recover after late frames; GIF exports distribute fractional delays across frames to preserve the clip duration.

The desktop Terry animation uses 251 palette-indexed .GR frames at 176 pixels tall, preserving the original 25 fps timing. Run `node tools/build-terry-sprites.mjs` with FFmpeg and ffprobe installed to regenerate `assets/terry-sprites.gr.gz` from the original GIFs.

Games request mouse capture through the guest input bridge. Click the game screen to capture the mouse; Esc releases it into hybrid mode. Clicking or focusing TempleOS again keeps the cursor free, even if the guest keeps requesting capture. Use Capture mouse to capture again; the HolyC Editor has its own capture button above the native preview. Native previews also support Shift+click and manual capture for programs that do not request it themselves. Use the Keys window's Esc button to send Esc to TempleOS. The Capture mouse button also allows manual capture. Focus loss, window changes and OS restarts clear held keys and mouse buttons. HolyCraft uses relative mouse movement and explicit held-key state in both execution paths.

The Games menu puts HolyCraft, TOOM, Babel, Volley and Snake first. Every description credits the author and links to the original source. Its 66 entries include 47 games and interactive demos by Terry, 8 games or adaptations by TheTinkerer, 5 HolyC games by Austin Sierra, and the site's HolyCraft, TOOM, Snake, Babel, Volley and FNAF. Authors are checked against Terry's official discs and the developers' source histories. See [games/AUTHORS.md](games/AUTHORS.md) for the inventory and attribution evidence. Both destinations read the same pinned, checksum-verified sources; only Run in TempleOS installs files in the guest. See [games/README.md](games/README.md) for sources and refresh instructions.

Developers can propose a game from the submission notice at the top of the Games window. It opens a GitHub issue draft asking for the game's source, author credit, launch instructions, screenshots and permission to share its code and assets.

Edit source opens the selected game's project in HolyC Editor. The source selector includes all HolyC files in a package, including TOOM's renderer and weapons. Edits save on the current device and apply to both launch destinations. Save downloads the selected file with its embedded sprites; Restore file restores its original source. Drafts for upstream files belong to their pinned file revision so an upstream update cannot attach old source to different sprite records.

Run plays the game beside its source using the same runner as Run in Browser. You can keep editing or switch source files during play. Run again restarts the whole project with a snapshot of all current edits; Stop ends the preview. On narrow screens, scroll inside the editor to move between source and preview. Closing the editor or returning to Games also stops its preview.

Browser games open in a larger window and scale the 640x480 canvas to fit while preserving its aspect ratio. Capture mouse and Fullscreen are available inside the game window. HolyC Editor offers Fullscreen editor for the whole workspace and Fullscreen game for just its preview. Escape or Exit fullscreen restores the previous layout and releases the mouse. Fullscreen survives preview reruns and uses a viewport fallback when the browser does not support element fullscreen. Native input handles left/right button combinations and retains quick clicks between worker polls.

Browser play and editor previews compile the game entry and its included HolyC files directly with HolyC-WASM in a Web Worker. Drafts are frozen across all files before a run. No game iframe, guest kernel or guest disk is created. Unknown native APIs and parser errors stop the run with an explanation in Console. Each run compiles `editor/Adam.HC` first, which gives the browser compiler SettingsPush, SettingsPop, AutoComplete and a window manager task that calls draw_it, so a game written for TempleOS runs unchanged. Browser compilation currently passes for HolyCraft, Snake, Babel, Volley, TicTacToe, Collision, ElephantWalk, Digits and B17. The first four also pass recorded worker-startup, advancing-frame and stop checks. The other five stay on Run in TempleOS until their browser runs are checked. The launcher requires both compilation and startup evidence; changing the program, compiler or browser runner invalidates that evidence. Startup does not establish input response or full gameplay parity. Run in TempleOS stays available for every package that passes the startup check below. Run `node tools/native-games-audit.mjs` to check the current compiler against the complete catalog. Successful compilation alone does not establish playability. The separate [native game checks](tools/games/README.md) verify input, rendering and repeated-launch cleanup in original TempleOS and HEMU; every entry is also launched in original TempleOS V5.03 under QEMU and in HEMU, and Run in TempleOS is enabled only for those that start and quit the same way in both (`games/startup.json`); that is not gameplay proof.

The editor's runner (`editor/worker.js`) supports opt-in relative mouse input through the HolyC globals `I64 BrowserMouseCapture`, `I64 BrowserMouseDX`, `I64 BrowserMouseDY`, and `U8 BrowserKeys[128]`. Set capture to 1 while the game needs it and to 0 when returning to menus. The worker accumulates mouse deltas until the program consumes and clears them, and copies held movement keys by set-1 scancode. Capture requires a click on the game canvas; Esc releases it. HolyCraft exercises this protocol in `tools/holycraft-input.test.mjs`.

`node tools/game-source.test.mjs` checks all 304 source files, byte preservation for the 64 files with embedded sprites, draft persistence, edited installations, restoration, partial-write recovery and OS restarts.

```sh
node tools/sprite-codec.test.mjs
node tools/sprite-player.test.mjs
node tools/guest-fps.test.mjs
node tools/presence.test.mjs
node tools/chat.test.mjs
node tools/chat-worker.test.mjs     # the chat Worker in wrangler dev, on this machine only (needs npx)
node tools/holycraft-input.test.mjs
node tools/game-capture.test.mjs
node tools/native-clicks.test.mjs
node tools/game-view.test.mjs
node tools/native-project.test.mjs
node tools/framebuffer.test.mjs
node tools/verify-games.mjs
node tools/game-credits.test.mjs
python3 tools/redsea.test.py
python3 tools/check-text.py
```

The emulator harnesses (`tools/hemu/`, memory-hungry, need the decompressed snapshot and a raw disk) and the QEMU capture recipes (`tools/snapshot/`) are documented in `engine/README.md`. `npm run test:browser` checks the desktop/mobile shell, including fullscreen keyboard focus. `npm run test:search` checks the native query parser and real search worker, copied/downloaded transcripts, archive links and video windows. These browser checks start their own local server and use Playwright with `CHROMIUM` (default `/usr/bin/chromium`). The search check also needs FFmpeg to generate small MP4/MKV fixtures; network routes supply these known files without depending on archive availability. Live archive/CDN delivery remains a separate deployment check.

```sh```

The editor uses native TempleOS keyboard decoding and cooperative tasks when a program needs them. `npm run test:editor` checks extended keys, modifiers, held-state release, queue overflow, blocked-input wakeups, child failures and worker-load errors in the actual browser worker. Unsupported blocking APIs fail before program initialization.

The Keys window routes presses to the active HolyC preview or TempleOS. Each release goes back to the program that accepted the press; physical and on-screen holds share ownership. Mobile keys stay above dialogs, and focus loss clears both held keys and latched modifiers. The browser editor check includes actual touch taps and legacy preview input.
