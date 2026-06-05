// codegen.js — lowers the HolyC AST to a WebAssembly module.
//
// Value model:
//   - ints & pointers -> wasm i64
//   - F64             -> wasm f64
//   - aggregates (array/class) are represented by their address (i64)
//
// Memory:
//   - static data (globals + interned strings) from DATA_BASE upward
//   - a shadow stack growing DOWN from STACK_TOP (global __sp), for addressable
//     locals (those whose address is taken, number-union accessed, or aggregates)
//   - a host bump-heap above HEAP_BASE for MAlloc
import { Module, Func, VT, EMPTY_BLOCK } from "./wasm/emitter.js";
import {
  T, BASE_TYPES, ptrTo, arrayOf, isInt, isFloat, isPtr, isArray, isVoid,
  isClass, isAggregate, isScalar, sizeof, elemType, wasmValType, loadOp, storeOp,
  binResultType, typeName, UNION_MEMBERS,
} from "./types.js";
import {
  HOST_IMPORTS, DATA_BASE, STACK_TOP, HEAP_BASE, MEM_INITIAL_PAGES,
  MEM_MAX_PAGES, ARG_BUF, ARG_SLOT, TAG_INT, TAG_FLT, MS_ADDR, JUNK_ADDR,
  COLOR_NAMES, GR_WIDTH, GR_HEIGHT,
} from "./abi.js";
import { foldConstInt, foldDim } from "./fold.js";

const PINNED_GLOBALS = { ms: MS_ADDR };

export class CodegenError extends Error {}

export function compile(programAst, opts = {}) {
  return new Codegen(programAst, opts).run();
}

class Codegen {
  constructor(program, opts) {
    this.program = program;
    this.opts = opts;
    this.m = new Module();
    this.classes = new Map();   // name -> ClassDecl node
    this.classLayouts = new Map(); // name -> {size, align, fields:Map}
    this.functions = new Map(); // name -> fn record
    this.globals = new Map();   // name -> {addr, type}
    this.constEnv = {};         // name -> bigint, for #define-like enum constants
    this.data = [];             // {addr, bytes}
    this.strings = new Map();   // key -> addr
    this.cursor = DATA_BASE;
    this.warnings = [];
    // Lenient mode (default ON): unknown kernel symbols/fields/calls become safe
    // fallbacks so whole programs compile & run, with unsupported features as
    // documented no-ops. Strict tests pass {lenient:false} to surface real bugs.
    this.lenient = opts.lenient !== false;
    this.unknownSyms = new Set();
  }

  warn(msg) { this.warnings.push(msg); }

  // Allocate (once) a backing I64 cell for an unknown kernel symbol so lenient
  // code can read/write it without colliding with anything real.
  lenientGlobal(name) {
    if (this.globals.has(name)) return this.globals.get(name).addr;
    const addr = this.alloc(8, 8);
    this.globals.set(name, { addr, type: T.I64, init: null, synthetic: true });
    if (!this.unknownSyms.has(name)) { this.unknownSyms.add(name); this.warn(`unknown symbol '${name}' modeled as I64 global`); }
    return addr;
  }
  errAt(node, msg) { throw new CodegenError(`line ${node && node.line}: ${msg}`); }

  alloc(size, align = 8) {
    if (!Number.isFinite(size)) { if (this.lenient) { this.warn("non-finite alloc size; using 8"); size = 8; } else throw new CodegenError("non-finite alloc size " + size); }
    if (!Number.isFinite(align) || align < 1) align = 8;
    this.cursor = align8(this.cursor, align);
    const a = this.cursor;
    this.cursor += size;
    return a;
  }

  internBytes(bytes, nulTerminate = true) {
    const arr = nulTerminate ? [...bytes, 0] : [...bytes];
    const key = arr.join(",");
    if (this.strings.has(key)) return this.strings.get(key);
    const addr = this.alloc(arr.length, 1);
    this.data.push({ addr, bytes: arr });
    this.strings.set(key, addr);
    return addr;
  }

  // ============================================================ run
  run() {
    // host imports first
    this.m.setMemory(MEM_INITIAL_PAGES, MEM_MAX_PAGES);
    this.imports = {};
    for (const [name, sig] of Object.entries(HOST_IMPORTS)) {
      const idx = this.m.importFunc("env", name, sig.params, sig.results);
      this.imports[name] = { index: idx, sig };
    }
    // globals for stack pointer & heap pointer
    this.spGlobal = this.m.addGlobal(VT.i64, true, new Func().i64_const(STACK_TOP));
    this.excGlobal = this.m.addGlobal(VT.i64, true, new Func().i64_const(0)); // thrown value

    // PASS 1: collect classes, function signatures, globals
    this.collectClasses();
    this.collectConsts();
    this.collectGlobals();
    this.collectFunctions();

    // reserve __rt_init and __main
    this.rtInit = this.m.func([], []);
    this.mainFn = this.m.func([], []);

    // PASS 2: generate bodies
    for (const fn of this.functions.values()) {
      if (fn.isImport) continue;
      if (fn.node && fn.node.body) { this.genFunctionBody(fn); continue; }
      // Prototype / extern with no body: emit a stub returning 0 so it links.
      if (fn.slot) this.genStubBody(fn);
    }
    this.genRtInit();
    this.genMain();

    // emit static data
    for (const d of this.data) this.m.addData(d.addr, d.bytes);

    // exports
    this.m.exportMemory("memory");
    this.m.exportFunc("__main", this.mainFn.index);
    this.m.exportFunc("__rt_init", this.rtInit.index);
    this.m.exportGlobal("__sp", this.spGlobal);

    const bytes = this.m.emit();
    return { bytes, warnings: this.warnings, dataEnd: this.cursor };
  }

  // ============================================================ classes
  collectClasses() {
    for (const d of this.program.decls) {
      if (d.kind === "ClassDecl" && d.name) this.classes.set(d.name, d);
    }
  }

  layoutClass(name) {
    if (this.classLayouts.has(name)) return this.classLayouts.get(name);
    const node = this.classes.get(name);
    if (!node) throw new CodegenError("unknown class " + name);
    const fields = new Map();
    let off = 0, maxAlign = 1, maxSize = 0;
    // base class members first
    if (node.base && this.classes.has(node.base)) {
      const base = this.layoutClass(node.base);
      for (const [fn, fi] of base.fields) fields.set(fn, { ...fi });
      off = base.size; maxAlign = Math.max(maxAlign, base.align);
    }
    // mark as in-progress to allow self-referential pointers
    this.classLayouts.set(name, { size: 0, align: 8, fields, incomplete: true });
    for (const mem of node.members) {
      let ty = this.resolveType(mem.type);
      if (ty && ty.kind === "class" && !this.classes.has(ty.name)) {
        if (this.lenient) { this.warn(`unknown class '${ty.name}' as member ${name}.${mem.name}; treated as I64`); ty = T.I64; }
        else throw new CodegenError(`class ${name}: member '${mem.name}' has unknown class type '${ty.name}'`);
      }
      const sz = this.typeSize(ty);
      const al = this.typeAlign(ty);
      if (node.isUnion) {
        fields.set(mem.name, { type: ty, offset: 0 });
        maxSize = Math.max(maxSize, sz);
        maxAlign = Math.max(maxAlign, al);
      } else {
        off = align8(off, al);
        fields.set(mem.name, { type: ty, offset: off });
        off += sz;
        maxAlign = Math.max(maxAlign, al);
      }
    }
    const size = node.isUnion ? align8(maxSize, maxAlign) : align8(off, maxAlign);
    const layout = { size, align: maxAlign, fields, incomplete: false };
    this.classLayouts.set(name, layout);
    return layout;
  }

  // Resolve classref types to {kind:'class', name} but keep pointers shallow.
  resolveType(t) {
    if (!t) return T.I64;
    switch (t.kind) {
      case "classref": return { kind: "class", name: t.name };
      case "ptr": return ptrTo(this.resolveType(t.to));
      case "array": {
        const of = this.resolveType(t.of);
        let count;
        try { count = t.count == null ? 0 : foldDim(t.count, this.constEnv); }
        catch (e) { if (this.lenient) { count = 1; this.warn("non-constant array dimension; assumed [1]"); } else throw e; }
        return arrayOf(of, count);
      }
      case "ClassDecl": return { kind: "class", name: t.name || ("__anon" + (t.line || 0)) };
      default: return t;
    }
  }

  typeSize(t) {
    t = this.resolveType(t);
    if (t.kind === "class") {
      if (!this.classes.has(t.name)) return 8; // opaque/forward class -> one word
      return this.layoutClass(t.name).size;
    }
    if (t.kind === "array") { const c = Number.isFinite(t.count) ? t.count : 1; return this.typeSize(t.of) * c; }
    const s = sizeof(t);
    return Number.isFinite(s) ? s : 8;
  }
  typeAlign(t) {
    t = this.resolveType(t);
    if (t.kind === "class") return this.layoutClass(t.name).align;
    if (t.kind === "array") return this.typeAlign(t.of);
    if (isFloat(t)) return 8;
    return Math.min(sizeof(t), 8);
  }
  classField(classType, name) {
    const layout = this.layoutClass(classType.name);
    let f = layout.fields.get(name);
    if (!f) {
      if (this.lenient) {
        // Unknown field: synthesize one at the end so reads/writes are valid and
        // don't collide with real fields. Grows the layout.
        this.warnOnceCg(`class ${classType.name} has no field '${name}'; synthesized`);
        const off = align8(layout.size, 8);
        f = { type: T.I64, offset: off, synthetic: true };
        layout.fields.set(name, f);
        layout.size = off + 8;
      } else {
        throw new CodegenError(`class ${classType.name} has no field '${name}'`);
      }
    }
    return f;
  }
  warnOnceCg(msg) { if (!this._cgWarned) this._cgWarned = new Set(); if (!this._cgWarned.has(msg)) { this._cgWarned.add(msg); this.warn(msg); } }

  // ============================================================ consts
  collectConsts() {
    // numeric-constant globals declared with simple constant initializers can
    // act as enum-ish constants for array dims. Also color names.
    for (const [k, v] of Object.entries(COLOR_NAMES)) this.constEnv[k] = BigInt(v);
    this.constEnv["GR_WIDTH"] = BigInt(GR_WIDTH);
    this.constEnv["GR_HEIGHT"] = BigInt(GR_HEIGHT);
  }

  // ============================================================ globals
  collectGlobals() {
    for (const d of this.program.decls) {
      if (d.kind === "VarDecl") this.declareGlobal(d);
      if (d.kind === "ClassDecl" && d.vars) for (const v of d.vars) this.declareGlobal(v);
    }
  }
  declareGlobal(d) {
    if (this.globals.has(d.name)) return;
    const ty = this.resolveType(d.type);
    let addr;
    if (d.name in PINNED_GLOBALS) addr = PINNED_GLOBALS[d.name];
    else addr = this.alloc(this.typeSize(ty), this.typeAlign(ty));
    this.globals.set(d.name, { addr, type: ty, init: d.init, node: d });
    // record simple integer constant for const-folding of later dims
    const c = d.init && foldConstInt(d.init, this.constEnv);
    if (c != null) this.constEnv[d.name] = c;
  }

  // Emit a constant integer-array global (sprite/bitmap data, lookup tables) as a
  // single wasm DATA SEGMENT at the global's address, instead of thousands of
  // per-element stores in __rt_init. Returns true if handled; returns false (so
  // the caller falls back to runtime stores) for float arrays, nested lists, or
  // any non-constant element. wasm memory is zero-initialized, so a partial
  // initializer leaves the remainder 0, matching C semantics.
  tryStaticConstArray(g) {
    const ty = this.resolveType(g.type);
    if (!isArray(ty)) return false;
    const et = this.resolveType(ty.of);
    if (!isInt(et)) return false;
    const esz = this.typeSize(et);
    if (esz !== 1 && esz !== 2 && esz !== 4 && esz !== 8) return false;
    const init = g.init;
    if (!init || init.kind !== "InitList") return false;
    const cap = this.typeSize(ty);                  // reserved bytes for this global
    const bytes = [];
    for (const el of init.elements) {
      if (el.kind === "InitList") return false;      // nested aggregate: fall back
      const c = foldConstInt(el, this.constEnv);
      if (c == null) return false;                   // non-constant element: fall back
      let v = BigInt.asUintN(64, c);
      for (let b = 0; b < esz; b++) { bytes.push(Number(v & 0xffn)); v >>= 8n; }
    }
    if (bytes.length > cap) bytes.length = cap;       // never write past the global
    this.data.push({ addr: g.addr, bytes });         // -> m.addData(addr, bytes)
    return true;
  }

  // ============================================================ functions
  collectFunctions() {
    // host intrinsics visible as callable HolyC functions
    for (const [name, info] of Object.entries(this.imports)) {
      const sig = info.sig;
      this.functions.set(name, {
        name, isImport: true, index: info.index,
        params: sig.params.map((vt) => ({ type: vt === VT.f64 ? T.F64 : T.I64 })),
        retType: sig.results.length ? (sig.results[0] === VT.f64 ? T.F64 : T.I64) : T.U0,
      });
    }
    for (const d of this.program.decls) {
      if (d.kind !== "FuncDecl") continue;
      if (!d.body) {
        // prototype/extern/import: register signature if not present
        if (!this.functions.has(d.name)) this.registerFuncSig(d, null);
        continue;
      }
      this.registerFuncSig(d, d);
    }
  }
  registerFuncSig(d, bodyNode) {
    const params = d.params.map((p) => ({
      type: this.resolveType(p.type), name: p.name, default: p.default,
    }));
    const retType = this.resolveType(d.retType);
    const sig = this.wasmSig(params, retType);
    let index;
    const existing = this.functions.get(d.name);
    if (existing && !existing.isImport && existing.slot) {
      index = existing.slot.index;
    } else {
      const slot = this.m.func(sig.params, sig.results, d.name);
      index = slot.index;
      this.functions.set(d.name, {
        name: d.name, isImport: false, index, slot, params, retType, node: bodyNode,
      });
      return;
    }
    if (bodyNode) { existing.node = bodyNode; existing.params = params; existing.retType = retType; }
  }
  wasmSig(params, retType) {
    return {
      params: params.map((p) => (isFloat(this.resolveType(p.type)) ? VT.f64 : VT.i64)),
      results: isVoid(retType) ? [] : [isFloat(retType) ? VT.f64 : VT.i64],
    };
  }

  // ============================================================ function body
  genFunctionBody(fn) {
    const ctx = new FnCtx(this, fn);
    const f = ctx.f;
    ctx.beginFrame();
    if (fn.node.body) ctx.genStmt(fn.node.body);
    ctx.endFrameFallthrough();
    fn.slot.setBody(ctx.localDecls(), f);
  }

  // Stub body for a prototype/extern function: ignore args, return 0 (or void).
  genStubBody(fn) {
    const f = new Func();
    if (!isVoid(fn.retType)) { isFloat(fn.retType) ? f.f64_const(0) : f.i64_const(0); }
    fn.slot.setBody([], f);
    this.warn(`extern/prototype '${fn.name}' has no body; stubbed (returns 0)`);
  }

  genRtInit() {
    const ctx = new FnCtx(this, { name: "__rt_init", params: [], retType: T.U0, node: { body: null } });
    const f = ctx.f;
    // set Fs->pix_width / pix_height if __Fs global + class CTask exist
    // initialize globals with initializers (in declaration order)
    for (const g of this.globals.values()) {
      if (g.init == null) continue;
      ctx.genGlobalInit(g);
    }
    // call the prelude's runtime-init hook if present (sets Fs, gr.dc, ...)
    const hook = this.functions.get("__hcrt_init");
    if (hook && !hook.isImport) f.call(hook.index);
    ctx.endFrameFallthrough();
    this.rtInit.setBody(ctx.localDecls(), f);
  }

  genMain() {
    // __main runs prelude rt-init, then top-level statements as a synthetic body
    const bodyBlock = { kind: "Block", stmts: this.program.topStmts };
    const fakeFn = { name: "__main", params: [], retType: T.U0, node: { body: bodyBlock } };
    const ctx = new FnCtx(this, fakeFn);
    const f = ctx.f;
    f.call(this.rtInit.index);
    ctx.beginFrame();
    ctx.genStmt(bodyBlock);
    ctx.endFrameFallthrough();
    this.mainFn.setBody(ctx.localDecls(), f);
  }
}

function align8(n, a = 8) { return Math.ceil(n / a) * a; }

// ============================================================ per-function ctx
class FnCtx {
  constructor(cg, fn) {
    this.cg = cg;
    this.fn = fn;
    this.f = new Func();
    this.ctrl = [];                 // structured-control markers (for branch depth)
    this.loops = [];                // {brk, cont}
    this.tries = [];                // catch-target markers
    this.locals = new Map();        // name -> descriptor
    this.wlocalTypes = [];          // extra wasm local valtypes (beyond params)
    this.frameSize = 0;
    this.scratch = {};              // cached scratch local indices
    this.paramCount = fn.params.length;

    // params occupy wasm locals 0..n-1
    this.nextWLocal = this.paramCount;

    // analyze + assign storage
    this.addrTaken = new Set();
    if (fn.node && fn.node.body) this.findAddrTaken(fn.node.body, this.addrTaken);
    this.assignParams();
    if (fn.node && fn.node.body) this.collectLocals(fn.node.body);
  }

  // ---- diagnostics ----
  err(node, msg) { throw new CodegenError(`line ${node && node.line}: ${msg}`); }

  // ---- wasm locals ----
  newWLocal(vt) { const idx = this.nextWLocal++; this.wlocalTypes.push(vt); return idx; }
  scratchI32() { return this.scratch.i32 ??= this.newWLocal(VT.i32); }
  scratchI64() { return this.scratch.i64 ??= this.newWLocal(VT.i64); }
  scratchF64() { return this.scratch.f64 ??= this.newWLocal(VT.f64); }
  fpLocal() { return this.scratch.fp ??= this.newWLocal(VT.i64); }

  localDecls() {
    // collapse consecutive equal valtypes
    const out = [];
    for (const vt of this.wlocalTypes) {
      if (out.length && out[out.length - 1].vt === vt) out[out.length - 1].count++;
      else out.push({ count: 1, vt });
    }
    return out;
  }

  // ---- storage assignment ----
  assignParams() {
    this.fn.params.forEach((p, i) => {
      if (!p.name) return;
      const ty = this.cg.resolveType(p.type);
      if (isAggregate(ty)) {
        this.locals.set(p.name, { kind: "reflocal", windex: i, type: ty });
      } else if (this.addrTaken.has(p.name)) {
        const off = this.allocSlot(this.cg.typeSize(ty), this.cg.typeAlign(ty));
        this.locals.set(p.name, { kind: "slot", offset: off, type: ty, paramIndex: i });
      } else {
        this.locals.set(p.name, { kind: "wlocal", windex: i, type: ty });
      }
    });
  }
  allocSlot(size, align) {
    this.frameSize = align8(this.frameSize, align) + size;
    return this.frameSize; // offset from base measured DOWN (we use fp+ (frameSize-offset))? simpler: store absolute below
  }
  collectLocals(node) {
    const visitDecl = (vd) => {
      if (this.locals.has(vd.name)) return;
      const ty = this.cg.resolveType(vd.type);
      if (isAggregate(ty) || this.addrTaken.has(vd.name) || this.needsUnionAddr(vd.name)) {
        const off = this.allocSlot(this.cg.typeSize(ty), this.cg.typeAlign(ty));
        this.locals.set(vd.name, { kind: "slot", offset: off, type: ty, init: vd.init });
      } else {
        const vt = isFloat(ty) ? VT.f64 : VT.i64;
        const widx = this.newWLocal(vt);
        this.locals.set(vd.name, { kind: "wlocal", windex: widx, type: ty, init: vd.init });
      }
    };
    const walk = (n) => {
      if (!n || typeof n !== "object") return;
      if (n.kind === "DeclStmt") { for (const d of n.decls) visitDecl(d); }
      if (n.kind === "For" && n.init && n.init.kind === "DeclStmt") for (const d of n.init.decls) visitDecl(d);
      for (const k in n) {
        const v = n[k];
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object" && v.kind) walk(v);
      }
    };
    walk(node);
  }
  needsUnionAddr(name) { return this.addrTaken.has(name); }

  findAddrTaken(node, set) {
    const markRoot = (n) => {
      while (n) {
        if (n.kind === "Ident") { set.add(n.name); return; }
        if (n.kind === "Member") { n = n.base; continue; }
        if (n.kind === "Index") { n = n.base; continue; }
        if (n.kind === "Unary" && n.op === "*") { return; } // deref: root is a pointer value, not addressable local
        return;
      }
    };
    const walk = (n) => {
      if (!n || typeof n !== "object") return;
      if (n.kind === "Unary" && n.op === "&") markRoot(n.operand);
      if (n.kind === "Member" && n.name in UNION_MEMBERS && !n.arrow) markRoot(n.base);
      for (const k in n) {
        const v = n[k];
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object" && v.kind) walk(v);
      }
    };
    walk(node);
  }

  // ---- frame prologue/epilogue ----
  beginFrame() {
    if (this.frameSize === 0) return;
    const f = this.f;
    f.global_get(this.cg.spGlobal).i64_const(this.frameSize).op("i64_sub").global_set(this.cg.spGlobal);
    f.global_get(this.cg.spGlobal).local_set(this.fpLocal());
    // copy addressable params into their slots
    for (const [name, d] of this.locals) {
      if (d.kind === "slot" && d.paramIndex != null) {
        this.pushSlotAddr(d);                 // i64 addr
        this.f.op("i32_wrap_i64");
        this.f.local_get(d.paramIndex);
        this.emitStore(d.type);
      }
    }
    // initialize slot locals with initializers
    for (const [name, d] of this.locals) {
      if (d.kind === "slot" && d.paramIndex == null && d.init != null) {
        this.genStoreInit(d);
      } else if (d.kind === "wlocal" && d.init != null) {
        this.genExprCoerce(d.init, d.type);
        this.f.local_set(d.windex);
      }
    }
  }
  restoreFrame() {
    if (this.frameSize === 0) return;
    this.f.global_get(this.cg.spGlobal).i64_const(this.frameSize).op("i64_add").global_set(this.cg.spGlobal);
  }
  endFrameFallthrough() {
    this.restoreFrame();
    if (!isVoid(this.fn.retType)) {
      if (isFloat(this.fn.retType)) this.f.f64_const(0); else this.f.i64_const(0);
    }
  }

  pushSlotAddr(d) {
    // address = fp_base + (frameSize - offset)   [slots packed from base upward]
    this.f.local_get(this.fpLocal());
    this.f.i64_const(this.frameSize - d.offset);
    this.f.op("i64_add");
  }

  // ---- control markers ----
  pushCtrl() { const m = {}; this.ctrl.push(m); return m; }
  popCtrl() { this.ctrl.pop(); }
  rel(m) { return this.ctrl.length - 1 - this.ctrl.lastIndexOf(m); }

  // ================================================== statements
  genStmt(s) {
    switch (s.kind) {
      case "Block": for (const st of this.flattenTry(s.stmts)) this.genStmt(st); return;
      case "Empty": return;
      case "DeclStmt": this.genDeclStmt(s); return;
      case "ExprStmt": { const t = this.genExpr(s.expr); this.dropIfValue(t); return; }
      case "Print": this.genPrint(s); return;
      case "PutChars": this.genPutChars(s.bytes); return;
      case "If": this.genIf(s); return;
      case "While": this.genWhile(s); return;
      case "DoWhile": this.genDoWhile(s); return;
      case "For": this.genFor(s); return;
      case "Switch": this.genSwitch(s); return;
      case "Return": this.genReturn(s); return;
      case "Break": { const L = this.loops[this.loops.length - 1]; if (!L) { if (this.cg.lenient) { this.warnOnce("break outside loop/switch; ignored"); return; } this.err(s, "break outside loop"); } this.f.br(this.rel(L.brk)); return; }
      case "Continue": { const L = this.loops[this.loops.length - 1]; if (!L) { if (this.cg.lenient) { this.warnOnce("continue outside loop; ignored"); return; } this.err(s, "continue outside loop"); } this.f.br(this.rel(L.cont)); return; }
      case "Throw": this.genThrow(s); return;
      case "TryCatch": this.genTryCatch(s); return;
      case "Try": this.genTryCatch({ body: s.body, handler: null, line: s.line }); return;
      case "Catch": this.genStmt(s.body); return; // lone catch: just run it
      case "Label": return; // labels handled structurally; bare labels are no-ops
      case "AsmBlock": this.warnOnce("inline asm{} is not supported (x86-64); emitting trap"); this.f.unreachable(); return;
      case "Goto": this.warnOnce("goto is not supported; ignored"); return;
      case "ClassDecl": return; // local class decl: types only
      default: this.err(s, "unsupported statement " + s.kind);
    }
  }

  warnOnce(msg) { if (!this._warned) this._warned = new Set(); if (!this._warned.has(msg)) { this._warned.add(msg); this.cg.warn(msg); } }

  // Pair `Try` with following `Catch` inside a statement list.
  flattenTry(stmts) {
    const out = [];
    for (let i = 0; i < stmts.length; i++) {
      const s = stmts[i];
      if (s.kind === "Try") {
        const next = stmts[i + 1];
        if (next && next.kind === "Catch") { out.push({ kind: "TryCatch", body: s.body, handler: next.body, line: s.line }); i++; continue; }
        out.push({ kind: "TryCatch", body: s.body, handler: null, line: s.line }); continue;
      }
      out.push(s);
    }
    // expand: replace TryCatch via direct generation marker
    return out.map((s) => (s.kind === "TryCatch" ? s : s));
  }

  genDeclStmt(s) {
    for (const d of s.decls) {
      const desc = this.locals.get(d.name);
      if (!desc) continue;
      if (d.init == null) continue;
      if (desc.kind === "slot") this.genStoreInit(desc);
      else { this.genExprCoerce(d.init, desc.type); this.f.local_set(desc.windex); }
    }
  }

  genStoreInit(desc) {
    // store an initializer into a memory slot/aggregate
    this.storeInitInto(() => this.pushSlotAddr(desc), desc.type, desc.init);
  }
  storeInitInto(pushAddr, type, init) {
    type = this.cg.resolveType(type);
    if (init.kind === "InitList") {
      if (isArray(type)) {
        const et = type.of, esz = this.cg.typeSize(et);
        init.elements.forEach((el, i) => {
          this.storeInitInto(() => { pushAddr(); this.f.i64_const(i * esz).op("i64_add"); }, et, el);
        });
      } else if (isClass(type)) {
        const layout = this.cg.layoutClass(type.name);
        const fieldArr = [...layout.fields.values()];
        init.elements.forEach((el, i) => {
          const fi = fieldArr[i]; if (!fi) return;
          this.storeInitInto(() => { pushAddr(); this.f.i64_const(fi.offset).op("i64_add"); }, fi.type, el);
        });
      }
      return;
    }
    // scalar
    pushAddr(); this.f.op("i32_wrap_i64");
    this.genExprCoerce(init, type);
    this.emitStore(type);
  }

  genGlobalInit(g) {
    // Constant integer arrays (sprite/bitmap data, tables) compile to one wasm
    // data segment rather than thousands of per-element stores — instant to emit.
    if (g.init.kind === "InitList" && this.cg.tryStaticConstArray(g)) return;
    const pushAddr = () => this.f.i64_const(g.addr);
    if (g.init.kind === "InitList") { this.storeInitInto(pushAddr, g.type, g.init); return; }
    pushAddr(); this.f.op("i32_wrap_i64");
    this.genExprCoerce(g.init, g.type);
    this.emitStore(g.type);
  }

  genReturn(s) {
    if (s.expr) {
      this.genExprCoerce(s.expr, this.fn.retType);
      this.restoreFrame();
      this.f.return_();
    } else {
      this.restoreFrame();
      if (!isVoid(this.fn.retType)) { isFloat(this.fn.retType) ? this.f.f64_const(0) : this.f.i64_const(0); }
      this.f.return_();
    }
  }

  genIf(s) {
    this.genCond(s.cond);
    const m = this.pushCtrl(); this.f.if_(EMPTY_BLOCK);
    this.genStmt(s.then);
    if (s.else) { this.f.else_(); this.genStmt(s.else); }
    this.f.end(); this.popCtrl();
  }

  genWhile(s) {
    const brk = this.pushCtrl(); this.f.block();
    const cont = this.pushCtrl(); this.f.loop();
    this.genCond(s.cond); this.f.op("i32_eqz").br_if(this.rel(brk));
    this.loops.push({ brk, cont });
    this.genStmt(s.body);
    this.loops.pop();
    this.f.br(this.rel(cont));
    this.f.end(); this.popCtrl();
    this.f.end(); this.popCtrl();
  }

  genDoWhile(s) {
    const brk = this.pushCtrl(); this.f.block();
    const loop = this.pushCtrl(); this.f.loop();
    const cont = this.pushCtrl(); this.f.block();
    this.loops.push({ brk, cont });
    this.genStmt(s.body);
    this.loops.pop();
    this.f.end(); this.popCtrl(); // cont
    this.genCond(s.cond); this.f.br_if(this.rel(loop));
    this.f.end(); this.popCtrl(); // loop
    this.f.end(); this.popCtrl(); // brk
  }

  genFor(s) {
    if (s.init) this.genStmt(s.init);
    const brk = this.pushCtrl(); this.f.block();
    const loop = this.pushCtrl(); this.f.loop();
    if (s.cond) { this.genCond(s.cond); this.f.op("i32_eqz").br_if(this.rel(brk)); }
    const cont = this.pushCtrl(); this.f.block();
    this.loops.push({ brk, cont });
    this.genStmt(s.body);
    this.loops.pop();
    this.f.end(); this.popCtrl(); // cont
    if (s.step) { const t = this.genExpr(s.step); this.dropIfValue(t); }
    this.f.br(this.rel(loop));
    this.f.end(); this.popCtrl(); // loop
    this.f.end(); this.popCtrl(); // brk
  }

  genThrow(s) {
    if (s.expr) { this.genExprCoerce(s.expr, T.I64); this.f.global_set(this.cg.excGlobal); }
    if (this.tries.length) this.f.br(this.rel(this.tries[this.tries.length - 1]));
    else this.f.unreachable();
  }

  // TryCatch appears via flattenTry
  genTryCatch(s) {
    // block $try_end { block $do_catch { <body; throw->br do_catch>; br try_end } <handler> }
    const tryEnd = this.pushCtrl(); this.f.block();
    const doCatch = this.pushCtrl(); this.f.block();
    this.tries.push(doCatch);
    this.genStmt(s.body);
    this.tries.pop();
    this.f.br(this.rel(tryEnd));   // normal completion: skip handler
    this.f.end(); this.popCtrl();  // do_catch
    if (s.handler) this.genStmt(s.handler);
    this.f.end(); this.popCtrl();  // try_end
  }

  genSwitch(s) {
    // Resolve labels with HolyC null-case auto-numbering & ranges.
    const labels = [];   // {values:[{lo,hi}], isDefault, segIdx}
    const segs = [];     // arrays of statements
    let cur = [];
    let prev = -1n;
    const pushSeg = () => { segs.push(cur); cur = []; };
    let started = false;
    for (const it of s.items) {
      if (it.type === "case" || it.type === "default") {
        if (started) pushSeg();
        started = true;
        if (it.type === "default") labels.push({ isDefault: true, segIdx: segs.length });
        else {
          let lo = it.lo ? foldConstInt(it.lo, this.cg.constEnv) : null;
          let hi = it.hi ? foldConstInt(it.hi, this.cg.constEnv) : null;
          // Non-constant case value: keep the AST node for a runtime compare.
          const loExpr = (lo == null && it.lo) ? it.lo : null;
          if (lo == null && !loExpr) { lo = prev + 1n; }        // empty `case:` auto-number
          if (it.hi && hi == null) hi = lo;                      // unfoldable range hi -> single
          if (!it.hi) hi = lo;
          if (lo != null) prev = (hi != null ? hi : lo);
          labels.push({ isDefault: false, lo, hi, loExpr, segIdx: segs.length });
        }
      } else if (it.type === "start" || it.type === "end") {
        // sub-switch markers: treated as plain fall-through points (limited)
      } else if (it.type === "stmt") {
        if (!started) { /* statements before first label: rare; ignore */ }
        else cur.push(it.stmt);
      }
    }
    if (started) pushSeg();

    if (labels.length === 0) { for (const st of segs.flat()) this.genStmt(st); return; }

    const disc = this.scratchI64();
    this.genExprCoerce(s.disc, T.I64); this.f.local_set(disc);

    const brk = this.pushCtrl(); this.f.block();   // break target (outermost)
    // open one block per segment, innermost = seg0
    const segMarks = [];
    for (let i = segs.length - 1; i >= 0; i--) { segMarks[i] = this.pushCtrl(); this.f.block(); }
    // dispatch (inside innermost = seg0 block)
    const defLabel = labels.find((l) => l.isDefault);
    const defDst = defLabel ? segMarks[defLabel.segIdx] : brk;
    // Fast path: a dense block of constant integer cases compiles to an O(1) br_table (jump table)
    // instead of an O(n) compare chain — critical for big dispatchers like the CPU opcode switch.
    const cst = labels.filter((l) => !l.isDefault);
    const dense = cst.length > 1 && cst.every((l) => l.lo != null && !l.loExpr);
    let blo, bhi;
    if (dense) {
      blo = cst[0].lo; bhi = cst[0].hi != null ? cst[0].hi : cst[0].lo;
      for (const l of cst) { const a = l.lo, b = l.hi != null ? l.hi : l.lo; if (a < blo) blo = a; if (b > bhi) bhi = b; }
    }
    if (dense && bhi - blo >= 0n && bhi - blo <= 1024n) {
      const N = Number(bhi - blo) + 1;
      const dflt = this.rel(defDst);
      const table = new Array(N).fill(dflt);
      for (const l of cst) {
        const a = Number(l.lo - blo), b = Number((l.hi != null ? l.hi : l.lo) - blo);
        const d = this.rel(segMarks[l.segIdx]);
        for (let v = a; v <= b; v++) table[v] = d;
      }
      this.f.local_get(disc); this.f.i64_const(blo); this.f.op("i64_lt_s"); this.f.br_if(this.rel(defDst));
      this.f.local_get(disc); this.f.i64_const(bhi); this.f.op("i64_gt_s"); this.f.br_if(this.rel(defDst));
      this.f.local_get(disc); this.f.i64_const(blo); this.f.op("i64_sub"); this.f.op("i32_wrap_i64");
      this.f.br_table(table, dflt);
    } else {
      for (const lab of labels) {
        if (lab.isDefault) continue;
        if (lab.loExpr) {
          // runtime case value: disc == <expr>
          this.f.local_get(disc);
          this.genExprCoerce(lab.loExpr, T.I64);
          this.f.op("i64_eq");
        } else if (lab.lo === lab.hi) {
          this.f.local_get(disc);
          this.f.i64_const(lab.lo).op("i64_eq");
        } else {
          // lo <= disc <= hi
          this.f.local_get(disc).i64_const(lab.lo).op("i64_ge_s");
          this.f.local_get(disc).i64_const(lab.hi).op("i64_le_s");
          this.f.op("i32_and");
        }
        this.f.br_if(this.rel(segMarks[lab.segIdx]));
      }
      this.f.br(this.rel(defDst));
    }
    // segment bodies
    this.loops.push({ brk, cont: brk }); // break works; continue maps to break (no loop)
    for (let i = 0; i < segs.length; i++) {
      this.f.end(); this.popCtrl(); // close segMark[i]
      for (const st of segs[i]) this.genStmt(st);
    }
    this.loops.pop();
    this.f.end(); this.popCtrl(); // brk
  }

  // ================================================== conditions
  genCond(node) {
    // leave i32 (1 if true)
    if (node.kind === "Unary" && node.op === "!") { this.genCond(node.operand); this.f.op("i32_eqz"); return; }
    const t = this.genExpr(node);
    if (isFloat(t)) { this.f.f64_const(0).op("f64_ne"); }
    else { this.f.i64_const(0).op("i64_ne"); }
  }

  dropIfValue(t) { if (t && !isVoid(t)) this.f.drop(); }

  // ================================================== print
  genPrint(s) {
    const fmtAddr = this.cg.internBytes(s.bytes, true);
    let n = 0;
    for (const arg of s.args) {
      if (arg == null) continue;
      if (n >= 64) { this.dropIfValue(this.genExpr(arg)); continue; } // ARG_MAX guard
      const slot = ARG_BUF + n * ARG_SLOT;
      // Decide float vs int from the value we actually push (robust to void).
      const valLocalI = this.scratchI64();
      const valLocalF = this.scratchF64();
      const at = this.cg.resolveType(this.genExpr(arg));
      let isF;
      if (isVoid(at)) { this.f.i64_const(0); isF = false; }
      else if (isFloat(at)) { this.f.local_set(valLocalF); isF = true; }
      else { isF = false; this.f.local_set(valLocalI); }
      // store tag
      this.f.i32_const(slot); this.f.i64_const(isF ? TAG_FLT : TAG_INT); this.emitRawStore("i64_store", 0);
      // store value
      this.f.i32_const(slot + 8);
      if (isF) { this.f.local_get(valLocalF); this.emitRawStore("f64_store", 0); }
      else { this.f.local_get(valLocalI); this.emitRawStore("i64_store", 0); }
      n++;
    }
    this.f.i64_const(fmtAddr); this.f.i64_const(n); this.f.call(this.cg.imports.__printf.index);
  }

  genPutChars(bytes) {
    // print up to N raw bytes
    const addr = this.cg.internBytes(bytes, false);
    this.f.i64_const(addr); this.f.i64_const(bytes.length); this.f.call(this.cg.imports.__print_bytes.index);
  }

  // ================================================== expressions
  // genExpr pushes a value and returns its HolyC type
  genExpr(node) {
    switch (node.kind) {
      case "IntLit": this.f.i64_const(node.value); return T.I64;
      case "FloatLit": this.f.f64_const(node.value); return T.F64;
      case "CharLit": this.f.i64_const(node.value); return T.I64;
      case "StrLit": { const a = this.cg.internBytes(node.bytes, true); this.f.i64_const(a); return ptrTo(T.U8); }
      case "Ident": return this.genIdent(node);
      case "Assign": return this.genAssign(node);
      case "Binary": return this.genBinary(node);
      case "Logical": return this.genLogical(node);
      case "Unary": return this.genUnary(node);
      case "Postfix": return this.genPostfix(node);
      case "Cond": return this.genCondExpr(node);
      case "Call": return this.genCall(node);
      case "Index": return this.genLoadLValue(node);
      case "Member": return this.genLoadLValue(node);
      case "Cast": { const t = this.genExpr(node.operand); return this.coerce(t, this.cg.resolveType(node.type)); }
      case "Sizeof": { let sz = node.type ? this.cg.typeSize(this.cg.resolveType(node.type)) : this.cg.typeSize(this.peekType(node.expr)); if (!Number.isFinite(sz)) sz = 8; this.f.i64_const(sz); return T.I64; }
      default: this.err(node, "unsupported expression " + node.kind);
    }
  }

  // Static type of an expression without emitting code (best-effort).
  peekType(node) {
    switch (node.kind) {
      case "IntLit": case "CharLit": return T.I64;
      case "FloatLit": return T.F64;
      case "StrLit": return ptrTo(T.U8);
      case "Ident": {
        const L = this.locals.get(node.name); if (L) return this.cg.resolveType(L.type);
        const G = this.cg.globals.get(node.name); if (G) return G.type;
        const fn = this.cg.functions.get(node.name); if (fn) return fn.retType;
        if (node.name in this.cg.constEnv) return T.I64;
        return T.I64;
      }
      case "Cast": return this.cg.resolveType(node.type);
      case "Binary": {
        if (node.op === "`") return T.F64;
        const a = this.peekType(node.left), b = this.peekType(node.right);
        if ([">","<",">=","<=","==","!="].includes(node.op)) return T.I64;
        return binResultType(a, b);
      }
      case "Logical": return T.I64;
      case "Unary": {
        if (node.op === "&") return ptrTo(this.peekType(node.operand));
        if (node.op === "*") { const t = this.peekType(node.operand); return isPtr(t) || isArray(t) ? elemType(t) : T.I64; }
        if (node.op === "!") return T.I64;
        return this.peekType(node.operand);
      }
      case "Postfix": return this.peekType(node.operand);
      case "Assign": return this.peekType(node.target);
      case "Cond": return this.peekType(node.then);
      case "Call": {
        const callee = node.callee;
        if (callee.kind === "Ident") { const fn = this.cg.functions.get(callee.name); if (fn) return fn.retType; }
        return T.I64;
      }
      case "Index": { const bt = this.peekType(node.base); return elemType(bt) || T.I64; }
      case "Member": return this.memberType(node);
      case "Sizeof": return T.I64;
      default: return T.I64;
    }
  }

  memberType(node) {
    let bt = this.peekType(node.base);
    if (node.arrow && isPtr(bt)) bt = bt.to;
    bt = this.cg.resolveType(bt);
    if (isInt(bt) && node.name in UNION_MEMBERS && !node.arrow) {
      const sub = UNION_MEMBERS[node.name];
      return arrayOf(sub, Math.max(1, sizeof(bt) / sizeof(sub)));
    }
    const lookup = (cls) => {
      if (!isClass(cls) || !this.cg.classes.has(cls.name)) return T.I64;
      const layout = this.cg.layoutClass(cls.name);
      const f = layout.fields.get(node.name);
      return f ? f.type : T.I64;
    };
    if (isClass(bt)) return lookup(bt);
    if (isPtr(bt)) return lookup(this.cg.resolveType(bt.to));
    return T.I64;
  }

  genIdent(node) {
    const L = this.locals.get(node.name);
    if (L) {
      if (L.kind === "wlocal") { this.f.local_get(L.windex); return this.cg.resolveType(L.type); }
      if (L.kind === "reflocal") { this.f.local_get(L.windex); return this.cg.resolveType(L.type); }
      // slot
      const t = this.cg.resolveType(L.type);
      if (isAggregate(t)) { this.pushSlotAddr(L); return t; } // value is address
      this.pushSlotAddr(L); this.f.op("i32_wrap_i64"); this.emitLoad(t); return t;
    }
    const G = this.cg.globals.get(node.name);
    if (G) {
      const t = G.type;
      if (isAggregate(t)) { this.f.i64_const(G.addr); return t; }
      this.f.i64_const(G.addr); this.f.op("i32_wrap_i64"); this.emitLoad(t); return t;
    }
    if (node.name in this.cg.constEnv) { this.f.i64_const(this.cg.constEnv[node.name]); return T.I64; }
    const fn = this.cg.functions.get(node.name);
    if (fn) { return this.emitCall(fn, [], node); } // no-paren call
    // Unknown symbol: in lenient mode it becomes a global I64 (kernel
    // global/constant we don't model) so the program still compiles & runs.
    if (this.cg.lenient) {
      const g = this.cg.lenientGlobal(node.name);
      this.f.i64_const(g); this.f.op("i32_wrap_i64"); this.emitLoad(T.I64);
      return T.I64;
    }
    this.err(node, "undefined symbol '" + node.name + "'");
  }

  // address of an lvalue: pushes i64 addr, returns pointee type
  genAddr(node) {
    switch (node.kind) {
      case "Ident": {
        const L = this.locals.get(node.name);
        if (L) {
          if (L.kind === "slot") { this.pushSlotAddr(L); return this.cg.resolveType(L.type); }
          if (L.kind === "reflocal") { this.f.local_get(L.windex); return this.cg.resolveType(L.type); }
          this.err(node, "cannot take address of register local '" + node.name + "'");
        }
        const G = this.cg.globals.get(node.name);
        if (G) { this.f.i64_const(G.addr); return G.type; }
        if (this.cg.lenient) { this.f.i64_const(this.cg.lenientGlobal(node.name)); return T.I64; }
        this.err(node, "cannot address undefined '" + node.name + "'");
      }
      case "Unary": if (node.op === "*") { const t = this.genExpr(node.operand); return isPtr(t) || isArray(t) ? elemType(t) : T.I64; } break;
      case "Index": return this.genIndexAddr(node);
      case "Member": return this.genMemberAddr(node);
    }
    if (this.cg.lenient) {
      // Not an lvalue (e.g. result of an expression used as a write target in
      // code we don't fully model): evaluate for side effects, point writes at
      // a junk cell so the store is harmless.
      const t = this.genExpr(node); this.dropIfValue(t);
      this.f.i64_const(JUNK_ADDR);
      return T.I64;
    }
    this.err(node, "not an lvalue: " + node.kind);
  }

  genIndexAddr(node) {
    let bt = this.peekType(node.base);
    bt = this.cg.resolveType(bt);
    let elemT;
    if (isArray(bt)) { this.genAddr(node.base); elemT = bt.of; }
    else if (isPtr(bt)) { this.genExpr(node.base); elemT = bt.to; }
    else { // fallback treat as i64*
      this.genExpr(node.base); elemT = T.I64;
    }
    const esz = this.cg.typeSize(elemT);
    this.genExprCoerce(node.index, T.I64);
    if (esz !== 1) this.f.i64_const(esz).op("i64_mul");
    this.f.op("i64_add");
    return elemT;
  }

  // Look up a class field; in lenient mode return a default {offset:0,type:I64}
  // when the base isn't a known class so member access on opaque kernel values
  // never aborts compilation.
  fieldOf(cls, name) {
    cls = this.cg.resolveType(cls);
    if (isClass(cls) && this.cg.classes.has(cls.name)) return this.cg.classField(cls, name);
    if (this.cg.lenient) { this.cg.warnOnceCg(`member '.${name}' on non-class value; offset 0`); return { offset: 0, type: T.I64 }; }
    throw new CodegenError(`member access '.${name}' on non-class type`);
  }

  genMemberAddr(node) {
    let bt = this.peekType(node.base);
    if (node.arrow) {
      bt = this.cg.resolveType(bt);
      const cls = isPtr(bt) ? this.cg.resolveType(bt.to) : bt;
      this.genExpr(node.base); // pointer value (base address)
      const fld = this.fieldOf(cls, node.name);
      if (fld.offset) this.f.i64_const(fld.offset).op("i64_add");
      return fld.type;
    }
    bt = this.cg.resolveType(bt);
    if (isInt(bt) && node.name in UNION_MEMBERS) {
      // union sub-access: base must be addressable
      this.genAddr(node.base);
      const sub = UNION_MEMBERS[node.name];
      return arrayOf(sub, Math.max(1, sizeof(bt) / sizeof(sub)));
    }
    if (isPtr(bt)) { // allow . on pointer too (lenient)
      const cls = this.cg.resolveType(bt.to);
      this.genExpr(node.base);
      const fld = this.fieldOf(cls, node.name);
      if (fld.offset) this.f.i64_const(fld.offset).op("i64_add");
      return fld.type;
    }
    // class (or lenient opaque) lvalue
    this.genAddr(node.base);
    const fld = this.fieldOf(bt, node.name);
    if (fld.offset) this.f.i64_const(fld.offset).op("i64_add");
    return fld.type;
  }

  genLoadLValue(node) {
    const t = this.genAddr(node);
    const rt = this.cg.resolveType(t);
    if (isAggregate(rt)) return rt; // address is the value
    this.f.op("i32_wrap_i64");
    this.emitLoad(rt);
    return rt;
  }

  genAssign(node) {
    const op = node.op;
    // target is Ident wlocal?
    if (node.target.kind === "Ident") {
      const L = this.locals.get(node.target.name);
      if (L && L.kind === "wlocal") {
        const t = this.cg.resolveType(L.type);
        if (op === "=") { this.genExprCoerce(node.value, t); this.f.local_tee(L.windex); return t; }
        // compound: local = (local OP value), with correct types throughout
        const base = op.slice(0, -1);
        const vt = this.combineToValue(base, () => this.f.local_get(L.windex), t, node.value);
        this.coerce(vt, t);
        this.f.local_tee(L.windex);
        return t;
      }
    }
    // memory lvalue
    const t = this.cg.resolveType(this.genAddr(node.target)); // pushes addr (i64)
    const addr = this.scratchI32();
    this.f.op("i32_wrap_i64").local_set(addr);
    if (op === "=") {
      this.f.local_get(addr);
      this.genExprCoerce(node.value, t);
      // duplicate value for result via scratch
      const res = isFloat(t) ? this.scratchF64() : this.scratchI64();
      this.f.local_tee(res);
      this.emitStore(t);
      this.f.local_get(res);
      return t;
    } else {
      const base = op.slice(0, -1);
      this.f.local_get(addr); // address for the eventual store
      const vt = this.combineToValue(base, () => { this.f.local_get(addr); this.emitLoad(t); }, t, node.value);
      this.coerce(vt, t);
      const res = isFloat(t) ? this.scratchF64() : this.scratchI64();
      this.f.local_tee(res);
      this.emitStore(t);
      this.f.local_get(res);
      return t;
    }
  }

  // Push (leftValue OP rightValue) with type-correct conversions. `pushLeft`
  // emits the current left value (of type leftType); `valueNode` is the rhs AST.
  // Returns the HolyC result type (F64 for float arithmetic, else I64).
  combineToValue(base, pushLeft, leftType, valueNode) {
    const lr = this.cg.resolveType(leftType);
    const rPeek = this.cg.resolveType(this.peekType(valueNode));
    const floatArith = (isFloat(lr) || isFloat(rPeek)) && (base === "+" || base === "-" || base === "*" || base === "/");
    if (floatArith) {
      pushLeft();
      if (!isFloat(lr)) this.f.op(isUnsigned(lr) ? "f64_convert_i64_u" : "f64_convert_i64_s");
      this.genExprCoerce(valueNode, T.F64);
      this.floatOp(base);
      return T.F64;
    }
    pushLeft();
    if (isFloat(lr)) this.f.fc("i64_trunc_sat_f64_s");
    this.genExprCoerce(valueNode, T.I64);
    this.intOp(base, isUnsigned(lr));
    return T.I64;
  }

  genBinary(node) {
    if (node.op === "`") {
      // power -> __pow(f64,f64)
      this.genExprCoerce(node.left, T.F64);
      this.genExprCoerce(node.right, T.F64);
      this.f.call(this.cg.imports.__pow.index);
      return T.F64;
    }
    const lt = this.peekType(node.left);
    const rt = this.peekType(node.right);
    // pointer arithmetic
    const lr = this.cg.resolveType(lt), rr = this.cg.resolveType(rt);
    if ((node.op === "+" || node.op === "-") && (isPtr(lr) || isArray(lr)) && isInt(rr)) {
      const elemT = elemType(lr); const esz = this.cg.typeSize(elemT);
      this.genExpr(node.left);
      this.genExprCoerce(node.right, T.I64);
      if (esz !== 1) this.f.i64_const(esz).op("i64_mul");
      this.f.op(node.op === "+" ? "i64_add" : "i64_sub");
      return ptrTo(elemT);
    }
    const useFloat = isFloat(lr) || isFloat(rr);
    // Float arithmetic applies ONLY to + - * / ; %, <<, >>, &, |, ^ are
    // integer-only and truncate any float operand to i64 first.
    const FLOAT_ARITH = node.op === "+" || node.op === "-" || node.op === "*" || node.op === "/";
    if (useFloat && FLOAT_ARITH) {
      this.genExprCoerce(node.left, T.F64);
      this.genExprCoerce(node.right, T.F64);
      this.floatOp(node.op);
      return T.F64;
    }
    if (isCmp(node.op)) {
      if (useFloat) {
        this.genExprCoerce(node.left, T.F64);
        this.genExprCoerce(node.right, T.F64);
        this.floatCmp(node.op);
      } else {
        this.genExprCoerce(node.left, T.I64);
        this.genExprCoerce(node.right, T.I64);
        const unsigned = isUnsigned(lr) && isUnsigned(rr);
        this.intCmp(node.op, unsigned);
      }
      this.f.op("i64_extend_i32_u");
      return T.I64;
    }
    // integer op (coerce truncates any float operand)
    this.genExprCoerce(node.left, T.I64);
    this.genExprCoerce(node.right, T.I64);
    this.intOp(node.op, (isUnsigned(lr) && isUnsigned(rr)) || isUnsigned(lr));
    // Propagate unsignedness (C "usual arithmetic conversions"): if either
    // operand is unsigned the result is unsigned, so a following comparison
    // (e.g. carry detection `(r & m) < (a & m)`) is done unsigned, not signed.
    return (isUnsigned(lr) || isUnsigned(rr)) ? T.U64 : T.I64;
  }

  intOp(op, unsigned) {
    switch (op) {
      case "+": this.f.op("i64_add"); break;
      case "-": this.f.op("i64_sub"); break;
      case "*": this.f.op("i64_mul"); break;
      case "/": this.f.op(unsigned ? "i64_div_u" : "i64_div_s"); break;
      case "%": this.f.op(unsigned ? "i64_rem_u" : "i64_rem_s"); break;
      case "&": this.f.op("i64_and"); break;
      case "|": this.f.op("i64_or"); break;
      case "^": this.f.op("i64_xor"); break;
      case "<<": this.f.op("i64_shl"); break;
      case ">>": this.f.op(unsigned ? "i64_shr_u" : "i64_shr_s"); break;
      default: this.err({}, "bad int op " + op);
    }
  }
  floatOp(op) {
    switch (op) {
      case "+": this.f.op("f64_add"); break;
      case "-": this.f.op("f64_sub"); break;
      case "*": this.f.op("f64_mul"); break;
      case "/": this.f.op("f64_div"); break;
      default: this.err({}, "bad float op " + op);
    }
  }
  intCmp(op, unsigned) {
    const u = unsigned;
    switch (op) {
      case "<": this.f.op(u ? "i64_lt_u" : "i64_lt_s"); break;
      case ">": this.f.op(u ? "i64_gt_u" : "i64_gt_s"); break;
      case "<=": this.f.op(u ? "i64_le_u" : "i64_le_s"); break;
      case ">=": this.f.op(u ? "i64_ge_u" : "i64_ge_s"); break;
      case "==": this.f.op("i64_eq"); break;
      case "!=": this.f.op("i64_ne"); break;
    }
  }
  floatCmp(op) {
    switch (op) {
      case "<": this.f.op("f64_lt"); break;
      case ">": this.f.op("f64_gt"); break;
      case "<=": this.f.op("f64_le"); break;
      case ">=": this.f.op("f64_ge"); break;
      case "==": this.f.op("f64_eq"); break;
      case "!=": this.f.op("f64_ne"); break;
    }
  }

  genLogical(node) {
    // short-circuit; result i64 0/1
    this.genCond(node.left); // i32
    const m = this.pushCtrl(); this.f.if_(VT.i64);
    if (node.op === "&&") {
      this.genCond(node.right); this.f.op("i64_extend_i32_u");
      this.f.else_(); this.f.i64_const(0);
    } else {
      this.f.i64_const(1);
      this.f.else_(); this.genCond(node.right); this.f.op("i64_extend_i32_u");
    }
    this.f.end(); this.popCtrl();
    return T.I64;
  }

  genCondExpr(node) {
    const rt = this.peekType(node.then);
    const wantFloat = isFloat(this.cg.resolveType(rt)) || isFloat(this.cg.resolveType(this.peekType(node.else)));
    this.genCond(node.cond);
    const m = this.pushCtrl(); this.f.if_(wantFloat ? VT.f64 : VT.i64);
    this.genExprCoerce(node.then, wantFloat ? T.F64 : T.I64);
    this.f.else_();
    this.genExprCoerce(node.else, wantFloat ? T.F64 : T.I64);
    this.f.end(); this.popCtrl();
    return wantFloat ? T.F64 : T.I64;
  }

  genUnary(node) {
    if (node.op === "&") {
      // address-of; function name -> id constant
      if (node.operand.kind === "Ident") {
        const fn = this.cg.functions.get(node.operand.name);
        if (fn && !this.locals.has(node.operand.name) && !this.cg.globals.has(node.operand.name)) {
          this.f.i64_const(fn.index); return ptrTo(T.U0);
        }
      }
      const t = this.genAddr(node.operand);
      return ptrTo(t);
    }
    if (node.op === "*") {
      const t = this.genExpr(node.operand);
      const rt = this.cg.resolveType(t);
      const et = isPtr(rt) || isArray(rt) ? elemType(rt) : T.I64;
      if (isAggregate(this.cg.resolveType(et))) return et;
      this.f.op("i32_wrap_i64"); this.emitLoad(this.cg.resolveType(et));
      return et;
    }
    if (node.op === "!") { this.genCond(node.operand); this.f.op("i32_eqz").op("i64_extend_i32_u"); return T.I64; }
    if (node.op === "++" || node.op === "--") return this.genIncDec(node.operand, node.op, true);
    // - ~ +
    const t = this.genExpr(node.operand);
    const rt = this.cg.resolveType(t);
    if (node.op === "-") { if (isFloat(rt)) this.f.op("f64_neg"); else { this.f.i64_const(-1).op("i64_mul"); } return rt; }
    if (node.op === "~") { this.coerceTopTo(T.I64); this.f.i64_const(-1).op("i64_xor"); return T.I64; }
    if (node.op === "+") return rt;
    this.err(node, "bad unary " + node.op);
  }

  genPostfix(node) {
    return this.genIncDec(node.operand, node.op, false);
  }

  genIncDec(target, op, prefix) {
    const delta = op === "++" ? 1 : -1;
    if (target.kind === "Ident") {
      const L = this.locals.get(target.name);
      if (L && L.kind === "wlocal") {
        const t = this.cg.resolveType(L.type);
        if (isFloat(t)) {
          if (prefix) { this.f.local_get(L.windex).f64_const(delta).op("f64_add").local_tee(L.windex); }
          else { this.f.local_get(L.windex); this.f.local_get(L.windex).f64_const(delta).op("f64_add").local_set(L.windex); }
        } else {
          if (prefix) { this.f.local_get(L.windex).i64_const(delta).op("i64_add").local_tee(L.windex); }
          else { this.f.local_get(L.windex); this.f.local_get(L.windex).i64_const(delta).op("i64_add").local_set(L.windex); }
        }
        return t;
      }
    }
    // memory lvalue
    const t = this.cg.resolveType(this.genAddr(target));
    const addr = this.scratchI32(); this.f.op("i32_wrap_i64").local_set(addr);
    const isF = isFloat(t);
    const res = isF ? this.scratchF64() : this.scratchI64();
    // old value
    this.f.local_get(addr); this.emitLoad(t); this.f.local_tee(res);
    // new value = old + delta
    if (isF) this.f.f64_const(delta).op("f64_add"); else this.f.i64_const(delta).op("i64_add");
    const nv = isF ? this.scratchF64b() : this.scratchI64b();
    this.f.local_set(nv);           // consume the computed value into nv (no stack leak)
    // store new
    this.f.local_get(addr); this.f.local_get(nv); this.emitStore(t);
    // result
    this.f.local_get(prefix ? nv : res);
    return t;
  }
  scratchI64b() { return this.scratch.i64b ??= this.newWLocal(VT.i64); }
  scratchF64b() { return this.scratch.f64b ??= this.newWLocal(VT.f64); }

  // ================================================== calls
  genCall(node) {
    const callee = node.callee;
    if (callee.kind === "Ident") {
      const fn = this.cg.functions.get(callee.name);
      if (fn) return this.emitCall(fn, node.args, node);
      // maybe a function-pointer variable -> unsupported indirect
      this.warnOnce("indirect/function-pointer call to '" + callee.name + "' not supported");
      // evaluate args for side effects then push 0
      for (const a of node.args) if (a) this.dropIfValue(this.genExpr(a));
      this.f.i64_const(0); return T.I64;
    }
    this.warnOnce("computed callee not supported");
    this.f.i64_const(0); return T.I64;
  }

  emitCall(fn, args, node) {
    const params = fn.params || [];
    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      const provided = args[i];
      const pType = this.cg.resolveType(p.type);
      if (provided != null) {
        this.genExprCoerce(provided, pType);
      } else if (p.default != null) {
        this.genExprCoerce(p.default, pType);
      } else {
        // missing arg, no default -> 0
        if (isFloat(pType)) this.f.f64_const(0); else this.f.i64_const(0);
      }
    }
    // extra args beyond params (varargs) — only meaningful for known variadics; drop
    for (let i = params.length; i < args.length; i++) { if (args[i]) this.dropIfValue(this.genExpr(args[i])); }
    this.f.call(fn.index);
    return fn.retType;
  }

  // ================================================== coercion / load / store
  genExprCoerce(node, wantType) {
    const t = this.genExpr(node);
    return this.coerce(t, wantType);
  }
  coerce(curType, wantType) {
    const c = this.cg.resolveType(curType), w = this.cg.resolveType(wantType);
    if (isVoid(w)) { if (!isVoid(c)) this.f.drop(); return w; }
    if (isVoid(c)) { // value of a void expr used where a value is needed -> 0
      if (isFloat(w)) this.f.f64_const(0); else this.f.i64_const(0);
      return w;
    }
    const cF = isFloat(c), wF = isFloat(w);
    if (cF && wF) return w;
    if (!cF && !wF) { this.narrowInt(w); return w; }
    if (!cF && wF) { this.f.op(isUnsigned(c) ? "f64_convert_i64_u" : "f64_convert_i64_s"); return w; }
    // cF && !wF
    this.f.fc("i64_trunc_sat_f64_s"); this.narrowInt(w); return w;
  }
  coerceTopTo(wantType) { /* value already correct width-ish; ensure narrow */ this.narrowInt(this.cg.resolveType(wantType)); }
  narrowInt(w) {
    if (!isInt(w)) return;
    const bits = w.bits;
    if (bits >= 64) return;
    if (w.signed) {
      if (bits === 8) this.f.op("i64_extend8_s");
      else if (bits === 16) this.f.op("i64_extend16_s");
      else if (bits === 32) this.f.op("i64_extend32_s");
    } else {
      const mask = (1n << BigInt(bits)) - 1n;
      this.f.i64_const(mask).op("i64_and");
    }
  }

  emitLoad(t) {
    let rt = this.cg.resolveType(t);
    if (isAggregate(rt)) rt = T.I64; // aggregates handled by address; load as i64 word
    const { op } = loadOp(rt);
    this.emitRawLoad(op, 0);
  }
  emitStore(t) {
    let rt = this.cg.resolveType(t);
    if (isAggregate(rt)) rt = T.I64; // store the pointer-width word
    const op = storeOp(rt);
    this.emitRawStore(op, 0);
  }
  emitRawLoad(op, off) { this.f.load(op, off, 0); }
  emitRawStore(op, off) { this.f.store(op, off, 0); }
}

function isCmp(op) { return [">","<",">=","<=","==","!="].includes(op); }
function isUnsigned(t) { return t && t.kind === "int" && !t.signed; }
