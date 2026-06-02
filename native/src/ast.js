// ast.js — AST node factory. Nodes are plain objects with a `kind` tag plus a
// source position (line) for diagnostics.
export function mk(kind, props, tok) {
  const n = { kind, ...props };
  if (tok) { n.line = tok.line; n.col = tok.col; }
  return n;
}
