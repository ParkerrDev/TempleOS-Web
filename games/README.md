# Game packages

Every game offers Run in Browser, Run in TempleOS and Edit source. HolyCraft and Snake compile directly to WebAssembly for browser play. The 31 games and demos in TinkerOS's Demo/Games tree, and TOOM with Freedoom, use an isolated HEMU session for browser play or install into the main desktop's C: drive for Run in TempleOS. Browser sessions close without changing the main desktop's files.

HolyC Editor exposes the package's HolyC files through a source selector. Local edits apply to both runners. The text before a document's NUL separator is editable; the original embedded sprite bytes are appended unchanged when downloading or installing the file. Restoring a file also restores it in a previously modified guest installation on the next launch. Upstream drafts are keyed by source checksum to avoid combining source from one revision with sprite records from another.

`catalog.json` pins the upstream Git revisions and SHA-256 of every installed file. The browser verifies the complete package before asking the guest to write files. It sends raw ArrayBuffers so HolyC's embedded DolDoc sprites survive unchanged. Installation uses TempleOS's own directory and file operations; completed installations are cached until the OS restarts.

Refresh the packages from reviewed local upstream checkouts:

```sh
node tools/sync-games.mjs /path/to/TinkerOS /path/to/TOOM
node tools/verify-games.mjs
```

The importer selects the complete TinkerOS Demo/Games tree, including Stadium's background. It includes TOOM's source and supporting files with the upstream notices. The bundled IWAD is Freedoom 0.12.1, divided into 4 MiB upload parts. BrowserStart.HC joins the parts inside TempleOS and starts SinglePlayer.HC with that IWAD. The original upstream source files are archived unchanged. TOOM installs BrowserScreenMelt.HC as ScreenMelt.HC to stop its two-row transition at the framebuffer height; the upstream bound permits two rows past the buffer beyond the destination. BrowserMainDrawer.HC also clips 2x2 sector pixels and corrects their mirrored x coordinate. The emulator separately implements FTST, which TempleOS Sign uses to advance renderer loops in the correct direction. Castle Frankenstein starts through BrowserCastle.HC, a generated V5.03 adapter that maps TinkerOS raw mouse input to position deltas and physical button state; keyboard controls are also available. TOOM's multiplayer code is included, but browser networking is not implemented by HEMU.

Sources:

- [TinkerOS](https://github.com/tinkeros/TinkerOS), revision dfadd7f08e2ad68b1235d8856e55e8c7574236f2. Public domain license in upstream/TinkerOS/LICENSE.
- [TOOM](https://github.com/Church-of-Templeos/TOOM), revision 9d24014e749fee376396c8a6a4acca152e48a250. Upstream redistribution notices and credits in upstream/TOOM/freedoom-0.12.1/.

Export the disk from Disk & Save to retain installed games and saves across a page reload or OS restart.
