// holyfmt.js: run the HolyC formatter (holyc-fmt/HolyCFmt.HC) in the browser.
//
// HolyC-wasm compiles the .HC to WebAssembly. The code to format is written straight
// into the module's memory, above the heap, and HolyCFmtPrint reads it there and
// prints the result, which is caught here. Going through memory, not a HolyC str,
// keeps DolDoc "$$" and every other byte as it is.
//
//   import { formatHolyC } from "./holyfmt.js";
//   const out = await formatHolyC(srcText, { indent: 2, tabs: true });
//
// tabs: true stores the layout through S2T, as Terry's files are; false writes spaces.
// Text after a NUL (sprite data) is kept as it is. TempleOS text is one byte a char,
// so each char from 0x80 up goes in as one high byte and is put back afterwards. The
// formatter only moves whitespace, so those chars come out in the same order.

const U = (p) => new URL(p, import.meta.url).href; // relative to this module
const FMT_INP = 28 * 1024 * 1024; // above the heap (16 MiB), below the first memory size (32 MiB)
const HIGH = 0x80; // stands in for every char from 0x80 up
const mods = new Map(); // "indent|tabs" to a compiled module

function getModule(indent, tabs) {
  const key = indent + "|" + tabs;
  let mod = mods.get(key);
  if (!mod) {
    mod = (async () => {
      const { compileHolyC } = await import(U("./holyc-wasm/src/compiler.js"));
      const r = await fetch(U("./holyc-fmt/HolyCFmt.HC"), { cache: "no-cache" });
      if (!r.ok) throw new Error("could not load HolyCFmt.HC (" + r.status + ")");
      const core = await r.text();
      const driver = `\nfmt_tabs=${tabs ? "TRUE" : "FALSE"};\nfmt_indent=${indent};\n` +
        `U8 *__fi=${FMT_INP};\nHolyCFmtPrint(__fi);\n`;
      const { bytes } = compileHolyC(core + driver, { filename: "HolyCFmt.HC", lenient: true, resilient: true });
      return WebAssembly.compile(bytes);
    })();
    mods.set(key, mod);
    mod.catch(() => mods.delete(key));
  }
  return mod;
}

export async function formatHolyC(src, { indent = 2, tabs = true } = {}) {
  if (!Number.isInteger(indent) || indent < 1 || indent > 8) throw new Error("indent must be an integer from 1 to 8");
  const nul = src.indexOf("\0");
  const text = nul < 0 ? src : src.slice(0, nul);
  const tail = nul < 0 ? "" : src.slice(nul);
  const { createHost } = await import(U("./holyc-wasm/src/runtime/host.js"));
  const mod = await getModule(indent, !!tabs);
  let out = "";
  const host = createHost({ onText: (s) => { out += s; }, ansi: false });
  const inst = await WebAssembly.instantiate(mod, { env: host.env }); // fresh memory and heap each call
  host.attach?.(inst);
  const mem = new Uint8Array(inst.exports.memory.buffer);
  if (FMT_INP + text.length + 1 > mem.length) throw new Error("input too large to format in the browser");
  const high = [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) mem[FMT_INP + i] = c;
    else {
      high.push(text[i]);
      mem[FMT_INP + i] = HIGH;
    }
  }
  mem[FMT_INP + text.length] = 0;
  inst.exports.__main();
  if ((out.match(/[\x80-\xff]/g) || []).length !== high.length)
    throw new Error("the formatter lost a char, so nothing was changed");
  let k = 0;
  return out.replace(/[\x80-\xff]/g, () => high[k++]) + tail;
}
