// fold.js — compile-time constant folding for integer expressions.
// Used for array dimensions, enum-like #defines, and global initializers.
// Returns a BigInt or null if not a compile-time integer constant.
export function foldConstInt(node, env = {}) {
  if (node == null) return null;
  switch (node.kind) {
    case "IntLit": return BigInt(node.value);
    case "CharLit": return BigInt(node.value);
    case "Ident": return node.name in env ? BigInt(env[node.name]) : null;
    case "Cast": return foldConstInt(node.operand, env);
    case "Unary": {
      const v = foldConstInt(node.operand, env);
      if (v == null) return null;
      switch (node.op) {
        case "-": return -v;
        case "+": return v;
        case "~": return ~v;
        case "!": return v === 0n ? 1n : 0n;
      }
      return null;
    }
    case "Binary": {
      const a = foldConstInt(node.left, env), b = foldConstInt(node.right, env);
      if (a == null || b == null) return null;
      switch (node.op) {
        case "+": return a + b; case "-": return a - b; case "*": return a * b;
        case "/": return b === 0n ? 0n : a / b; case "%": return b === 0n ? 0n : a % b;
        case "<<": return a << b; case ">>": return a >> b;
        case "&": return a & b; case "|": return a | b; case "^": return a ^ b;
        case "==": return a === b ? 1n : 0n; case "!=": return a !== b ? 1n : 0n;
        case "<": return a < b ? 1n : 0n; case ">": return a > b ? 1n : 0n;
        case "<=": return a <= b ? 1n : 0n; case ">=": return a >= b ? 1n : 0n;
        case "`": return a ** b;
      }
      return null;
    }
    case "Cond": {
      const c = foldConstInt(node.cond, env);
      if (c == null) return null;
      return c !== 0n ? foldConstInt(node.then, env) : foldConstInt(node.else, env);
    }
  }
  return null;
}

// Used where a count must be a number (array dims). Falls back to 1 if unknown.
// Accepts either an AST node or an already-resolved numeric/bigint count (so
// re-resolving an already-resolved array type is idempotent).
export function foldDim(node, env = {}) {
  if (node == null) return null; // flexible array
  if (typeof node === "number") return node;
  if (typeof node === "bigint") return Number(node);
  const v = foldConstInt(node, env);
  if (v == null) throw new Error("array dimension is not a constant integer at line " + (node.line || "?"));
  return Number(v);
}
