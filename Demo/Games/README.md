# Game packages

Games offer Run in Browser, Run in TempleOS and Edit source. Each runner is enabled only by a passing play check in `Play.json` for the exact files, scripts and runtime it was made with (`Demo/Games/Test/README.md` says how it is made and judged). Run in Browser also needs a passing browser startup record in `BrowserChks.json` for the exact source and current compiler/editor revisions. Browser runs use HolyC-WASM; they do not create a HEMU session. Strict compilation and unsupported APIs are recorded in `Compatibility.json`.

A browser run compiles the game with HolyC-WASM's runtime, which is V5.03's own Kernel, Adam and Compiler source ported file by file (`hemu/holyc-wasm/Adam/` beside V5.03's `Adam/`): SettingsPush, SettingsPop, AutoComplete, the window manager and the rest a game uses. So Snake, Babel and Volley are each one source, written on Terry's Game1 template, and the same file runs in both places.

Run in TempleOS installs the game in the main guest. The catalog check launches each game in a fresh copy of TempleOS V5.03 under QEMU, plays the same input in HEMU and compares the frames and exit behavior. The browser check opens the game's card and plays that input through its canvas. Some original games ignore Esc. The play check records each game’s response to the same input on all runners. [Per-game results](Play.json) · [Test instructions](Test/README.md)

Babel, Volley and Snake also have tests for game state and input. They compare an exact indexed frame and check cleanup after two launches in the same task. [Game-state results](Test/Evidence.json)


King's Quest uses native HolyC room functions, graphics, actors and controls reconstructed from the supplied 1984 PCjr edition. Its decoded assets are packaged with the source; players do not upload a disk. [Installation, controls and edition](KingsQuest/README.md)

FNAF keeps its source, images and sounds together in one DolDoc file. Its catalog entry installs the complete file at `C:/Home/Games/FNAF.HC` so the game can read its embedded assets at runtime.

HolyC Editor exposes the package's HolyC files through a source selector. Local edits apply to both runners. The text before a document's NUL separator is editable; the original embedded sprite bytes are appended unchanged when downloading or installing the file. Restoring a file also restores it in a previously modified guest installation on the next launch. Upstream drafts are keyed by source checksum to avoid combining source from one revision with sprite records from another.

`Catalog.json` records upstream Git revisions where available and the SHA-256 of every installed file. The browser verifies the complete package before asking the guest to write files. It sends raw ArrayBuffers so HolyC's embedded DolDoc sprites survive unchanged. Installation uses TempleOS's own directory and file operations; completed installations are cached until the OS restarts.

Follow [AUTHORS.md](AUTHORS.md) to stage the verified official archives and author checkouts, then refresh the packages:

```sh
node Demo/Games/GamesSync.mjs /path/to/TinkerOS
node Demo/Games/GamesVerify.mjs
```

The importer selects the complete TinkerOS Demo/Games tree, including Stadium's background. Original source is archived with binary sprites preserved and em dashes in UTF-8 text normalized to hyphens. Castle Frankenstein starts through BrowserCastle.HC, a generated V5.03 adapter that maps TinkerOS raw mouse input to position deltas and physical button state; keyboard controls are also available.

Titanium installs `Upstream/TinkerOS/Apps/Titanium/Browser/Titanium.HC`, the TinkerOS file with its last byte set to 0. That byte ends the file's last sprite, the fourth frame of the CIA man, and it is 0x38 in Terry's V5.03 file and 0x6E in TinkerOS's. Without the 0, `SpriteSize` reads on past the file into whatever memory follows it. In a freshly booted V5.03 the walk stops soon; in a machine that has run a while it can come to hundreds of megabytes, `MAlloc` throws in the draw job and the window stops taking keys. Frames 7 and 8 hold the same mesh and end in 0. The sync rule in `Demo/Games/GameLibSync.mjs` makes the same change and refuses a file whose ending differs.

MarioClone’s package removes a stray DolDoc marker and control byte after `MarioMain;` so quitting returns to the caller. The archive contains the original file.

Solomon's Temple initializes its four movement flags to zero and allocates a separate bitmap for the second map layer. Upstream calls a two-pointer queue initializer on the four-byte flags and then writes through an unallocated bitmap. The package adapter preserves the embedded sprite data and gives both runners the same initial camera position.

TOOM was originally created by [Austin Sierra (aichrist)](https://github.com/Church-of-Templeos/TOOM). This site's new HolyC implementation lives in `Toom/` (see its README). Its package is built by `node Demo/Games/Toom/Test/Package.mjs --write` and checked by `node Demo/Games/Toom/Test/Package.mjs`, which the deploy runs: the HolyC sources, the state data `TMDATA.BIN`, the optional native module build, its GPL notices, and Freedoom 0.13.0's `freedoom1.wad`, `COPYING.txt` and `CREDITS.txt` from `upstream/Freedoom/`, installed as `C:/Home/TOOM/FREEDOOM.WAD`, `Freedoom-COPYING.txt` and `Freedoom-CREDITS.txt`. The IWAD goes in whole, as one file write. `C:/Home/TOOM/Run.HC` compiles the game and starts E1M1.

The author inventory, archive hashes and per-game provenance are recorded in [AUTHORS.md](AUTHORS.md) and [Provenance.json](Provenance.json). Malicious Testimonies runs as an offline TempleOS edition; its experimental Aiwnios multiplayer requires the upstream environment.

Sources:

- [TinkerOS](https://github.com/tinkeros/TinkerOS), revision dfadd7f08e2ad68b1235d8856e55e8c7574236f2. Public domain license in upstream/TinkerOS/LICENSE.
- [Freedoom](https://freedoom.github.io/) 0.13.0, the files of its official release ZIP. BSD license in Upstream/Freedoom/COPYING.txt and credits in Upstream/Freedoom/CREDITS.txt.

Export the disk from Disk & Save to retain installed games and saves across a page reload or OS restart.
