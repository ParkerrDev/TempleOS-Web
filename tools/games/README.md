The native game check executes the complete source in a TempleOS child task,
then calls the already-compiled main again in that same task. Reusing the task
checks that a fresh launch resets transient state without recompiling globals.
It checks observable game state after task messages and held-key changes, renders
a deterministic paused scene through the game's own draw callback, and verifies
that Escape and Shift+Escape restore prior settings and release animation tasks.
The identical HolyC fixture runs in original V5.03 under QEMU/KVM and in HEMU.

Run `node tools/games/native.mjs --write` to refresh both current scenarios,
Babel and Volley. The fast test checks the exact program source, fixture,
compiler/HEMU pins, compiled engine and host source against this evidence; stale
evidence fails the build. Keep the pins fixed while a check runs.
The snapshot and disk input hashes include explicit LIVE/RAW overrides; fixture
loaders and runner sources are recorded too.

For a candidate source, set `GAME_SOURCE_DIR` and name the game, for example
`GAME_SOURCE_DIR=/path/to/drafts node tools/games/native.mjs Snake`. Candidate
results go to `tmp/games/`; they cannot replace production evidence. Snake's
candidate scenario adds restart, turning, reverse rejection, growth, vacated-tail
and self collision, all four boundaries, circular-buffer wrap, each possible
last free apple cell and a full board.

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
candidate Snake animation task for controlled physics states, then invokes the
game's compiled functions using TempleOS's `Call` API. No game source is rewritten
or given replacement drawing/input functions by this check.

`node tools/games/catalog.mjs NAME` checks byte-preserving installation and
observes the selected TempleOS task in HEMU. `--all` gives each of the 65 catalog
entries a fresh emulator process and writes reports under `tmp/games/catalog/`.
The old `tools/hemu/game-suite.mjs` command forwards here. `OUT` changes the report
directory; `CATALOG_FRAMES` changes the observation budget (default 300 frames).
A child has a separate 180-second wall-time limit. Reports retain actual observed
frames, artifact hashes, exceptions and stage timings. A `running` result means
the task remains active: it may still be compiling or waiting at a menu. A
`returned` result only means its entry finished without a reported exception.
Neither result qualifies gameplay, input, performance or original-QEMU parity.
Those require program-specific checks such as the native scenarios above.

The browser launcher also requires recorded startup evidence. Run
`node tools/browser/games.mjs --write`, then
`node tools/native-games-audit.mjs --write` after a compiler, editor or game
change. The browser check uses the actual editor worker, observes visible and
advancing frames, checks worker survival and Stop, and tests the launcher's
refusal when compilation is the only evidence or the evidence cannot load.
`games/browser-checks.json` records exact project/compiler/runner hashes.
The fast compiler audit rejects stale records. These four startup scenarios
(HolyCraft, Babel, Volley and Snake) do not establish input response, complete
gameplay or native parity; `gameplay` remains explicitly unverified.
