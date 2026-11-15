`Corpus.json.gz` freezes the JavaScript codec's output before the HolyC port,
from TempleOS-Web commit `eb3a17f`. Its source hashes identify the original
modules. Repeated input and output buffers share entries in `data`.

The corpus covers 270 palette conversions with random pixels, gradients,
palette artwork, alpha boundaries, fractional strengths and changing cache
strengths; 24 GIF streams cover literal-run and sub-block boundaries,
transparency and fractional frame delays; three ZIP archives cover empty
files, UTF-8 names, CRCs and directory offsets.

Run `node Apps/Sprites/Color.test.mjs` after `node Misc/AppsBuild.mjs`.
Add `--native` to compile the same HolyC source in original TempleOS V5.03
under QEMU and compare all 297 outputs with these same frozen bytes.
The test does not regenerate its own expected output.
