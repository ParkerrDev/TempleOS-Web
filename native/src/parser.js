// parser.js — recursive-descent + Pratt parser for HolyC.
import { mk } from "./ast.js";
import { BASE_TYPES, ptrTo, arrayOf } from "./types.js";

const STORAGE = new Set([
  "public", "extern", "import", "_extern", "static", "reg", "noreg",
  "interrupt", "haserrcode", "argpop", "noargpop", "private",
]);

const ASSIGN_OPS = new Set(["=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>="]);
const RELOPS = new Set(["<", ">", "<=", ">="]);

export class Parser {
  constructor(tokens, filename = "<src>", opts = {}) {
    this.toks = tokens;
    this.i = 0;
    this.filename = filename;
    this.opts = opts;
    this.typeNames = new Set(Object.keys(BASE_TYPES));
    this.classes = new Map(); // name -> ClassDecl
  }

  // --- token helpers ---
  peek(k = 0) { return this.toks[this.i + k]; }
  cur() { return this.toks[this.i]; }
  next() { return this.toks[this.i++]; }
  atEnd() { return this.cur().type === "eof"; }
  err(msg, tok = this.cur()) {
    throw new Error(`${this.filename}:${tok.line}:${tok.col}: parse error: ${msg} (near '${tok.text}')`);
  }
  isP(v, k = 0) { const t = this.peek(k); return t.type === "punct" && t.value === v; }
  isKw(v, k = 0) { const t = this.peek(k); return t.type === "ident" && t.value === v; }
  eatP(v) { if (this.isP(v)) return this.next(); this.err(`expected '${v}'`); }
  optP(v) { if (this.isP(v)) { this.next(); return true; } return false; }
  isType(k = 0) {
    const t = this.peek(k);
    return t.type === "ident" && (this.typeNames.has(t.value) || t.value === "class" || t.value === "union");
  }

  // ====================================================================
  // Program
  // ====================================================================
  parseProgram() {
    const decls = [];
    const topStmts = [];
    this.diagnostics = [];
    while (!this.atEnd()) {
      const startIdx = this.i;
      try {
        if (this.isP(";")) { this.next(); continue; }
        // top-level inline asm block
        if (this.isKw("asm")) { this.parseAsmBlock(); continue; }
        // class/union declaration, possibly behind storage specifiers
        // (e.g. `public class Foo {...}` or forward decl `extern class Bar;`)
        let k = 0;
        while (this.peek(k).type === "ident" && STORAGE.has(this.peek(k).value)) k++;
        if (this.isKw("class", k) || this.isKw("union", k)) {
          for (let s = 0; s < k; s++) this.next(); // consume storage specifiers
          decls.push(this.parseClass());
          continue;
        }
        // declaration vs statement
        if (this.looksLikeDecl()) {
          const d = this.parseDeclaration(true);
          if (Array.isArray(d)) decls.push(...d); else decls.push(d);
        } else {
          topStmts.push(this.parseStatement());
        }
      } catch (e) {
        if (!this.opts || !this.opts.resilient) throw e;
        this.diagnostics.push(e.message);
        // recover: skip to the next top-level boundary so one bad construct
        // doesn't sink the whole file.
        if (this.i === startIdx) this.next();
        this.resyncTopLevel();
      }
    }
    return mk("Program", { decls, topStmts, diagnostics: this.diagnostics });
  }

  // After a parse error in resilient mode, advance to a plausible restart point:
  // the next ';' or the end of the next balanced '{...}' at depth 0.
  resyncTopLevel() {
    let depth = 0;
    while (!this.atEnd()) {
      if (this.isP("{")) { depth++; this.next(); continue; }
      if (this.isP("}")) { if (depth > 0) depth--; this.next(); if (depth === 0) return; continue; }
      if (depth === 0 && this.isP(";")) { this.next(); return; }
      this.next();
    }
  }

  looksLikeDecl() {
    let k = 0;
    // skip storage specifiers
    while (this.peek(k).type === "ident" && STORAGE.has(this.peek(k).value)) k++;
    const t = this.peek(k);
    if (t.type !== "ident") return false;
    if (t.value === "class" || t.value === "union") return true;
    return this.typeNames.has(t.value);
  }

  // ====================================================================
  // Class / union
  // ====================================================================
  parseClass() {
    const kw = this.next(); // class|union
    const isUnion = kw.value === "union";
    let name = null;
    if (this.cur().type === "ident") name = this.next().value;
    let base = null;
    if (this.optP(":")) { base = this.next().value; }
    // forward declaration: `class Name;` (no body) — register the name only.
    if (this.isP(";")) {
      this.next();
      if (name) this.typeNames.add(name);
      const fwd = mk("ClassDecl", { name, base, members: [], isUnion, forward: true }, kw);
      if (name) this.classes.set(name, fwd);
      return fwd;
    }
    const members = [];
    this.eatP("{");
    while (!this.isP("}") && !this.atEnd()) {
      // member declaration: Type [*] name [array] ... ;
      const baseType = this.parseTypeSpec();
      do {
        let mt = baseType;
        while (this.optP("*")) mt = ptrTo(mt);
        const mname = this.cur().type === "ident" ? this.next().value : null;
        const dims = [];
        while (this.isP("[")) { this.next(); dims.push(this.parseConstIntish()); this.eatP("]"); }
        for (let d = dims.length - 1; d >= 0; d--) mt = arrayOf(mt, dims[d]);
        // bitfield ': n' -> ignore width, treat as scalar
        if (this.optP(":")) { this.parseConstIntish(); }
        if (mname) members.push({ name: mname, type: mt });
      } while (this.optP(","));
      this.optP(";");
    }
    this.eatP("}");
    const node = mk("ClassDecl", { name, base, members, isUnion }, kw);
    if (name) { this.typeNames.add(name); this.classes.set(name, node); }
    // optional trailing variable declarators: } a, b;
    const vars = [];
    if (!this.isP(";")) {
      do {
        let vt = name ? { kind: "classref", name } : node;
        while (this.optP("*")) vt = ptrTo(vt);
        if (this.cur().type === "ident") {
          const vn = this.next().value;
          const dims = [];
          while (this.isP("[")) { this.next(); dims.push(this.parseConstIntish()); this.eatP("]"); }
          for (let d = dims.length - 1; d >= 0; d--) vt = arrayOf(vt, dims[d]);
          let init = null;
          if (this.optP("=")) init = this.parseInitializer();
          vars.push(mk("VarDecl", { name: vn, type: vt, init, storage: [] }));
        }
      } while (this.optP(","));
    }
    this.optP(";");
    node.vars = vars;
    return node;
  }

  parseConstIntish() {
    // allow a constant expression for array dims / bitfields; evaluate simple ints
    const e = this.parseConditional();
    return e; // resolved later by codegen (foldConst)
  }

  // ====================================================================
  // Type specifier
  // ====================================================================
  parseTypeSpec() {
    // returns a Type (may be {kind:'classref',name} for not-yet-resolved classes)
    while (this.peek().type === "ident" && STORAGE.has(this.peek().value)) this.next();
    const t = this.cur();
    if (t.type !== "ident") this.err("expected type");
    const name = this.next().value;
    if (BASE_TYPES[name]) return BASE_TYPES[name];
    return { kind: "classref", name };
  }

  // ====================================================================
  // Declarations (functions + variables)
  // ====================================================================
  parseDeclaration(topLevel) {
    const storage = [];
    while (this.peek().type === "ident" && STORAGE.has(this.peek().value)) storage.push(this.next().value);

    const baseType = this.parseTypeSpec();

    // First declarator
    let ptr = 0;
    while (this.optP("*")) ptr++;
    const nameTok = this.cur();
    if (nameTok.type !== "ident") this.err("expected declarator name");
    const name = this.next().value;

    // function?
    if (this.isP("(")) {
      return this.parseFunction(storage, baseType, ptr, name, nameTok);
    }

    // variable declarator list
    const decls = [];
    let first = true;
    while (true) {
      let dptr = first ? ptr : 0;
      let dname = name;
      if (!first) {
        dptr = 0;
        while (this.optP("*")) dptr++;
        dname = this.next().value;
      }
      let type = baseType;
      for (let p = 0; p < dptr; p++) type = ptrTo(type);
      const dims = [];
      while (this.isP("[")) { this.next(); if (this.isP("]")) { dims.push(null); } else dims.push(this.parseConstIntish()); this.eatP("]"); }
      for (let d = dims.length - 1; d >= 0; d--) type = arrayOf(type, dims[d]);
      let init = null;
      if (this.optP("=")) init = this.parseInitializer();
      decls.push(mk("VarDecl", { name: dname, type, init, storage }, nameTok));
      first = false;
      if (!this.optP(",")) break;
    }
    this.optP(";");
    return decls;
  }

  parseFunction(storage, retBase, ptr, name, tok) {
    let retType = retBase;
    for (let p = 0; p < ptr; p++) retType = ptrTo(retType);
    this.eatP("(");
    const params = [];
    let isVarArgs = false;
    if (!this.isP(")")) {
      do {
        if (this.isP("...")) { this.next(); isVarArgs = true; break; }
        // a param: Type [*] name [= default] ; allow unnamed
        const pbase = this.parseTypeSpec();
        let pp = 0; while (this.optP("*")) pp++;
        let pname = null;
        if (this.cur().type === "ident" && !this.isP("(")) pname = this.next().value;
        let ptype = pbase; for (let p = 0; p < pp; p++) ptype = ptrTo(ptype);
        const dims = [];
        while (this.isP("[")) { this.next(); if (!this.isP("]")) this.parseConstIntish(); this.eatP("]"); ptype = ptrTo(ptype); }
        let dflt = null;
        if (this.optP("=")) dflt = this.parseAssignment();
        params.push({ type: ptype, name: pname, default: dflt });
      } while (this.optP(","));
    }
    this.eatP(")");

    let body = null;
    if (this.isP("{")) {
      body = this.parseBlock();
    } else {
      this.optP(";"); // prototype
    }
    const fn = mk("FuncDecl", { name, retType, params, body, storage, isVarArgs }, tok);
    this.funcNamesAdd?.(name);
    return fn;
  }

  parseInitializer() {
    if (this.isP("{")) {
      const tok = this.next();
      const elements = [];
      if (!this.isP("}")) {
        do {
          if (this.isP("}")) break;
          elements.push(this.parseInitializer());
        } while (this.optP(","));
      }
      this.eatP("}");
      return mk("InitList", { elements }, tok);
    }
    return this.parseAssignment();
  }

  // ====================================================================
  // Statements
  // ====================================================================
  parseBlock() {
    const tok = this.eatP("{");
    const stmts = [];
    while (!this.isP("}") && !this.atEnd()) {
      stmts.push(this.parseStatement());
    }
    this.eatP("}");
    return mk("Block", { stmts }, tok);
  }

  parseStatement() {
    const t = this.cur();

    if (this.isP("{")) return this.parseBlock();
    if (this.isP(";")) { this.next(); return mk("Empty", {}, t); }

    // local declaration
    if (this.isKw("class") || this.isKw("union")) return this.parseClass();
    if (this.looksLikeDecl()) {
      const d = this.parseDeclaration(false);
      return mk("DeclStmt", { decls: Array.isArray(d) ? d : [d] }, t);
    }

    if (t.type === "ident") {
      switch (t.value) {
        case "asm": return this.parseAsmBlock();
        case "if": return this.parseIf();
        case "while": return this.parseWhile();
        case "do": return this.parseDoWhile();
        case "for": return this.parseFor();
        case "switch": return this.parseSwitch();
        case "return": { this.next(); let e = null; if (!this.isP(";")) e = this.parseExpression(); this.optP(";"); return mk("Return", { expr: e }, t); }
        case "break": this.next(); this.optP(";"); return mk("Break", {}, t);
        case "continue": this.next(); this.optP(";"); return mk("Continue", {}, t);
        case "goto": { this.next(); const lbl = this.next().value; this.optP(";"); return mk("Goto", { label: lbl }, t); }
        case "try": {
          this.next();
          const body = this.isP("{") ? this.parseBlock() : this.parseStatement();
          // HolyC: `catch` follows `try`. Attach it here so try/catch stays
          // paired even when the try is nested (e.g. as an `else` body).
          let handler = null;
          if (this.isKw("catch")) {
            this.next();
            handler = this.isP("{") ? this.parseBlock() : this.parseStatement();
          }
          return mk("TryCatch", { body, handler }, t);
        }
        case "catch": { this.next(); const body = this.isP("{") ? this.parseBlock() : this.parseStatement(); return mk("Catch", { body }, t); }
        case "throw": { this.next(); let e = null; if (!this.isP(";")) e = this.parseExpression(); this.optP(";"); return mk("Throw", { expr: e }, t); }
        case "no_warn": case "lock": { this.next(); return this.parseStatement(); }
      }
      // label:  (ident followed by ':' but not '::')
      if (this.peek(1).type === "punct" && this.peek(1).value === ":" && !(this.peek(2) && this.peek(2).type === "punct" && this.peek(2).value === ":")) {
        const name = this.next().value; this.next(); // ':'
        return mk("Label", { name }, t);
      }
    }

    // statement-level string -> Print
    if (t.type === "str") return this.parsePrintStmt();
    // statement-level char const -> maybe PutChars
    if (t.type === "char") {
      const expr = this.parseExpression();
      this.optP(";");
      if (expr.kind === "CharLit") {
        const bytes = Array.from(expr.text, (c) => c.charCodeAt(0) & 0xff);
        return mk("PutChars", { bytes }, t);
      }
      return mk("ExprStmt", { expr }, t);
    }

    // expression statement
    const expr = this.parseExpression();
    this.optP(";");
    return mk("ExprStmt", { expr }, t);
  }

  // inline assembly: we cannot lower x86-64, so record it as an unsupported
  // marker (codegen turns it into a trap/no-op) rather than crashing the parse.
  parseAsmBlock() {
    const t = this.next(); // 'asm'
    this.skipBraceBlock();
    this.optP(";");
    return mk("AsmBlock", {}, t);
  }
  // Skip a balanced {...} region (used for asm and other opaque blocks). The
  // lexer stops at embedded binary, so this is purely brace-counting.
  skipBraceBlock() {
    if (!this.isP("{")) return;
    let depth = 0;
    while (!this.atEnd()) {
      if (this.isP("{")) { depth++; this.next(); }
      else if (this.isP("}")) { depth--; this.next(); if (depth === 0) break; }
      else this.next();
    }
  }

  parsePrintStmt() {
    const t = this.cur();
    // collect adjacent string literals
    const bytes = [];
    while (this.cur().type === "str") { bytes.push(...this.cur().value); this.next(); }
    const args = [];
    while (this.optP(",")) {
      if (this.isP(";")) break;
      args.push(this.parseAssignment());
    }
    this.optP(";");
    return mk("Print", { bytes, args }, t);
  }

  parseIf() {
    const t = this.next(); this.eatP("(");
    const cond = this.parseExpression(); this.eatP(")");
    const then = this.parseStatement();
    let els = null;
    if (this.isKw("else")) { this.next(); els = this.parseStatement(); }
    return mk("If", { cond, then, else: els }, t);
  }
  parseWhile() {
    const t = this.next(); this.eatP("(");
    const cond = this.parseExpression(); this.eatP(")");
    const body = this.parseStatement();
    return mk("While", { cond, body }, t);
  }
  parseDoWhile() {
    const t = this.next();
    const body = this.parseStatement();
    if (!this.isKw("while")) this.err("expected 'while'");
    this.next(); this.eatP("(");
    const cond = this.parseExpression(); this.eatP(")"); this.optP(";");
    return mk("DoWhile", { body, cond }, t);
  }
  parseFor() {
    const t = this.next(); this.eatP("(");
    let init = null;
    if (!this.isP(";")) {
      if (this.looksLikeDecl()) { const d = this.parseDeclaration(false); init = mk("DeclStmt", { decls: Array.isArray(d) ? d : [d] }, t); }
      else init = mk("ExprStmt", { expr: this.parseExpression() }, t);
    }
    this.optP(";");
    let cond = null; if (!this.isP(";")) cond = this.parseExpression(); this.eatP(";");
    let step = null; if (!this.isP(")")) step = this.parseExpression(); this.eatP(")");
    const body = this.parseStatement();
    return mk("For", { init, cond, step, body }, t);
  }
  parseSwitch() {
    const t = this.next();
    let noBounds = false;
    if (this.isP("[")) { this.next(); this.eatP("]"); noBounds = true; } // switch [x] -> NoBounds
    this.eatP("(");
    const disc = this.parseExpression(); this.eatP(")");
    this.eatP("{");
    const items = []; // sequence of {type:'case'|'default'|'start'|'end'|'stmt', ...}
    while (!this.isP("}") && !this.atEnd()) {
      if (this.isKw("case")) {
        const ct = this.next();
        let lo = null, hi = null;
        if (!this.isP(":")) {            // HolyC allows empty `case:` (auto-number)
          lo = this.parseConditional();
          if (this.isP("...")) { this.next(); hi = this.parseConditional(); }
        }
        this.eatP(":");
        items.push({ type: "case", lo, hi });
      } else if (this.isKw("default")) {
        this.next(); this.eatP(":");
        items.push({ type: "default" });
      } else if (this.isKw("start") && this.peek(1).type === "punct" && this.peek(1).value === ":") {
        this.next(); this.next(); items.push({ type: "start" });
      } else if (this.isKw("end") && this.peek(1).type === "punct" && this.peek(1).value === ":") {
        this.next(); this.next(); items.push({ type: "end" });
      } else {
        items.push({ type: "stmt", stmt: this.parseStatement() });
      }
    }
    this.eatP("}");
    return mk("Switch", { disc, items, noBounds }, t);
  }

  // ====================================================================
  // Expressions (precedence climbing)
  // ====================================================================
  parseExpression() { return this.parseAssignment(); }

  parseAssignment() {
    const left = this.parseConditional();
    const t = this.cur();
    if (t.type === "punct" && ASSIGN_OPS.has(t.value)) {
      this.next();
      const right = this.parseAssignment();
      return mk("Assign", { op: t.value, target: left, value: right }, t);
    }
    return left;
  }

  parseConditional() {
    const cond = this.parseLogicalOr();
    if (this.isP("?")) {
      const t = this.next();
      const then = this.parseAssignment();
      this.eatP(":");
      const els = this.parseConditional();
      return mk("Cond", { cond, then, else: els }, t);
    }
    return cond;
  }

  binLevel(next, ops) {
    let left = next.call(this);
    while (this.cur().type === "punct" && ops.includes(this.cur().value)) {
      const t = this.next();
      const right = next.call(this);
      left = mk("Binary", { op: t.value, left, right }, t);
    }
    return left;
  }

  parseLogicalOr() {
    let left = this.parseLogicalAnd();
    while (this.isP("||")) { const t = this.next(); const right = this.parseLogicalAnd(); left = mk("Logical", { op: "||", left, right }, t); }
    return left;
  }
  parseLogicalAnd() {
    let left = this.parseBitOr();
    while (this.isP("&&")) { const t = this.next(); const right = this.parseBitOr(); left = mk("Logical", { op: "&&", left, right }, t); }
    return left;
  }
  parseBitOr() { return this.binLevel(this.parseBitXor, ["|"]); }
  parseBitXor() { return this.binLevel(this.parseBitAnd, ["^"]); }
  parseBitAnd() { return this.binLevel(this.parseEquality, ["&"]); }
  parseEquality() { return this.binLevel(this.parseRelational, ["==", "!="]); }

  parseRelational() {
    // HolyC chained range comparisons: a<b<c => (a<b)&&(b<c)
    const operands = [this.parseShift()];
    const ops = [];
    while (this.cur().type === "punct" && RELOPS.has(this.cur().value)) {
      ops.push(this.next().value);
      operands.push(this.parseShift());
    }
    if (ops.length === 0) return operands[0];
    if (ops.length === 1) return mk("Binary", { op: ops[0], left: operands[0], right: operands[1] });
    // build conjunction (note: middle operands evaluated more than once)
    let result = null;
    for (let k = 0; k < ops.length; k++) {
      const cmp = mk("Binary", { op: ops[k], left: operands[k], right: operands[k + 1] });
      result = result ? mk("Logical", { op: "&&", left: result, right: cmp }) : cmp;
    }
    return result;
  }

  parseShift() { return this.binLevel(this.parseAdditive, ["<<", ">>"]); }
  parseAdditive() { return this.binLevel(this.parseMultiplicative, ["+", "-"]); }
  parseMultiplicative() { return this.binLevel(this.parsePower, ["*", "/", "%"]); }
  parsePower() {
    // backtick power, right associative: a`b
    const left = this.parseUnary();
    if (this.isP("`")) {
      const t = this.next();
      const right = this.parsePower();
      return mk("Binary", { op: "`", left, right }, t);
    }
    return left;
  }

  parseUnary() {
    const t = this.cur();
    if (t.type === "punct" && ["!", "~", "-", "+", "&", "*", "++", "--"].includes(t.value)) {
      this.next();
      const operand = this.parseUnary();
      return mk("Unary", { op: t.value, operand, prefix: true }, t);
    }
    if (this.isKw("sizeof")) {
      this.next();
      if (this.isP("(") && this.isType(1)) {
        this.next(); const ty = this.parseTypeRef(); this.eatP(")");
        return mk("Sizeof", { type: ty }, t);
      }
      // sizeof expr
      const operand = this.parseUnary();
      return mk("Sizeof", { expr: operand }, t);
    }
    // cast: (Type)expr
    if (this.isP("(") && this.isType(1)) {
      // look ahead to ensure it's a cast: ( Type [*]* )
      const save = this.i;
      this.next();
      const ty = this.parseTypeRef();
      if (this.isP(")")) {
        this.next();
        // a cast must be followed by a unary expr
        const operand = this.parseUnary();
        return mk("Cast", { type: ty, operand }, t);
      }
      this.i = save; // not a cast, backtrack
    }
    return this.parsePostfix();
  }

  parseTypeRef() {
    const base = this.parseTypeSpec();
    let ty = base;
    while (this.optP("*")) ty = ptrTo(ty);
    return ty;
  }

  parsePostfix() {
    let e = this.parsePrimary();
    while (true) {
      const t = this.cur();
      if (this.isP("(")) {
        this.next();
        const args = [];
        if (!this.isP(")")) {
          // support skipped args via empty slots: f(,x) f(a,,b)
          while (true) {
            if (this.isP(",")) { args.push(null); this.next(); continue; }
            if (this.isP(")")) { break; }
            args.push(this.parseAssignment());
            if (this.isP(",")) { this.next(); if (this.isP(")")) { args.push(null); } continue; }
            break;
          }
        }
        this.eatP(")");
        e = mk("Call", { callee: e, args }, t);
      } else if (this.isP("[")) {
        this.next(); const index = this.parseExpression(); this.eatP("]");
        e = mk("Index", { base: e, index }, t);
      } else if (this.isP(".")) {
        this.next(); const name = this.next().value;
        e = mk("Member", { base: e, name, arrow: false }, t);
      } else if (this.isP("->")) {
        this.next(); const name = this.next().value;
        e = mk("Member", { base: e, name, arrow: true }, t);
      } else if (this.isP("++") || this.isP("--")) {
        const op = this.next().value;
        e = mk("Postfix", { op, operand: e }, t);
      } else break;
    }
    return e;
  }

  parsePrimary() {
    const t = this.cur();
    if (t.type === "num") {
      this.next();
      if (t.value.kind === "float") return mk("FloatLit", { value: t.value.value }, t);
      return mk("IntLit", { value: t.value.value }, t);
    }
    if (t.type === "str") {
      // adjacent string concat in expression position
      const bytes = [];
      while (this.cur().type === "str") { bytes.push(...this.cur().value); this.next(); }
      return mk("StrLit", { bytes }, t);
    }
    if (t.type === "char") { this.next(); return mk("CharLit", { value: t.value, text: t.text, nchars: t.nchars }, t); }
    if (t.type === "ident") {
      this.next();
      return mk("Ident", { name: t.value }, t);
    }
    if (this.isP("(")) { this.next(); const e = this.parseExpression(); this.eatP(")"); return e; }
    this.err("unexpected token in expression");
  }
}

export function parse(tokens, filename, opts = {}) {
  const p = new Parser(tokens, filename, opts);
  const ast = p.parseProgram();
  return ast;
}
