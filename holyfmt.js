// holyfmt.js — run the REAL HolyC formatter (holyc-fmt/HolyCFmt.HC) in the
// browser. The .HC source is compiled to WASM by holyc-wasm, then the user's code is
// written straight into the module's linear memory (above the heap) and HolyCFmtPrint
// reads it and emits the formatted text via PutChars, which we capture. Feeding the
// input through memory (not a HolyC string literal) keeps DolDoc "$$" byte-exact.
//
//   import { formatHolyC } from "./holyfmt.js";
//   const out = await formatHolyC(srcText, { indent: 2, tabs: false });

const U = (p) => new URL(p, import.meta.url).href;            // resolve relative to THIS module
const FMT_INP = 28 * 1024 * 1024;                            // 28 MiB: above heap (16), below initial mem (32)
const _mods = new Map();                                     // "indent|tabs" -> WebAssembly.Module

async function getModule(indent, tabs) {
  const key = indent + "|" + tabs;
  if (_mods.has(key)) return _mods.get(key);
  const { compileHolyC } = await import(U("./holyc-wasm/src/compiler.js"));
  const core = await fetch(U("./holyc-fmt/HolyCFmt.HC"), { cache: "no-cache" }).then((r) => {
    if (!r.ok) throw new Error("could not load HolyCFmt.HC (" + r.status + ")");
    return r.text();
  });
  const driver = `\ng_indent_w=${indent};\ng_use_tabs=${tabs ? "TRUE" : "FALSE"};\nU8 *__fi=${FMT_INP};\nHolyCFmtPrint(__fi);\n`;
  const { bytes } = compileHolyC(core + driver, { filename: "HolyCFmt.HC", lenient: true, resilient: true });
  const mod = await WebAssembly.compile(bytes);
  _mods.set(key, mod);
  return mod;
}

export async function formatHolyC(src, { indent = 2, tabs = false } = {}) {
  if (src.indexOf("\0") !== -1)
    throw new Error("this file has embedded binary (a DolDoc sprite) — format plain-text HolyC only");
  const { createHost } = await import(U("./holyc-wasm/src/runtime/host.js"));
  const mod = await getModule(indent, tabs);
  let out = "";
  const host = createHost({ onText: (s) => { out += s; }, ansi: false });
  const inst = await WebAssembly.instantiate(mod, { env: host.env });   // fresh memory + heap each call
  host.attach?.(inst);
  const mem = new Uint8Array(inst.exports.memory.buffer);
  if (FMT_INP + src.length + 1 > mem.length) throw new Error("input too large to format in-browser");
  for (let i = 0; i < src.length; i++) mem[FMT_INP + i] = src.charCodeAt(i) & 0xff;
  mem[FMT_INP + src.length] = 0;
  inst.exports.__main();
  return out;
}
