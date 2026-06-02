# hemu source patch

`hemu-qemu.patch` is the diff applied to the **ktock/qemu-wasm** fork to build the
hemu (Holy Emulator) `qemu-system-x86_64.wasm` shipped in `vendor/qemu-sdl/`.

The headline change is in `tcg/wasm32.c`: `hle_dispatch()` (called at the top of
`tcg_qemu_tb_exec`) recognizes TempleOS's per-frame compositor `DCBlotColor8` by its
entry address and runs it **natively** on guest RAM, then simulates the HolyC
callee-clean RET — so the OS binary stays 100% unmodified. `hw/display/vga.c` adds
`hemu_present()`. Measured: desktop ~27 → ~30-79 fps, guest CPU 99% → 64%.

The `DCBlotColor4` (native planar pack) and `GrUpdateVGAGraphics` (present) branches
are included but gated off — measured neutral / net-negative respectively (see the
comments in the patch). Build: apply to the fork, `build/make-qemu.sh` + `restage.sh`.

Addresses in the HLE are baked from the shipped snapshot (deterministic JIT). See the
project memory `hemu-hle.md` for the full reverse-engineering notes (ABI, CDC offsets,
CPUX86State offsets, probe recipe).
