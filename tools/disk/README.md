# Disk reader checks

`node tools/disk.test.mjs` compares all visible sectors of two independently
created qcow2 images against `qemu-img`'s raw export. It also checks sparse
sectors, allocated-zero clusters, subarray inputs, overlay ownership and early
rejection of malformed or unsupported images. The ordinary fast suite runs it
without needing QEMU installed.

`node tools/disk/record.mjs` regenerates the small compressed fixtures using
`qemu-img` and `qemu-io`. The recorded tool version, exact commands, decompressed
lengths and hashes are in `evidence.json`. The v3 fixture first writes nonzero
data, then issues a zero write without discarding the allocation. A reader that
ignores the zero bit exposes the old payload. The v2 fixture is an independent
conversion of the raw result with 512-byte clusters.

The reader supports standalone, unencrypted v2/v3 qcow2 images with standard,
uncompressed clusters and 512-byte guest sectors. It validates the active
mapping before accepting the image; backing files, incompatible feature flags,
compressed clusters and truncated data are rejected. It preserves the input
image and keeps session writes in a separate overlay. Validation covers this
storage representation, not whether a disk contains a valid TempleOS filesystem.

Format reference: [QEMU qcow2 specification](https://www.qemu.org/docs/master/interop/qcow2.html).
`tools/browser/snapshot.mjs` confirms rejected disk imports preserve the active
page and leave no reload record. `tools/browser/disk-import.mjs` checks worker
imports against delayed/default loads on one and four cores.

`node tools/disk/stock.mjs` additionally compares every sector of the stock
256 MiB TempleOS image with a fresh `qemu-img` raw conversion and prints both
image hashes. This optional check requires QEMU and uses a temporary directory.
