# Deferred GC initialization

On Linux x86-64, Qt 6.12.0 and JavaScriptCoreGTK 2.54.1, the earlier native host
crashed outside guest execution in `FullGCActivityCallback::doCollection`.
The faulting `MemoryPressureHandler::singleton` constructor loaded a null
pointer from the same global returned by `RunLoop::mainSingleton` and then
accessed offset 8. This was not an OOM kill.

The original core (PID1729339) came from the real Wayland Backend test during
save/resume. A separate offscreen lifecycle using the settled pre-pointer
`App.hpp` (SHA256 `5475c2e826476a3a1e86fc03cbfa3416f809765f306cd03e3cfcb865bfd2bf4b`,
matching `fca6c7e`) reproduced the identical fault (PID1760659). Its bundle SHA256
was `77bfaf0ede4d75e76715c37e8a854b811b014b5c762497741cb1f80a68fb0d5e`.
The library ELF build ID was `fa26862a96388babc6b3bac9ebddaa203c400b4d`.
No raw process memory is included in this repository.

The corresponding upstream source explains the boundary:

- [JSContextRef.cpp](https://github.com/WebKit/WebKit/blob/webkitgtk-2.54.1/Source/JavaScriptCore/API/JSContextRef.cpp)
  calls JSC initialization when constructing the context.
- [InitializeThreading.cpp](https://github.com/WebKit/WebKit/blob/webkitgtk-2.54.1/Source/JavaScriptCore/runtime/InitializeThreading.cpp)
  initializes WTF/JSC but does not initialize the main run loop.
- [MainThread.cpp](https://github.com/WebKit/WebKit/blob/webkitgtk-2.54.1/Source/WTF/wtf/MainThread.cpp)
  initializes that run loop in `WTF::initializeMainThread`.
- [MemoryPressureHandler.cpp](https://github.com/WebKit/WebKit/blob/webkitgtk-2.54.1/Source/WTF/wtf/MemoryPressureHandler.cpp)
  constructs its timer from the main loop.
- [FullGCActivityCallback.cpp](https://github.com/WebKit/WebKit/blob/webkitgtk-2.54.1/Source/JavaScriptCore/heap/FullGCActivityCallback.cpp)
  consults that handler before collecting.

A control with only main-thread WTF initialization completed the same 40-second
lifecycle. The permanent `tests/lifecycle.cpp` now opens, runs, saves, pauses,
resumes and replaces the actual Backend over 45 seconds. The debug proof passed
with **two deferred full-GC callbacks** and a normal process exit. The existing
six native checks, including transport cancellation and saved CPU faults,
also passed. Initialization from a worker before the application thread is
explicitly rejected; worker use after initialization is covered.

This fix uses an exported private JSC entry point on Linux, isolated in
`engine/native/JsInit.hpp`, and validates runtime/header version agreement.
It neither disables collection nor changes HEMU, saved CPU state or the
snapshot format. Other JSC releases/platforms and indefinite uptime are not
qualified by this evidence.

Reproduce on the exact built dependency pair:

```sh
HEMU_NATIVE_FIXTURE="$PWD/build/native/TempleOS.hemu" node tools/native/lifecycle.mjs --gc-proof
```
