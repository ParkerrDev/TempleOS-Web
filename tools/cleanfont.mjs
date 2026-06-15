// cleanfont.mjs — fix + size the real TempleOS webfont.
// fonts/templeos_orig.ttf is the real font (322 glyphs, the design the site has always used) but its OS/2
// table is version 5 with malformed version-5 fields -> OTS "Failed to decode" error. This re-exports it
// via opentype.js with OS/2 downgraded to v4 (drops the optical-point-size fields) and, if a SCALE arg is
// given, uniformly scales every glyph + metric so it renders SCALE x its original size. Output: fonts/templeos.ttf
//   node tools/cleanfont.mjs [scale]      (e.g. 0.8; default 1.0 = original size)
import opentype from "opentype.js";
import { readFileSync, writeFileSync } from "node:fs";

const SCALE = +(process.argv[2]) || 1.0;
const f = opentype.parse(readFileSync("fonts/templeos_orig.ttf").buffer);
f.tables.os2.version = 4;
delete f.tables.os2.usLowerOpticalPointSize; delete f.tables.os2.usUpperOpticalPointSize;

if (SCALE !== 1) {
  const sc = (v) => Math.round(v * SCALE);
  for (let i = 0; i < f.glyphs.length; i++) { const g = f.glyphs.get(i);
    for (const c of g.path.commands) for (const k of ["x", "y", "x1", "y1", "x2", "y2"]) if (c[k] !== undefined) c[k] *= SCALE;
    if (g.advanceWidth !== undefined) g.advanceWidth = sc(g.advanceWidth);
  }
  f.ascender = sc(f.ascender); f.descender = sc(f.descender);
  const o = f.tables.os2; for (const k of ["sTypoAscender", "sTypoDescender", "sTypoLineGap", "usWinAscent", "usWinDescent", "sxHeight", "sCapHeight"]) if (o[k] !== undefined) o[k] = sc(o[k]);
  const h = f.tables.hhea; if (h) for (const k of ["ascender", "descender", "lineGap"]) if (h[k] !== undefined) h[k] = sc(h[k]);
}
writeFileSync("fonts/templeos.ttf", Buffer.from(f.toArrayBuffer()));
console.log(`fonts/templeos.ttf: ${f.glyphs.length} glyphs, em ${f.unitsPerEm}, OS/2 v${f.tables.os2.version}, scale ${SCALE}`);
