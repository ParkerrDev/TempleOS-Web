# TempleOS-Web guide

**TempleOS V5.03 running in your browser**, through the
[HEMU](https://github.com/ParkerrDev/HEMU) x86-64 emulator. HEMU's CPU and
devices are HolyC, compiled to WebAssembly by
[HolyC-wasm](https://github.com/ParkerrDev/HolyC-wasm). HolyC-wasm also owns the
JavaScript host that connects browser workers, storage, input and display.
HEMU's HolyC JIT emits WebAssembly for hot guest instructions; the host loads
those blocks. TempleOS runs its own kernel, HolyC compiler and desktop.
The initial capture already contains the display corrections, Welcome card
and native Take Tour question.

> This is a static site. Drop it on any static host (with cross‑origin isolation - see
> *Deploying*) and it runs entirely client‑side.

## Try it

- With **Save full session** enabled, the desktop restores a saved session when its disk revision still matches. Otherwise it starts from the prepared RAM/register capture with the newest saved C:.
- **Click the screen** for keyboard and mouse input. **Esc** releases mouse capture;
  use the Keys window's Esc button to send Escape to a captured game.
- **Ctrl+M** opens the personal menu - click a game sprite (Varoom, BlackDiamond, …) to play.
- **↻ Restart** reloads the stock desktop while preserving your saved C: drive.
- **⌨ HolyC Editor** - write & run TempleOS HolyC compiled *natively* to WASM (no emulation).
  Import or download source files. Files opened from C: save back to their original location. New programs let you choose a C: path.
- **Games** - every game has Run in Browser, Run in TempleOS and Edit source. Browser play
  uses HolyC-WASM exclusively, including editor previews. Unsupported native APIs are
  reported as compilation errors; only Run in TempleOS invokes the emulator. The main desktop pauses during browser play and resumes on close.
  Edit source keeps the code and playable preview together, with Run again to apply edits.
- **⏸ Pause** - freeze and resume the OS (guest time stops too).
- **Files** - browse C: in its own window, with places, back/up navigation, a path bar, filtering and file sizes. Select a file to edit or download it; drop files into the current folder to import them. New program opens HolyC Editor with this folder as its save destination.
- **Disk & Save** - save the session or import/export a whole snapshot or disk.
- **Menu → Cheatsheet** - browse common TempleOS commands, editor shortcuts and a first HolyC program.
- **Sync when multiple tabs are open** is on by default. One tab handles frames, sound and window updates locally; a lightweight shared worker detects other tabs without polling. A second tab activates shared frame delivery and input routing. Closing it returns the host to local delivery without restarting. The host owns the CPU workers and all connected tabs use its filesystem. Turning sync off takes effect after refresh; only one independent tab can save C:.
- C: saves after writes. **Save full session** is off by default. When enabled, full sessions save after input settles outside gameplay and when the page hides. Only the checkpoint copy briefly stops the CPUs; compression and storage leave the OS responsive. A checkpoint whose disk changed during compression is discarded and saved again after activity settles. **Save session** creates an explicit checkpoint. Closing or refreshing the host tab restores the last completed checkpoint; a crash or immediate close can lose newer RAM changes. Newer saved files are never replaced by an older checkpoint.
- **Remember window positions** is off by default. Enable it to preserve positions, sizes and open state. Disabling it removes the saved layout and disconnects layout-saving observers, without moving the current windows. Settings can reset their positions. Desktop windows can move into browser popups; mobile windows stay in the page so scrolling works.
- **✞ God Tools** - God's words and Bible passages on the page itself, picked in the timing-bit
  order of Adam/God and seeded by the browser, and Terry's God Song and God Doodle opened in TempleOS.
- **Chat** - talk with everyone else on the site. It opens in the corner without darkening the
  desktop, so the OS stays usable beside it, and the Menu counts new messages while it is shut.
- On phones: an on‑screen joystick + L/R mouse buttons + a keyboard summon button appear,
  and the function/modifier key bar works by touch.

Terry Search favors browser formats (MP4, WebM and Ogg video) before other formats, retaining the selected relevance or date order within each group. The player offers a playable copy when the catalog matches a source video ID or an identical full transcript of over 500 characters, with durations within two seconds. Matching titles alone are not enough. `node Apps/Search/VideoListMk.mjs` regenerates these links from the transcript corpus. The player keeps the requested timestamp when switching copies; conversion remains available for originals without a matching copy. Transcript opens the current recording in Terry Search, including after video navigation. Watching alone does not load transcripts.

### URL options
| URL | What it does |
|-----|--------------|
| `/` | Prepared desktop, with four cores when shared memory is available |
| `/?transcript=PATH` | Open the transcript for an archive video path |
| `/?single` | Use the single-core engine in a worker |
| `/?b=N` | Pin the guest instruction budget per frame (debug) |

## How it works

HEMU resumes TempleOS's captured 64-bit machine. It emulates the hardware
TempleOS uses (PIC/PIT/HPET/PS-2/ATA/VGA-DAC), while the browser host supplies
input, display, sound and storage. It does not execute the DVD's 16-bit BIOS
loader. [HEMU's runtime documentation](https://github.com/ParkerrDev/HolyC-wasm/blob/master/Apps/HEMU/README.md) covers the
machine boundary, build, checks and supported behavior.

HEMU executes guest instructions through an interpreter and an **x86-64 → WASM
block JIT** written in HolyC (`hemu/Kernel/JitCore.HC`). **Web Optimization** is on by default
for smoother games. It replaces selected stock drawing routines with HolyC
implementations running on the CPU.
Turn it off in Settings to execute the original drawing instructions. The change
applies immediately and the choice is remembered on this browser. Both modes use
the same engine and instruction-level JIT optimizations.

Acceleration checks the complete original code ranges, including helpers it
bypasses. Edited routines and unsupported inputs fall back to guest execution.
Polygon assembly, transforms and callbacks run as guest code in both modes;
fast mode accelerates triangle filling and depth spans. Software drawing
acceleration changes instruction counts and timing, so it is not a claim of
instruction-for-instruction fidelity.

Full machine saves retain their engine and graphics mode. Older embedded engines
without the switch require Restart to use the current engine; Restart keeps saved
C: files and reloads the desktop instead of preserving running RAM.

Neither mode establishes complete PC or cycle accuracy. The machine resumes
prepared snapshots, observes completed frames through TempleOS symbols, integrates
mouse state, and applies requested display-rate settings. The guest clock follows
host elapsed time; rendering speed depends on the workload and host. Input timing
reaches that clock without a claim that its entropy matches physical hardware.

The top FPS counter reads the digits painted in the last completed TempleOS
frame. A covered label is unknown; repeated frames cannot invent new samples.
Pausing retains the frozen frame's label. Direct-WASM editor previews use their
own worker's frame sequence for a separate FPS label.

### Window settings

**Native window drawing** draws browser window frames with a small HolyC/WASM
renderer using TempleOS's font, `TextBorder` and `DrawWinScroll`. Titles and
controls use the native 8x8 grid. Turn it off for matching HTML/CSS decorations.
The CSS mode uses bitmap cells extracted from the same system font, with no
drawing WASM or canvas. Both modes use an 8-pixel cell at 100%.
The renderer loads only when selected and works before boot and while paused.
**Window scale (DPI)** in Settings adjusts borders, titles and scroll
handles from 100% to 200% in either drawing style, defaulting to 125%. Saved
scale preferences are preserved. Contents keep their existing
size. The scale applies immediately, follows popup windows and survives reload.
Browser content and accessible controls remain HTML; this does not turn a web
form into a TempleOS application. Native task addresses and editor status are
omitted from browser frames. The reference check compares focused and unfocused
borders, moving titles and scrollbar states with original V5.03 drawing.
`node Adam/WinDrawRef.mjs` checks the HolyC renderer against an unaccelerated
guest capture. `node Adam/WinChrome.browser.mjs` compares CSS screenshot pixels
against that renderer at all five DPI settings, including narrow and partial
cells. HTML/CSS frames use pixel-aligned fonts and CSS rules with no decoration
images or per-frame JavaScript. Only the selected scale's font loads. Arbitrary
browser zoom and device scale can still change final rasterization.
See [Window decoration reference](WindowChrome.md) for the geometry and sources.

**Window passthrough** lets you drag a compatible TempleOS title bar across the
screen edge to move its live window onto the page. Drag its title back over the
screen to return it. Its task, document, keyboard, mouse and scroll controls still
run inside TempleOS.

Every site tool except Video Player and Sprite Studio can move into TempleOS,
including Chat, HolyC Editor, Files, Disk & Save, Terry Search, Settings, Games,
God Tools, the cheatsheet, Menu and Terry. A shared converter reads the
resolved HTML/CSS layout. Native HolyC draws its text, rectangles and indexed
images with `GrPrint`, `GrRect` and `GrBlot`. SVG icons become palette bitmaps,
including icons that refer to shared SVG symbols.

TempleOS handles pointer hits and keyboard navigation in guest tasks. Text fields
edit inline using TempleOS documents, including their cursor and selection.
Enter submits a single-line field and inserts a newline in a multiline field.
Dropdowns use native list pickers. The browser receives edited values and actions
for services such as chat, file access and compilation;
it never focuses an invisible HTML field for native typing. HolyC source keeps
its original CP437 bytes. Other Unicode text uses `\u{...}` escapes in the native
editor when the character is outside TempleOS's font.

Compatible tools opened from a native tool stay inside TempleOS, including
Files → Editor, Editor → Files, game launchers, dropdown menus and save/replace
dialogs. Video Player and Sprite Studio remain on the page. Picking files from
your computer, downloads and browser permission dialogs still use browser APIs.

The converter uses TempleOS's 8×8 font and sixteen colors. It translates this
site's resolved DOM, rather than supplying a standalone browser in the guest.
Rectangular layouts, clipping and positioned overlays are supported; CSS shadows,
gradients, rounded corners and arbitrary transformed graphics are not reproduced.
Native frames replace the web decorations instead of drawing both.

Guest capture supports bordered documents and their native sprites and scrollbars.
Arbitrary custom drawing callbacks, persistent desktop graphics, fullscreen programs
and captured-mouse programs stay on the TempleOS screen. The bridge's own scene
tasks return to their browser owner instead of entering guest capture. Pausing or
disabling passthrough returns windows to their original environment; resuming enables
dragging again. Restart and snapshot restore also return native windows before
further dragging. Old saved engines require Restart to enable passthrough.

**TempleOS Only Mode** in Settings fills the browser viewport and moves open
compatible tools and detached windows into TempleOS. New tools open there too,
and windows cannot be dragged out while the mode is active. Use Settings'
exit button or the corner [X] to return to the site. Exiting restores the previous
browser positions and popups, including native windows that were dragged out.
Tools already inside TempleOS stay there. Existing popups wait for their tools
to return. Restart keeps the mode;
pausing or opening Video Player or Sprite Studio leaves it so those browser
controls remain reachable. The mode lasts for this visit and does not change
your usual passthrough preference.

Both window options are off initially and remembered independently of Web
Optimization. Detached documents use isolated native pixel buffers. HEMU stops
the other CPUs during that bounded drawing transaction and restores the shared
drawing state before they resume.

The screen is always a whole number of device pixels per 8x8 character cell, so one letter has one
shape everywhere. `FrameBuf.js` scales each frame itself with integer maths and hands the browser
only whole-number zooms: at a scale like 1.25, `image-rendering:pixelated` puts some GPU sample
points exactly between two guest rows, and the same letter comes out in up to 15 shapes by position,
wobbling as it moves. Only rows that changed are expanded and uploaded, and scaling in JS stops at 15
pixels per cell, so the cost per frame stays bounded on any screen.

### Startup assets

| Path | What |
|------|------|
| `hemu/live.bin.gz`, `hemu/live-smp.bin.gz` | one- and four-core RAM captures, stored as gzipped sparse 64-byte ranges |
| `hemu/stock.json`, `hemu/stock*.disk` | capture identities and disk sectors changed from the base image |
| `hemu/templeos-hd.qcow2.gz` | the base C: disk, loaded in the background |
| `hemu/build/hemu*.wasm`, `hemu/build/hemu-smp.json` | matching engines and SMP metadata, compiled at deployment |

The loader overlaps snapshot download, worker startup and engine preparation.
Visitor presence and the Terry animation wait for the first desktop frame.
Games, Chat and Terry Search load only when opened. The Games catalog loads separately
from its editor and runners, with immediate cancellable loading feedback.
Only populated RAM ranges are inflated and copied into the zeroed 384 MiB guest
memory. The corrections and Welcome task were compiled in native TempleOS
before capture; startup resumes them directly. C: restores from browser storage
when available. The stock disk is fetched separately when no saved drive exists.

## Repository layout (6 repos)

| repo | what | consumed how |
|---|---|---|
| **TempleOS-web** (this) | the site: pages, search, video windows, converter, assets | deployed on Netlify |
| [holyc-wasm](https://github.com/ParkerrDev/HolyC-wasm) | compiler and HolyC runtime; `Apps/HEMU` owns the WebAssembly host, browser lifecycle/storage, build and integration tests | pinned by HEMU in `./hemu/holyc-wasm`; shared by the machine and site apps |
| [HEMU](https://github.com/ParkerrDev/HEMU) | HolyC CPU/devices/JIT, native Linux host, instruction self-tests and captures | cloned into `./hemu`; `hemu/holyc-wasm/Apps/HEMU/Kernel/Build.mjs` writes `hemu/build/` |
| [HolyC-fmt](https://github.com/ParkerrDev/HolyC-fmt) | the HolyC formatter, written in HolyC (the Format button, `/Apps/Editor/Format.html`) | cloned into `./holyc-fmt` at build time |
| [HolyCraft](https://github.com/ParkerrDev/HolyCraft) | the HolyCraft voxel game, in HolyC, for the browser and for TempleOS | cloned into `./holycraft` at build time |
| [TerryADavis-archive-transcriber](https://github.com/ParkerrDev/TerryADavis-archive-transcriber) | Whisper transcription pipeline | offline - its output is baked into `Apps/Search/Transcripts/` by `Apps/Search/TranscriptsMk.mjs` |

`Siblings.txt` pins the site's sibling repos; `hemu/Siblings.txt` pins the
compiler. Netlify's build, `Misc/NetlifyBuild.sh`, fetches those commits, builds
the fixed app programs with `Misc/AppsBuild.mjs`, generates module preloads,
builds HEMU and runs the fast checks through `Misc/Test.sh`. It then writes CDN redirects and publishes
the served files with `node Misc/Server.mjs Site`.

The fixed HolyC programs are the sprite codec (`Gr.HC`), transcript search
(`Search.HC` and `Query.HC`), MP4 and MKV planners, God Tools' timing-bit queue (`GodBits.HC`),
HolyC-fmt and the optional window renderer (`WinDraw.HC`). Their WASM is built once into `build/`; using these features
loads it directly. Editable programs and games still need the compiler at run
time.

The heavy files never come from Netlify: the build's last step, `Misc/Cdn/OffloadRedirects.mjs`, writes
`_redirects` that send the disk image, the RAM snapshots, the games, Terry Search's shards, Terry's
sprites and ffmpeg's wasm to `templeosweb-files`, a Cloudflare Worker over an R2 bucket (`Misc/Cdn/`),
pinned to the commits they came from. Workers Cache serves these immutable files
from Cloudflare's edge, including on workers.dev. Archive byte-range replies
remain browser-cached only. The Worker copies a pinned file in from raw GitHub on its first
request, and the build HEADs every file first, so a bad pin or host fails the build instead of the
site. Deploy the Worker with `cd Misc/Cdn && npx wrangler deploy`; a new file or folder to offload goes
in `Misc/Cdn/Offload.js`, which both the Worker (`Misc/Cdn/Files.js`) and `Misc/Cdn/OffloadRedirects.mjs` read.

"Visitors" in the top bar comes from `templeosweb-presence` (`Apps/Chat/Room/`), a separate Worker with one
Durable Object. Each open page holds a WebSocket to it, the number goes out when it changes, and the
bar shows nothing if it cannot be reached. A random id in localStorage stops one person's tabs
counting twice. It is held only while the socket is open, and nothing about a visitor is stored.
Only the main page connects. Deploy it with `cd Apps/Chat/Room && npx wrangler deploy`.

Chat comes from `templeosweb-chat` (`Apps/Chat/ChatRoom/`), another Worker with one Durable Object, kept apart so
that presence still stores nothing. A page connects the first time someone opens Chat and stays
connected so the Menu can count what arrives. The room keeps the last 100 messages in its SQLite
storage: time, name, text and a four-digit tag after the name, made from a salted hash of the
browser's id, so two people called Guest can be told apart. The id itself and the sender's IP are
never stored. Each sender (one IP, or one IPv6 /64) gets a burst of 5 messages and then one every
3 seconds, may not repeat a message within 30 seconds, and may hold 8 sockets. That limit is kept
in storage under a salted hash of the address, because a hibernating room forgets its memory, and
each row goes a minute after the sender's last message. `Apps/Chat/ChatRules.js` holds the limits and the
cleaning (bidi overrides, control characters and piled-up combining marks are removed), shared by
the Worker and the page, and the page only ever puts a message on screen as text. Deploy with
`cd Apps/Chat/ChatRoom && npx wrangler deploy`.

To moderate, set a secret once with `cd Apps/Chat/ChatRoom && npx wrangler secret put ADMIN_TOKEN`, then:

```sh
curl -X POST https://templeosweb-chat.parkerrhunt.workers.dev/admin -H "Authorization: Bearer $TOKEN" -d '{"list":true}'
curl -X POST https://templeosweb-chat.parkerrhunt.workers.dev/admin -H "Authorization: Bearer $TOKEN" -d '{"delete":42}'
curl -X POST https://templeosweb-chat.parkerrhunt.workers.dev/admin -H "Authorization: Bearer $TOKEN" -d '{"clear":true}'
```

`list` shows each message's number `n`; `delete` removes one from the room and from every open
page; `clear` empties the room. Without the secret, `/admin` does not exist.

To work on Chat locally, run the Worker with `cd Apps/Chat/ChatRoom && npx wrangler dev --var ORIGINS:http://localhost:8080`
and open `http://localhost:8080/?chat=ws://127.0.0.1:8787/`. The page takes `?chat=` only when it
is served from localhost itself.

### What's where in this repo

| Path | What |
|---|---|
| `index.html` | the desktop page; with `_headers`, `netlify.toml`, `package.json` and `Siblings.txt` it is all the root holds |
| `Adam/` | what every window uses: the host of the OS (`Os.js`), the window manager, keyboard, touch and mouse input, the frame scaler, the fonts and the shell's images |
| `Apps/<Name>/` | one folder a window, with its module, pages, styles, HolyC, Worker, data and tests: `Chat` (with its two Cloudflare Workers, `ChatRoom/` and `Room/`), `Disk`, `Editor` (the in-browser HolyC editor: compiles with `hemu/holyc-wasm/src` and runs programs in its own worker), `Games`, `God`, `Help`, `Search` (Terry Search, the player page, the clip maker in `Clip/`, the transcripts and FFmpeg), `Settings`, `Sprites` and `Terry` |
| `Demo/Games/` | the HolyC games and their catalog, the packages from elsewhere (`Upstream/`), TOOM (`Toom/`), and the tools and records that check them (`Test/`) |
| `Doc/` | the validation record |
| `Misc/` | the server and publisher (`Server.mjs`), the fast tests (`Test.sh`), Netlify's build, the text check, Lighthouse, and `Cdn/`, the Cloudflare Worker that serves the heavy files from R2 (`Files.js`, its list `Offload.js`, `wrangler.toml`) |
| `build/` | gitignored fixed app programs: `Gr.wasm`, `Search.wasm`, `Mp4.wasm`, `Mkv.wasm`, `GodBits.wasm`, `HolyCFmt.wasm` |
| `hemu/`, `holyc-fmt/`, `holycraft/` | the sibling repos, cloned at build time (gitignored); HEMU contains the shared compiler mount |

A test sits beside what it tests: `Name.test.mjs` runs under node and `Name.browser.mjs` drives a
browser. A folder named `Test` holds what only tests read. The publisher
(`Misc/Server.mjs`) serves the site and sibling runtime assets while excluding
tests, build tools, notes and server-side Worker sources. Machine checks live in
`hemu/holyc-wasm/Apps/HEMU/Kernel/Test/`; shell integration checks live beside `Adam/` and the apps.

## Running locally

```bash
git clone https://github.com/ParkerrDev/TempleOS-Web && cd TempleOS-Web
while read dir url sha; do git clone -q $url $dir && git -C $dir checkout -q $sha; done <Siblings.txt
while read dir url sha; do git clone -q $url hemu/$dir && git -C hemu/$dir checkout -q $sha; done <hemu/Siblings.txt
node hemu/holyc-wasm/Apps/HEMU/Kernel/Build.mjs hemu/build
node Misc/AppsBuild.mjs
node Misc/Preload.mjs
sh Misc/Test.sh               # the fast tests
node Misc/Server.mjs          # http://localhost:8080, with _headers (and _redirects, if written)
```

For local sibling development, symlink HEMU, HolyC-fmt and HolyCraft at those
mounts. The compiler belongs at `hemu/holyc-wasm`, so HEMU and the site use the
same compiler and runtime.

## Credits & licenses

- **TempleOS** - created by **Terry A. Davis**. Public domain. The disk image and snapshot
  contain TempleOS V5.03.
- **HolyC-wasm and HEMU** - companion projects; the x86-to-WASM JIT lives in HEMU.
- **ffmpeg.wasm** (`Apps/Search/FFmpeg/`, powers the in-browser video converter) - FFmpeg (GPL) compiled
  to WebAssembly by the [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) project (MIT wrapper).
- **Transcripts** - Whisper (large-v3-turbo) transcriptions of the
  [TerryADavis_TempleOS_Archive](https://archive.org/details/TerryADavis_TempleOS_Archive) item.
- **Theme & assets** - the TempleOS‑desktop look (cursor, the Terry GIF) is from
  [afterdavis](https://github.com/ParkerrDev/afterdavis); the TempleOS font and the window
  chrome styling (vertical border titles, scrolling title marquee, blinking MENU chip) are
  adopted from [TempleOS-tribute](https://github.com/del-Real/TempleOS-tribute) by
  Alberto del Real (MIT).
- **Menu icons** - [pixelarticons](https://github.com/halfmage/pixelarticons) by Gerrit Halfmann
  (MIT, `Adam/pixelarticons-LICENSE.txt`), inline in `index.html`. The cross is its `cross-sharp`
  with the bar raised.

## Sprite Studio and current game packages

Open Sprite Studio from the desktop menu to convert PNG/JPEG/WebP images, GIFs, or video clips to the TempleOS palette. It stays closed on arrival, including visits through old `/#sprites` links. It opens in a draggable desktop window and keeps the current conversion when closed and reopened. Save to TempleOS writes the selected .GR frame directly to C:/Home on the running guest disk, using the filename shown in Sprite Studio. The browser saves C: automatically; the same filename replaces its prior contents. Downloads include transparent .GR frames, a PNG sheet, an animated GIF, and a ZIP with .GR frames and Play.HC. Clips default to 25 fps, with options up to 50 fps, 600 frames and 20 million pixels. Conversion runs locally: videos use the browser decoder and bounded canvas frame extraction; GIFs and browsers without video-frame callbacks still use the vendored FFmpeg, and palette mapping runs in a separate worker. Supported browsers do not download the 31 MB FFmpeg module for video conversion. The editor visibly credits greg0-4's PNG2GR for the conversion inspiration and format reference. Palette quantization, smoothing, diffusion, RGBA conversion, GIF encoding and stored ZIP/CRC encoding run in the same HolyC codec as the standard-palette .GR reader and writer (`Apps/Sprites/Gr.HC`). Sprite Studio and the Terry player share its compiled WASM; JavaScript handles browser input, buffers and downloads. `node Apps/Sprites/Color.test.mjs --native` compares 297 pre-port outputs with both WASM and original TempleOS. Native GR checks compare GR files with TempleOS's own `DCLoad` and `DCSave`; `npm run test:sprites` checks the browser preview, downloads, MP4/WebM frame selection, cancellation and cleanup (Python and FFmpeg are needed for its independent fixtures). Exported `Play.HC` restores native window settings and cleans up images on exit or load failure; `node Apps/Sprites/Play.test.mjs --native` verifies the actual package in TempleOS under QEMU.

Natural shading is the default. It fits the unmodified source color with up to three nearby-hue entries from the stock palette, balancing display-RGB error against the contrast of the resulting pattern. There is no saturation boost or penalty for choosing gray. A fixed blue-noise mask keeps the same pattern across animation frames. Local source smoothing removes isolated compression flecks, with exact palette artwork and transparency preserved. Dither strength defaults to 35%; lower values reduce texture and 0% selects solid colors. Reconvert after changing it. The mask is reproducible with `node Apps/Sprites/SpriteNoiseMk.mjs`. Error diffusion and nearest-color matching remain selectable. Playback caches ImageData and uses elapsed time to recover after late frames; GIF exports distribute fractional delays across frames to preserve the clip duration.

The desktop Terry animation uses 251 palette-indexed .GR frames at 176 pixels tall, preserving the original 25 fps timing. Run `node Apps/Terry/TerrySpritesMk.mjs` with FFmpeg and ffprobe installed to regenerate `Apps/Terry/TerrySprites.gr.gz` from the original GIFs.

Games request mouse capture through the guest input bridge. Click the game screen to capture the mouse; Esc releases it into hybrid mode. Clicking or focusing TempleOS again keeps the cursor free, even if the guest keeps requesting capture. Use Capture mouse to capture again; the HolyC Editor has its own capture button above the native preview. Native previews also support Shift+click and manual capture for programs that do not request it themselves. Use the Keys window's Esc button to send Esc to TempleOS. The Capture mouse button also allows manual capture. Focus loss, window changes and OS restarts clear held keys and mouse buttons. HolyCraft uses relative mouse movement and explicit held-key state in both execution paths.

The Games menu has 67 entries. Alongside Terry's games, HolyCraft and TOOM, it includes Roberta Williams's original King's Quest. King's Quest reconstructs the 1984 PCjr game's rooms and behavior in native HolyC and includes its recovered assets. It does not ask players to upload a disk. Each game card credits the author and links to its source. [Game packages](../Demo/Games/README.md) · [Author inventory](../Demo/Games/AUTHORS.md)

Developers can propose a game from the submission notice at the top of the Games window. It opens a GitHub issue draft asking for the game's source, author credit, launch instructions, screenshots and permission to share its code and assets.

Edit source opens the selected game's project in HolyC Editor. The source selector includes all HolyC files in a package, including TOOM's renderer and weapons. Edits save on the current device and apply to both launch destinations. Save downloads the selected file with its embedded sprites; Restore file restores its original source. Drafts for upstream files belong to their pinned file revision so an upstream update cannot attach old source to different sprite records.

Run plays the game beside its source using the same runner as Run in Browser. You can keep editing or switch source files during play. Run again restarts the whole project with a snapshot of all current edits; Stop ends the preview. On narrow screens, scroll inside the editor to move between source and preview. Closing the editor or returning to Games also stops its preview.

Browser games open in a larger window and scale the 640x480 canvas to fit while preserving its aspect ratio. Capture mouse and Fullscreen are available inside the game window. HolyC Editor offers Fullscreen editor for the whole workspace and Fullscreen game for just its preview. Escape or Exit fullscreen restores the previous layout and releases the mouse. Fullscreen survives preview reruns and uses a viewport fallback when the browser does not support element fullscreen. Native input handles left/right button combinations and retains quick clicks between worker polls.

Run in Browser and the editor preview compile the selected HolyC project to WebAssembly in a worker. Both read the saved drafts when you press Run. The worker runs the drawing, task and input code the program uses. Compiler errors appear in Console. Run in TempleOS starts the program on the emulated desktop.

Each catalog entry has a script that sends keys or mouse input and checks how the program draws, responds and exits. The same script runs in original TempleOS V5.03 under QEMU, in HEMU and in the direct browser runner. The catalog enables each launch button when its checks pass. Edited sources run with a notice that the checks covered the original. See the [game checks](../Demo/Games/Test/README.md) for the scripts, recorded frames and limits of the comparisons.

Browser `GetTSC` reads a monotonic virtual timestamp sampled by a small worker,
avoiding a browser-clock query for each randomized pixel. Its resolution follows
browser timers and can become coarser in the background; `tS`, sleep and task
deadlines still read fresh time. The random-number recurrence and seeded mode
are unchanged. If the clock worker is unavailable, timestamp reads use fresh time.

The editor's runner (`hemu/holyc-wasm/src/runtime/worker.js`) supports opt-in relative mouse input through the HolyC globals `I64 BrowserMouseCapture`, `I64 BrowserMouseDX`, `I64 BrowserMouseDY`, and `U8 BrowserKeys[128]`. Set capture to 1 while the game needs it and to 0 when returning to menus. The worker accumulates mouse deltas until the program consumes and clears them, and copies held movement keys by set-1 scancode. Capture requires a click on the game canvas; Esc releases it. HolyCraft exercises this protocol in `Apps/Games/HolyCraft.test.mjs`.

`node Apps/Games/GameSrc.test.mjs` checks all 304 source files, byte preservation for the 64 files with embedded sprites, draft persistence, edited installations, restoration, partial-write recovery and OS restarts.

```sh
node Apps/Sprites/SpriteCodec.test.mjs
node Apps/Sprites/SpritePlayer.test.mjs
node Adam/GuestFps.test.mjs
node Apps/Chat/Presence.test.mjs
node Apps/Chat/Chat.test.mjs
node Apps/Chat/ChatWorker.test.mjs     # the chat Worker in wrangler dev, on this machine only (needs npx)
node Apps/Games/HolyCraft.test.mjs
node Apps/Games/GameCapture.test.mjs
node hemu/holyc-wasm/tests/worker-input.mjs
node Apps/Games/GameView.test.mjs
node Apps/Editor/NativeProject.test.mjs
node Adam/FrameBuf.test.mjs
node Demo/Games/GamesVerify.mjs
node Apps/Games/GameCredits.test.mjs
python3 Demo/Games/RedSea.test.py
python3 Misc/ChkText.py
```

The emulator harnesses (`hemu/holyc-wasm/Apps/HEMU/Kernel/Test/`, which can need several hundred MiB
per guest) and native capture recipes (`hemu/Misc/Capture/`) are documented in
[HEMU's runtime guide](https://github.com/ParkerrDev/HolyC-wasm/blob/master/Apps/HEMU/README.md). `npm run test:browser` checks the desktop/mobile shell, including fullscreen keyboard focus. `npm run test:search` checks the native query parser and real search worker, copied/downloaded transcripts, archive links and video windows. These browser checks start their own local server and use Playwright with `CHROMIUM` (default `/usr/bin/chromium`). The search check also needs FFmpeg to generate small MP4/MKV fixtures; network routes supply these known files without depending on archive availability. Live archive/CDN delivery remains a separate deployment check.


The example picker fetches the selected `.HC` file from `Apps/Editor/Demos/`.
Native examples retain their original bytes, including embedded DolDoc records.
Open and Save preserve an unchanged file byte for byte; editing its text keeps
the binary tail. `Apps/Editor/Demos.browser.mjs` checks actual default drawing,
file round trips and pending-download races.

The editor uses native TempleOS keyboard decoding and cooperative tasks when a program needs them. `npm run test:editor` checks extended keys, modifiers, held-state release, queue overflow, blocked-input wakeups, child failures and worker-load errors in the actual browser worker. Unsupported blocking APIs fail before program initialization.

The Keys window routes presses to the active HolyC preview or TempleOS. Each release goes back to the program that accepted the press; physical and on-screen holds share ownership. Mobile keys stay above dialogs, and focus loss clears both held keys and latched modifiers. The browser editor check includes actual touch taps and legacy preview input.

### Automatic C: saving

C: is saved in this browser with IndexedDB and restored on the next visit.
The worker batches changed sectors after each guest turn; Restart waits for the
last transaction to commit. Importing a disk or snapshot replaces the saved C:.
Multiple tabs share the same running machine and saved drive by default. The
sharing data path is inactive with one tab. If sync is disabled or shared workers
are unavailable, only one independent tab can save the drive; other tabs show that
their changes are not saved. The Disk & Save window shows saving, saved and storage errors,
and still exports portable disk and machine backups. Opening it requests
persistent browser storage where supported. Clearing site data, private browsing
or browser eviction can remove local saves; export a backup for safekeeping.

Deleting this site's saved data resets C:, the saved machine, window positions,
settings and editor drafts on refresh. Open tabs stop using the deleted machine
and must be refreshed. Clearing only cached downloads preserves these saves.

Checks: `node Adam/Persistence.browser.mjs` (also with `CORES=4`) covers automatic sharing and return to local delivery, opt-out disk protection, session opt-in/opt-out, and layout persistence. `node Apps/Disk/Checkpoint.browser.mjs` covers frame/input progress during compression, concurrent writes, automatic follow-up saves and visibility changes. `node Apps/Disk/AutoSave.browser.mjs` exercises actual guest file writes,
restart, tab close/reopen and multiple tabs with one and four cores;
`node Apps/Disk/Storage.browser.mjs` checks exact sector restoration, replacement
and transaction failure. `node Apps/Disk/StorageClear.browser.mjs` checks deletion
and immediate refresh with saved RAM, C: files and surviving tabs;
`node Adam/StorageClear.browser.mjs` checks layouts and drafts, including pending saves.

### Choosing checks

Use focused browser checks for settings, persistence and window changes. The
normal `npm test` checks code and packages without requiring a fresh replay of
every game. `npm run test:games:evidence` separately audits the recorded game
runs against their exact source and runtime fingerprints. Those fingerprints
include the site shell, so a shell-only change can make that full audit report
stale evidence without a gameplay regression. Keep the recorded results intact;
refresh them for game, compiler or emulator execution changes, or when checking
a reported gameplay regression.
