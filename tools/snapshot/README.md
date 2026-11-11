# Native stock captures

A stock RAM image is only usable with its matching CPU registers and disk.
`stock.json` in HEMU binds the one- and four-core RAM images, raw native
register dumps, generated register source, original base disk and small sector
overlays. The build places this identity in a `hemu.stock` WASM custom section.
Page, desktop and worker preflight reject a mismatched RAM/module pair. A full
`.hemu` saved machine contains its own engine, CPU/device state and disk and
uses the separate saved-machine restore path.

Capture the installed original TempleOS disk, without HEMU:

```sh
python3 tools/snapshot/Capture.py --cores 1 \
  --disk vendor/images/templeos-hd.qcow2.gz \
  --font holyc-wasm/src/runtime/font.js --out /tmp/stock-one
python3 tools/snapshot/Capture.py --cores 4 \
  --disk vendor/images/templeos-hd.qcow2.gz \
  --font holyc-wasm/src/runtime/font.js --out /tmp/stock-four
python3 tools/snapshot/Pack.py \
  --base vendor/images/templeos-hd.qcow2.gz \
  --one /tmp/stock-one --four /tmp/stock-four --out /tmp/stock-package
```

The output directories must not exist. Capture uses a private writable disk,
waits for the native boot prompt and desktop, dismisses the tour, and samples
stopped state until every CPU is halted with an empty x87 stack. The strict
parser also requires ring-zero flat long mode, no interrupt shadow, matching
shared system registers and default MXCSR. It rejects missing fields, pending
x87 exceptions, occupied x87 registers and unsupported topology. All sixteen
XMM registers are captured as exact bit patterns. FCW, FSW, TOP and native HLT
state are preserved. The raw 80-bit payloads of empty x87 slots remain in the
register record; the emulator's empty F64 slots are cleared.

RAM and registers are read while QEMU is stopped. QEMU then exits to flush the
private disk before its checksum is recorded. Packaging verifies the source
artifacts, regenerates the HolyC register source, compresses RAM and records
only disk sectors differing from the hash-bound original disk. The complete
reconstructed disk checksum is checked by `tools/hemu/stock.test.mjs`.

This is exact pairing of the captured RAM, supported CPU fields and disk, not
a complete QEMU device snapshot. HEMU still initializes PIC, PIT and RTC using
its existing synthetic startup policy; halted CPUs do not prove that native
pending interrupts or device counters were captured. HEMU's x87 slots and
FXSAVE/FXRSTOR payloads also remain an F64 model, not architectural 80-bit
storage. Neither limitation is fixed or hidden by this capture change.

The independent register-order witness enables native OSFXSR, loads distinct
low/high halves into all sixteen XMM registers, sets FCW077f, advances an empty
x87 stack to TOP3 and halts. The occupied variant then pushes1.0, producing
TOP2/FTW04, which the stock parser refuses. Run and optionally refresh its
source-bound register fixtures with:

```sh
python3 tools/snapshot/Probe.py --disk vendor/images/templeos-hd.qcow2.gz \
  --font holyc-wasm/src/runtime/font.js --out /tmp/stock-xmm --record
python3 tools/snapshot/Probe.py --disk vendor/images/templeos-hd.qcow2.gz \
  --font holyc-wasm/src/runtime/font.js --out /tmp/stock-occupied --occupied --record
node tools/hemu/snapregs.test.mjs
node tools/hemu/stock.test.mjs
node tools/hemu/stock-init.test.mjs
```

The historical RAM fixture under `tools/hemu/fixtures` preserves the old
omitted-FPU startup defect for compatibility testing. `LegacySnapshot.mjs`
initializes its hash-bound historical module and RAM in isolation, then emits
a self-contained full save. Live stock loaders never accept that inaccurate
old pairing as a new stock session. Existing full saved sessions remain
supported without altering their stored FPU or device state.
