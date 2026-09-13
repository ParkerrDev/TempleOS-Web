# Engine, games and media validation

Validated locally on 2026-09-13. Changes span TempleOS-Web, HolyC-wasm, Hemu-wasm, HolyC-fmt and the archive transcriber. Deployment must include the matching compiler runtime, JIT, both rebuilt snapshot engines and the SMP sidecar.

## Behavior

- Games install verified raw files through TempleOS filesystem operations and run in fresh guest tasks. Command typing and character-by-character TaskMsg launch bootstraps have been removed from the site engines. Request IDs carry launch and file results; compile errors, runtime exceptions, task completion and a busy game have distinct outcomes.
- All 31 TinkerOS Demo/Games packages are pinned to dfadd7f08e2ad68b1235d8856e55e8c7574236f2. TOOM is pinned to 9d24014e749fee376396c8a6a4acca152e48a250, with the bundled Freedoom 0.12.1 IWAD. The 32 packages contain 126 install assets. Original sources and notices are retained. Explicit adapters handle Castle's newer mouse API and TOOM framebuffer bounds.
- ATA INSD/OUTSD now transfer complete 32-bit words and the host persists diskWrite callbacks. Already-compressed .Z uploads use raw sector streams through the guest filesystem; Stadium's background is no longer recompressed.
- VGA DAC reads and writes carry the actual palette. FTST now implements the floating-point comparison used by native Sign; negative and zero inputs no longer return +1. FTST/FNSTSW also compile into native JIT blocks. Cached blocks check their decoded source bytes before entry, fixing reused-code execution.
- Sprite Studio converts local images, GIFs and videos to 16-color TempleOS sprites, with transparency, optional dithering, animated preview, .GR frames, PNG sheets, GIFs and a playable HolyC ZIP. A PNG2GR reference fixture matches byte for byte and the exported package renders inside the real guest.
- The formatter reuses compiled modules with fresh memory per call. Its tests and source sweep use the actual CLI byte path, preserving DolDoc dollar sequences.

## Checks

| Check | Result |
|---|---|
| Emitter self-test | 10/10 |
| Atomic XOR | 8/16/32/64-bit old values, memory and neighboring bytes, shared/unshared |
| Host disk adapter | Exact two-sector write/read after guest memory clearing |
| ATA and palette checks | Primary/secondary 16/32-bit I/O and VGA DAC round trips |
| FTST/FNSTSW | Interpreter/JIT agreement for signs, both zeros, NaN and infinities |
| Guest execution | 12/12, including independent persisted-sector readback and launch lifecycle |
| Recycled code | 3/3 exact results |
| Desktop JIT comparison | 0 differing pixels out of 307,200 |
| Catalog integration | 32/32 startup/input smoke checks; every persisted install asset verified |
| TOOM | First level reached in the native harness and four-core browser emulator; movement/fire redraw, gameplay state active, assembled IWAD hash exact |
| Browser backend | Single-core worker, four-core worker, inline fallback and standalone SMP launch checks; zero automatic launch keystrokes |
| Sprite Studio | PNG, GIF and video conversion, exports, playback and mobile layout |
| Formatter | 16/16 plus 150/150 source files with idempotency and token preservation |

These are regression and smoke checks, not complete game playthroughs or full x86 conformance. TOOM's first launch compiles inside TempleOS and can take a minute or two before its menu appears. TOOM multiplayer networking is not implemented. SMP remains a separate experimental execution path.

Run the dependency-free checks listed in the repository READMEs. `Hemu-wasm/game-suite.mjs --all` writes per-game screenshots and JSON under `/tmp/hemu-games`, or `OUT`. `games/catalog.json` records every source revision and asset hash.

## Desktop window and input follow-up

Sprite Studio now opens as a draggable desktop window using the same chrome as the HolyC editor. Closing and reopening preserves its controls and converted frames. Direct visits to `sprites.html` return to the desktop; Sprite Studio opens from its menu button. The Terry animation decodes 251 actual .GR frames with the TempleOS palette and pixel scaling. The color and timing follow-up below supersedes the initial low-resolution, nearest-color pack.

HolyCraft had two independent input faults: native movement counters were not initialized and were only set when pressed, and its camera continuously steered from an off-center absolute cursor. Movement state is now initialized and refreshed on every frame. Relative mouse deltas are consumed once, and the native guest recenters with MsSet. The browser compiler uses explicit shared held-key and relative-mouse fields. The emulator bridge discovers keyboard/mouse offsets from the running guest, honors guest recentering and publishes capture hints from foreground input ownership. All host paths clear keys and buttons on focus loss. Keyboard polling respects the guest FIFO's 64-entry capacity.

| Follow-up check | Result |
|---|---|
| Live HolyCraft input | Neutral spawn; stable idle camera and position; one-shot relative motion; held movement and release; 200-event FIFO burst |
| Browser-compiled HolyCraft | Actual Init and HandleInput functions pass idle, relative motion, held movement and release checks |
| Browser input | Pointer capture, immediate held-key release and Escape reset in single-core, four-core and inline engines; native compiler capture and shared key state |
| Standalone SMP | Talons backend launch, capture, relative motion, held-key release, Escape unlock and guest Esc button |
| Guest execution after rebuild | 12/12 |
| Sprite desktop | One page, preserved controls after reopening, embedded GIF conversion and playback |
| Terry sprite | Real canvas animation, palette limited to the 16 TempleOS colors |
| Engine builds | Both snapshot engines rebuilt with zero compiler warnings |

Click the game screen to accept a capture request; browser pointer lock requires a user gesture. Esc releases the mouse. The desktop Keys window has a separate Esc button for quitting guest games. A manual Capture mouse button covers programs whose input ownership does not produce an automatic hint. These follow-up checks exercise input and window behavior; they are separate from the earlier 32-game catalog smoke run.

Mouse capture was verified in Chromium. The in-app preview declined pointer lock during automation, so capture in that surface is not verified. Its embedded Sprite Studio conversion and playback were verified.

## Sprite color and timing follow-up

The old Terry pack used nearest-color mapping, turning muted skin tones gray. Studio defaulted to 10 fps, and both players added drawing time to a repeating timeout. Studio also rebuilt both canvas backing stores and allocated preview pixels every frame.

The first color revision used stable ordered mixtures of nearby hues, including three-color mixtures for dark warm tones. Mixtures are evaluated in linear light with [Oklab color distances](https://bottosson.github.io/posts/oklab/). A bounded lookup cache is reused across frames; a changed pixel does not alter its neighbors' pattern. Error diffusion remains available with serpentine, unclipped linear-light error. All exports still use the exact 16-color palette and transparency.

Terry was rebuilt at 176 pixels tall into 251 .GR frames at the source GIFs' 25 fps. The latest stock-palette pack is 464,369 compressed bytes. Both browser players use elapsed time and requestAnimationFrame. Studio caches prepared ImageData, changes canvas dimensions only when needed, and maps colors in a worker. The default is 25 fps, with options through 50 fps and a 600-frame limit within the existing 20-million-pixel budget.

| Check | Result |
|---|---|
| Color regressions | Exact palette/alpha preservation; four warm-tone swatches; neutral grays; unchanged pixels stable after a neighboring change |
| Playback clock | 25 fps; catch-up after a 480 ms stall; exact loop duration; hidden pause; stop and seek |
| Chromium 25 fps preview | 24.95 fps over 6.5 seconds, 75 reused ImageData objects, zero canvas resizes |
| Chromium 50 fps preview | 49.80 fps; 150-frame clip retained and exported |
| Terry desktop animation | 24.97 fps over six seconds at 176 pixels tall, with the emulator running |
| Export timing | ffprobe confirms 150 frames, 50 fps and exactly 3 seconds; 30 fps GIF test confirms 100 centiseconds for 30 frames |
| Exported HolyC player | Compiles and runs in the live guest; 13 frames in 0.5 guest seconds using elapsed-time scheduling |
| Browser integration | Worker conversion, responsive window and no page errors |

Frame-rate measurements are local Chromium results with the four-core desktop running behind the studio. Selecting a rate above a source's rate repeats frames; it cannot add motion absent from that source.

## Quieter dithering follow-up

The 4-by-4 Bayer pattern made colored dots line up in a grid. The mixture search also allowed very saturated colors to represent much duller source pixels. That revision used a deterministic 64-by-64 [void-and-cluster blue-noise mask](https://momentsingraphics.de/BlueNoise.html), stricter hue/saturation/lightness limits and a stronger contrast penalty. Colors already in the TempleOS palette are preserved exactly, including intentional bright greens.

Across all 251 resized Terry source frames, generated bright-green pixels fell from 1,161 to zero. Use of vivid palette entries 9 through 14 fell from 243,265 pixels to 26,933, about 89% fewer. Four warm-tone swatches still preserve channel ordering and stay within the existing linear-light error bounds. New tests reject bright green in muted/dark source swatches, preserve vivid green when it belongs in the source, and reject a repeating four-pixel grid. Neighboring-pixel stability, transparency and exact palette tests continue to pass.

The noise-mask rebuild is byte-for-byte reproducible. The updated converter passes the Chromium conversion, export and responsive-layout checks with no page errors; playback measured 24.96 fps and 49.80 fps at the respective 25/50 fps settings, with zero canvas resizes.

## Clean colors follow-up

The mixture-based revisions above passed average-color checks but still looked noisy, and their candidate restrictions made some skin tones gray. The clean-color revision supersedes both. Its default adds no spatial dithering. A small edge-preserving filter reduces source compression speckles before color matching, with exact palette colors and alpha edges preserved. Warm midtones receive more chroma weight so they map to brown more often. The palette remains the same 16 TempleOS colors; eliminating dither texture gives flatter shading.

Sprite Studio exposes Dither strength, initially 0%. Raising it perturbs only perceived lightness, with a bounded 64-by-64 blue-noise mask fixed in image coordinates. It does not search for high-contrast mixtures. A bounded 8.7 MB palette cache is shared across frames. Error diffusion and nearest-color modes retain their existing behavior.

The default now maps solid source swatches to one solid palette color, including five warm swatches mapped to brown. Tests also cover optional texture, a fixed pattern across repeated frames, exact palette preservation at full strength, invalid strength, muted green rejection, and smoothing confined to immediate neighbors. This replaces the earlier linear-average accuracy assertions, which did not measure the visible defect.

All 251 Terry frames were rebuilt at the existing 176-pixel height and 25 fps. Across the same adjacent source pixels whose per-channel differences are below 20, output brightness jumps above 70/255 fell from 235,288 to 8,941. This is a texture diagnostic, not a claim of photo accuracy. Of 42,763 source pixels with R > G + 12 and G > B + 12, the number mapped to brown rose from 23,501 to 42,399. No bright-green palette pixels occur in the rebuilt pack. Four before/after frames were inspected alongside the source GIFs.

Chromium checks passed with the new default and the optional strength control: worker conversion, 25/50 fps playback, cached frames without canvas resizes, GIF export, and narrow-window layout. The in-app file chooser timed out during this run, so the automated conversion/playback check used the existing standalone Chromium harness. The in-app page itself showed the updated Clean colors and 0% controls.

## Stock-palette hue follow-up

The user selected the stock TempleOS palette. No custom palette was added. The previous chroma restrictions still removed dark blue and pale red from the candidate set, turning denim and some skin areas gray. The revised mapper compares hue and relative saturation separately from Oklab lightness. Saturation and hue guards continue to reject weak tints becoming vivid colors, but dark blue and pale warm shades are available. A small penalty for losing a visible tint resolves close gray-versus-color matches. Zero dither strength remains the default.

The existing local smoothing now detects a non-palette source-color outlier when at least five immediate neighbors agree, before applying the edge-preserving average. Exact stock-palette artwork remains untouched. Palette caches and smoothing weights are allocated only during conversion, so GR playback no longer allocates those tables.

All 251 frames were rebuilt at 176 pixels tall and 25 fps. In a fixed source-mask comparison, neutral mappings among 165,623 warm-tinted pixels fell from 102,744 to 63,595; among 619,029 muted blue pixels they fell from 615,755 to 145,327. Warm means R > G + 6 and R > B + 6; muted blue means B > R + 12, B > G + 5 and B < 150. These masks describe source colors, not semantic skin/clothing recognition. They show reduced loss of hue, not photographic fidelity. The retained stock colors are more saturated than the source in those areas. No bright-green palette pixels appear in the rebuilt pack.

Regression swatches now include pale pinks, light warm tones and muted navy, alongside transparency, exact palette colors, repeated frames, zero-strength solid fills, optional stable texture and source outlier removal. Four source/before/after frames from the two clips were inspected visually.

The final Chromium check measured 24.96 fps and 49.81 fps at the 25/50 fps settings, with cached frame objects, zero canvas resizes, GIF export, optional-strength controls and narrow-window layout all passing. There were no page errors. Codec, player-clock and punctuation checks also passed.

## Natural shading follow-up

The user found the hue-preserving revision too saturated. Its nonlinear saturation boost and gray-avoidance penalty are removed. The default now fits the original display-RGB color with up to three nearby-hue stock palette entries, balancing average error against pattern contrast. A fixed blue-noise mask makes the pattern repeatable across frames, and palette entries already present in the source remain exact. Local source-fleck removal is retained. No custom colors were introduced.

Natural shading defaults to 35% strength. Zero strength still gives solid colors; higher values favor closer color averages with more texture. The palette lookup now uses one 128 KB table for the active strength instead of an 8.7 MB table. Terry was rebuilt with the same 251 frames, 176-pixel height and 25 fps timing. It retains fine dithering to represent muted tones within the stock palette.

The regressions no longer require every skin pixel to be red/brown or every denim pixel to be blue, since those assertions enforced the rejected saturated appearance. They check bounded display-RGB error for warm/cool source swatches, retained average tint, no unrelated hues in skin swatches, no bright neutral flecks in dark fabric, exact palette/alpha preservation, zero-strength behavior, stable patterns and source outlier removal. Source/before/after frames from both clips were inspected, including a comparison at the actual 176-pixel display height.

The Chromium check passed worker conversion, controls, export and narrow-window layout with no page errors. It measured 24.96 fps at 25 fps and 49.80 fps at 50 fps, with cached frames and no canvas resizes. Codec and player-clock checks passed.

## Desktop startup and menu follow-up

The final desktop menu check covers `/`, the old `/?v=sprite-32-clean#sprites` preview link, and `/sprites.html`. All arrive with Sprite Studio closed and its iframe unloaded. The menu opens it, controls survive closing and reopening, and a page reload leaves it closed again. Chromium pointer capture and Escape release preserve the SVG mouse icon, update the label and `aria-pressed`, and produce no page errors. The in-app browser also showed the closed desktop, working Studio menu and visible mouse icon.

## Game projects and browser sessions

All 34 Games menu entries now offer Run in Browser, Run in TempleOS and Edit source. HolyCraft and Snake compile directly to WebAssembly for browser play. The 32 upstream packages use an isolated HEMU game session because they depend on TempleOS kernel and graphics APIs absent from the direct compiler runtime. This change does not add native compilation support for those APIs. Closing the browser window ends its guest session and restores the main desktop's prior pause state.

HolyC Editor exposes each package's source files, including TOOM's 67 files. Drafts persist locally and are used by both launch paths. Files are decoded as TempleOS byte strings, with binary DolDoc sprite records kept outside the textarea and reattached on export. Draft keys include the original file hash. Failed partial installations invalidate the install cache so a retry restores every original asset before launch.

The source regression checks all 100 upstream HolyC files for exact unchanged round trips and preserves the binary tails of all 23 sprite-bearing files after an edit. Draft reload, edited installs, restoring originals, partial-write recovery, OS restarts, transfer detachment and invalid source characters pass. The package verifier still validates all 126 assets and the assembled Freedoom IWAD.

Chromium checks cover all 34 menu entries, startup of all 32 isolated packages, TOOM file selection and draft restoration, edited Snake in both runners, and the main desktop's pause/resume behavior. An edited BlackDiamond declared a new global; guest introspection verified its value in both execution paths. Its downloaded source retained the exact original sprite tail. Mobile checks exposed and fixed a collapsed source pane and hidden session keys. The embedded canvas now explicitly receives keyboard focus when clicked. These catalog checks establish startup and input behavior, not full game playthroughs.

The isolated TOOM session reached its first level with an active guest `in_level` flag; mouse capture, movement and Escape release passed. TOOM compiles and loads its level inside the guest, so opening the session precedes playable gameplay by several minutes on this test machine. Native runtime errors remain visible in the game window's console. Returning to the editor preserves the draft, and restoring HolyCraft after an intentional division-by-zero error launches it successfully. Repeated launches retain one window frame, and both native and emulated game windows fit a 390-pixel viewport.

## Editor iteration and window dragging

Game projects now keep source and playable preview in HolyC Editor. Run and Run again share the browser game's execution path and use a snapshot of all edited files. Switching source files or editing during play does not overwrite the running snapshot. Stop, closing the editor and returning to Games end the preview and restore the desktop's pause state. HolyCraft, TOOM and Snake lead the catalog; all 34 descriptions link the author and original source.

Chromium checks passed native Snake edits and reruns, an intentional runtime error displayed in the editor console, HolyCraft preview startup, repeated BlackDiamond sessions, and TOOM startup while preserving the selected Weapons.HC file and its text. Narrow-screen checks cover source scrolling, both preview types, visible mouse-capture controls and a 4:3 native canvas for correct input coordinates. These are editor integration checks; the TOOM first-level check above remains the gameplay validation.

Twelve immediate native restarts retain exactly one display callback, and Stop cancels it. The native editor API accepts source independently of its textarea and cancels the prior animation callback before restarting. The source regression also checks that edits made during asynchronous package loading appear only in the next run, while retaining all 100 byte-preserving source round trips and 23 embedded sprite tails. Deployment needs the updated HolyC-wasm native/app.js alongside the site.

The custom desktop cursor now follows pointermove events, which continue during pointer capture when a window suppresses compatibility mouse events. The drag regression checks the cursor coordinates at three positions while the mouse button stays held, then verifies that the window moved with it. JavaScript syntax checks, asset verification and the text punctuation scan pass.

## Local performance measurements

| Workload | Before | After | Interpretation |
|---|---:|---:|---|
| 90,000 native Sign calls | 100.45 ms | 28.88 ms | 3.5x for native FTST/FNSTSW versus the corrected interpreter fallback |
| 400 identical framebuffer uploads | 92.73 ms | 21.18 ms | 4.4x less display work |
| 400 changing framebuffer uploads | 112.57 ms | 90.34 ms | About 20% less display work |
| 30 formatter calls | 232.49 ms | 21.95 ms | 10.6x with module caching |

The final desktop run measured 22.98 ms/frame in the interpreter and 5.57 ms/frame with the JIT (4.1x), with identical pixels. These local microbenchmarks do not predict every game's frame rate. Source-byte validation adds dispatch work but prevents stale native code from corrupting subsequent compilations.

## Text and attribution cleanup

The [declaudify tool](https://github.com/ParkerrDev/declaudify) audited all five repository histories and contributor lists and reported no attribution to remove. No history rewrite was needed. The cleanup made 5,301 punctuation replacements across repository text, including compressed transcript JSON. The final scan covers more than 8,000 text files and rejects literal, escaped and HTML-encoded em dashes. Binary image, disk and WASM data are not altered as if they were text. Future transcriber output normalizes the same punctuation in full text, segments and word records. Stored SHA-256 values were refreshed for the two normalized JSON transcripts so integrity checks continue to recognize them.
