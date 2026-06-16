// gen-cursor.mjs — reconstruct the authentic TempleOS mouse pointer and write it to
// assets/cursor.png.  TempleOS has no cursor image file; the pointer is drawn by
// DrawStdMs (Adam/Gr/GrComposites.HC) as GrArrow3(dc, x+8,y+8,0, x,y,0) with thick=1.
// GrArrow3 (same file) draws, with the tip = hotspot at the top-left:
//   shaft  (8,8) -> (0,0)
//   barb1  (0.5,4.39) -> (0,0)   [w=2.75: x2-dx*d+dy*d+0.5, y2-dy*d-dx*d+0.5]
//   barb2  (4.39,0.5) -> (0,0)
// TempleOS Line() truncates to ints, so we rasterize those three lines with integer
// Bresenham (no anti-aliasing — 1-bit, like the real OS) on a 9x9 grid.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const N = 9, SCALE = 2;                 // 9x9 authentic grid, drawn 2x => 18x18
const grid = Array.from({ length: N }, () => new Uint8Array(N));
const line = (x1, y1, x2, y2) => {       // integer Bresenham
  let dx = Math.abs(x2 - x1), dy = -Math.abs(y2 - y1);
  let sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1, err = dx + dy;
  for (;;) {
    if (x1 >= 0 && x1 < N && y1 >= 0 && y1 < N) grid[y1][x1] = 1;
    if (x1 === x2 && y1 === y2) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x1 += sx; }
    if (e2 <= dx) { err += dx; y1 += sy; }
  }
};
line(8, 8, 0, 0);   // shaft
line(0, 4, 0, 0);   // barb1 (trunc of (0.5,4.39))
line(4, 0, 0, 0);   // barb2 (trunc of (4.39,0.5))

// ascii preview
console.log("authentic TempleOS pointer (X = set):");
for (let y = 0; y < N; y++) console.log("  " + [...grid[y]].map(v => v ? "X" : "·").join(""));

const W = N * SCALE, H = N * SCALE;
const px = [];
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (grid[y][x]) px.push([x, y]);

const browser = await chromium.launch();
const page = await browser.newPage();
const dataUrl = await page.evaluate(({ W, H, SCALE, px }) => {
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(W, H);
  for (const [x, y] of px)
    for (let dy = 0; dy < SCALE; dy++) for (let dx = 0; dx < SCALE; dx++) {
      const o = ((y * SCALE + dy) * W + (x * SCALE + dx)) * 4;
      img.data[o] = 255; img.data[o + 1] = 255; img.data[o + 2] = 255; img.data[o + 3] = 255; // white
    }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}, { W, H, SCALE, px });
await browser.close();

writeFileSync("assets/cursor.png", Buffer.from(dataUrl.split(",")[1], "base64"));
console.log(`wrote assets/cursor.png (${W}x${H}, white, 1-bit)`);
