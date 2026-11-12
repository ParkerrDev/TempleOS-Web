# Game packages

Games offer Run in TempleOS and Edit source. Run in Browser is enabled only when the exact source and current compiler/editor revisions have a passing browser startup record. Browser runs use HolyC-WASM; they do not create a HEMU session. Current records cover startup, advancing rendered frames and stopping for HolyCraft, Snake, Babel and Volley. These checks do not certify gameplay or native parity. Strict compilation and unsupported APIs are recorded in `compatibility.json`.

Run in TempleOS installs and launches the package in the main guest. The catalog launch sweep observed 64 of65 programs running for300 guest frames; the current production Snake fails native compilation because it uses the browser-only `KeyGet`. A native Snake replacement is being qualified. Babel and Volley have additional original-V5.03/HEMU input, exact-frame and two-launch cleanup evidence in `tools/games/evidence.json`. The other launch observations are not gameplay or all-platform certification.

FNAF (`FNAF.HC`) is one file: its HolyC source, a NUL, then every image and sound in a DolDoc bin that it reads back from its own file. Its catalog entry names an `install` path, so Run in TempleOS writes the file's bytes to `C:/Home/Games/FNAF.HC` and runs it from there instead of sending its text. In the catalog harness it installs unchanged and runs for 600 guest frames. It does not compile in HolyC-WASM, which has no `CArcCompress`.

HolyC Editor exposes the package's HolyC files through a source selector. Local edits apply to both runners. The text before a document's NUL separator is editable; the original embedded sprite bytes are appended unchanged when downloading or installing the file. Restoring a file also restores it in a previously modified guest installation on the next launch. Upstream drafts are keyed by source checksum to avoid combining source from one revision with sprite records from another.

`catalog.json` pins the upstream Git revisions and SHA-256 of every installed file. The browser verifies the complete package before asking the guest to write files. It sends raw ArrayBuffers so HolyC's embedded DolDoc sprites survive unchanged. Installation uses TempleOS's own directory and file operations; completed installations are cached until the OS restarts.

Follow [AUTHORS.md](AUTHORS.md) to stage the verified official archives and author checkouts, then refresh the packages:

```sh
node tools/sync-games.mjs /path/to/TinkerOS /path/to/TOOM
node tools/verify-games.mjs
```

The importer selects the complete TinkerOS Demo/Games tree, including Stadium's background. It includes TOOM's source and supporting files with the upstream notices. The bundled IWAD is Freedoom 0.12.1, divided into 4 MiB upload parts. BrowserStart.HC joins the parts inside TempleOS and starts SinglePlayer.HC with that IWAD. Original source is archived with binary sprites preserved and em dashes in UTF-8 text normalized to hyphens. TOOM installs BrowserScreenMelt.HC as ScreenMelt.HC to stop its two-row transition at the framebuffer height; the upstream bound permits two rows past the buffer beyond the destination. BrowserMainDrawer.HC also clips 2x2 sector pixels and corrects their mirrored x coordinate. The importer also applies the speed edits in tools/toom-speed.mjs: BrowserMainDrawer.HC, BrowserDoomGr.HC, BrowserWad.HC and BrowserST.HC (installed as MainDrawer.HC, DoomGr.HC, Wad.HC and ST.HC) draw walls, flats and the status bar, convert images, compose textures and build the floor map with less work and the same result, so every frame and every tic match the original. Each edit checks its upstream text, and the import stops if TOOM changes it. BrowserStart.HC also turns off the compiler's unused variable and header mismatch warnings before it includes the game. The emulator separately implements FTST, which TempleOS Sign uses to advance renderer loops in the correct direction. Castle Frankenstein starts through BrowserCastle.HC, a generated V5.03 adapter that maps TinkerOS raw mouse input to position deltas and physical button state; keyboard controls are also available. TOOM's multiplayer code is included, but browser networking is not implemented by HEMU.

The author inventory, archive hashes and per-game provenance are recorded in [AUTHORS.md](AUTHORS.md) and [provenance.json](provenance.json). Malicious Testimonies runs as an offline TempleOS edition; its experimental Aiwnios multiplayer requires the upstream environment.

Sources:

- [TinkerOS](https://github.com/tinkeros/TinkerOS), revision dfadd7f08e2ad68b1235d8856e55e8c7574236f2. Public domain license in upstream/TinkerOS/LICENSE.
- [TOOM](https://github.com/Church-of-Templeos/TOOM), revision 9d24014e749fee376396c8a6a4acca152e48a250. Upstream redistribution notices and credits in upstream/TOOM/freedoom-0.12.1/.

Export the disk from Disk & Save to retain installed games and saves across a page reload or OS restart.
