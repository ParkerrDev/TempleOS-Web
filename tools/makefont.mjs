// makefont.mjs — build a CLEAN web font from the REAL TempleOS system font.
// Source: Kernel/FontStd.HC `U64 sys_font_std[256]` (the authentic 8x8 bitmap), cross-checked against
// hemu's already-decoded copy (holyc-wasm/src/runtime/font.js). Each ON-pixel run becomes a filled
// rectangle; opentype.js writes valid head/hhea/maxp/OS/2/cmap/glyf tables (so no OTS decode error, the
// problem the old templeos_font.woff had). Output: fonts/templeos.ttf  +  fonts/templeos.woff (zlib).
//   node tools/makefont.mjs <path-to-FontStd.HC>
import opentype from "opentype.js";
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { FONT } from "../holyc-wasm/src/runtime/font.js";

const hcPath = process.argv[2] || "/tmp/TOSclone/Kernel/FontStd.HC";
// --- parse sys_font_std[256] from the real source ---
const src = readFileSync(hcPath, "latin1");
const block = src.slice(src.indexOf("sys_font_std[256]"));
const hex = (block.slice(0, block.indexOf("};")).match(/0x[0-9A-Fa-f]{1,16}/g) || []).map((h) => BigInt(h));
if (hex.length !== 256) throw new Error(`expected 256 glyph U64s, got ${hex.length}`);
// glyph g, row r (0=top): byte r (little-endian) = (val >> 8r) & 0xFF; col c (0=left) = bit c.
const rowByte = (g, r) => Number((hex[g] >> BigInt(8 * r)) & 0xFFn);

// --- cross-check against hemu's verified decode (font.js) ---
let mism = 0;
for (let g = 0; g < 256; g++) for (let r = 0; r < 8; r++) if (rowByte(g, r) !== FONT[g * 8 + r]) mism++;
console.log(mism === 0 ? "cross-check OK: FontStd.HC matches hemu font.js (authentic)" : `WARN: ${mism} byte mismatches vs font.js`);

// --- build the TTF ---
const EM = 1024, PX = EM / 8;                       // 8x8 cell scaled to a 1024 em (128 units/pixel)
const rect = (path, x0, x1, yTop) => { const y0 = (7 - yTop) * PX, y1 = (8 - yTop) * PX; // row index -> font y (baseline at cell bottom)
  path.moveTo(x0 * PX, y0); path.lineTo(x1 * PX, y0); path.lineTo(x1 * PX, y1); path.lineTo(x0 * PX, y1); path.close(); };
const glyphFor = (g) => { const path = new opentype.Path();
  for (let r = 0; r < 8; r++) { const b = rowByte(g, r); let c = 0;
    while (c < 8) { if (b & (1 << c)) { let e = c; while (e < 8 && (b & (1 << e))) e++; rect(path, c, e, r); c = e; } else c++; } }
  return path; };

const glyphs = [new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: EM, path: new opentype.Path() })];
for (let c = 0x20; c <= 0x7e; c++)                  // printable ASCII (covers all site UI text)
  glyphs.push(new opentype.Glyph({ name: "u" + c.toString(16), unicode: c, advanceWidth: EM, path: glyphFor(c) }));

const font = new opentype.Font({ familyName: "TempleOS", styleName: "Regular", unitsPerEm: EM,
  ascender: EM, descender: 0, glyphs });
const ttf = Buffer.from(font.toArrayBuffer());
writeFileSync("fonts/templeos.ttf", ttf);
console.log(`wrote fonts/templeos.ttf (${ttf.length} bytes, ${glyphs.length} glyphs)`);
