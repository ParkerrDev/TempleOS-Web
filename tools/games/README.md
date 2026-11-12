The native game check executes the complete source in a TempleOS child task,
then calls the already-compiled main again in that same task. Reusing the task
checks that a fresh launch resets transient state without recompiling globals.
It checks observable game state after task messages and held-key changes, renders
a deterministic paused scene through the game's own draw callback, and verifies
that Escape and Shift+Escape restore prior settings and release animation tasks.
The identical HolyC fixture runs in original V5.03 under QEMU/KVM and in HEMU.

Run `node tools/games/native.mjs --write` to refresh all three scenarios,
Babel, Volley and Snake. The fast test checks the exact program source, fixture,
compiler/HEMU pins, compiled engine and host source against this evidence; stale
evidence fails the build. Keep the pins fixed while a check runs.
The snapshot and disk input hashes include explicit LIVE/RAW overrides; fixture
loaders and runner sources are recorded too.

Snake's scenario adds restart, turning, reverse rejection, growth, vacated-tail
and self collision, all four boundaries, circular-buffer wrap, each possible
last free apple cell and a full board.

For a candidate source, set `GAME_SOURCE_DIR` and name the game, for example
`GAME_SOURCE_DIR=/path/to/drafts node tools/games/native.mjs Tetris`. Candidate
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
The browser compiler audit remains separate in `tools/native-games-audit.mjs`.

The fixture deliberately installs prior settings before running each game and
checks restoration before its own outer settings are popped. It suspends the
Snake animation task for controlled physics states, then invokes the
game's compiled functions using TempleOS's `Call` API. No game source is rewritten
or given replacement drawing/input functions by this check.

`node tools/games/catalog.mjs NAME` installs one entry in HEMU with the site's
own installer and launch (`Install.mjs` follows `runInTempleOS` in `games.js`),
checks every written file byte for byte and lets the game run for 15 seconds of
guest time. A game still running then gets Esc and, if it is still running five
seconds later, Shift-Esc, as the Keys window sends them. The report says how it
ran (`running`, `returned`, `closed`, `never` or `except:CODE`), which key ended
it (`esc`, `shift-esc` or `ignored`) and how it ended. `--all` gives every entry a
fresh emulator process and writes reports under `tmp/games/catalog/`; `OUT`
changes the directory and `CATALOG_FRAMES` the run (938 frames of 16 ms). The old
`tools/hemu/game-suite.mjs` command forwards here.

`node tools/games/start.mjs` runs each entry in original TempleOS V5.03 under
QEMU as well. `Start.HC` copies the entry's files, staged under 8.3 names, to the
paths the site writes with `CopySingle`, launches the game with the site's own
`PopUp` script and puts its keys in `kbd.fifo2`, where the keyboard interrupt
puts the bytes it reads. Every entry gets a freshly booted V5.03 and the same 15
and 5 seconds. `--write` records all of them in `games/startup.json`, bound to
each entry's files and launch, the check's own sources and the site runtime, and
`startup.test.mjs` fails the build when any of those change. The Games window
enables Run in TempleOS only for an entry that starts and quits as it does in
V5.03. `running` means the task was alive after 15 seconds: it may be at a menu
or an intro dialog (BigGuns' two PopUpOk dialogs take both keys, in V5.03 too).
`ignored` entries are killed after the check. Gameplay is not compared.

The browser launcher also requires recorded startup evidence. Run
`node tools/browser/games.mjs --write`, then
`node tools/native-games-audit.mjs --write` after a compiler, shell, editor or game
change. The browser check uses the actual editor worker, observes visible and
advancing frames, checks worker survival and Stop, and tests the launcher's
refusal when compilation is the only evidence or the evidence cannot load.
`games/browser-checks.json` records exact project/compiler/runner hashes.
The fast compiler audit rejects stale records. These four startup scenarios
(HolyCraft, Babel, Volley and Snake) do not establish input response, complete
gameplay or native parity; `gameplay` remains explicitly unverified.
