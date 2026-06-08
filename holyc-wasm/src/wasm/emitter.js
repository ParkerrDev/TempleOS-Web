// emitter.js — a small, dependency-free WebAssembly binary module encoder.
//
// This is the back-end target for the HolyC compiler. It produces a Uint8Array
// containing a valid .wasm module. It supports exactly the features the codegen
// needs: imported functions / memory / globals, defined globals, defined
// functions (with forward references), exports, data segments, and a function
// body builder (`Func`) exposing the opcode subset HolyC lowering requires.
//
// Value model used by the compiler:
//   - HolyC ints & pointers  -> wasm i64
//   - HolyC F64              -> wasm f64
// so most of the opcode helpers below are i64/f64 oriented.

// ----------------------------------------------------------------------------
// LEB128 + primitive encoders
// ----------------------------------------------------------------------------

export function uleb(n) {
  // unsigned LEB128; accepts number or bigint
  let v = typeof n === "bigint" ? n : BigInt(n);
  if (v < 0n) throw new Error("uleb of negative: " + n);
  const out = [];
  do {
    let byte = Number(v & 0x7fn);
    v >>= 7n;
    if (v !== 0n) byte |= 0x80;
    out.push(byte);
  } while (v !== 0n);
  return out;
}

export function sleb(n) {
  // signed LEB128; accepts number or bigint
  let v = typeof n === "bigint" ? n : BigInt(n);
  const out = [];
  while (true) {
    let byte = Number(v & 0x7fn);
    v >>= 7n; // arithmetic shift for bigint
    const signBit = byte & 0x40;
    if ((v === 0n && !signBit) || (v === -1n && signBit)) {
      out.push(byte);
      break;
    }
    out.push(byte | 0x80);
  }
  return out;
}

export function f64bytes(x) {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, x, true);
  return Array.from(new Uint8Array(buf));
}

export function f32bytes(x) {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, x, true);
  return Array.from(new Uint8Array(buf));
}

function toBig(v) {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") { if (!Number.isFinite(v)) return 0n; return BigInt(Math.trunc(v)); }
  try { return BigInt(v); } catch { return 0n; }
}

function strBytes(s) {
  const enc = new TextEncoder().encode(s);
  return [...uleb(enc.length), ...enc];
}

function vec(items) {
  // items: array of byte-arrays
  return [...uleb(items.length), ...items.flat()];
}

function section(id, payloadBytes) {
  if (payloadBytes.length === 0) return [];
  return [id, ...uleb(payloadBytes.length), ...payloadBytes];
}

// ----------------------------------------------------------------------------
// Value types + block types
// ----------------------------------------------------------------------------

export const VT = {
  i32: 0x7f,
  i64: 0x7e,
  f32: 0x7d,
  f64: 0x7c,
};

export const EMPTY_BLOCK = 0x40;

// ----------------------------------------------------------------------------
// Opcodes
// ----------------------------------------------------------------------------

export const OP = {
  unreachable: 0x00, nop: 0x01,
  block: 0x02, loop: 0x03, if: 0x04, else: 0x05, end: 0x0b,
  br: 0x0c, br_if: 0x0d, br_table: 0x0e, return: 0x0f,
  call: 0x10, call_indirect: 0x11,
  drop: 0x1a, select: 0x1b,
  local_get: 0x20, local_set: 0x21, local_tee: 0x22,
  global_get: 0x23, global_set: 0x24,

  i32_load: 0x28, i64_load: 0x29, f32_load: 0x2a, f64_load: 0x2b,
  i32_load8_s: 0x2c, i32_load8_u: 0x2d, i32_load16_s: 0x2e, i32_load16_u: 0x2f,
  i64_load8_s: 0x30, i64_load8_u: 0x31, i64_load16_s: 0x32, i64_load16_u: 0x33,
  i64_load32_s: 0x34, i64_load32_u: 0x35,
  i32_store: 0x36, i64_store: 0x37, f32_store: 0x38, f64_store: 0x39,
  i32_store8: 0x3a, i32_store16: 0x3b,
  i64_store8: 0x3c, i64_store16: 0x3d, i64_store32: 0x3e,
  memory_size: 0x3f, memory_grow: 0x40,

  i32_const: 0x41, i64_const: 0x42, f32_const: 0x43, f64_const: 0x44,

  i32_eqz: 0x45, i32_eq: 0x46, i32_ne: 0x47,
  i32_lt_s: 0x48, i32_lt_u: 0x49, i32_gt_s: 0x4a, i32_gt_u: 0x4b,
  i32_le_s: 0x4c, i32_le_u: 0x4d, i32_ge_s: 0x4e, i32_ge_u: 0x4f,

  i64_eqz: 0x50, i64_eq: 0x51, i64_ne: 0x52,
  i64_lt_s: 0x53, i64_lt_u: 0x54, i64_gt_s: 0x55, i64_gt_u: 0x56,
  i64_le_s: 0x57, i64_le_u: 0x58, i64_ge_s: 0x59, i64_ge_u: 0x5a,

  f64_eq: 0x61, f64_ne: 0x62, f64_lt: 0x63, f64_gt: 0x64, f64_le: 0x65, f64_ge: 0x66,

  i32_clz: 0x67, i32_ctz: 0x68, i32_popcnt: 0x69,
  i32_add: 0x6a, i32_sub: 0x6b, i32_mul: 0x6c,
  i32_div_s: 0x6d, i32_div_u: 0x6e, i32_rem_s: 0x6f, i32_rem_u: 0x70,
  i32_and: 0x71, i32_or: 0x72, i32_xor: 0x73,
  i32_shl: 0x74, i32_shr_s: 0x75, i32_shr_u: 0x76, i32_rotl: 0x77, i32_rotr: 0x78,

  i64_clz: 0x79, i64_ctz: 0x7a, i64_popcnt: 0x7b,
  i64_add: 0x7c, i64_sub: 0x7d, i64_mul: 0x7e,
  i64_div_s: 0x7f, i64_div_u: 0x80, i64_rem_s: 0x81, i64_rem_u: 0x82,
  i64_and: 0x83, i64_or: 0x84, i64_xor: 0x85,
  i64_shl: 0x86, i64_shr_s: 0x87, i64_shr_u: 0x88, i64_rotl: 0x89, i64_rotr: 0x8a,

  f64_abs: 0x99, f64_neg: 0x9a, f64_ceil: 0x9b, f64_floor: 0x9c,
  f64_trunc: 0x9d, f64_nearest: 0x9e, f64_sqrt: 0x9f,
  f64_add: 0xa0, f64_sub: 0xa1, f64_mul: 0xa2, f64_div: 0xa3,
  f64_min: 0xa4, f64_max: 0xa5, f64_copysign: 0xa6,

  i32_wrap_i64: 0xa7,
  i32_trunc_f64_s: 0xaa, i32_trunc_f64_u: 0xab,
  i64_extend_i32_s: 0xac, i64_extend_i32_u: 0xad,
  i64_trunc_f64_s: 0xb0, i64_trunc_f64_u: 0xb1,
  f64_convert_i32_s: 0xb7, f64_convert_i32_u: 0xb8,
  f64_convert_i64_s: 0xb9, f64_convert_i64_u: 0xba,
  i64_reinterpret_f64: 0xbd, f64_reinterpret_i64: 0xbf,

  i32_extend8_s: 0xc0, i32_extend16_s: 0xc1,
  i64_extend8_s: 0xc2, i64_extend16_s: 0xc3, i64_extend32_s: 0xc4,
};

// 0xFC-prefixed saturating truncation (no trap on NaN/overflow) — HolyC casts
// floats to ints freely, so we use these to match C-ish wrap semantics safely.
const FC = {
  i32_trunc_sat_f64_s: 0x02, i32_trunc_sat_f64_u: 0x03,
  i64_trunc_sat_f64_s: 0x06, i64_trunc_sat_f64_u: 0x07,
};

// ----------------------------------------------------------------------------
// Func — a function body builder
// ----------------------------------------------------------------------------

export class Func {
  constructor() {
    this.bytes = [];
  }
  _op(b) { this.bytes.push(b); return this; }
  raw(...bs) { for (const b of bs) this.bytes.push(b); return this; }

  // constants. HolyC values arrive as possibly-unsigned BigInts; wasm const
  // operands are signed LEB of fixed width, so wrap into signed range first.
  // A non-finite/NaN operand (from incompletely-modeled lenient code) degrades
  // to 0 rather than throwing, keeping the whole compile alive.
  i32_const(v) { this._op(OP.i32_const); this.bytes.push(...sleb(BigInt.asIntN(32, toBig(v)))); return this; }
  i64_const(v) { this._op(OP.i64_const); this.bytes.push(...sleb(BigInt.asIntN(64, toBig(v)))); return this; }
  f64_const(v) { this._op(OP.f64_const); this.bytes.push(...f64bytes(v)); return this; }

  // locals / globals
  local_get(i) { this._op(OP.local_get); this.bytes.push(...uleb(i)); return this; }
  local_set(i) { this._op(OP.local_set); this.bytes.push(...uleb(i)); return this; }
  local_tee(i) { this._op(OP.local_tee); this.bytes.push(...uleb(i)); return this; }
  global_get(i) { this._op(OP.global_get); this.bytes.push(...uleb(i)); return this; }
  global_set(i) { this._op(OP.global_set); this.bytes.push(...uleb(i)); return this; }

  // control flow
  block(bt = EMPTY_BLOCK) { this._op(OP.block); this.bytes.push(bt & 0xff); return this; }
  loop(bt = EMPTY_BLOCK) { this._op(OP.loop); this.bytes.push(bt & 0xff); return this; }
  if_(bt = EMPTY_BLOCK) { this._op(OP.if); this.bytes.push(bt & 0xff); return this; }
  else_() { return this._op(OP.else); }
  end() { return this._op(OP.end); }
  br(d) { this._op(OP.br); this.bytes.push(...uleb(d)); return this; }
  br_if(d) { this._op(OP.br_if); this.bytes.push(...uleb(d)); return this; }
  br_table(targets, dflt) {
    this._op(OP.br_table);
    this.bytes.push(...uleb(targets.length));
    for (const t of targets) this.bytes.push(...uleb(t));
    this.bytes.push(...uleb(dflt));
    return this;
  }
  return_() { return this._op(OP.return); }
  call(i) { this._op(OP.call); this.bytes.push(...uleb(i)); return this; }
  call_indirect(typeIdx, tableIdx = 0) {
    this._op(OP.call_indirect);
    this.bytes.push(...uleb(typeIdx));
    this.bytes.push(...uleb(tableIdx));
    return this;
  }
  unreachable() { return this._op(OP.unreachable); }
  nop() { return this._op(OP.nop); }
  drop() { return this._op(OP.drop); }
  select() { return this._op(OP.select); }

  // memory (align is log2; we use natural alignment-permissive value 0)
  load(opName, offset = 0, align = 0) {
    this._op(OP[opName]);
    this.bytes.push(...uleb(align));
    this.bytes.push(...uleb(offset));
    return this;
  }
  store(opName, offset = 0, align = 0) {
    this._op(OP[opName]);
    this.bytes.push(...uleb(align));
    this.bytes.push(...uleb(offset));
    return this;
  }
  memory_grow() { this._op(OP.memory_grow); this.bytes.push(0x00); return this; }
  memory_size() { this._op(OP.memory_size); this.bytes.push(0x00); return this; }

  // generic single-byte op by name
  op(name) {
    if (!(name in OP)) throw new Error("unknown op " + name);
    return this._op(OP[name]);
  }
  // 0xFC saturating conversions
  fc(name) {
    if (!(name in FC)) throw new Error("unknown fc op " + name);
    this._op(0xfc);
    this.bytes.push(...uleb(FC[name]));
    return this;
  }
}

// ----------------------------------------------------------------------------
// Module
// ----------------------------------------------------------------------------

export class Module {
  constructor() {
    this.types = []; // {params:[vt], results:[vt]}
    this.typeKey = new Map();

    this.importFuncs = []; // {module,name,typeIdx}
    this.importGlobals = []; // {module,name,vt,mutable}
    this.importMems = []; // {module,name,min,max}

    this.funcs = []; // {typeIdx, locals:[{count,vt}], body:Func|null}
    this.globals = []; // {vt, mutable, init:[bytes]}
    this.exports = []; // {name, kind, index}
    this.datas = []; // {offset, bytes:Uint8Array|number[]}
    this.startIndex = null;
    this.localMemory = null; // {min,max}
    this.table = null; // {min,max}
    this.elements = []; // {offset, funcIndices:[]}
  }

  typeIndex(params, results) {
    const key = params.join(",") + "->" + results.join(",");
    if (this.typeKey.has(key)) return this.typeKey.get(key);
    const idx = this.types.length;
    this.types.push({ params, results });
    this.typeKey.set(key, idx);
    return idx;
  }

  importFunc(module, name, params, results) {
    if (this.funcs.length) throw new Error("imports must precede defined funcs");
    const typeIdx = this.typeIndex(params, results);
    const idx = this.importFuncs.length;
    this.importFuncs.push({ module, name, typeIdx });
    return idx; // function index
  }

  importGlobal(module, name, vt, mutable = false) {
    const idx = this.importGlobals.length;
    this.importGlobals.push({ module, name, vt, mutable });
    return idx; // global index
  }

  importMemory(module, name, min, max = undefined) {
    this.importMems.push({ module, name, min, max });
  }

  setMemory(min, max = undefined) {
    this.localMemory = { min, max };
  }

  setTable(min, max = undefined) {
    this.table = { min, max };
  }

  addElement(offset, funcIndices) {
    this.elements.push({ offset, funcIndices });
  }

  addGlobal(vt, mutable, initFunc) {
    // initFunc: a Func with the const expr (no trailing end; we add it)
    const idx = this.importGlobals.length + this.globals.length;
    this.globals.push({ vt, mutable, init: initFunc.bytes });
    return idx;
  }

  // Reserve a function slot (supports forward references). Returns func index.
  func(params, results, name) {
    const typeIdx = this.typeIndex(params, results);
    const localIndex = this.funcs.length;
    const idx = this.importFuncs.length + localIndex;
    const rec = { typeIdx, locals: [], body: null, params, results, name };
    this.funcs.push(rec);
    return { index: idx, setBody: (locals, fn) => { rec.locals = locals; rec.body = fn; } };
  }

  // Map function index -> name (for diagnostics). Imports first, then defined.
  funcName(index) {
    if (index < this.importFuncs.length) return this.importFuncs[index].name;
    const rec = this.funcs[index - this.importFuncs.length];
    return rec ? (rec.name || `func${index}`) : `?${index}`;
  }

  exportFunc(name, index) { this.exports.push({ name, kind: 0x00, index }); }
  exportMemory(name, index = 0) { this.exports.push({ name, kind: 0x02, index }); }
  exportGlobal(name, index) { this.exports.push({ name, kind: 0x03, index }); }
  exportTable(name, index = 0) { this.exports.push({ name, kind: 0x01, index }); }

  setStart(index) { this.startIndex = index; }

  addData(offset, bytes) {
    this.datas.push({ offset, bytes: bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes) });
  }

  emit() {
    const out = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
    // Append a byte array WITHOUT `out.push(...arr)`: function-call spread of a
    // large array (e.g. a sprite/bitmap data section) blows the call stack.
    const appendBytes = (arr) => { for (let i = 0; i < arr.length; i++) out.push(arr[i]); };

    // Type section (1)
    {
      const items = this.types.map((t) => [
        0x60,
        ...uleb(t.params.length), ...t.params,
        ...uleb(t.results.length), ...t.results,
      ]);
      appendBytes(section(1, vec(items)));
    }

    // Import section (2)
    {
      const items = [];
      for (const im of this.importFuncs) {
        items.push([...strBytes(im.module), ...strBytes(im.name), 0x00, ...uleb(im.typeIdx)]);
      }
      for (const im of this.importMems) {
        const limits = im.max === undefined ? [0x00, ...uleb(im.min)] : [0x01, ...uleb(im.min), ...uleb(im.max)];
        items.push([...strBytes(im.module), ...strBytes(im.name), 0x02, ...limits]);
      }
      for (const im of this.importGlobals) {
        items.push([...strBytes(im.module), ...strBytes(im.name), 0x03, im.vt, im.mutable ? 0x01 : 0x00]);
      }
      appendBytes(section(2, vec(items)));
    }

    // Function section (3)
    {
      const items = this.funcs.map((f) => uleb(f.typeIdx));
      appendBytes(section(3, vec(items)));
    }

    // Table section (4)
    if (this.table) {
      const limits = this.table.max === undefined
        ? [0x00, ...uleb(this.table.min)]
        : [0x01, ...uleb(this.table.min), ...uleb(this.table.max)];
      const items = [[0x70, ...limits]]; // funcref
      appendBytes(section(4, vec(items)));
    }

    // Memory section (5)
    if (this.localMemory) {
      const m = this.localMemory;
      const limits = m.max === undefined ? [0x00, ...uleb(m.min)] : [0x01, ...uleb(m.min), ...uleb(m.max)];
      appendBytes(section(5, vec([limits])));
    }

    // Global section (6)
    {
      const items = this.globals.map((g) => [g.vt, g.mutable ? 0x01 : 0x00, ...g.init, OP.end]);
      appendBytes(section(6, vec(items)));
    }

    // Export section (7)
    {
      const items = this.exports.map((e) => [...strBytes(e.name), e.kind, ...uleb(e.index)]);
      appendBytes(section(7, vec(items)));
    }

    // Start section (8)
    if (this.startIndex !== null) {
      appendBytes(section(8, uleb(this.startIndex)));
    }

    // Element section (9)
    if (this.elements.length) {
      const items = this.elements.map((el) => [
        0x00, // table 0, active
        OP.i32_const, ...sleb(el.offset), OP.end,
        ...uleb(el.funcIndices.length),
        ...el.funcIndices.flatMap((i) => uleb(i)),
      ]);
      appendBytes(section(9, vec(items)));
    }

    // Code section (10)
    {
      const items = this.funcs.map((f) => {
        if (!f.body) throw new Error("function body not set (typeIdx " + f.typeIdx + ")");
        const localsVec = [...uleb(f.locals.length), ...f.locals.flatMap((l) => [...uleb(l.count), l.vt])];
        const bodyBytes = [...localsVec, ...f.body.bytes, OP.end];
        return [...uleb(bodyBytes.length), ...bodyBytes];
      });
      appendBytes(section(10, vec(items)));
    }

    // Data section (11)
    {
      const items = this.datas.map((d) => [
        0x00, // active, memory 0
        OP.i32_const, ...sleb(d.offset), OP.end,
        ...uleb(d.bytes.length), ...d.bytes,
      ]);
      appendBytes(section(11, vec(items)));
    }

    return Uint8Array.from(out);
  }
}
