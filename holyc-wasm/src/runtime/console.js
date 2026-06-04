// console.js — TempleOS-flavored printf engine + DolDoc inline markup handling.
//
// Reads a NUL-terminated format string and a marshalled argument buffer from
// linear memory and renders text. Supports the common HolyC format codes and
// DolDoc inline color commands ($RED$, $FG$, $BG,n$, $$ -> literal $, etc.).
//
// Argument buffer: ARG_SLOT bytes per arg at ARG_BUF + i*ARG_SLOT:
//   [0..8)  i64 tag (0=int, 1=float)
//   [8..16) i64 (two's complement) or f64 bits
import { ARG_BUF, ARG_SLOT, TAG_FLT } from "../abi.js";

// 16 ANSI-ish colors matching the TempleOS palette indices for terminal output.
const ANSI_FG = [
  "30", "34", "32", "36", "31", "35", "33", "37",
  "90", "94", "92", "96", "91", "95", "93", "97",
];

export function readCStr(mem, addr) {
  const u8 = new Uint8Array(mem.buffer);
  let end = addr;
  while (end < u8.length && u8[end] !== 0) end++;
  return u8.subarray(addr, end);
}

export function bytesToLatin1(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

class ArgReader {
  constructor(mem, nargs) {
    this.dv = new DataView(mem.buffer);
    this.n = nargs;
    this.i = 0;
  }
  hasNext() { return this.i < this.n; }
  nextInt() {
    if (this.i >= this.n) return 0n;
    const base = ARG_BUF + this.i * ARG_SLOT;
    const tag = this.dv.getBigInt64(base, true);
    const v = tag === BigInt(TAG_FLT)
      ? BigInt(Math.trunc(this.dv.getFloat64(base + 8, true)))
      : this.dv.getBigInt64(base + 8, true);
    this.i++;
    return v;
  }
  nextFloat() {
    if (this.i >= this.n) return 0;
    const base = ARG_BUF + this.i * ARG_SLOT;
    const tag = this.dv.getBigInt64(base, true);
    const v = tag === BigInt(TAG_FLT)
      ? this.dv.getFloat64(base + 8, true)
      : Number(this.dv.getBigInt64(base + 8, true));
    this.i++;
    return v;
  }
}

function withCommas(digits) {
  // insert thousands separators into a run of digits
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ",";
    out += digits[i];
  }
  return out;
}

function pad(str, width, leftAlign, zero) {
  if (str.length >= width) return str;
  const fill = (zero && !leftAlign ? "0" : " ").repeat(width - str.length);
  if (leftAlign) return str + " ".repeat(width - str.length);
  if (zero && (str[0] === "-" || str[0] === "+")) return str[0] + fill + str.slice(1);
  return fill + str;
}

function fmtFloat(x, prec) {
  if (!isFinite(x)) return x > 0 ? "inf" : (x < 0 ? "-inf" : "nan");
  if (prec != null) return x.toFixed(prec);
  // "natural" formatting: trim trailing zeros, reasonable precision
  if (x === 0) return "0";
  let s = x.toPrecision(12);
  if (s.indexOf("e") < 0 && s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s;
}

// Render a format string with args. Returns { text } where text may contain
// ANSI color escapes (for terminal) controlled by `ansi`.
export function format(fmtBytes, mem, nargs, opts = {}) {
  const ansi = opts.ansi !== false;
  const args = new ArgReader(mem, nargs);
  const u8 = new Uint8Array(mem.buffer);
  let out = "";
  const fmt = fmtBytes;
  let i = 0;
  const N = fmt.length;
  const ch = (k) => String.fromCharCode(fmt[k]);

  while (i < N) {
    const c = ch(i);

    // DolDoc command: $...$  ; $$ -> literal $
    if (c === "$") {
      if (i + 1 < N && ch(i + 1) === "$") { out += "$"; i += 2; continue; }
      // read until closing $
      let j = i + 1, cmd = "";
      while (j < N && ch(j) !== "$") { cmd += ch(j); j++; }
      i = j + 1;
      out += dolDoc(cmd, ansi);
      continue;
    }

    if (c !== "%") { out += c; i++; continue; }

    // parse format spec
    i++; // past %
    if (i < N && ch(i) === "%") { out += "%"; i++; continue; }
    let leftAlign = false, zero = false, plus = false, comma = false, space = false;
    let parsingFlags = true;
    while (parsingFlags && i < N) {
      const fc = ch(i);
      if (fc === "-") { leftAlign = true; i++; }
      else if (fc === "0") { zero = true; i++; }
      else if (fc === "+") { plus = true; i++; }
      else if (fc === ",") { comma = true; i++; }
      else if (fc === " ") { space = true; i++; }
      else parsingFlags = false;
    }
    // width
    let width = 0, hasWidth = false;
    if (i < N && ch(i) === "*") { width = Number(args.nextInt()); hasWidth = true; i++; }
    else while (i < N && ch(i) >= "0" && ch(i) <= "9") { width = width * 10 + (fmt[i] - 48); hasWidth = true; i++; }
    // precision
    let prec = null;
    if (i < N && ch(i) === ".") {
      i++; prec = 0;
      if (i < N && ch(i) === "*") { prec = Number(args.nextInt()); i++; }
      else while (i < N && ch(i) >= "0" && ch(i) <= "9") { prec = prec * 10 + (fmt[i] - 48); i++; }
    }
    // HolyC 'h' aux modifier: %h<aux><conv>. aux ∈ { ?, digits, -digits, * }.
    // For repeat-style conversions (c) the aux/width is a repeat count.
    let aux = null;
    if (i < N && ch(i) === "h") {
      i++;
      if (i < N && ch(i) === "?") { aux = "?"; i++; }
      else if (i < N && ch(i) === "*") { aux = Number(args.nextInt()); i++; }
      else {
        let neg = false;
        if (ch(i) === "-") { neg = true; i++; }
        let num = 0, any = false;
        while (i < N && ch(i) >= "0" && ch(i) <= "9") { num = num * 10 + (fmt[i] - 48); i++; any = true; }
        if (any) aux = neg ? -num : num;
      }
    }
    const conv = i < N ? ch(i) : "";
    i++;

    let s = "";
    switch (conv) {
      case "d": case "i": {
        let v = args.nextInt();
        let neg = v < 0n; let digits = (neg ? -v : v).toString();
        if (comma) digits = withCommas(digits);
        s = (neg ? "-" : (plus ? "+" : (space ? " " : ""))) + digits;
        break;
      }
      case "u": {
        let v = args.nextInt(); if (v < 0n) v += 1n << 64n;
        let digits = v.toString(); if (comma) digits = withCommas(digits);
        s = digits; break;
      }
      case "x": case "X": {
        let v = args.nextInt(); if (v < 0n) v += 1n << 64n;
        s = v.toString(16); if (conv === "X") s = s.toUpperCase();
        if (prec != null) s = s.padStart(prec, "0");
        break;
      }
      case "b": {
        let v = args.nextInt(); if (v < 0n) v += 1n << 64n;
        s = v.toString(2); break;
      }
      case "p": {
        let v = args.nextInt(); if (v < 0n) v += 1n << 64n;
        s = "0x" + v.toString(16).toUpperCase(); break;
      }
      case "c": case "C": {
        const code = Number(args.nextInt() & 0xffn);
        const rep = aux != null && aux !== "?" ? Number(aux) : (hasWidth ? width : 1);
        s = String.fromCharCode(code).repeat(Math.max(1, rep));
        if (aux != null || (hasWidth && rep > 1)) { out += s; continue; } // count consumed width
        break;
      }
      case "s": {
        const addr = Number(args.nextInt());
        const bytes = readCStr(mem, addr);
        s = bytesToLatin1(bytes);
        if (prec != null) s = s.slice(0, prec);
        break;
      }
      case "f": case "n": case "g": {
        const v = args.nextFloat();
        s = fmtFloat(v, prec);
        break;
      }
      case "D": { // date — we don't carry CDate; print as integer
        const v = args.nextInt(); s = v.toString(); break;
      }
      case "T": { const v = args.nextInt(); s = v.toString(); break; }
      case "z": case "Z": case "t": {
        // string-table lookup; we lack tables — print the index
        const v = args.nextInt(); s = "#" + v.toString(); break;
      }
      default:
        s = "%" + conv; break;
    }

    if (hasWidth) s = pad(s, width, leftAlign, zero);
    out += s;
  }

  return out;
}

// Translate a DolDoc command into terminal output (mostly color changes).
function dolDoc(cmd, ansi) {
  const up = cmd.toUpperCase();
  const colorIdx = {
    BLACK: 0, BLUE: 1, GREEN: 2, CYAN: 3, RED: 4, PURPLE: 5, BROWN: 6, LTGRAY: 7,
    DKGRAY: 8, LTBLUE: 9, LTGREEN: 10, LTCYAN: 11, LTRED: 12, LTPURPLE: 13,
    YELLOW: 14, WHITE: 15,
  };
  if (!ansi) return "";
  // FG / FG,n
  if (up === "FG") return "\x1b[39m";
  if (up === "BG") return "\x1b[49m";
  if (up.startsWith("FG,")) { const n = parseInt(up.slice(3)); if (!isNaN(n)) return `\x1b[${ANSI_FG[n & 15]}m`; }
  if (up.startsWith("BG,")) { return ""; }
  if (up in colorIdx) return `\x1b[${ANSI_FG[colorIdx[up]]}m`;
  // ignore links, buttons, highlights, macros, etc.
  return "";
}
