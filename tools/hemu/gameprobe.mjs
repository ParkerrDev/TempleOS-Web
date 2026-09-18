// gameprobe.mjs - launch a game from the Ctrl+M menu and report (a) every distinct unsupported
// opcode it hits (BADOP), (b) a PNG of the result. Compiles snapshot.HC fresh (picks up src edits
// without a rebuild). NOJIT=1 = pure interpreter (clean BADOP attribution).
//   node --max-old-space-size=3072 gameprobe.mjs               -> snap the Ctrl+M menu to /tmp/menu.png
//   GX=225 GY=325 NAME=varoom node ... gameprobe.mjs           -> launch + probe one game
import { compileHemu } from "../../engine/compile.js";
import { createHemuHost } from "../../engine/host.js";
import * as jit from "../../engine/jit.js";
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { FONT } from "../../holyc-wasm/src/runtime/font.js";
const PAL = [[0,0,0],[0,0,0xaa],[0,0xaa,0],[0,0xaa,0xaa],[0xaa,0,0],[0xaa,0,0xaa],[0xaa,0x55,0],[0xaa,0xaa,0xaa],
  [0x55,0x55,0x55],[0x55,0x55,0xff],[0x55,0xff,0x55],[0x55,0xff,0xff],[0xff,0x55,0x55],[0xff,0x55,0xff],[0xff,0xff,0x55],[0xff,0xff,0xff]];
function crc32(b){let c=~0;for(let i=0;i<b.length;i++){c^=b[i];for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1));}return ~c>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const tt=Buffer.from(t,"latin1");const cr=Buffer.alloc(4);cr.writeUInt32BE(crc32(Buffer.concat([tt,d])));return Buffer.concat([l,tt,d,cr]);}
function dumpPng(p,idx,w,h){const raw=Buffer.alloc((w*3+1)*h);let o=0;for(let y=0;y<h;y++){raw[o++]=0;for(let x=0;x<w;x++){const c=PAL[idx[y*w+x]&15];raw[o++]=c[0];raw[o++]=c[1];raw[o++]=c[2];}}
  const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;
  writeFileSync(p,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw)),chunk("IEND",Buffer.alloc(0))]));}
const RAMSZ = 402653184;
const liveBuf = readFileSync("/tmp/live.bin");
const diskBuf = readFileSync("/tmp/templeos.raw");
const r = compileHemu();
const G = (n) => Number(r.globals.get(n).addr);
const mod = await WebAssembly.compile(r.bytes);
const NOJIT = !!process.env.NOJIT;

let mx = 320, my = 240, mb = 0, gBase = 0, inst;
let curBudget = 1500000, dtMs = 16, measuring = false;
const keyq = []; const ovl = new Map();
const badops = new Map();           // "op" or "0Fop" -> count
const badlines = [];
const alltext = [];                 // DUMPTXT=1 -> capture every guest text line (compile errors, exceptions)
const onText = (s) => {
  if (s && process.env.DUMPTXT) { alltext.push(s); if (alltext.length > 4000) alltext.shift(); }
  if (!s || s.indexOf("BADOP") < 0) return;
  if (badlines.length < 40) badlines.push(s.trim());
  let m = s.match(/BADOP0F op2=([0-9A-Fa-f]+)/); if (m) { const k = "0F" + m[1].toUpperCase().padStart(2, "0"); badops.set(k, (badops.get(k) || 0) + 1); return; }
  m = s.match(/BADOP op=([0-9A-Fa-f]+)/); if (m) { const k = m[1].toUpperCase().padStart(2, "0"); badops.set(k, (badops.get(k) || 0) + 1); }
};
let lastFrame = null;
const host = createHemuHost({ onText, snd: { tone: () => {} },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
  diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
  present: (a, w, h, u8) => { lastFrame = { a, w, h, u8 }; } });
host.env.__host_msx = () => BigInt(mx); host.env.__host_msy = () => BigInt(my); host.env.__host_msb = () => BigInt(mb); host.env.__host_wheel = () => 0n;
host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n;
host.env.__host_budget = () => BigInt(curBudget | 0); host.env.__host_dt = () => BigInt(dtMs | 0);
let RIPOFF = 0;
if (!NOJIT) {
  host.env.__jit_state = (rg, fl, rp) => { RIPOFF = Number(rp); jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem, inst.exports.RasterHLE); return 1n; };
  host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip)));
  host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
  host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c);
  host.env.__jit_dispatch = (b) => BigInt(jit.jitDispatch(Number(b)));
  host.env.__jit_chain = (a, b) => jit.jitChain(a, b);
  host.env.__jit_seg = (...a) => jit.jitSeg(...a.map(Number));
  jit.jitReset();
}
inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
const FRAME_MS = 1000 / 60;
const sleep = (ms) => new Promise((rr) => setTimeout(rr, ms));
let lastT = performance.now(), dtAcc = 0;
const step = async () => { const now = performance.now();
  dtAcc += now - lastT; lastT = now; if (dtAcc > 100) dtAcc = 100;
  dtMs = Math.max(1, Math.min(100, Math.floor(dtAcc))); dtAcc -= dtMs;
  inst.exports.__main();
  const work = performance.now() - now;
  if (work > 15 && curBudget > 900000) curBudget = (curBudget * 0.90) | 0; else if (work < 11 && curBudget < 24000000) curBudget = (curBudget * 1.07) | 0;
  const wait = FRAME_MS - (performance.now() - now); if (wait > 1) await sleep(wait); };
const dv = () => new DataView(inst.exports.memory.buffer);
const ICOUNT = G("icount");
const rdU64 = (a) => Number(dv().getBigUint64(a, true));
let sampling = false; const ripHist = new Map();
const sampleRip = () => { if (!sampling || NOJIT || !RIPOFF) return; const rp = Number(dv().getBigUint64(RIPOFF, true)); ripHist.set(rp, (ripHist.get(rp) || 0) + 1); };
const run = async (n) => { for (let i = 0; i < n; i++) { await step(); sampleRip(); } };
const key = async (...scs) => { for (const s of scs) { keyq.push(s); await run(4); } };
// OCR the framebuffer with the real TempleOS 8x8 font (fg/bg-invariant), like whoat.mjs.
function popcnt8(v){v=v-((v>>1)&0x55);v=(v&0x33)+((v>>2)&0x33);return (v+(v>>4))&0x0F;}
function screenText() { if (!lastFrame) return "(no frame)"; const { a, w, h, u8 } = lastFrame; const cols = w >> 3, rows = h >> 3, lines = [];
  for (let cy = 0; cy < rows; cy++) { let line = "";
    for (let cx = 0; cx < cols; cx++) { const pat = new Uint8Array(8); const colors = new Map();
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const c = u8[a + (cy*8+y)*w + cx*8+x]; colors.set(c,(colors.get(c)||0)+1); }
      const bg = [...colors.entries()].sort((p,q)=>q[1]-p[1])[0][0];
      for (let y = 0; y < 8; y++) { let b = 0; for (let x = 0; x < 8; x++) if (u8[a+(cy*8+y)*w+cx*8+x] !== bg) b |= 1<<x; pat[y] = b; }
      let best = 32, bestScore = 1e9; for (let g = 32; g < 127; g++) { let s = 0; for (let y = 0; y < 8; y++) s += popcnt8(pat[y]^FONT[g*8+y]); if (s < bestScore){bestScore=s;best=g;} }
      line += bestScore <= 12 ? String.fromCharCode(best) : (pat.every(v=>!v) ? " " : "?"); }
    lines.push(line.trimEnd()); }
  return lines.filter(l=>l).join("\n"); }

const NAME = process.env.NAME || "game";
await run(150);
await key(0x31, 0xB1); await run(20);                          // dismiss "Take Tour?" with n
await key(0x1D, 0x32, 0xB2, 0x9D); await run(60);             // Ctrl+M -> personal/games menu
const GX = Number(process.env.GX || 0), GY = Number(process.env.GY || 0);
if (!GX) { if (lastFrame) { dumpPng("/tmp/menu.png", lastFrame.u8.subarray(lastFrame.a, lastFrame.a + lastFrame.w * lastFrame.h), lastFrame.w, lastFrame.h); console.log("wrote /tmp/menu.png (" + lastFrame.w + "x" + lastFrame.h + ")"); } else console.log("no frame"); process.exit(0); }
mx = GX; my = GY; await run(6); mb = 1; await run(10); mb = 0;       // click the sprite
measuring = true;
const ic0 = rdU64(ICOUNT);
sampling = true;
const FR = Number(process.env.FR || 360);
if (process.env.KEYS) {                                              // probe input-wait: tap space/enter/arrows midway
  await run(FR >> 1);
  for (const [mk, bk] of [[0x39,0xB9],[0x1C,0x9C],[0x39,0xB9],[0x48,0xC8],[0x50,0xD0],[0x4B,0xCB],[0x4D,0xCD],[0x1C,0x9C]]) { keyq.push(mk); await run(8); keyq.push(bk); await run(8); }
  await run(FR >> 1);
} else await run(FR);                                                // let the game boot + run
sampling = false;
const icDelta = rdU64(ICOUNT) - ic0;
if (lastFrame) { dumpPng("/tmp/game_" + NAME + ".png", lastFrame.u8.subarray(lastFrame.a, lastFrame.a + lastFrame.w * lastFrame.h), lastFrame.w, lastFrame.h); console.log("wrote /tmp/game_" + NAME + ".png"); }
console.log(`=== ${NAME} @(${GX},${GY}) ${NOJIT ? "INTERP" : "JIT"} ===`);
if (badops.size === 0) console.log("no BADOP (unsupported opcode not the cause, or game OK)");
else { console.log("UNSUPPORTED OPCODES: " + [...badops.entries()].sort((a,b)=>b[1]-a[1]).map(([k,c]) => `${k}(x${c})`).join(" "));
  console.log("first lines:"); for (const l of badlines.slice(0, 12)) console.log("  " + l); }
if (process.env.DUMPTXT) {
  const joined = alltext.join("");
  const interesting = joined.split("\n").filter(l => /error|except|fault|warn|not found|fail|line \d|undefined|missing|halt|0x[0-9a-f]/i.test(l));
  console.log(`--- guest text: ${alltext.length} chunks; ${interesting.length} interesting lines ---`);
  for (const l of interesting.slice(-50)) console.log("  | " + l.trim().slice(0, 160));
}
console.log(`game-phase icount: ${(icDelta/1e6).toFixed(1)}M instr over ${process.env.FR||360} frames (${icDelta ? "executing" : "IDLE/blocked"})`);
if (!NOJIT && ripHist.size) { const top = [...ripHist.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12);
  console.log("hot RIPs during game phase (jit_state offset → guest rip):");
  for (const [rp, c] of top) console.log(`   0x${rp.toString(16)}  x${c}`); }
if (process.env.OCR) { console.log("--- screen OCR ---\n" + screenText()); }
