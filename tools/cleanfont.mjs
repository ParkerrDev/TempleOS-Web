// cleanfont.mjs — fix the original TempleOS webfont so browsers stop rejecting it.
// The original fonts/templeos_orig.ttf is the real font (322 glyphs, the design the site has always used)
// but its OS/2 table is version 5 with malformed version-5 fields -> OTS "Failed to decode" error. This
// re-exports it through opentype.js with OS/2 downgraded to version 4 (drops the optical-point-size fields),
// keeping every glyph + metric IDENTICAL. Output: fonts/templeos.ttf
//   node tools/cleanfont.mjs
import opentype from "opentype.js";
import { readFileSync, writeFileSync } from "node:fs";
const f = opentype.parse(readFileSync("fonts/templeos_orig.ttf").buffer);
f.tables.os2.version = 4;
delete f.tables.os2.usLowerOpticalPointSize; delete f.tables.os2.usUpperOpticalPointSize;
writeFileSync("fonts/templeos.ttf", Buffer.from(f.toArrayBuffer()));
console.log(`fonts/templeos.ttf: ${f.glyphs.length} glyphs, em ${f.unitsPerEm}, OS/2 v${f.tables.os2.version} (was v5) — same font, clean tables`);
