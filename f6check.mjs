// f6check.mjs — boot desktop, press F6 (God Song), report liveliness + faults.
// Mirrors deploycheck.mjs wiring exactly (prebuilt snapshot.wasm + JIT). NOJIT=1 for interp.
import { createHost } from "./holyc-wasm/src/runtime/host.js";
import * as jit from "./jit.js";
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
const PAL = [[0,0,0],[0,0,0xaa],[0,0xaa,0],[0,0xaa,0xaa],[0xaa,0,0],[0xaa,0,0xaa],[0xaa,0x55,0],[0xaa,0xaa,0xaa],
  [0x55,0x55,0x55],[0x55,0x55,0xff],[0x55,0xff,0x55],[0x55,0xff,0xff],[0xff,0x55,0x55],[0xff,0x55,0xff],[0xff,0xff,0x55],[0xff,0xff,0xff]];
function crc32(buf){let c=~0;for(let i=0;i<buf.length;i++){c^=buf[i];for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1));}return ~c>>>0;}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const t=Buffer.from(type,"latin1");const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([len,t,data,crc]);}
function dumpPng(path,idx,w,h){const raw=Buffer.alloc((w*3+1)*h);let o=0;for(let y=0;y<h;y++){raw[o++]=0;for(let x=0;x<w;x++){const p=PAL[idx[y*w+x]&15];raw[o++]=p[0];raw[o++]=p[1];raw[o++]=p[2];}}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ihdr),chunk("IDAT",deflateSync(raw)),chunk("IEND",Buffer.alloc(0))]);
  writeFileSync(path,png);}
const RAMSZ = 402653184;
const liveBuf = readFileSync("/tmp/live.bin");
const diskBuf = readFileSync("/tmp/templeos.raw");
const NOJIT = !!process.env.NOJIT;
const mod = await WebAssembly.compile(readFileSync("./hemu-wasm/snapshot.wasm"));

let mx = 320, my = 240, mb = 0, gBase = 0, inst, bad = false, badmsg = "";
let curBudget = 1500000, dtMs = 16;
let measuring = false, presents = 0, distinct = 0, lastHash = 0, lastNz = 0;
const keyq = []; const ovl = new Map();
let toneCalls = 0;
const host = createHost({ onText: (s) => { if (s && s.indexOf("BADOP") >= 0) { bad = true; badmsg += s; process.stdout.write("GUEST: " + s); } }, snd: { tone: () => { toneCalls++; } },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
  diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
  present: (a, w, h, u8) => { lastFrame = { a, w, h, u8 }; if (!measuring) return; let s = 0x811c9dc5, nz = 0; for (let i = 0; i < w * h; i++) { const v = u8[a + i]; s = ((s ^ v) * 16777619) >>> 0; if (v) nz++; } presents++; lastNz = nz / (w * h); if (s !== lastHash) { distinct++; lastHash = s; } } });
let lastFrame = null;
const snap = (path) => { if (!lastFrame) return; const { a, w, h, u8 } = lastFrame; dumpPng(path, u8.subarray(a, a + w * h), w, h);
  const hist = new Array(16).fill(0); for (let i = 0; i < w * h; i++) hist[u8[a + i] & 15]++;
  const top = hist.map((c, i) => [i, c]).filter(x => x[1] > 0).sort((p, q) => q[1] - p[1]).slice(0, 5).map(x => `c${x[0]}=${(x[1] * 100 / (w * h)).toFixed(0)}%`).join(" ");
  console.log("wrote " + path + "  [" + top + "]"); };
host.env.__host_msx = () => BigInt(mx); host.env.__host_msy = () => BigInt(my); host.env.__host_msb = () => BigInt(mb); host.env.__host_wheel = () => 0n;
host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n; host.env.__host_prof = () => {};
host.env.__host_budget = () => BigInt(curBudget | 0); host.env.__host_dt = () => BigInt(dtMs | 0);
let ripOff = 0, dispCalls = 0, dispInstr = 0, mainCalls = 0;
let classify = false, exitsOk = 0, punts = 0; const puntRips = new Map();
if (!NOJIT) {
  host.env.__jit_state = (rg, fl, rp) => { ripOff = Number(rp); jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem, inst.exports.RasterHLE); return 1n; };
  host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip)));
  host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
  host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c);
  host.env.__jit_dispatch = (b) => { const r = jit.jitDispatch(Number(b)); dispCalls++; dispInstr += r;
    if (classify) { const rp = Number(dv().getBigUint64(ripOff, true)); const ins = jit.jitInspect(rp);
      if (ins.cached && ins.ninstr > 0) exitsOk++; else { punts++; puntRips.set(rp, (puntRips.get(rp) || 0) + 1); } }
    return BigInt(r); };
  host.env.__jit_chain = (a, b) => jit.jitChain(a, b);
  host.env.__jit_seg = (...a) => jit.jitSeg(...a.map(Number));
  jit.jitReset();
}
inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
const dv = () => new DataView(inst.exports.memory.buffer);
const jiffies = () => Number(dv().getBigUint64(gBase + 0xBD98, true));
const wmUpdates = () => Number(dv().getBigUint64(gBase + 0x1140cbf0, true));   // winmgr.updates (via asksym)
const focusTask = () => Number(dv().getBigUint64(gBase + 0x93f8, true));       // sys_focus_task

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
let sampling = false; const ripHist = new Map();
const sampleRip = () => { if (!sampling || !ripOff) return; const r = Number(dv().getBigUint64(ripOff, true)); ripHist.set(r, (ripHist.get(r) || 0) + 1); };
const run = async (n) => { for (let i = 0; i < n; i++) { await step(); sampleRip(); } };
const dumpRips = (label) => { const top = [...ripHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12); console.log(`-- ${label} top rips --`); for (const [r, c] of top) console.log(`  0x${r.toString(16)}  x${c}`); ripHist.clear(); };
const key = async (...scs) => { for (const s of scs) { keyq.push(s); await run(4); } };

const measure = async (label, frames) => {
  measuring = true; presents = 0; distinct = 0; const tc0 = toneCalls;
  const dc0 = dispCalls, di0 = dispInstr, wm0 = wmUpdates();
  const j0 = jiffies(), t0 = performance.now();
  await run(frames);
  const wallD = (performance.now() - t0) / 1000, jRate = (jiffies() - j0) / wallD;
  const native = dispInstr - di0, calls = dispCalls - dc0;
  console.log(`${label} (${NOJIT ? "INTERP" : "JIT"}): ${(distinct / wallD).toFixed(1)} distinct fps, clock ${(jRate / 1000).toFixed(2)}x, ${(lastNz * 100).toFixed(0)}% non-black, budget ${(curBudget/1e6).toFixed(1)}M, disp ${(calls / wallD / 1000).toFixed(0)}k/s avg ${(native / Math.max(1, calls)).toFixed(0)} instr, wmfps ${((wmUpdates() - wm0) / wallD).toFixed(1)}, focus 0x${focusTask().toString(16)}, tones ${toneCalls - tc0} ${bad ? "BADOP!" : ""}`);
  measuring = false;
};

await run(150);
sampling = true; await measure("DESKTOP", 240); sampling = false; dumpRips("DESKTOP");
// Dismiss the boot "Take Tour(y or n)?" prompt with 'n' (0x31/0xB1), then Enter, to reach a clean Cmd line.
await key(0x31, 0xB1); await run(30); await key(0x1C, 0x9C); await run(40);
measuring = true; await run(2); snap("/tmp/n_desktop.png"); measuring = false;
// Press F6 (God Song): make 0x40, break 0xC0
await key(0x40, 0xC0);
await run(60);                          // let popups open
measuring = true; await run(2); snap("/tmp/n_f6a.png"); measuring = false;
classify = true; exitsOk = 0; punts = 0; puntRips.clear(); sampling = true;
await measure("AFTER-F6", 420);
classify = false;
console.log(`-- chain exits: ${exitsOk} continuable (flag/cap), ${punts} punts --`);
for (const [r, c] of [...puntRips.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  punt at 0x${r.toString(16)}  x${c}`);
measuring = true; await run(2); snap("/tmp/n_f6b.png"); measuring = false;
await measure("AFTER-F6b", 420); sampling = false; dumpRips("AFTER-F6");
measuring = true; await run(2); snap("/tmp/n_f6c.png"); measuring = false;
// Dismiss the modal form with Esc -> does the desktop recover (text renders, budget back up)?
await key(0x01, 0x81); await run(180);
measuring = true; await run(2); snap("/tmp/n_f6_esc.png"); measuring = false;
await measure("AFTER-ESC", 300);
await key(0x01, 0x81); await run(180);
measuring = true; await run(2); snap("/tmp/n_f6_esc2.png"); measuring = false;
await measure("AFTER-ESC2", 300);
console.log(bad ? `FAULT: ${badmsg.slice(0,200)}` : "no fault");
