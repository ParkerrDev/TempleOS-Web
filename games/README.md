# Game packages

Games offer Run in TempleOS and Edit source. Run in Browser is enabled only when the exact source and current compiler/editor revisions have a passing browser startup record. Browser runs use HolyC-WASM; they do not create a HEMU session. Current records cover startup, advancing rendered frames and stopping for HolyCraft, Snake, Babel and Volley. These checks do not certify gameplay or native parity. Strict compilation and unsupported APIs are recorded in `compatibility.json`.

A browser run compiles `editor/Adam.HC` before the game. It holds the parts of TempleOS's Adam that HolyC-WASM lacks and games use: SettingsPush, SettingsPop, AutoComplete and a window manager task that calls the window's draw_it 120 times a second, so a 60 Hz or 120 Hz display gets a fresh frame each time it shows one. So Snake, Babel and Volley are each one source, written on Terry's Game1 template, and the same file runs in both places.

Run in TempleOS installs and launches the package in the main guest. `node tools/games/start.mjs` installs and launches every entry the same way in original TempleOS V5.03 under QEMU and in the site's HEMU, and `startup.json` records both. All 66 are still running after 15 seconds of guest time in both machines. Esc then ends 33 and Shift-Esc 20, the same key in both. MarioClone's entry throws a Compiler exception in both once its game returns: its `Main.HC` ends `MarioMain;` with a stray `$SY,3$` and a 0x05 byte. The other 13 take neither key in V5.03 or in HEMU: FNAF, BigGuns, TreeCheckers, TicTacToe, Wenceslas, Chess, ToTheFront, X-Caliber, GlowUFOs, Oregon Trail 1975, MissileDefense, Malicious Testimonies and Lord of Hosts. The Games window enables Run in TempleOS only for an entry whose two runs match, and its toast names the key that quit it in V5.03. Babel, Volley and Snake have additional original V5.03 and HEMU evidence in `tools/games/evidence.json`: input, an exact frame and cleanup over two launches. None of this compares gameplay.

FNAF (`FNAF.HC`) is one file: its HolyC source, a NUL, then every image and sound in a DolDoc bin that it reads back from its own file. Its catalog entry names an `install` path, so Run in TempleOS writes the file's bytes to `C:/Home/Games/FNAF.HC` and runs it from there instead of sending its text. In the catalog harness it installs unchanged and runs for 600 guest frames. It does not compile in HolyC-WASM, which has no `CArcCompress`.

HolyC Editor exposes the package's HolyC files through a source selector. Local edits apply to both runners. The text before a document's NUL separator is editable; the original embedded sprite bytes are appended unchanged when downloading or installing the file. Restoring a file also restores it in a previously modified guest installation on the next launch. Upstream drafts are keyed by source checksum to avoid combining source from one revision with sprite records from another.

`catalog.json` pins the upstream Git revisions and SHA-256 of every installed file. The browser verifies the complete package before asking the guest to write files. It sends raw ArrayBuffers so HolyC's embedded DolDoc sprites survive unchanged. Installation uses TempleOS's own directory and file operations; completed installations are cached until the OS restarts.

Follow [AUTHORS.md](AUTHORS.md) to stage the verified official archives and author checkouts, then refresh the packages:

```sh
node tools/sync-games.mjs /path/to/TinkerOS
node tools/verify-games.mjs
```

The importer selects the complete TinkerOS Demo/Games tree, including Stadium's background. Original source is archived with binary sprites preserved and em dashes in UTF-8 text normalized to hyphens. Castle Frankenstein starts through BrowserCastle.HC, a generated V5.03 adapter that maps TinkerOS raw mouse input to position deltas and physical button state; keyboard controls are also available.

Titanium installs `upstream/TinkerOS/Apps/Titanium/Browser/Titanium.HC`, the TinkerOS file with its last byte set to 0. That byte ends the file's last sprite, the fourth frame of the CIA man, and it is 0x38 in Terry's V5.03 file and 0x6E in TinkerOS's. Without the 0, `SpriteSize` reads on past the file into whatever memory follows it. In a freshly booted V5.03 the walk stops soon; in a machine that has run a while it can come to hundreds of megabytes, `MAlloc` throws in the draw job and the window stops taking keys. Frames 7 and 8 hold the same mesh and end in 0. The sync rule in `tools/sync-game-library.mjs` makes the same change and refuses a file whose ending differs.

TOOM is this site's own game, written in HolyC in `Toom/` (see its README). Its package is built by `node tools/toom/Package.mjs --write` and checked by `node tools/toom/Package.mjs`, which the deploy runs: the HolyC sources, the state data `TMDATA.BIN`, the optional native module build, its GPL notices, and Freedoom 0.13.0's `freedoom1.wad`, `COPYING.txt` and `CREDITS.txt` from `upstream/Freedoom/`, installed as `C:/Home/TOOM/FREEDOOM.WAD`, `Freedoom-COPYING.txt` and `Freedoom-CREDITS.txt`. The IWAD goes in whole, as one file write. `C:/Home/TOOM/Run.HC` compiles the game and starts E1M1.

The author inventory, archive hashes and per-game provenance are recorded in [AUTHORS.md](AUTHORS.md) and [provenance.json](provenance.json). Malicious Testimonies runs as an offline TempleOS edition; its experimental Aiwnios multiplayer requires the upstream environment.

Sources:

- [TinkerOS](https://github.com/tinkeros/TinkerOS), revision dfadd7f08e2ad68b1235d8856e55e8c7574236f2. Public domain license in upstream/TinkerOS/LICENSE.
- [Freedoom](https://freedoom.github.io/) 0.13.0, the files of its official release ZIP. BSD license in upstream/Freedoom/COPYING.txt and credits in upstream/Freedoom/CREDITS.txt.

Export the disk from Disk & Save to retain installed games and saves across a page reload or OS restart.
