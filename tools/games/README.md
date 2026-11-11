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

For a candidate source, set `GAME_SOURCE_DIR` and name the game, for example
`GAME_SOURCE_DIR=/path/to/drafts node tools/games/native.mjs Snake`. Candidate
results go to `tmp/games/`; they cannot replace production evidence. Snake's
candidate scenario adds restart, turning, reverse rejection, growth, vacated-tail
and self collision, all four boundaries, circular-buffer wrap, each possible
last free apple cell and a full board.

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
