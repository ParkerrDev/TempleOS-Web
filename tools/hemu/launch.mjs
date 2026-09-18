// launch.mjs - drive the TempleOS shell: type a command (CMD=...), optionally tap gameplay keys
// (KEYS=1), then OCR the screen + dump a PNG. Reuses whoat.mjs's boot/type/OCR machinery.
//   CMD='Dir("::/Demo/Games");' node --max-old-space-size=3072 launch.mjs
//   CMD='#include "::/Demo/Games/Caliber/Caliber";' KEYS=1 NAME=caliber node ... launch.mjs
import { compileHemu } from "../../engine/compile.js";
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
let gBase = 0, inst, lastFb = null; const keyq = []; const ovl = new Map();
const badops = new Set();
const host = createHemuHost({ onText: (s) => { if (s && s.indexOf("BADOP") >= 0) { const m = s.match(/op2?=([0-9A-Fa-f]+)/); badops.add((s.includes("0F") ? "0F" : "") + (m ? m[1] : "?")); } }, snd: { tone: () => {} },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
  diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
  present: (a, w, h, u8) => { lastFb = { a, w, h, u8 }; } });
host.env.__host_msx = () => 320n; host.env.__host_msy = () => 240n; host.env.__host_msb = () => 0n; host.env.__host_wheel = () => 0n;
host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n;
host.env.__host_budget = () => 12000000n; host.env.__host_dt = () => 16n; host.env.__host_time = () => 0n;
let RIPOFF = 0, covNative = 0, covCalls = 0; const brkRips = new Map(); let cov = false;
host.env.__jit_state = (rg, fl, rp) => { RIPOFF = Number(rp); jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem, inst.exports.RasterHLE); return 1n; };
host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip)));
host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c);
host.env.__jit_dispatch = (b) => { const n = jit.jitDispatch(Number(b)); if (cov) { covNative += n; covCalls++; const rp = Number(dvX().getBigUint64(RIPOFF, true)); brkRips.set(rp, (brkRips.get(rp) || 0) + 1); } return BigInt(n); };
host.env.__jit_chain = (a, b) => jit.jitChain(a, b); host.env.__jit_seg = (...a) => jit.jitSeg(...a.map(Number));
const dvX = () => new DataView(inst.exports.memory.buffer);
jit.jitReset();
inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
const run = (n) => { for (let i = 0; i < n; i++) inst.exports.__main(); };
const dv = () => new DataView(inst.exports.memory.buffer);
const SC = { a:0x1E,b:0x30,c:0x2E,d:0x20,e:0x12,f:0x21,g:0x22,h:0x23,i:0x17,j:0x24,k:0x25,l:0x26,m:0x32,n:0x31,o:0x18,p:0x19,q:0x10,r:0x13,s:0x1F,t:0x14,u:0x16,v:0x2F,w:0x11,x:0x2D,y:0x15,z:0x2C,"0":0x0B,"1":0x02,"2":0x03,"3":0x04,"4":0x05,"5":0x06,"6":0x07,"7":0x08,"8":0x09,"9":0x0A," ":0x39,"=":0x0D,";":0x27,"\n":0x1C,",":0x33,".":0x34,"/":0x35,"-":0x0C,"'":0x28,"[":0x1A,"]":0x1B,"\\":0x2B };
const SHIFTED = { "*":"8","(":"9",")":"0","&":"7","_":"-","+":"=",":":";","\"":"'","{":"[","}":"]","|":"\\","<":",",">":".","?":"/","!":"1","@":"2","#":"3","$":"4","%":"5","^":"6" };
function typeStr(s){ for (const ch of s){ const shifted = SHIFTED[ch]!==undefined||(ch>="A"&&ch<="Z"); const base=SHIFTED[ch]!==undefined?SHIFTED[ch]:ch.toLowerCase(); const sc=SC[base]; if(sc===undefined) throw new Error("no sc for "+JSON.stringify(ch)); if(shifted)keyq.push(0x2A); keyq.push(sc);keyq.push(sc|0x80); if(shifted)keyq.push(0x2A|0x80); run(3);} run(30); }
function popcnt8(v){v=v-((v>>1)&0x55);v=(v&0x33)+((v>>2)&0x33);return (v+(v>>4))&0x0F;}
function screenText(){ if(!lastFb) return "(no frame)"; const {a,w,h,u8}=lastFb,cols=w>>3,rows=h>>3,lines=[]; for(let cy=0;cy<rows;cy++){let line="";for(let cx=0;cx<cols;cx++){const pat=new Uint8Array(8);const cm=new Map();for(let y=0;y<8;y++)for(let x=0;x<8;x++){const c=u8[a+(cy*8+y)*w+cx*8+x];cm.set(c,(cm.get(c)||0)+1);}const bg=[...cm.entries()].sort((p,q)=>q[1]-p[1])[0][0];for(let y=0;y<8;y++){let b=0;for(let x=0;x<8;x++)if(u8[a+(cy*8+y)*w+cx*8+x]!==bg)b|=1<<x;pat[y]=b;}let best=32,bs=1e9;for(let g=32;g<127;g++){let s=0;for(let y=0;y<8;y++)s+=popcnt8(pat[y]^FONT[g*8+y]);if(s<bs){bs=s;best=g;}}line+=bs<=12?String.fromCharCode(best):(pat.every(v=>!v)?" ":"?");}lines.push(line.trimEnd());}return lines.filter(l=>l).join("\n"); }

run(400);
keyq.push(0x31); keyq.push(0xB1); run(40);              // 'n' answers "Take Tour(y or n)?"
keyq.push(0x01); keyq.push(0x81); run(60);              // Esc: close the Welcome doc -> desktop Cmd line
let ready = false;
for (let t = 0; t < 8 && !ready; t++) { typeStr("1;\n"); run(220); if (/C:\/[A-Za-z]*>/.test(screenText())) { ready = true; console.error(`prompt ready (round ${t+1})`); } else { keyq.push(0x01); keyq.push(0x81); run(80); } }
if (!ready) console.error("WARN: no clean prompt; proceeding anyway");
const CMD = process.env.CMD || 'Dir("::/Demo/Games");';
const G = (n) => Number(r.globals.get(n).addr);
const ic = () => Number(dv().getBigUint64(G("icount"), true));
const ripHist = new Map(); let sampling = false;
const runS = (n) => { for (let i = 0; i < n; i++) { inst.exports.__main(); if (sampling && RIPOFF) { const rp = Number(dv().getBigUint64(RIPOFF, true)); ripHist.set(rp, (ripHist.get(rp) || 0) + 1); } } };
typeStr(CMD + "\n");
const ic0 = ic(); sampling = true; cov = !!process.env.COV;
if (process.env.PROG) {                                  // watch for progress: run chunks, report icount + whether the screen changed
  const chunks = Number(process.env.PROG), CH = Number(process.env.CHUNK || 300);
  let sawBlank = false;
  for (let c = 0; c < chunks; c++) { runS(CH); const t = screenText(); const first = t.split("\n")[0] || "";
    let nz = 0; const f = lastFb; if (f) for (let i = 0; i < f.w * f.h; i++) if (f.u8[f.a + i] && f.u8[f.a + i] !== 1) nz++;
    const pct = 100 * nz / (f.w * f.h);
    console.error(`chunk ${c+1}/${chunks}: ic=${(ic()/1e9).toFixed(1)}B  init=${/nitializ/.test(t)?"Y":"n"}  nonbg=${pct.toFixed(1)}%  | ${first.slice(0,40)}`);
    if (pct < 5) sawBlank = true;
    else if (sawBlank && pct > 20) { console.error(`>>> INIT COMPLETE at ${(ic()/1e9).toFixed(1)}B instr - terrain is drawing (nonbg ${pct.toFixed(1)}%)`); break; }   // blank -> drawn = game started
  }
} else runS(Number(process.env.BOOT || 400));
sampling = false;
const icD = ic() - ic0;
console.error(`post-cmd icount: ${(icD/1e6).toFixed(0)}M (${icD ? "busy" : "idle"});  top RIPs: ` + [...ripHist.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([r,c])=>`0x${r.toString(16)}(x${c})`).join(" "));
if (process.env.COV) {
  console.error(`JIT coverage: ${(100*covNative/Math.max(1,icD)).toFixed(1)}% native (${(covNative/1e9).toFixed(1)}B of ${(icD/1e9).toFixed(1)}B), ${covCalls} dispatches, avg ${(covNative/Math.max(1,covCalls)).toFixed(0)} instr/block`);
  console.error("top chain-break RIPs (where the JIT keeps handing back to the interpreter):");
  for (const [rp, c] of [...brkRips.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12)) console.error(`   0x${rp.toString(16)}  x${c}`);
}
if (process.env.KEYS) for (const [mk,bk] of [[0x39,0xB9],[0x1C,0x9C],[0x39,0xB9],[0x48,0xC8],[0x50,0xD0],[0x4B,0xCB],[0x4D,0xCD],[0x39,0xB9]]) { keyq.push(mk); run(10); keyq.push(bk); run(10); run(40); }
const NAME = process.env.NAME || "cmd";
if (lastFb) { dumpPng("/tmp/launch_" + NAME + ".png", lastFb.u8.subarray(lastFb.a, lastFb.a + lastFb.w * lastFb.h), lastFb.w, lastFb.h); console.error("wrote /tmp/launch_" + NAME + ".png"); }
console.log("=== OCR (" + NAME + ") " + (badops.size ? "BADOP:[" + [...badops].join(",") + "]" : "no-badop") + " ===");
console.log(screenText());
process.exit(0);   // skip node's GC-at-exit on the ~1GB guest buffers (it can segfault on teardown)
