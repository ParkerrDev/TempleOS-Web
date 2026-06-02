// graphics.js — a 640x480 16-color indexed framebuffer with the TempleOS
// palette, software drawing primitives (plot/line/rect/circle/text), and a
// blit to a Canvas/OffscreenCanvas 2D context. Works on both the main thread
// (HTMLCanvas) and a worker (OffscreenCanvas).
import { PALETTE, GR_WIDTH, GR_HEIGHT } from "../abi.js";
import { FONT, FONT_W, FONT_H } from "./font.js";

export class Framebuffer {
  constructor(ctx, width = GR_WIDTH, height = GR_HEIGHT, scale = 1, indicesBuf = null) {
    this.width = width;
    this.height = height;
    this.scale = scale;
    this.ctx = ctx;                       // CanvasRenderingContext2D-like
    // Optional shared (SharedArrayBuffer-backed) index buffer: lets a worker that
    // is blocked in a synchronous program loop draw into it while the MAIN thread
    // presents it via rAF (a blocked worker never composites its own canvas).
    this.indices = indicesBuf || new Uint8Array(width * height); // palette index per pixel
    // RGBA image at native size; we upscale via the context if scale>1.
    this.image = ctx ? ctx.createImageData(width, height) : { data: new Uint8ClampedArray(width * height * 4), width, height };
    // precompute palette as 0xAABBGGRR little-endian u32 for fast blits
    this.pal32 = new Uint32Array(16);
    for (let i = 0; i < 16; i++) {
      const [r, g, b] = PALETTE[i];
      this.pal32[i] = (255 << 24) | (b << 16) | (g << 8) | r;
    }
    this.fill(0);
  }

  inBounds(x, y) { return x >= 0 && x < this.width && y >= 0 && y < this.height; }

  fill(color) { this.indices.fill(color & 15); }

  plot(x, y, color) {
    x |= 0; y |= 0;
    if (this.inBounds(x, y)) this.indices[y * this.width + x] = color & 15;
  }

  // Bresenham line with optional thickness.
  line(x1, y1, x2, y2, color, thick = 1) {
    x1 |= 0; y1 |= 0; x2 |= 0; y2 |= 0;
    const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;
    const t = Math.max(1, thick | 0);
    const half = (t / 2) | 0;
    while (true) {
      if (t === 1) this.plot(x1, y1, color);
      else for (let oy = -half; oy <= half; oy++) for (let ox = -half; ox <= half; ox++) this.plot(x1 + ox, y1 + oy, color);
      if (x1 === x2 && y1 === y2) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x1 += sx; }
      if (e2 < dx) { err += dx; y1 += sy; }
    }
  }

  rect(x, y, w, h, color) {
    x |= 0; y |= 0; w |= 0; h |= 0;
    const x0 = Math.max(0, x), y0 = Math.max(0, y);
    const x1 = Math.min(this.width, x + w), y1 = Math.min(this.height, y + h);
    for (let yy = y0; yy < y1; yy++) {
      const row = yy * this.width;
      this.indices.fill(color & 15, row + x0, row + x1);
    }
  }

  circle(cx, cy, r, color, filled = true) {
    cx |= 0; cy |= 0; r = Math.abs(r | 0);
    if (filled) {
      for (let dy = -r; dy <= r; dy++) {
        const dx = Math.floor(Math.sqrt(r * r - dy * dy));
        const yy = cy + dy;
        if (yy < 0 || yy >= this.height) continue;
        const x0 = Math.max(0, cx - dx), x1 = Math.min(this.width, cx + dx + 1);
        this.indices.fill(color & 15, yy * this.width + x0, yy * this.width + x1);
      }
    } else {
      // midpoint circle outline
      let x = r, y = 0, err = 1 - r;
      const o = (px, py) => this.plot(px, py, color);
      while (x >= y) {
        o(cx + x, cy + y); o(cx + y, cy + x); o(cx - y, cy + x); o(cx - x, cy + y);
        o(cx - x, cy - y); o(cx - y, cy - x); o(cx + y, cy - x); o(cx + x, cy - y);
        y++;
        if (err < 0) err += 2 * y + 1; else { x--; err += 2 * (y - x) + 1; }
      }
    }
  }

  // draw a NUL/already-decoded string using the TempleOS 8x8 font
  text(x, y, color, str) {
    x |= 0; y |= 0;
    let cx = x;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i) & 0xff;
      if (ch === 10) { cx = x; y += FONT_H; continue; }
      this.glyph(cx, y, color, ch);
      cx += FONT_W;
    }
  }
  glyph(x, y, color, ch) {
    const base = (ch & 0xff) * 8;
    for (let r = 0; r < FONT_H; r++) {
      const bits = FONT[base + r];
      if (!bits) continue;
      const py = y + r;
      if (py < 0 || py >= this.height) continue;
      for (let c = 0; c < FONT_W; c++) {
        if (bits & (1 << c)) this.plot(x + c, py, color);
      }
    }
  }

  // Convert the index buffer to RGBA and present it.
  present() {
    if (!this.ctx) return;   // worker side has no canvas; the main thread presents the shared buffer
    const data = new Uint32Array(this.image.data.buffer);
    const idx = this.indices, pal = this.pal32;
    for (let i = 0; i < idx.length; i++) data[i] = pal[idx[i]];
    if (!this.ctx) return;
    if (this.scale === 1) {
      this.ctx.putImageData(this.image, 0, 0);
    } else {
      // draw native into an offscreen, then scale up
      if (!this._tmp) {
        this._tmp = (typeof OffscreenCanvas !== "undefined")
          ? new OffscreenCanvas(this.width, this.height)
          : null;
        this._tmpctx = this._tmp ? this._tmp.getContext("2d") : null;
      }
      if (this._tmpctx) {
        this._tmpctx.putImageData(this.image, 0, 0);
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.drawImage(this._tmp, 0, 0, this.width * this.scale, this.height * this.scale);
      } else {
        this.ctx.putImageData(this.image, 0, 0);
      }
    }
  }
}
