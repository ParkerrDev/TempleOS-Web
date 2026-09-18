// _t.mjs - install HolyCraft to C:/Home via the OS's own FileWrite (with TOS_NATIVE), #include it
// (real HolyC compiles it -> compile errors show up in the OCR), then measure native fps while turning
// the camera, and dump PNGs.  Run from tools/hemu:   node --max-old-space-size=3072 _t.mjs
import { compileHemu, SITE_DIR } from "../../engine/compile.js";
import { createHemuHost } from "../../engine/host.js";
import * as jit from "../../engine/jit.js";
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { FONT } from "../../holyc-wasm/src/runtime/font.js";
const PAL = [[0,0,0],[0,0,0xaa],[0,0xaa,0],[0,0xaa,0xaa],[0xaa,0,0],[0xaa,0,0xaa],[0xaa,0x55,0],[0xaa,0xaa,0xaa],[0x55,0x55,0x55],[0x55,0x55,0xff],[0x55,0xff,0x55],[0x55,0xff,0xff],[0xff,0x55,0x55],[0xff,0x55,0xff],[0xff,0xff,0x55],[0xff,0xff,0xff]];
function crc32(b){let c=~0;for(let i=0;i<b.length;i++){c^=b[i];for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1));}return ~c>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const tt=Buffer.from(t,"latin1");const cr=Buffer.alloc(4);cr.writeUInt32BE(crc32(Buffer.concat([tt,d])));return Buffer.concat([l,tt,d,cr]);}
function dumpPng(p,idx,w,h){const raw=Buffer.alloc((w*3+1)*h);let o=0;for(let y=0;y<h;y++){raw[o++]=0;for(let x=0;x<w;x++){const c=PAL[idx[y*w+x]&15];raw[o++]=c[0];raw[o++]=c[1];raw[o++]=c[2];}}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;writeFileSync(p,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw)),chunk("IEND",Buffer.alloc(0))]));}
const RAMSZ = 402653184;
const liveBuf = readFileSync("/tmp/live.bin"), diskBuf = readFileSync("/tmp/templeos.raw");
const r = compileHemu();
const mod = await WebAssembly.compile(r.bytes);
const G = (n) => Number(r.globals.get(n).addr);
let gBase = 0, inst, lastFb = null; const keyq = []; const ovl = new Map();
const badops = new Set();
let measuring = false, presents = 0, distinct = 0, lastHash = 0;
const BUDGET = Number(process.env.BUDGET || 24000000);
const host = createHemuHost({ onText: (s) => { if (s && s.indexOf("BADOP") >= 0) { const m = s.match(/op2?=([0-9A-Fa-f]+)/); badops.add((s.includes("0F") ? "0F" : "") + (m ? m[1] : "?")); process.stdout.write("GUEST: " + s); } }, snd: { tone: () => {} },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
  diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
  present: (a, w, h, u8) => { lastFb = { a, w, h, u8 }; if (measuring) { let s = 0x811c9dc5; for (let i = 0; i < w * h; i++) s = ((s ^ u8[a + i]) * 16777619) >>> 0; presents++; if (s !== lastHash) { distinct++; lastHash = s; } } } });
host.env.__host_msx = () => 320n; host.env.__host_msy = () => 240n; host.env.__host_msb = () => 0n; host.env.__host_wheel = () => 0n;
host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n;
host.env.__host_budget = () => BigInt(BUDGET); host.env.__host_dt = () => 16n; host.env.__host_time = () => 0n;
let RIPOFF = 0;
host.env.__jit_state = (rg, fl, rp) => { RIPOFF = Number(rp); jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem, inst.exports.RasterHLE); return 1n; };
host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip)));
host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c);
let covNative = 0, covCalls = 0; const brkOps = new Map();
host.env.__jit_dispatch = (b) => { const n = jit.jitDispatch(Number(b)); if (measuring) { covNative += n; covCalls++;
  const m = new Uint8Array(inst.exports.memory.buffer); let a = gBase + Number(new DataView(inst.exports.memory.buffer).getBigUint64(RIPOFF, true)), rexW = 0;
  for (;;) { const x = m[a]; if (x === 0x66 || x === 0x67 || x === 0xF0 || x === 0xF2 || x === 0xF3 || x === 0x2E || x === 0x36 || x === 0x3E || x === 0x26 || x === 0x64 || x === 0x65 || (x >= 0x40 && x <= 0x4F)) { if (x >= 0x40 && x <= 0x4F) rexW = (x >> 3) & 1; a++; } else break; }
  let key = m[a].toString(16).padStart(2, "0"); if (m[a] === 0x0F) key = "0f" + m[a + 1].toString(16).padStart(2, "0"); else if (m[a] >= 0xD8 && m[a] <= 0xDF) { const mm = m[a + 1]; key += ` x87 /${(mm >> 3) & 7}` + (mm >= 0xC0 ? " reg" : " mem"); }
  brkOps.set(key, (brkOps.get(key) || 0) + 1); }
  return BigInt(n); };
host.env.__jit_chain = (a, b) => jit.jitChain(a, b); host.env.__jit_seg = (...a) => jit.jitSeg(...a.map(Number));
jit.jitReset();
inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
const dv = () => new DataView(inst.exports.memory.buffer);
const run = (n) => { for (let i = 0; i < n; i++) inst.exports.__main(); };
const SC = { a:0x1E,b:0x30,c:0x2E,d:0x20,e:0x12,f:0x21,g:0x22,h:0x23,i:0x17,j:0x24,k:0x25,l:0x26,m:0x32,n:0x31,o:0x18,p:0x19,q:0x10,r:0x13,s:0x1F,t:0x14,u:0x16,v:0x2F,w:0x11,x:0x2D,y:0x15,z:0x2C,"0":0x0B,"1":0x02,"2":0x03,"3":0x04,"4":0x05,"5":0x06,"6":0x07,"7":0x08,"8":0x09,"9":0x0A," ":0x39,"=":0x0D,";":0x27,"\n":0x1C,",":0x33,".":0x34,"/":0x35,"-":0x0C,"'":0x28,"[":0x1A,"]":0x1B,"\\":0x2B };
const SHIFTED = { "*":"8","(":"9",")":"0","&":"7","_":"-","+":"=",":":";","\"":"'","{":"[","}":"]","|":"\\","<":",",">":".","?":"/","!":"1","@":"2","#":"3","$":"4","%":"5","^":"6" };
function typeStr(s){ for (const ch of s){ const shifted = SHIFTED[ch]!==undefined||(ch>="A"&&ch<="Z"); const base=SHIFTED[ch]!==undefined?SHIFTED[ch]:ch.toLowerCase(); const sc=SC[base]; if(sc===undefined) throw new Error("no sc for "+JSON.stringify(ch)); if(shifted)keyq.push(0x2A); keyq.push(sc);keyq.push(sc|0x80); if(shifted)keyq.push(0x2A|0x80); run(3);} run(30); }
function popcnt8(v){v=v-((v>>1)&0x55);v=(v&0x33)+((v>>2)&0x33);return (v+(v>>4))&0x0F;}
function screenText(){ if(!lastFb) return "(no frame)"; const {a,w,h,u8}=lastFb,cols=w>>3,rows=h>>3,lines=[]; for(let cy=0;cy<rows;cy++){let line="";for(let cx=0;cx<cols;cx++){const pat=new Uint8Array(8);const cm=new Map();for(let y=0;y<8;y++)for(let x=0;x<8;x++){const c=u8[a+(cy*8+y)*w+cx*8+x];cm.set(c,(cm.get(c)||0)+1);}const bg=[...cm.entries()].sort((p,q)=>q[1]-p[1])[0][0];for(let y=0;y<8;y++){let b=0;for(let x=0;x<8;x++)if(u8[a+(cy*8+y)*w+cx*8+x]!==bg)b|=1<<x;pat[y]=b;}let best=32,bs=1e9;for(let g=32;g<127;g++){let s=0;for(let y=0;y<8;y++)s+=popcnt8(pat[y]^FONT[g*8+y]);if(s<bs){bs=s;best=g;}}line+=bs<=12?String.fromCharCode(best):(pat.every(v=>!v)?" ":"?");}lines.push(line.trimEnd());}return lines.filter(l=>l).join("\n"); }
function nonbg(){ const f=lastFb; if(!f) return 0; let nz=0; for(let i=0;i<f.w*f.h;i++){const c=f.u8[f.a+i]; if(c && c!==1 && c!==11) nz++;} return 100*nz/(f.w*f.h); }

// ---- boot to a clean prompt (same recipe as launch.mjs) ----
run(400);
keyq.push(0x31, 0xB1); run(40);                         // 'n' to "Take Tour?"
keyq.push(0x01, 0x81); run(60);                          // Esc -> desktop
let ready = false;
for (let t = 0; t < 8 && !ready; t++) { typeStr("1;\n"); run(220); if (/C:\/[A-Za-z]*>/.test(screenText())) { ready = true; console.error(`prompt ready (round ${t+1})`); } else { keyq.push(0x01,0x81); run(80); } }
if (!ready) console.error("WARN: no clean prompt; proceeding anyway");

// ---- install HolyCraft via the OS's own FileWrite (TOS_NATIVE), then #include it ----
const SCRATCH = 0x16800000, MBOX = 0x16700000;
const game = readFileSync(SITE_DIR + "/games/HolyCraft.HC", "latin1");
const payload = "#define TOS_NATIVE 1\n" + game;
const bytes = Buffer.from(payload, "latin1");
new Uint8Array(inst.exports.memory.buffer).set(bytes, gBase + SCRATCH);
keyq.push(0x01,0x81); run(120);                          // Esc (clear any AutoComplete)
dv().setBigUint64(gBase + MBOX, 0n, true);
typeStr(`*(0x16700000)(I64*)=FileWrite("C:/Home/HolyCraft.HC",0x16800000,${bytes.length});\n`);
run(1200);
const wrote = dv().getBigInt64(gBase + MBOX, true);
console.error(`FileWrite -> ${wrote} (${wrote ? "OK" : "FAILED"}), staged ${bytes.length} b`);
typeStr(`#include "C:/Home/HolyCraft.HC";\n`);
run(Number(process.env.COMPILE || 6000));                // compile (real HolyC) + init + first frames
console.error(`after #include: nonbg=${nonbg().toFixed(1)}%`);
if (lastFb) dumpPng("/tmp/hc_after.png", lastFb.u8.subarray(lastFb.a, lastFb.a + lastFb.w * lastFb.h), lastFb.w, lastFb.h);
console.error("=== OCR after #include ===\n" + screenText().split("\n").slice(0,8).join("\n"));

// ---- measure fps while MOVING (walk 'w' + turn 'l', held in bursts) so frames genuinely differ ----
measuring = true; presents = 0; distinct = 0; lastHash = 0;
const ic0 = Number(dv().getBigUint64(G("icount"), true));
const wall0 = performance.now();
const MF = Number(process.env.MF || 900);                // measured frames (@16ms guest -> ~14s guest time)
let f = 0, dumpedMid = false;
while (f < MF) {
  keyq.push(0x11, 0x26);                                  // 'w' down + 'l' down  (walk forward + turn right)
  for (let k = 0; k < 6 && f < MF; k++) { inst.exports.__main(); f++; if (f === 120 && !dumpedMid && lastFb) { dumpPng("/tmp/hc_mid.png", lastFb.u8.subarray(lastFb.a, lastFb.a + lastFb.w * lastFb.h), lastFb.w, lastFb.h); dumpedMid = true; } }
  keyq.push(0x91, 0xA6);                                  // 'w' up + 'l' up
  for (let k = 0; k < 2 && f < MF; k++) { inst.exports.__main(); f++; }
}
measuring = false;
const fps = distinct / MF * (1000 / 16);
const ic1 = Number(dv().getBigUint64(G("icount"), true));
const wallMs = (performance.now() - wall0) / MF;                          // real host ms per __main
const mainRate = wallMs > 16.67 ? 1000 / wallMs : 60;                     // real worker __main/s (60Hz-paced unless slower)
const realFps = mainRate * distinct / MF;                                 // wall-clock fps the worker would show
console.error(`MEASURE: ${distinct} distinct / ${presents} presents over ${MF} frames  ->  guestFps~${fps.toFixed(1)}  nonbg=${nonbg().toFixed(1)}%  instr/__main=${((ic1-ic0)/MF/1e6).toFixed(1)}M  wall=${wallMs.toFixed(1)}ms/__main  -> REAL~${realFps.toFixed(1)}fps (${wallMs>16.67?"WALL-bound":"guest-bound"})`);
console.error(`JIT: ${(100*covNative/Math.max(1,ic1-ic0)).toFixed(1)}% native (${(covNative/1e9).toFixed(2)}B of ${((ic1-ic0)/1e9).toFixed(2)}B), ${covCalls} interp-handoffs/measure, avg ${(covNative/Math.max(1,covCalls)).toFixed(0)} instr/JIT-block`);
console.error("top JIT break-ops (where it hands back to the interpreter): " + [...brkOps.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([k,c])=>`${k}×${c}`).join("  "));
{ const rd64=(n)=>{ try { return Number(dv().getBigUint64(G(n),true)); } catch { return -1; } };
  console.error(`HLE: game_running=${rd64("g_game_running")} poly3_hle=0x${rd64("g_poly3_hle").toString(16)} poly3_calls=${rd64("g_poly3_calls")} poly3_scanned=${rd64("g_poly3_scanned")} raster_n=${rd64("g_raster_n")} raster_calls=${rd64("g_raster_calls")}`); }
if (lastFb) { dumpPng("/tmp/hc_play.png", lastFb.u8.subarray(lastFb.a, lastFb.a + lastFb.w * lastFb.h), lastFb.w, lastFb.h); console.error("wrote /tmp/hc_play.png (+ /tmp/hc_after.png)"); }
console.log("=== final OCR " + (badops.size ? "BADOP:[" + [...badops].join(",") + "]" : "no-badop") + " ===");
console.log(screenText());
process.exit(0);
