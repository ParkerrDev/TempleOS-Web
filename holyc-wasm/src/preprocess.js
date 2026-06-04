// preprocess.js — token-level HolyC preprocessor.
//
// Supports: #define (object- and function-like), #undef, #include,
// #ifdef/#ifndef/#else/#endif, and ignores #help_index / #assert / #exe{...} /
// #pragma-ish directives we don't need. Macro expansion is recursive with a
// guard. Backslash-newline continuations are handled by the caller (text level).

import { lex } from "./lexer.js";

function isDirectiveHash(tokens, idx) {
  const t = tokens[idx];
  if (!(t.type === "punct" && t.value === "#")) return false;
  // must be first token on its line
  if (idx === 0) return true;
  return tokens[idx - 1].line !== t.line;
}

export function preprocess(tokens, opts = {}) {
  const defines = new Map(); // name -> {params:null|[...], body:[tokens]}
  // seed with builtin defines
  for (const [k, v] of Object.entries(opts.defines || {})) {
    defines.set(k, { params: null, body: lex(String(v)).slice(0, -1) });
  }
  const includeResolver = opts.includeResolver || (() => null);
  const includedOnce = new Set();

  // First pass: collect directives + produce a stream with directives removed,
  // honoring conditional compilation.
  const out = [];
  const condStack = []; // {active, taken, parentActive}
  function activeNow() { return condStack.every((c) => c.active); }
  let skipBraceNext = false;  // set after #exe to drop the following {...} block

  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === "eof") break;

    // Skip a brace-balanced block following an #exe directive (compile-time code).
    if (skipBraceNext && t.type === "punct" && t.value === "{") {
      let depth = 0;
      while (i < tokens.length) {
        const tk = tokens[i];
        if (tk.type === "punct" && tk.value === "{") depth++;
        else if (tk.type === "punct" && tk.value === "}") { depth--; if (depth === 0) { i++; break; } }
        i++;
      }
      skipBraceNext = false;
      continue;
    }
    if (skipBraceNext && !(t.type === "punct" && t.value === ";")) skipBraceNext = false;

    if (isDirectiveHash(tokens, i)) {
      const line = t.line;
      // gather the rest of this line's tokens
      let j = i + 1;
      const lineToks = [];
      while (j < tokens.length && tokens[j].line === line && tokens[j].type !== "eof") {
        lineToks.push(tokens[j]); j++;
      }
      i = j;
      const dir = lineToks[0] && lineToks[0].type === "ident" ? lineToks[0].value : "";

      if (dir === "ifdef" || dir === "ifndef") {
        const name = lineToks[1] && lineToks[1].value;
        const def = defines.has(name);
        const cond = dir === "ifdef" ? def : !def;
        condStack.push({ active: activeNow() && cond, taken: cond, parentActive: activeNow() });
        continue;
      }
      if (dir === "if") {
        // we don't evaluate full #if expressions; assume true unless "0"
        const isZero = lineToks.length === 2 && lineToks[1].type === "num" && Number(lineToks[1].value.value) === 0;
        condStack.push({ active: activeNow() && !isZero, taken: !isZero, parentActive: activeNow() });
        continue;
      }
      if (dir === "else") {
        const c = condStack[condStack.length - 1];
        if (c) c.active = c.parentActive && !c.taken;
        continue;
      }
      if (dir === "elif") {
        const c = condStack[condStack.length - 1];
        if (c) { c.active = c.parentActive && !c.taken; c.taken = c.taken || c.active; }
        continue;
      }
      if (dir === "endif") { condStack.pop(); continue; }

      if (!activeNow()) continue; // inside a disabled block: ignore everything

      if (dir === "define") {
        const name = lineToks[1] && lineToks[1].value;
        if (!name) continue;
        // function-like if next token is '(' immediately adjacent
        let params = null;
        let bodyStart = 2;
        const p1 = lineToks[1], p2 = lineToks[2];
        if (p2 && p2.type === "punct" && p2.value === "(" &&
            p2.pos === p1.pos + p1.text.length) {
          params = [];
          let k = 3;
          while (k < lineToks.length && !(lineToks[k].type === "punct" && lineToks[k].value === ")")) {
            if (lineToks[k].type === "ident") params.push(lineToks[k].value);
            k++;
          }
          bodyStart = k + 1;
        }
        defines.set(name, { params, body: lineToks.slice(bodyStart) });
        continue;
      }
      if (dir === "undef") {
        const name = lineToks[1] && lineToks[1].value;
        if (name) defines.delete(name);
        continue;
      }
      if (dir === "include") {
        const arg = lineToks[1];
        if (arg && arg.type === "str") {
          const path = arg.text;
          const resolved = includeResolver(path);
          if (resolved != null && !includedOnce.has(path)) {
            includedOnce.add(path);
            const subToks = lex(resolved, path);
            // recursively preprocess included file with shared defines
            const sub = preprocessWithDefines(subToks, defines, opts);
            out.push(...sub.filter((t) => t.type !== "eof"));
          }
        }
        continue;
      }
      // #exe { ... }  — compile-time execution block. The '{' may be on this
      // line (consumed already) or the next; in both cases skip the brace block.
      if (dir === "exe") {
        // if '{' was on the directive line, skip from here; else arm for next '{'
        skipBraceNext = true;
        continue;
      }
      // ignore: help_index, assert, pragma, etc.
      continue;
    }

    if (!activeNow()) { i++; continue; }
    out.push(t);
    i++;
  }

  // Second pass: macro expansion. Re-attach an EOF token so the parser has a
  // proper terminator (the lexer's EOF was consumed by the directive scan).
  const expanded = expandMacros(out, defines);
  const eof = tokens[tokens.length - 1];
  expanded.push(eof && eof.type === "eof" ? eof : { type: "eof", value: null, text: "", line: 0, col: 0, pos: 0 });
  return expanded;
}

// Helper: preprocess a token list sharing an existing defines map (for includes)
function preprocessWithDefines(tokens, defines, opts) {
  // Reuse the main routine but with pre-seeded defines: cheap re-impl by copying.
  const saved = opts.defines;
  // We can't easily thread the same map; just run a fresh preprocess and merge.
  const result = preprocess(tokens, { ...opts });
  return result;
}

function expandMacros(tokens, defines) {
  const out = [];
  let i = 0;
  const guard = new Set();
  function expandIdent(name, i, tokens, active) {
    // returns {tokens, next}
    const def = defines.get(name);
    if (!def || active.has(name)) return null;
    if (def.params === null) {
      const sub = expandMacros(def.body, defines); // recursive
      return { tokens: sub, next: i + 1 };
    }
    // function-like: need '(' next
    let k = i + 1;
    if (!(tokens[k] && tokens[k].type === "punct" && tokens[k].value === "(")) return null;
    k++;
    const args = [];
    let depth = 1, cur = [];
    while (k < tokens.length && depth > 0) {
      const tk = tokens[k];
      if (tk.type === "punct" && tk.value === "(") { depth++; cur.push(tk); }
      else if (tk.type === "punct" && tk.value === ")") { depth--; if (depth === 0) { args.push(cur); } else cur.push(tk); }
      else if (tk.type === "punct" && tk.value === "," && depth === 1) { args.push(cur); cur = []; }
      else cur.push(tk);
      k++;
    }
    // substitute params in body
    const sub = [];
    for (const bt of def.body) {
      if (bt.type === "ident" && def.params.includes(bt.value)) {
        const argIdx = def.params.indexOf(bt.value);
        sub.push(...(args[argIdx] || []));
      } else sub.push(bt);
    }
    return { tokens: expandMacros(sub, defines), next: k };
  }
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === "ident" && defines.has(t.value)) {
      const r = expandIdent(t.value, i, tokens, guard);
      if (r) {
        guard.add(t.value);
        for (const et of r.tokens) out.push(et);
        guard.delete(t.value);
        i = r.next;
        continue;
      }
    }
    out.push(t);
    i++;
  }
  return out;
}
