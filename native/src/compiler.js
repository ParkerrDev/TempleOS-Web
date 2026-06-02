// compiler.js — orchestrates lex -> preprocess -> parse -> codegen.
//
// The HolyC prelude is compiled together with the user program so its #defines,
// classes, and functions are in scope (mirroring how TempleOS boots its runtime
// before user code). The prelude and user source are lexed SEPARATELY so each
// token keeps its true file+line — user diagnostics then report real line
// numbers instead of being shifted by the prelude's length.
import { lex } from "./lexer.js";
import { preprocess } from "./preprocess.js";
import { parse } from "./parser.js";
import { compile as codegen } from "./codegen.js";
import { PRELUDE_SRC } from "./prelude.js";

export function compileHolyC(source, opts = {}) {
  const userName = opts.filename || "<holyc>";
  let tokens;
  if (opts.noPrelude) {
    tokens = lex(source, userName);
  } else {
    const preToks = lex(PRELUDE_SRC, "<prelude>").filter((t) => t.type !== "eof");
    const userToks = lex(source, userName);
    tokens = [...preToks, ...userToks];
  }
  const pp = preprocess(tokens, {
    includeResolver: opts.includeResolver,
    defines: opts.defines || {},
  });
  const ast = parse(pp, userName, { resilient: opts.resilient });
  const { bytes, warnings, dataEnd } = codegen(ast, opts);
  return { bytes, warnings, dataEnd, ast, diagnostics: ast.diagnostics || [] };
}

export { lex, preprocess, parse };
