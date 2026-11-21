The native game check executes the complete source in a TempleOS child task,
then calls the already-compiled main again in that same task. Reusing the task
checks that a fresh launch resets transient state without recompiling globals.
It checks observable game state after task messages and held-key changes, renders
a deterministic paused scene through the game's own draw callback, and verifies
that Escape and Shift+Escape restore prior settings and release animation tasks.
The identical HolyC fixture runs in original V5.03 under QEMU/KVM and in HEMU.

Run `node Demo/Games/Test/Native.mjs --write` to refresh all three scenarios,
Babel, Volley and Snake. The fast test checks the exact program source, fixture,
compiler/HEMU pins, compiled engine and host source against this evidence; stale
evidence fails the build. Keep the pins fixed while a check runs.
The snapshot and disk input hashes include explicit LIVE/RAW overrides; fixture
loaders and runner sources are recorded too.

Snake's scenario adds restart, turning, reverse rejection, growth, vacated-tail
and self collision, all four boundaries, circular-buffer wrap, each possible
last free apple cell and a full board.

For a candidate source, set `GAME_SOURCE_DIR` and name the game, for example
`GAME_SOURCE_DIR=/path/to/drafts node Demo/Games/Test/Native.mjs Tetris`. Candidate
results go to `tmp/games/`; they cannot replace production evidence.

The Tetris candidate also needs `Help.DD` in its source directory. Its scenario
checks pause, rotation, movement, hard-drop points and restart; one through four
row clears, row collapse, score/high-score updates and the special cross clear.
The intro is dismissed through the task's normal key-message queue. Both the
original TinkerOS game and the Game1 candidate produce the same controlled frame.

These checks do not certify full gameplay, all frames, physical keyboard hardware,
WebAssembly game execution, VirtualBox, VMware, macOS or bare-metal behavior.
Input enters at TempleOS's task-message/held-state boundary. The frame comparison
uses a native indexed device context and does not replace whole-screen tests.
The browser compiler audit remains separate in `Demo/Games/NativeGamesAudit.mjs`.

The fixture deliberately installs prior settings before running each game and
checks restoration before its own outer settings are popped. It suspends the
Snake animation task for controlled physics states, then invokes the
game's compiled functions using TempleOS's `Call` API. No game source is rewritten
or given replacement drawing/input functions by this check.

`node Demo/Games/Test/Catalog.mjs NAME` installs one entry in HEMU with the site's
own installer and launch (`Install.mjs` follows `runInTempleOS` in `GamesWin.js`),
checks every written file byte for byte and lets the game run for 15 seconds of
guest time. A game still running then gets Esc and, if it is still running ten
seconds later, Shift-Esc, as the Keys window sends them. The report says how it
ran (`running`, `returned`, `closed`, `never` or `except:CODE`), the window in which
it ended (`esc`, `shift-esc` or `ignored`) and how it ended. These windows do not
prove which key caused completion: normal cleanup may continue after a key.
`--all` gives every entry a
fresh emulator process and writes reports under `tmp/games/catalog/`; `OUT`
changes the directory and `CATALOG_FRAMES` the run (938 frames of 16 ms).

`node Demo/Games/Test/Start.mjs` runs each entry in original TempleOS V5.03 under
QEMU as well. `Start.mjs` copies the entry's files, staged under 8.3 names, to the
paths the site writes with `CopySingle`, launches the game with the site's own
`PopUp` script and puts its keys in `kbd.fifo2`, where the keyboard interrupt
puts the bytes it reads. Every entry gets a freshly booted V5.03 and the same 15
and 10 seconds, defined once in `Install.mjs` and injected into `Start.HC`.
`--write` records all of them in `Demo/Games/Startup.json`, bound to
each entry's files and launch, the check's own sources and the site runtime, and
`Startup.test.mjs` fails the build when any of those change. The Games window
enables Run in TempleOS only for an entry that starts and quits as it does in
V5.03 and passes the play check below. `running` means the task was alive after
15 seconds: it may be at a menu or an intro dialog (BigGuns' two PopUpOk dialogs
take both keys, in V5.03 too). `ignored` entries are killed after the check. The
play check below compares input response; timing parity is not compared. The
cleanup window allows native initialization after Main returns; Solomon's
Temple, for example, restores AutoComplete while its original drawing callback
is still active. In HEMU that completed 5.040 guest seconds after Esc,
without a second key; the former five-second window misclassified it.

`Start.mjs` also plays each entry. `Apps/Games/GamePlays.js` holds one input
script per entry, as data: the keys and mouse its own source or instructions
name, at fixed seconds after the 15, the last step its quit key. `Play.mjs`
turns a script into timed events for every machine and a frame into a snap: an
FNV-1a hash of the 640x480 color indices below the status line (its clock is
left out), the count of colors and a 4-bit digest of each of 16x12 cells, with a
PNG beside the run's report. A snap is taken at the start and before each step.
Each machine runs the entry twice, with the script (`play`) and without its
input (`control`: the old startup check, Esc, then Shift-Esc); V5.03 plays it a
third time (`again`). V5.03 gets its events in `Start.HC`: keys in `kbd.fifo2`
with the `<CTRL-ALT-letter>` calls `KbdPktRead` makes in the interrupt, the mouse
by `MsSet`, frames copied from `gr.dc2` once a refresh is done. Frame capture
pauses the script clock on every runner. The native fixture writes the frames
to the debug port after the final input so serial I/O cannot shorten a button
hold. HEMU gets them
through `GuestHarness` and the production mouse input queue (`Catalog.mjs NAME play`), a frame standing for 16 ms; a
snap runs it in slices of a frame until the window manager finishes a refresh and
takes the frame the engine kept as `GrUpdateScrn`'s `GrUpdateVGAGraphics`
returned (HEMU's `Cpu.HC` `CaptureDesk`). Reading `gr.dc2` at a slice's end does
not work for a game whose refresh outlasts its period (Lord of Hosts, Malicious
Testimonies): the next refresh has always begun.

`Apps/Games/Games.browser.mjs` runs every entry HolyC-WASM compiles from its
Games window card, as Run in Browser does, with the same events in real time
(Playwright keys and mouse on the game's canvas) and snaps of the frame buffer
the editor hands its worker. A game that hides the mouse plays captured, as a
player does: the check captures the mouse before the script's first step (a
player's first click), and releases it before a scripted Esc and waits for the
worker to take the reset (the browser spends a player's first Esc on the
release; `App.js` does the same with an Esc it sees). When the script is done
and the game still runs, it frees the mouse the same way before it clicks the
window's close. A HolyC throw that ends a run is named as `Start.mjs` names it
(`except:Compiler`), from the worker's `Except:Compiler:` line. The page gets a
`Play.json` and a `Compatibility.json` that pass every entry, since the check is
what makes them. The check clicks the enabled Run in Browser button and
separately verifies that missing or failed checks disable it. The 15-second
startup interval begins when the worker enters the guest. `JOBS` selects one
to four entries at a time (default one). `Misc/Server.mjs` serves the site on
`PORT` or a free port.

`Kvm.mjs` plays every entry a third way: native HEMU, `hemu/Linux/HEMU.CPP` on
KVM, from the four-core capture `make_hemu` installs, rebuilt in
`tmp/games/kvm/base` (the installed launcher is never touched). Each run is
`HEMU -t DIR` with the run's files in `C:/Tmp` of its own disk copy, written with
`QCow2.js`'s FAT32 code. The check closes the Welcome card with Shift-Esc,
answers the tour with `n` and types two lines through `DIR/keys.fifo` (a test
HEMU takes no keys or mouse from the compositor, so focus moving between test
windows cannot let go of a held Shift): one drops
the capture's disk cache and FAT block, which predate those files, and one
includes the fixture. That fixture is `Start.HC`'s, made by the same
`StartStage` as under QEMU, so only the machine differs; its output leaves by
port 0xE9 as QEMU's does. Hyprland starts each HEMU (`hl.exec_cmd` with
`workspace = "9 silent"`), so the rule is on the process and the window opens on
workspace 9 whichever monitor has the pointer; a named rule on its app id,
HEMUTEST, backs that up. A run fails if its own window is elsewhere when it
opens or when it ends, and the check fails if any is left. A run with no end
leaves `DIR/frame.ppm`, the last frame, beside its snaps. `Kvm.mjs --write` keeps the runs as each entry's `kvm` in `Play.json`.

`PlayCmp.mjs` makes the verdicts in `Demo/Games/Play.json`, so changing it needs
no new runs. Per machine: `alive` (still running until its quit step),
`drawn`, `advancing` (the window manager drew between snaps), and `response`:
`input` when the input changed cells that do not change without it (the
control's moving cells: blinking titles and cursors, the game's own motion) or
the two runs matched until the input and parted after it; `moved` when frames
changed but only where the game also moves by itself; `none` otherwise.
`clean` says both the control and the play run ended without an exception. The catalog requires a
clean run on every supported machine. `deterministic` says V5.03's two plays agree outside the moving cells; only
there is exact frame equality expected. `siteSame`/`siteExact` and
`browserSame`/`browserExact` compare each snap with V5.03's, outside the moving
cells and over the whole frame, and `siteCells`/`browserCells` count the cells
that differ. Popup titles, borders and controls in browser games use the
TempleOS drawing code ported to HolyC-WASM. The Games window enables Run in TempleOS only when `templeos`
holds (both machines play, and quit at the same step in the same way) and Run
in Browser only when `browserPlays` holds (the game plays on both machines and
both the control and the scripted play quit as in V5.03). The catalog test also
requires `kvmMatch`: native HEMU plays and quits at the same step as V5.03.
`kvmSame`, `kvmExact` and `kvmCells` describe its frame comparisons.

The checks run every program the site runs outside the Games window too:
`Apps/Programs.js` lists them (the editor's demos and its starter program, and
the God Tools), and `ENTRIES` is the Games entries then those, each with a
script in `GamePlays.js`. A demo installs as a file in `C:/Home`, as a user
saves the editor's program and runs it: a file's DolDoc links and sprites are
only its own in a file. God Song and God Doodle run from `God/Tools.HC` as the
God window launches them in TempleOS; God Word and God Passage run in the
browser's God window and take no input. A program that returns by itself
`runs` when it returns; one that keeps running `runs` when it is alive, drawn
and advancing. Its `templeos` holds when V5.03 runs it and the site's TempleOS
ends it the same way, `browserPlays` and `kvmMatch` the same for the browser and
native HEMU. The editor enables Run, and the God window its buttons, only on
those verdicts; a source the user edited has no play check, so it is compiled
first and runs, and the site says so.

`npm run test:games:play` reruns everything: `Start.mjs --write`,
`Games.browser.mjs --write` and `NativeGamesAudit.mjs --write`, then the fast
tests. `Start.mjs --write NAME...`, `Kvm.mjs --write NAME...` and
`Games.browser.mjs --write NAME...` replace only those entries. Each entry
carries the hash of the inputs it was made with (`nativeSha256`, and
`inputsSha256` in its `kvm` and `browser`), so an entry kept from older inputs
reads as stale in `Play.test.mjs` and `Startup.test.mjs` (fast tests), which
also fail when the scripts, files, runtimes or verdicts are not the ones
recorded. Keep the compiler and HEMU fixed while it runs: their hashes bind the
evidence. Set `HEMU_ROOT` to a HEMU tree whose `build/disk.wasm` is whole when
the shared one is being rebuilt; the evidence hashes the one it used.

The browser launcher also requires recorded startup evidence. Run
`node Apps/Games/Games.browser.mjs --write`, then
`node Demo/Games/NativeGamesAudit.mjs --write` after a compiler, shell, editor or game
change. `Demo/Games/BrowserChks.json` records exact project/compiler/runner hashes
and whether the control run started, drew and survived (a throw that ends it as
in V5.03 is its end, not a fault); the fast compiler audit
rejects stale records.
