// asksym.mjs — resolve TempleOS symbol addresses by ASKING THE RUNNING OS: type HolyC into the
// emulated shell that POKES each &symbol into a fixed guest-RAM mailbox, then read the mailbox
// from the host. No OCR, no reverse engineering — the OS's own compiler resolves the names.
//   node asksym.mjs JobQue mp_cnt Spawn        (default set below)
// Output: JSON { name: "0xADDR", ... } on stdout + human log on stderr.
import { compileHolyC } from "./holyc-wasm/src/compiler.js";
import { createHost } from "./holyc-wasm/src/runtime/host.js";
import * as jit from "./jit.js";
import { readFileSync } from "node:fs";
const RAMSZ = 402653184, MBOX = 0x16700000;             // mailbox: free high RAM, well clear of the OS
const liveBuf = readFileSync("/tmp/live.bin");
const diskBuf = readFileSync("/tmp/templeos.raw");
const dir = "./hemu-wasm/src";
const src = readFileSync(dir + "/snapshot.HC", "latin1");
const r = compileHolyC(src, { filename: "snapshot.HC", lenient: false, includeResolver: (p) => { try { return readFileSync(dir + "/" + p, "latin1"); } catch { return null; } } });
const G = (n) => Number(r.globals.get(n).addr);
const mod = await WebAssembly.compile(r.bytes);
let gBase = 0, inst, lastFb = null; const keyq = []; const ovl = new Map();
const host = createHost({ onText: () => {}, snd: { tone: () => {} },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
  diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
  present: (a, w, h, u8) => { lastFb = { w, h, px: u8.slice(a, a + w * h) }; } });
host.env.__host_msx = () => 320n; host.env.__host_msy = () => 240n; host.env.__host_msb = () => 0n; host.env.__host_wheel = () => 0n;
host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n; host.env.__host_prof = () => {};
host.env.__host_budget = () => 8000000n; host.env.__host_dt = () => 16n; host.env.__host_time = () => 0n;
host.env.__jit_state = (rg, fl, rp) => { jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem); return 1n; };
host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip)));
host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c);
host.env.__jit_dispatch = (b) => BigInt(jit.jitDispatch(Number(b)));
host.env.__jit_chain = (a, b) => jit.jitChain(a, b); host.env.__jit_seg = (...a) => jit.jitSeg(...a.map(Number));
jit.jitReset();
inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
const run = (n) => { for (let i = 0; i < n; i++) inst.exports.__main(); };
const dv = () => new DataView(inst.exports.memory.buffer);

// US set-1 scancodes for the HolyC we need to type
const SC = { a:0x1E,b:0x30,c:0x2E,d:0x20,e:0x12,f:0x21,g:0x22,h:0x23,i:0x17,j:0x24,k:0x25,l:0x26,m:0x32,n:0x31,o:0x18,p:0x19,q:0x10,r:0x13,s:0x1F,t:0x14,u:0x16,v:0x2F,w:0x11,x:0x2D,y:0x15,z:0x2C,
  "0":0x0B,"1":0x02,"2":0x03,"3":0x04,"4":0x05,"5":0x06,"6":0x07,"7":0x08,"8":0x09,"9":0x0A,
  " ":0x39,"=":0x0D,";":0x27,"\n":0x1C,",":0x33,".":0x34,"/":0x35,"-":0x0C,"'":0x28,"[":0x1A,"]":0x1B,"\\":0x2B };
const SHIFTED = { "*":"8","(":"9",")":"0","&":"7","_":"-","+":"=",":":";","\"":"'","{":"[","}":"]","|":"\\","<":",",">":".","?":"/","!":"1","@":"2","#":"3","$":"4","%":"5","^":"6" };
function typeStr(s) {
  for (const ch of s) {
    const lo = ch.toLowerCase();
    const shifted = SHIFTED[ch] !== undefined || (ch >= "A" && ch <= "Z");
    const base = SHIFTED[ch] !== undefined ? SHIFTED[ch] : lo;
    const sc = SC[base];
    if (sc === undefined) throw new Error("no scancode for " + JSON.stringify(ch));
    if (shifted) keyq.push(0x2A);                       // LShift down
    keyq.push(sc); keyq.push(sc | 0x80);                // key down+up
    if (shifted) keyq.push(0x2A | 0x80);                // LShift up
    run(3);
  }
  run(30);
}
// screen-to-text: match each 8x8 cell against the real TempleOS font (fg/bg-invariant via bit patterns)
import { FONT } from "./holyc-wasm/src/runtime/font.js";
function screenText() {
  if (!lastFb) return "(no frame)";
  const { w, h, px } = lastFb, cols = w >> 3, rows = h >> 3, lines = [];
  for (let cy = 0; cy < rows; cy++) {
    let line = "";
    for (let cx = 0; cx < cols; cx++) {
      const pat = new Uint8Array(8);
      const colors = new Map();
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const c = px[(cy * 8 + y) * w + cx * 8 + x]; colors.set(c, (colors.get(c) || 0) + 1); }
      const bg = [...colors.entries()].sort((a, b) => b[1] - a[1])[0][0];   // most common = background
      for (let y = 0; y < 8; y++) { let b = 0; for (let x = 0; x < 8; x++) if (px[(cy * 8 + y) * w + cx * 8 + x] !== bg) b |= 1 << x; pat[y] = b; }
      let best = 32, bestScore = 1e9;
      for (let g = 32; g < 127; g++) { let s = 0; for (let y = 0; y < 8; y++) { const d = pat[y] ^ FONT[g * 8 + y]; s += popcnt8(d); } if (s < bestScore) { bestScore = s; best = g; } }
      line += bestScore <= 12 ? String.fromCharCode(best) : (pat.every(v => !v) ? " " : "?");
    }
    lines.push(line.trimEnd());
  }
  return lines.filter(l => l).join("\n");
}
function popcnt8(v) { v = v - ((v >> 1) & 0x55); v = (v & 0x33) + ((v >> 2) & 0x33); return (v + (v >> 4)) & 0x0F; }
run(500);                                               // boot fully
for (let tries = 0; tries < 8; tries++) {               // settle until the SHELL PROMPT is on screen
  keyq.push(0x01); keyq.push(0x81); run(80);            // Esc: close the focused doc/popup (Welcome lands focused)
  typeStr("1;\n"); run(250);                            // probe line: a ready shell echoes + reprompts
  const txt = screenText();
  if (/C:\/[A-Za-z]*>/.test(txt)) { console.error(`prompt ready after ${tries + 1} settle round(s)`); break; }
  if (tries === 7) { console.error("NO PROMPT FOUND; last screen:\n" + txt.split("\n").slice(-12).join("\n")); process.exit(2); }
}
const names = process.argv.slice(2).length ? process.argv.slice(2) : ["JobQue", "Spawn", "mp_cnt"];
const out = {};
for (let k = 0; k < names.length; k++) {
  const slot = MBOX + 16 + k * 8;
  dv().setBigUint64(gBase + slot, 0xDEADBEEFn, true);   // sentinel so we can tell the poke landed
  // *(0xADDR)(I64*) = &Name;
  for (let attempt = 0; attempt < 4; attempt++) {
    typeStr(`*(0x${slot.toString(16).toUpperCase()})(I64*)=${names[k]};\n`);
    run(500);                                           // let the shell JIT + run the line
    if (dv().getBigUint64(gBase + slot, true) !== 0xDEADBEEFn) break;
    keyq.push(0x01); keyq.push(0x81); run(120);         // a popup (AutoComplete) ate the line — dismiss + retry
  }
  const v = dv().getBigUint64(gBase + slot, true);
  out[names[k]] = v === 0xDEADBEEFn ? null : "0x" + v.toString(16);
  console.error(`${names[k].padEnd(18)} -> ${out[names[k]] ?? "FAILED (sentinel intact)"}`);
  if (out[names[k]] === null || process.env.SCREEN) { console.error("---- screen ----"); console.error(screenText().split("\n").slice(-14).join("\n")); }
}
console.log(JSON.stringify(out));
