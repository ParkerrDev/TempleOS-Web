// abi.js — the contract between compiled HolyC modules and the JS runtime host.
// Both src/codegen.js and src/runtime/host.js import this so memory layout and
// host import signatures stay in sync.
//
// Convention: every integer/pointer is passed as wasm i64, every float as f64.
// HolyC's own value model is identical, so call sites need no conversion.
import { VT } from "./wasm/emitter.js";

// --- Linear memory layout (byte addresses) ---
export const PAGE = 65536;
export const MEM_INITIAL_PAGES = 512;          // 32 MiB initial
export const MEM_MAX_PAGES = 8192;             // 512 MiB max (growable)
export const STACK_TOP = 256 * PAGE;           // shadow stack grows DOWN from 16 MiB
export const HEAP_BASE = STACK_TOP;            // heap grows UP from 16 MiB (16 MiB free initially)

export const JUNK_ADDR = 32;                   // scratch for unknown field/symbol writes (16 B)
export const MS_ADDR = 64;                     // CMouse mirror (host writes it)
// CMouse field offsets relative to MS_ADDR (must match prelude class CMouse).
export const MS = { x: 0, y: 4, z: 8, lb: 12, rb: 16, SIZE: 20 };
export const ARG_BUF = 1024;                   // printf argument marshalling area
export const ARG_SLOT = 16;                    // [tag @0 (i64)][value @8 (i64/f64)]
export const ARG_MAX = 64;                     // max marshalled args per call
export const DATA_BASE = 8192;                 // static data (globals, strings) start

// printf arg tags
export const TAG_INT = 0;
export const TAG_FLT = 1;

// Screen dimensions (TempleOS default)
export const GR_WIDTH = 640;
export const GR_HEIGHT = 480;

// TempleOS 16-color palette (RGB), from Adam/Gr/GrPalette.HC gr_palette_std.
export const PALETTE = [
  [0x00, 0x00, 0x00], [0x00, 0x00, 0xaa], [0x00, 0xaa, 0x00], [0x00, 0xaa, 0xaa],
  [0xaa, 0x00, 0x00], [0xaa, 0x00, 0xaa], [0xaa, 0x55, 0x00], [0xaa, 0xaa, 0xaa],
  [0x55, 0x55, 0x55], [0x55, 0x55, 0xff], [0x55, 0xff, 0x55], [0x55, 0xff, 0xff],
  [0xff, 0x55, 0x55], [0xff, 0x55, 0xff], [0xff, 0xff, 0x55], [0xff, 0xff, 0xff],
];

export const COLOR_NAMES = {
  BLACK: 0, BLUE: 1, GREEN: 2, CYAN: 3, RED: 4, PURPLE: 5, BROWN: 6, LTGRAY: 7,
  DKGRAY: 8, LTBLUE: 9, LTGREEN: 10, LTCYAN: 11, LTRED: 12, LTPURPLE: 13,
  YELLOW: 14, WHITE: 15,
};

const I = VT.i64, F = VT.f64;

// Host imports (module "env"). name -> {params, results} in wasm value types.
export const HOST_IMPORTS = {
  __printf:      { params: [I, I], results: [] },        // (fmtAddr, nargs)
  __print_bytes: { params: [I, I], results: [] },        // (addr, n)
  __putc:        { params: [I], results: [] },           // (ch)

  __gr_plot:     { params: [I, I, I], results: [] },     // x,y,color
  __gr_line:     { params: [I, I, I, I, I, I], results: [] }, // x1,y1,x2,y2,color,thick
  __gr_rect:     { params: [I, I, I, I, I], results: [] },    // x,y,w,h,color
  __gr_circle:   { params: [I, I, I, I, I], results: [] },    // x,y,r,color,fill
  __gr_text:     { params: [I, I, I, I], results: [] },       // x,y,color,strAddr
  __gr_fill:     { params: [I], results: [] },           // color
  __gr_flip:     { params: [], results: [] },
  __gr_width:    { params: [], results: [I] },
  __gr_height:   { params: [], results: [I] },
  __gr_sprite:   { params: [I, I, I, I, I, I], results: [] }, // x,y,w,h,dataAddr,scale — 8-bit indexed sprite, 0xFF=transparent
  __present:     { params: [I, I, I], results: [] },      // (fbAddr, w, h) — blit a raw 8-bit indexed framebuffer
  __snap_load:   { params: [I], results: [] },            // (memBase) — host loads a RAM snapshot into guest memory
  __host_in:     { params: [I], results: [I] },           // (port) — host I/O read (devices the host owns)
  __host_out:    { params: [I, I], results: [] },         // (port,val) — host I/O write
  __host_msx:    { params: [], results: [I] },            // absolute mouse x (0..639), host-owned cursor
  __host_msy:    { params: [], results: [I] },            // absolute mouse y (0..479)
  __host_msb:    { params: [], results: [I] },            // mouse button bits
  __host_key:    { params: [], results: [I] },            // next set-1 scancode, or <0 when drained
  __host_budget: { params: [], results: [I] },            // guest instructions to run this display frame
  __host_dt:     { params: [], results: [I] },            // real wall-clock ms since last frame (for pacing)
  __host_prof:   { params: [I], results: [] },            // debug: sample rip for profiling

  __snd:         { params: [F], results: [] },           // freq Hz (0 = off)
  __play_note:   { params: [F, I], results: [] },        // freq, ms (blocks)

  __sleep:       { params: [I], results: [] },           // ms (blocks)
  __yield:       { params: [], results: [] },
  __scan_char:   { params: [], results: [I] },           // peek: char or 0 (nonblocking)
  __get_char:    { params: [I, I], results: [I] },        // (echo, doScan) blocking
  __time_ms:     { params: [], results: [F] },

  __malloc:      { params: [I], results: [I] },
  __free:        { params: [I], results: [] },

  // transcendental math (wasm lacks these as opcodes)
  __sin:  { params: [F], results: [F] }, __cos:  { params: [F], results: [F] },
  __tan:  { params: [F], results: [F] }, __asin: { params: [F], results: [F] },
  __acos: { params: [F], results: [F] }, __atan: { params: [F], results: [F] },
  __atan2:{ params: [F, F], results: [F] }, __pow:  { params: [F, F], results: [F] },
  __log:  { params: [F], results: [F] }, __log10:{ params: [F], results: [F] },
  __exp:  { params: [F], results: [F] },
};
