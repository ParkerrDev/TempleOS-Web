// types.js — HolyC type system.
//
// Value model for codegen:
//   - everything that isn't F64 is represented as wasm i64 (ints, pointers,
//     and the *address* of aggregates).
//   - F64 is wasm f64.
import { VT } from "./wasm/emitter.js";

export function intType(bits, signed) { return { kind: "int", bits, signed }; }
export const T = {
  U0: { kind: "void" },
  I0: { kind: "void" },
  Bool: intType(8, false),
  I8: intType(8, true), U8: intType(8, false),
  I16: intType(16, true), U16: intType(16, false),
  I32: intType(32, true), U32: intType(32, false),
  I64: intType(64, true), U64: intType(64, false),
  F64: { kind: "float", bits: 64 },
};

// Base type keywords -> Type
export const BASE_TYPES = {
  U0: T.U0, I0: T.I0, Bool: T.Bool,
  I8: T.I8, U8: T.U8, I8i: T.I8, U8i: T.U8,
  I16: T.I16, U16: T.U16,
  I32: T.I32, U32: T.U32, I32i: T.I32,
  I64: T.I64, U64: T.U64, I64i: T.I64,
  F64: T.F64, F32: T.F64, // we treat F32 as F64 (TempleOS rarely uses F32)
};

export function ptrTo(t) { return { kind: "ptr", to: t }; }
export function arrayOf(t, count) { return { kind: "array", of: t, count }; }

export function isInt(t) { return t.kind === "int"; }
export function isFloat(t) { return t.kind === "float"; }
export function isPtr(t) { return t.kind === "ptr"; }
export function isArray(t) { return t.kind === "array"; }
export function isVoid(t) { return t.kind === "void"; }
export function isClass(t) { return t.kind === "class"; }
export function isAggregate(t) { return isArray(t) || isClass(t); }
export function isScalar(t) { return isInt(t) || isFloat(t) || isPtr(t); }

export function sizeof(t) {
  switch (t.kind) {
    case "void": return 0;
    case "int": return t.bits / 8;
    case "float": return 8;
    case "ptr": return 8;
    case "array": { const c = Number.isFinite(t.count) ? t.count : 1; return sizeof(t.of) * c; }
    case "class": return t.size;
    default: return 8; // unknown/opaque type modeled as one word
  }
}

// Element type for pointer arithmetic / indexing
export function elemType(t) {
  if (isPtr(t)) return t.to;
  if (isArray(t)) return t.of;
  return null;
}

// The wasm value type used to hold a value of this HolyC type in a temp/local.
export function wasmValType(t) {
  if (isFloat(t)) return VT.f64;
  return VT.i64; // ints, pointers, and aggregate addresses
}

// For loads/stores of scalars in memory: the wasm load/store op name + the
// (i64) value type. width in {1,2,4,8}; signed for sign-extension.
export function loadOp(t) {
  if (isFloat(t)) return { op: "f64_load", val: VT.f64 };
  const w = sizeof(t);
  const signed = isInt(t) ? t.signed : false; // ptr unsigned
  switch (w) {
    case 1: return { op: signed ? "i64_load8_s" : "i64_load8_u", val: VT.i64 };
    case 2: return { op: signed ? "i64_load16_s" : "i64_load16_u", val: VT.i64 };
    case 4: return { op: signed ? "i64_load32_s" : "i64_load32_u", val: VT.i64 };
    case 8: return { op: "i64_load", val: VT.i64 };
    default: throw new Error("bad load width " + w);
  }
}
export function storeOp(t) {
  if (isFloat(t)) return "f64_store";
  const w = sizeof(t);
  switch (w) {
    case 1: return "i64_store8";
    case 2: return "i64_store16";
    case 4: return "i64_store32";
    case 8: return "i64_store";
    default: throw new Error("bad store width " + w);
  }
}

// Type promotion for binary arithmetic between two scalar types.
// Returns 'float' if either is float; else 'int'.
export function arithIsFloat(a, b) { return isFloat(a) || isFloat(b); }

// Result type of binary arithmetic (HolyC mostly works in I64/F64).
export function binResultType(a, b) {
  if (arithIsFloat(a, b)) return T.F64;
  // pointer arithmetic: ptr +/- int -> ptr
  if (isPtr(a) && isInt(b)) return a;
  if (isInt(a) && isPtr(b)) return b;
  if (isPtr(a) && isPtr(b)) return T.I64; // ptr - ptr
  // integer: unsigned propagates (C "usual arithmetic conversions"), so a
  // comparison on an unsigned arithmetic result is done unsigned, not signed.
  if (isInt(a) && isInt(b) && (!a.signed || !b.signed)) return T.U64;
  return T.I64;
}

export function typeName(t) {
  switch (t.kind) {
    case "void": return "U0";
    case "int": return (t.signed ? "I" : "U") + t.bits;
    case "float": return "F64";
    case "ptr": return typeName(t.to) + "*";
    case "array": return typeName(t.of) + "[" + t.count + "]";
    case "class": return t.name;
    default: return "?";
  }
}

// Number-union sub-members available on integer-typed lvalues (x.i32[k] etc.)
export const UNION_MEMBERS = {
  i8: T.I8, u8: T.U8, i16: T.I16, u16: T.U16,
  i32: T.I32, u32: T.U32, i64: T.I64, u64: T.U64,
};
