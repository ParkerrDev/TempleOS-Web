These are the original King's Quest PCjr game resources, transformed from the disk supplied for this port. King's Quest and its story, artwork, sprites, and sound belong to Sierra and their respective rights holders. The HolyC port does not claim authorship of that material.

`Manifest.json` records each extracted resource's size, SHA-256, and source disk offset. The source disk SHA-256 is `9647acdbadb0b8ebd3af8d19a02cb549dc7282659cde0efe5d15390cafb4af29`.

- `PIC000.BIN` through `PIC084.BIN`: original vector picture commands.
- `VIEW000.BIN` through `VIEW110.BIN`: original sprite loops/cels, including their two-byte length prefix. Twenty-three entries are empty placeholders (`01 00 FF`). The 88 populated resources contain 138 loops and 722 cels.
- `MSG000.BIN` through `MSG084.BIN`: original room text; message offsets in the generated HolyC address these files.
- `SND000.BIN` through `SND009.BIN`: four-channel sound bundles, each beginning with four little-endian channel lengths.
- `INITIAL.BIN`: original saved initial state from disk sector 639. Six signature bytes, 256 game variables, 111 eight-byte object records, and 156 bytes of actor/engine state.
- `WORDS.BIN`: 357 original parser entries and the end sentinel, decoded by the original executable and recovered from its RAM. Each entry is a NUL-terminated word followed by sequence, type, and token bytes.
- `NAMES.BIN`: 111 NUL-terminated object names, indexed by original object number, recovered through the initial state's pointers into the original data segment. Empty names represent non-inventory objects.

The dictionary and inventory names came from a decoded RAM capture. Its hash and original data segment are recorded separately in the manifest. Neither that capture nor the original executable is used by the game.

All 85 original room logic resources were translated into `../Rooms.HC`. The runtime contains native HolyC conditions and calls, not the original script bytecode. `../Test/Rooms.json` retains the decoded build-time representation so the translation can be audited. `../Test/Extract.py` reproduces the assets and generated code from the original disk and RAM capture:

```
python Test/Extract.py ORIGINAL.IMG --memory ORIGINAL-RAM.BIN
```

Room 64's original input length places its message boundary one byte late. The extractor preserves its shared idle/input return marker and starts the text at the actual first character. Input marker `FB` differs from idle marker `FB`; the native translation follows the original evaluator rather than assuming they match.

`../Test/Verify.py ORIGINAL.IMG ORIGINAL-RAM.BIN` compares the generated control flow with the original PCjr evaluator, using a host C compiler and Python Unicorn. It tests 11,382 targeted/randomized cases across every room and both event types. This checks rule selection, ordered action calls, stopping behavior, and mutations for the tested variable operations. It does not establish correctness of the port's action implementations, graphics, movement, or a complete winning playthrough.
