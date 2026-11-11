# Opt-in SMP memory protocol

Worker integration requires explicit `busProtocol:1`. The page and desktop
controllers declare it for their normal four-core machines. Single-core
operation needs no shared protocol. Without full participant registration,
wide SMP operations still stop without operand writes. HEMU 1f5854e / Web
b0d51bf is the preceding single-core-only checkpoint.

The external 64-byte control SAB has version 1 at word 15, one exclusive owner
at 12, a four-core active mask at 13, and one capability byte per core at 14.
Core counts outside 1..4 and duplicate/version-mismatched owners reject. A
participant registers only after its host owns all synchronous RAM entry paths.
Capability 1 is guarded host access; capability 3 also promises native polling.
Every configured participant must advertise 3 before any wide operation can
acquire ownership. An old embedded module lacks polling and keeps safe refusal.
These are new host/control interfaces, not a change to the saved CPU layout.

Normal RAM access takes a shared lease. It publishes its active bit, rechecks
the exclusive owner, and withdraws if an owner arrived. A wide operation first
withdraws its shared lease, claims the exclusive owner, then waits for all
active bits to clear. Two upgraders both withdraw before competing. Release
publishes the owner's normal active bit before clearing the owner, preventing
another owner from missing its resumed access. Sequentially consistent Atomics
provide these ordering edges. No opcode-only mutex is sufficient.

Every synchronous WASM entry is guarded, including JIT code compilation and
fallback callbacks inside that entry. Nested/reentrant calls reuse the same
core lease; awaited work cannot hold it. Guestexec read/write/name staging APIs
use the same guard. DocClip reads copies through those APIs and writes its
revision through wr64. Worker cache invalidation and stopped-frame copies also
take a lease. The test worker's raw diagnostics only run under the BSP lease
or, for explicit paused copies, a complete acknowledged capture.
Snapshot restore and initial IPI cleanup occur before AP release; snapshot
copying requires capture acknowledgement from every AP and deferred host
messages throughout asynchronous serialization. A local BSP freeze rejects
all new guarded access until serialization settles, including already-pending
async continuations. AP acknowledgements remain held until that freeze ends.

Capture suspends the BSP lease before asking APs to stop. An AP already inside
a wide instruction must finish it, update registers/flags, unwind RunCore, and
only then acknowledge capture. Treating an upgrader's inactive bit as capture
acknowledgement could save an advanced RIP before its instruction completed.
The BSP reacquires its lease after the capture barrier returns. While capture
is held, guarded nested BSP writes are permitted and APs remain parked.

Fault/cancellation handling must stop and notify the whole protocol, never
steal an owner or clear its activity bit while it might still access RAM.
Capture must refuse after protocol failure. A worker lost midway through an
exclusive instruction cannot produce a resumable snapshot. Registered owner
exit/error and cancellation need deterministic controller notification; a
bounded wait is a final fail-stop fallback, not evidence of normal progress.

`bus.test.mjs` currently proves forced shared-reader blocking, actual ordinary
WASM loads and raw host writes against a paused half-write, simultaneous
upgrades, nested access and capture handoff after simulated instruction
retirement/RunCore unwind. Unguarded negative controls deterministically see
or cause torn values. Worker termination while owning/upgrading and a thrown
exclusive callback fail-stop without stealing ownership. Late continuations
are refused during serialization and work again after thaw.

`bus-hemu.test.mjs` pauses actual AtomPart after reading a cross-word operand,
using a test-only inserted import absent from production. Against LOCK INC
from 1, an interpreter MOV, compiled MOV and real guestexec wr64 all wait until
the instruction retires, then write 10. Disabling their guard makes each
negative control lose its write, producing 2; no legal ordering of those two
instructions produces 2. Four real worker instances share the same WASM
memory. `atom-split.test.mjs` also compares 2,064 coordinated SMP executions
against original V5.03/physical x86 vectors while preserving uncoordinated
refusal, neighboring bytes, defined flags and interrupt deferral.

The same real-worker gate pauses LOCK CMPXCHG16B after its low-half write.
Interpreter, compiled and guestexec peer stores all wait until the high half
and CPU state have retired, then leave 10,20. Each unguarded negative control
instead leaves 10,6, which no legal ordering of the locked exchange and those
two peer stores permits. This verifies exclusive ownership for aligned pairs;
the unaligned-field predicate alone would not protect them.

`worker-bus.test.mjs` runs four real TempleOS tasks with 1,024 split LOCK INC
operations and 1,024 complementary-pair CMPXCHG16B increments.
`worker-snapshot.test.mjs` with HEMU_BUS_PROTOCOL=1 preserves CPU,
devices, pixels, palette, disk, active game and settings across full restore.
The same option on worker-legacy-fault tests the actual historical 7ea5d3e
embedded module: missing polling capability prevents exclusive ownership,
and its version-1 full save and retained native AP fault still work.

## Host and snapshot interfaces

New imports are __bus_poll, __bus_lock and __bus_unlock. Poll is called only at
retired instruction boundaries; a capture response unwinds RunCore before the
AP acknowledges. The default host returns continue/refuse/no-op respectively.
There is no changed guest CPU/RAM layout or allocator ABI. The shared control
protocol and these imports are nevertheless new interfaces.

The controller passes busProtocol:1 to BSP smp configuration and every AP,
plus sc.ncore (1..4). It must call BusStop on cancellation and unexpected worker
failure/exit, before termination. The bounded owner wait is a final fail-stop
fallback. A controller must validate a saved requiredBusProtocol before
creating workers, and forward that requirement to AP initialization. WorkerHost,
Os.js and the desktop controller implement this contract. Every cancellation
and worker termination first stops coordination. Unexpected running worker
failures retain a visibly stopped machine and reject export; ordinary completed
CPU faults retain their existing capture path. Restart uses fresh control
storage. Stale callbacks and late boot success/failure cannot replace the new
machine or start a second set of workers.

A fully coordinated save has requiredBusProtocol:1 and mandatory header
version 2 within the existing HEMUSNP1 envelope. The actual unmodified
version-1 decoder (fixture Snapshot-v1.mjs, Web b0d51bf) rejects version 2.
The new loader reads both versions, verifies the embedded module's polling
imports and rejects unsupported ownership before memory growth/restoration.
SnapshotOpen/Inspect(bytes,{busProtocol}) default to protocol 0, so existing
uncoordinated callers reject before creating workers. Coordinated controllers
must explicitly pass protocol 1; Restore independently requires the same.
Both BSP and AP initialization independently reject an unmet requirement
before touching their shared memory/control state. Full saves whose legacy
module cannot coordinate retain version 1 and never claim wide-operation
support. Native host implementations of this protocol remain separate work.
The aligned CMPXCHG16B path uses the same imports, ownership lifetime and saved
format; it does not silently introduce a second lock or protocol version.

## Controller checks

`tools/browser/snapshot.mjs` verifies real page one/four-core export, import,
reload and restart, including exact displayed RGBA/FPS and the mandatory
version-2 header. `desktop-lifecycle.test.mjs` covers the same desktop lifecycle,
native CPU faults and the historical embedded engine's version-1 safe refusal.
`HEMU_LEGACY=1 node tools/browser/snapshot.mjs` also restores that actual older
embedded engine through the page's export/import/reload/restart UI.
Current desktop sessions must install the native document clipping correction;
the local server explicitly serves its HolyC source.

`tools/browser/bus.mjs` inserts a test-only gate into the real worker module,
after AP1 has acquired exclusive ownership. The page and desktop both cancel
and fault that operation. Actual Worker.terminate calls observe stop=1 before
termination, the unfinished owner is never stolen, no successful full snapshot
leaves the old machine, and restart registers fresh cores. The modified module
exists only in intercepted test responses and retains the isolation headers
needed by a shared-memory worker. `tools/browser/boot-cancel.mjs` holds an
earlier engine fetch until a replacement is running, then releases success or
failure to check the separate asynchronous boot race. It also holds the initial
snapshot body and releases late data, a read failure or an HTTP failure after
the replacement starts; neither loader text nor progress may change.
