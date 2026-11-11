# Native HEMU host

![TempleOS in the native Qt window](Screenshot.png)

This host runs the HolyC-generated HEMU WASM and its existing x86-to-WASM block
JIT in JavaScriptCore, with Qt Quick for the window and zlib for snapshots.
There is no DOM, Chromium, Electron or Node runtime. Node and the pinned
**esbuild 0.28.2** are build tools only.

This is an in-progress Linux x86-64 host. One guest CPU is supported; four-core
and shared-ownership snapshots are rejected before WASM instantiation. The
macOS JavaScriptCore framework build branch is untested. Other host CPU/OS
combinations and native-host performance are not qualified.

From the repository root, with the pinned compiler and HEMU sources present:

```sh
npm ci
node engine/build.mjs
node tools/native/build.mjs
node tools/native/fixture.mjs
build/native/hemu-native build/native/TempleOS.hemu
```

The bundle can be rebuilt separately with
`node tools/native/build.mjs --bundle-only`. Its exact input hashes and output
SHA-256 are written to `build/native/Runtime.json`; `Build.json` records the
C++/QML source hashes, binary hash and local Qt/JSC versions. Qt's resource compiler
embeds the bundle in the binary; no generated code is committed. The platform
build needs Qt 6 Core/Gui/Qml/Quick/Multimedia, qmake6, a C++17 compiler, zlib and
JavaScriptCoreGTK 4.1 development headers/libraries. Linux pointer capture needs
Qt 6.12 or later with its matching private GUI headers, wayland-client,
wayland-protocols and wayland-scanner. Protocol bindings are generated from the
installed XML; `Build.json` records their hashes and dependency versions. The
test build also needs Qt Test and Qt WaylandCompositor. Tested locally with
Qt 6.12.0, JavaScriptCoreGTK 2.54.1, Wayland 1.26.0 and protocols 1.49.

The fixture command uses the real one-core worker, validates its stock
RAM/register/disk pairing, waits for the document sprite correction, and
exports a complete paused session. It adds no Welcome popup. You can also open
a complete one-core `.hemu` file exported by the web version. Raw RAM files
lack sufficient CPU and disk state and are refused. This host resumes captured
TempleOS; it does not implement a cold BIOS/DVD boot.

The window accepts a session path, Open, Save, Pause/Resume, Restart and Cancel.
Click the screen to route keys to TempleOS. Moving focus away releases held
keys. The [Qt Wayland input source](https://codebrowser.dev/qt6/qtbase/src/plugins/platforms/wayland/qwaylandinputdevice.cpp.html#1342)
provides the eight-key XKB offset used here. Linux evdev/XKB scan codes preserve left/right modifiers and keypad
identity; the logical Qt-key fallback has not been qualified on macOS.

When a running guest hides its pointer for a game, click the screen to request
relative capture. **Ctrl+Alt releases it.** Focus loss, pause, saving, session
replacement and retained CPU faults release the compositor lock and held input.
Capture is a host lease: restoring a saved session never acquires it automatically.
The Linux adapter uses Wayland pointer-constraints and relative-pointer version1,
waits for the compositor's grant, and delivers fractional unaccelerated deltas.
It does not claim raw hardware motion. A refused request times out with a retry
message; unsupported compositors and X11 retain absolute input with an explicit
capture diagnostic. macOS relative input remains unimplemented.

Qt's public Wayland interface provides the connection and pointer; its private
QPA boundary supplies only the window's `wl_surface`. The registry, managers and lock objects use Qt's default queue: its Wayland
reader wakes the GUI thread to dispatch their callbacks. There is no periodic
pointer poll while active or idle; only an outstanding capture request starts
a bounded refusal timer. Registry removal and reannouncement remain event driven.
The [Qt dispatch source](https://codebrowser.dev/qt6/qtbase/src/plugins/platforms/wayland/qwaylanddisplay.cpp.html#529)
shows the default queue's `EmitToDispatch`/queued `flushRequests` boundary. Capture is
refused if the runtime Qt version differs from the build headers; rebuild after
upgrading Qt. This private boundary is confined to `Pointer.cpp`.

Loading and saving run on the dedicated JSC thread. A replacement uses a fresh
JSC context, keeping its JIT state separate from the previous machine. Only a
fully validated candidate publishes its frame. Failed or cancelled loads leave
the previous machine paused and available. Native output uses bounded chunks
and QSaveFile atomic replacement; failure or cancellation preserves the old
file. During replacement, both old and candidate memory can coexist. This is
not a low-memory peak claim.

The snapshot framing, SHA-256 engine validation, heap ABI and restore logic are
shared with the web host. Native zlib and browser CompressionStream are
transport adapters. Existing version 1 saves remain readable. The CPU, heap
and snapshot file layouts are unchanged. A saved document correction retains
its original patch policy; the native host does not fetch or inject a new one
while restoring.

```sh
build/native/hemu-native check build/native/TempleOS.hemu
build/native/hemu-native check build/native/TempleOS.hemu 60
HEMU_NATIVE_FIXTURE="$PWD/build/native/TempleOS.hemu" node tools/native/test.mjs
HEMU_NATIVE_FIXTURE="$PWD/build/native/TempleOS.hemu" node tools/native/format.mjs
node tools/native/check.mjs --web
```

`check` emits JSON, returns 0 on success and reports failures on stderr. Without
a tick count it validates/restores without running the guest. Tests exercise
forced cancellation at actual read/write boundaries, atomic file preservation,
exact paused RGBA restoration, guest file round trips, native keyboard state,
retained CPU faults and the actual Qt window. The default screenshot path is
`/tmp/hemu-native-window.png`; override with `HEMU_NATIVE_SCREENSHOT`.

The Linux check also starts a private Qt Wayland compositor and real clients.
It verifies grant/refusal/timeout, fractional motion, Ctrl+Alt, focus and surface
lifetime, plus the production QML/Backend against HEMU. A native guest task must
observe the expected relative coordinates; tests also save/reopen, reject a bad
replacement and execute a real retained CPU fault while captured. These use an
isolated compositor and do not send input to the user's desktop.

Remaining qualification includes audible PCM timing/lifecycle,
UI file selection through the desktop portal, native packaging and
installation, performance/resource measurement, and non-Linux platforms. The
browser host's four-core protocol remains separate; this window does not yet
satisfy that native SMP requirement.

JavaScriptCoreGTK initialization is a platform boundary: its C API does not
initialize the WebKit main run loop used by the deferred full-GC callback in
the tested 2.54.1 library. `JsInit.hpp` initializes that loop on Qt's application
thread before any engine workers, through the library's exported **private**
`WTF::initializeMainThread` function. This is not a stable public JSC ABI. The
host refuses a header/runtime JSC version mismatch and must be rebuilt and
qualified when that dependency changes. GC remains enabled. The macOS branch
does not use this Linux compatibility adapter and remains unqualified.

The pre-fix host reproduced a null-main-loop crash during a real
open/resume/save/pause/resume lifecycle. The 45-second lifecycle regression now
also replaces the machine; `node tools/native/lifecycle.mjs --gc-proof` uses GDB
to require actual deferred full-GC callbacks before it passes. The ordinary
native check includes the lifecycle without the debugger. This bounds the
regression evidence; it does not establish indefinite runtime stability.
See the source-derived [GC failure evidence](../../tools/native/DeferredGc.md).
