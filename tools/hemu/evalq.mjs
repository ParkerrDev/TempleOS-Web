// evalq.mjs - evaluate guest I64 expressions in the running OS and print them. The OS compiler
// resolves the names. EXPRS='mp_cnt;Fs->num;...' (semicolon-separated). Reuses getsrc boot machinery.
import { compileHemu } from "../../engine/compile.js";
import { createHemuHost } from "../../engine/host.js";
import * as jit from "../../engine/jit.js";
import { readFileSync } from "node:fs";
import { FONT } from "../../holyc-wasm/src/runtime/font.js";
const RAMSZ = 402653184, MBOX = 0x16700000;
const liveBuf = readFileSync("/tmp/live.bin"), diskBuf = readFileSync("/tmp/templeos.raw");
const r = compileHemu();
const mod = await WebAssembly.compile(r.bytes);
let gBase = 0, inst, lastFb = null; const keyq = []; const ovl = new Map();
const host = createHemuHost({ onText: () => {}, snd: { tone: () => {} },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
  diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
  present: (a, w, h, u8) => { lastFb = { a, w, h, u8 }; } });
host.env.__host_msx = () => 320n; host.env.__host_msy = () => 240n; host.env.__host_msb = () => 0n; host.env.__host_wheel = () => 0n;
host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n;
host.env.__host_budget = () => 12000000n; host.env.__host_dt = () => 16n; host.env.__host_time = () => 0n;
host.env.__jit_state = (rg, fl, rp) => { jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem, inst.exports.RasterHLE); return 1n; };
host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip)));
host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c);
host.env.__jit_dispatch = (b) => BigInt(jit.jitDispatch(Number(b)));
host.env.__jit_chain = (a, b) => jit.jitChain(a, b); host.env.__jit_seg = (...a) => jit.jitSeg(...a.map(Number));
jit.jitReset();
inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
const run = (n) => { for (let i = 0; i < n; i++) inst.exports.__main(); };
const dv = () => new DataView(inst.exports.memory.buffer);
const SC = { a:0x1E,b:0x30,c:0x2E,d:0x20,e:0x12,f:0x21,g:0x22,h:0x23,i:0x17,j:0x24,k:0x25,l:0x26,m:0x32,n:0x31,o:0x18,p:0x19,q:0x10,r:0x13,s:0x1F,t:0x14,u:0x16,v:0x2F,w:0x11,x:0x2D,y:0x15,z:0x2C,"0":0x0B,"1":0x02,"2":0x03,"3":0x04,"4":0x05,"5":0x06,"6":0x07,"7":0x08,"8":0x09,"9":0x0A," ":0x39,"=":0x0D,";":0x27,"\n":0x1C,",":0x33,".":0x34,"/":0x35,"-":0x0C,"'":0x28,"[":0x1A,"]":0x1B,"\\":0x2B };
const SHIFTED = { "*":"8","(":"9",")":"0","&":"7","_":"-","+":"=",":":";","\"":"'","{":"[","}":"]","|":"\\","<":",",">":".","?":"/","!":"1","@":"2","#":"3","$":"4","%":"5","^":"6" };
function typeStr(s){ for (const ch of s){ const shifted = SHIFTED[ch]!==undefined||(ch>="A"&&ch<="Z"); const base=SHIFTED[ch]!==undefined?SHIFTED[ch]:ch.toLowerCase(); const sc=SC[base]; if(sc===undefined) throw new Error("no sc for "+JSON.stringify(ch)); if(shifted)keyq.push(0x2A); keyq.push(sc);keyq.push(sc|0x80); if(shifted)keyq.push(0x2A|0x80); run(3);} run(30); }
function popcnt8(v){v=v-((v>>1)&0x55);v=(v&0x33)+((v>>2)&0x33);return (v+(v>>4))&0x0F;}
function screenText(){ if(!lastFb) return ""; const {a,w,h,u8}=lastFb,cols=w>>3,rows=h>>3,lines=[]; for(let cy=0;cy<rows;cy++){let line="";for(let cx=0;cx<cols;cx++){const pat=new Uint8Array(8);const cm=new Map();for(let y=0;y<8;y++)for(let x=0;x<8;x++){const c=u8[a+(cy*8+y)*w+cx*8+x];cm.set(c,(cm.get(c)||0)+1);}const bg=[...cm.entries()].sort((p,q)=>q[1]-p[1])[0][0];for(let y=0;y<8;y++){let b=0;for(let x=0;x<8;x++)if(u8[a+(cy*8+y)*w+cx*8+x]!==bg)b|=1<<x;pat[y]=b;}let best=32,bs=1e9;for(let g=32;g<127;g++){let s=0;for(let y=0;y<8;y++)s+=popcnt8(pat[y]^FONT[g*8+y]);if(s<bs){bs=s;best=g;}}line+=bs<=12?String.fromCharCode(best):(pat.every(v=>!v)?" ":"?");}lines.push(line.trimEnd());}return lines.filter(l=>l).join("\n"); }
run(400);
keyq.push(0x31); keyq.push(0xB1); run(40);
keyq.push(0x01); keyq.push(0x81); run(60);
let ready = false;
for (let t = 0; t < 8 && !ready; t++) { typeStr("1;\n"); run(220); if (/C:\/[A-Za-z]*>/.test(screenText())) { ready = true; console.error(`prompt ready (round ${t+1})`); } else { keyq.push(0x01); keyq.push(0x81); run(80); } }
const EXPRS = (process.env.EXPRS || "mp_cnt").split(";").filter(x => x.trim());
for (let i = 0; i < EXPRS.length; i++) dv().setBigUint64(gBase + MBOX + i * 8, 0xDEADn, true);
let cmd = "";
for (let i = 0; i < EXPRS.length; i++) cmd += `*(0x${(MBOX + i * 8).toString(16).toUpperCase()})(I64*)=(${EXPRS[i].trim()});`;
typeStr(cmd + "\n");
run(300);
for (let i = 0; i < EXPRS.length; i++) { const v = dv().getBigInt64(gBase + MBOX + i * 8, true); console.log(`${EXPRS[i].trim()} = ${v} (0x${(v < 0n ? v + (1n << 64n) : v).toString(16)})`); }
process.exit(0);
