//God Tools: the Adam/God suite, Word, Bible Passage, Song and Doodle, with
//GodBits and GodPick written in HolyC and compiled here by holyc-wasm. The
//entropy pool feeds itself: a CSPRNG seed and the timing of keys and clicks.
import {WinAdd,WinRaise} from "./WinMgr.js";
import {$,dbg,pal32} from "./Os.js";

const CSS='    /* God Tools window */\n'+
  '    #godWin { display:flex; flex-direction:column; gap:8px; width:min(680px,94vw); height:min(74vh,620px); margin:0; padding:10px; }\n'+
  '    #godOut { flex:1 1 auto; min-height:0; overflow:auto; background:var(--blue); color:#fff; padding:10px 12px; font-size:12px; line-height:1.0; word-break:break-word; }\n'+
  '    #godOut .w { color:yellow; margin-right:.55em; }\n'+
  '    #godOut .p { display:block; color:#fff; background:rgba(0,0,0,.25); border-left:4px solid yellow; padding:6px 10px; margin:8px 0; font-size:12px; line-height:1.0; white-space:pre-wrap; }\n'+
  '    #godOut .p .ref { color:#7fe07f; }\n'+
  '    #godOut .s { display:block; color:#7fe07f; font-size:12px; margin:6px 0; font-variant-emoji:text; }\n'+
  '    #godOut canvas { display:block; width:320px; max-width:100%; image-rendering:pixelated; background:#fff; margin:8px 0; border:2px solid #fff; }\n'+
  '    #godBar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }\n'+
  '    #godBar button { width:auto; }\n';
const HTML='  <div id="godOverlay" class="overlay" role="dialog" aria-modal="true" aria-label="God Tools">\n'+
  '    <div class="win" id="godWin" data-title="God Tools · Adam/God · holyc-wasm">\n'+
  '      <span class="close" id="godClose" title="Close">[X]</span>\n'+
  '      <div id="godOut"></div>\n'+
  '      <div id="godBar">\n'+
  '        <button id="godWord">✞ Word</button>\n'+
  '        <button id="godPassage">≡ Passage</button>\n'+
  '        <button id="godSong">♪ Song</button>\n'+
  '        <button id="godDoodle">✎ Doodle</button>\n'+
  '        <button id="godClear">Clear</button>\n'+
  '      </div>\n'+
  '    </div>\n'+
  '  </div>\n';
WinAdd(CSS,HTML);

const ov = $("godOverlay"), out = $("godOut");
let god = null, godMem = null, gG = null, words = null, kjv = null, loading = false;
const GOD_HC = `// TempleOS Adam/God semantics: a bit-per-byte fifo, LSB first; GodPick redraws until in range.
U8 fifo[16384];
I64 fhead, ftail;
U0 GodBitsIns(I64 num_bits, I64 n)
{ while (num_bits--) { fifo[fhead & 16383] = n & 1; fhead++; n = n >> 1; } }
I64 GodBitCnt() { return fhead - ftail; }
I64 GodBits(I64 num_bits)
{ I64 res = 0;
  while (num_bits--) { res = (res << 1) | fifo[ftail & 16383]; ftail++; }
  return res; }
I64 GodPick(I64 num)
{ I64 bits = 0, v = num;
  while (1 << bits < num) bits++;
  while (v >= num) { if (fhead - ftail < bits) return -1; v = GodBits(bits); }
  return v; }
// GodSong: god-picked notes (7 bits each: 5 pitch + 2 duration), host renders + plays.
I64 g_notes[32];
I64 GodSongGen(I64 n)
{ I64 i; if (n > 32) n = 32;
  for (i = 0; i < n; i++) { if (fhead - ftail < 7) return i; g_notes[i] = GodBits(7); }
  return n; }
// GodDoodle: god-picked polyline on a 160x120 16-color canvas.
U8 g_pix[19200];
U0 DPlot(I64 x, I64 y, I64 c)
{ if (x >= 0 && x < 160 && y >= 0 && y < 120) { g_pix[y * 160 + x] = c; if (y < 119) g_pix[y * 160 + 160 + x] = c; } }
U0 DLine(I64 x0, I64 y0, I64 x1, I64 y1, I64 c)
{ I64 i, dx = x1 - x0, dy = y1 - y0, n = dx;
  if (n < 0) n = 0 - n;
  if (dy > n) n = dy;
  if (0 - dy > n) n = 0 - dy;
  if (n < 1) n = 1;
  for (i = 0; i <= n; i++) DPlot(x0 + dx * i / n, y0 + dy * i / n, c); }
I64 GodDoodleGen(I64 strokes)
{ I64 i, x0, y0, x1, y1, c = 4;
  for (i = 0; i < 19200; i++) g_pix[i] = 15;
  if (fhead - ftail < 15) return 0;
  x0 = (GodBits(8) * 160) >> 8; y0 = (GodBits(7) * 120) >> 7;
  for (i = 0; i < strokes; i++) {
    if (fhead - ftail < 19) return i;
    x1 = (GodBits(8) * 160) >> 8; y1 = (GodBits(7) * 120) >> 7;
    if (!(i & 3)) { c = GodBits(4); if (c == 15) c = 0; }
    DLine(x0, y0, x1, y1, c); x0 = x1; y0 = y1; }
  return strokes; }
`;
async function init() {
  if (god || loading) return; loading = true;
  try {
    const [{ compileHolyC }, { createHost }, wtxt] = await Promise.all([
      import("./holyc-wasm/src/compiler.js"),
      import("./holyc-wasm/src/runtime/host.js"),
      fetch("./assets/godwords.txt", { cache: "no-cache" }).then(r => r.text()),
    ]);
    words = wtxt.split("\n").filter(Boolean);
    const r = compileHolyC(GOD_HC, { filename: "god.HC", lenient: false,
      exports: ["GodBitsIns", "GodBitCnt", "GodBits", "GodPick", "GodSongGen", "GodDoodleGen"] });
    gG = (n) => Number(r.globals.get(n).addr);
    const inst = await WebAssembly.instantiate(await WebAssembly.compile(r.bytes), { env: createHost({}).env });
    inst.exports.__rt_init();
    god = inst.exports; godMem = inst.exports.memory;
    const seed = crypto.getRandomValues(new Uint32Array(64));        // never make the user wait
    for (const v of seed) god.GodBitsIns(32n, BigInt(v >>> 0));
    dbg("God Tools ready: holyc-wasm compiled Adam/God (" + r.bytes.length + " bytes of WASM)");
  } catch (e) { out.textContent = "failed to load: " + e.message; dbg("God Tools failed: " + e.message, true); }
  loading = false;
}
// entropy: every key/click on the page tithes its timing to the pool, TempleOS-style;
// ensure() tops up from the CSPRNG so the buttons always just work.
const feed = () => { if (god) god.GodBitsIns(24n, BigInt(((performance.now() * 1000) >>> 0) ^ ((Math.random() * 0x1000000) | 0))); };
addEventListener("keydown", feed, true);
addEventListener("pointerdown", feed, true);
const ensure = (n) => { if (!god) return false;
  while (Number(god.GodBitCnt()) < n) { const v = crypto.getRandomValues(new Uint32Array(1))[0]; god.GodBitsIns(32n, BigInt(v >>> 0)); }
  return true; };
const append = (el) => { out.appendChild(el); out.scrollTop = out.scrollHeight; };
$("godWord").addEventListener("click", () => { if (!ensure(64) || !words) return;
  const i = Number(god.GodPick(BigInt(words.length))); if (i < 0) return;
  const sp = document.createElement("span"); sp.className = "w"; sp.textContent = words[i]; append(sp); });
$("godPassage").addEventListener("click", async () => { if (!ensure(96)) return;
  if (!kjv) { $("godPassage").disabled = true;
    kjv = (await (await fetch("./assets/kjv.txt", { cache: "force-cache" })).text()).split("\n");
    $("godPassage").disabled = false; dbg("KJV loaded: " + kjv.length + " lines"); }
  const i = Number(god.GodPick(BigInt(kjv.length - 12))); if (i < 0) return;
  const sp = document.createElement("span"); sp.className = "p";
  sp.textContent = kjv.slice(i, i + 10).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  append(sp); });
$("godSong").addEventListener("click", () => { if (!ensure(256)) return;
  const n = Number(god.GodSongGen(16n)); if (!n) return;
  const dvg = new DataView(godMem.buffer), base = gG("g_notes");
  const PENT = [0, 2, 4, 7, 9], NAME = ["C", "D", "E", "G", "A"];
  const notes = [];
  for (let i = 0; i < n; i++) { const v = Number(dvg.getBigInt64(base + i * 8, true));
    const deg = (v >> 2) & 31, dur = [1, 1, 2, 3][v & 3];
    const oct = Math.floor(deg / 5) % 3, st = PENT[deg % 5] + 12 * oct;
    notes.push({ f: 261.63 * Math.pow(2, st / 12), nm: NAME[deg % 5] + (4 + oct), dur }); }
  const sp = document.createElement("span"); sp.className = "s";
  sp.textContent = "♪ " + notes.map(q => q.nm + (q.dur > 1 ? "·".repeat(q.dur - 1) : "")).join(" ");
  append(sp);
  try { const ac = new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain(); o.type = "square"; g.gain.value = 0;
    o.connect(g).connect(ac.destination); o.start();
    let t = ac.currentTime + 0.05;
    for (const q of notes) { const d = q.dur * 0.18;
      o.frequency.setValueAtTime(q.f, t); g.gain.setValueAtTime(0.05, t); g.gain.setValueAtTime(0, t + d - 0.03); t += d; }
    o.stop(t + 0.1); o.onended = () => ac.close();
  } catch {} });
$("godDoodle").addEventListener("click", () => { if (!ensure(512)) return;
  const n = Number(god.GodDoodleGen(24n)); if (!n) return;
  const c = document.createElement("canvas"); c.width = 160; c.height = 120;
  const cx2 = c.getContext("2d"), im = cx2.createImageData(160, 120), o32 = new Uint32Array(im.data.buffer);
  const px = new Uint8Array(godMem.buffer, gG("g_pix"), 19200);
  for (let i = 0; i < 19200; i++) o32[i] = pal32[px[i] & 15];
  cx2.putImageData(im, 0, 0); append(c); });
$("godClear").addEventListener("click", () => { out.textContent = ""; });
ov.addEventListener("pointerdown", (e) => { if (e.target === ov) close(); });
const open = () => { ov.classList.add("open"); WinRaise(ov); init(); };
const close = () => ov.classList.remove("open", "free");
$("godClose").addEventListener("click", close);
export {open as Open};
