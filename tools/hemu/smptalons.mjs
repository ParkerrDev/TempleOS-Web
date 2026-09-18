// smptalons.mjs - launch Talons on the multi-core engine and show its parallel MPDoPanels workers
// running on the APs. Orchestrator: core 0 on the JIT (fast: desktop, shell, Talons main, the Spawns
// + I_WAKE IPIs), APs via RunCore (IPI-woken, pure interp). Types the include at the shell prompt.
import { compileHemu } from "../../engine/compile.js";
import { createHemuHost } from "../../engine/host.js";
// one jit.js instance PER CORE (distinct URL = distinct module state -> per-core compiled blocks +
// per-core baked reg offsets). APs run single blocks via jitRun (no shared g_jit_rip dependency).
const jits = [await import("../../engine/jit.js"), await import("./jit.js?c1"), await import("./jit.js?c2"), await import("./jit.js?c3")];
const jit = jits[0];
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { FONT } from "../../holyc-wasm/src/runtime/font.js";
const PAL=[[0,0,0],[0,0,0xaa],[0,0xaa,0],[0,0xaa,0xaa],[0xaa,0,0],[0xaa,0,0xaa],[0xaa,0x55,0],[0xaa,0xaa,0xaa],[0x55,0x55,0x55],[0x55,0x55,0xff],[0x55,0xff,0x55],[0x55,0xff,0xff],[0xff,0x55,0x55],[0xff,0x55,0xff],[0xff,0xff,0x55],[0xff,0xff,0xff]];
function crc32(x){let c=~0;for(let i=0;i<x.length;i++){c^=x[i];for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1));}return ~c>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const tt=Buffer.from(t,"latin1");const cr=Buffer.alloc(4);cr.writeUInt32BE(crc32(Buffer.concat([tt,d])));return Buffer.concat([l,tt,d,cr]);}
function dumpPng(p,idx,w,h){const raw=Buffer.alloc((w*3+1)*h);let o=0;for(let y=0;y<h;y++){raw[o++]=0;for(let x=0;x<w;x++){const c=PAL[idx[y*w+x]&15];raw[o++]=c[0];raw[o++]=c[1];raw[o++]=c[2];}}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;writeFileSync(p,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw)),chunk("IEND",Buffer.alloc(0))]));}
const RAMSZ = 402653184;
const liveBuf = readFileSync("/tmp/hemusnap/live-smp.bin"), diskBuf = readFileSync("/tmp/templeos.raw");
const r = compileHemu({ smp: true });
const G = (n) => Number(r.globals.get(n).addr);
const mod = await WebAssembly.compile(r.bytes);
const sharedMem = new WebAssembly.Memory({ initial: 512, maximum: 8192, shared: true });
let mx = 320, my = 240, mb = 0, gBase = 0, inst, bad = false, lastFrame = null;
const keyq = []; const ovl = new Map();
const host = createHemuHost({ onText: (s) => { if (s && s.indexOf("BADOP") >= 0) { bad = true; process.stdout.write("GUEST:" + s.slice(0,80)); } }, snd: { tone: () => {} },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
  diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
  present: (a, w, h, u8) => { lastFrame = { a, w, h, u8 }; } });
host.env.__host_msx = () => BigInt(mx); host.env.__host_msy = () => BigInt(my); host.env.__host_msb = () => BigInt(mb); host.env.__host_wheel = () => 0n;
host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n;
let curBudget = Number(process.env.B0 || 4000000);
const APB = BigInt(process.env.APB || 3000000);
host.env.__host_budget = () => BigInt(curBudget); host.env.__host_dt = () => 16n;
// JIT only runs for core 0 (jitState gets core 0's offsets); APs use RunCore (pure interp), so the
// shared jit.js never sees a non-core-0 offset.
const cur = () => Number(inst.exports.__core.value);    // route JIT host imports to the running core's jit
host.env.__jit_state = (rg, fl, rp) => { jits[cur()].jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem, inst.exports.RasterHLE); return 1n; };
host.env.__jit_compile = (rip) => BigInt(jits[cur()].jitCompile(Number(rip)));
host.env.__jit_run = (rip) => BigInt(jits[cur()].jitRun(Number(rip)));
host.env.__jit_x87 = (a, b, c) => jits[cur()].jitX87(a, b, c);
host.env.__jit_dispatch = (b) => BigInt(jits[cur()].jitDispatch(Number(b)));
host.env.__jit_chain = (a, b) => jits[cur()].jitChain(a, b); host.env.__jit_seg = (...a) => jits[cur()].jitSeg(...a.map(Number));
const apHot = [new Map(), new Map(), new Map(), new Map()];   // per-core hotness for __ap_run
globalThis.apJitN = 0; globalThis.apJitInstr = 0; globalThis.apMiss = 0;
host.env.__ap_run = (rip, bud) => { rip = Number(rip); const k = cur(); const J = jits[k];
  if (!J.jitInspect(rip).cached) { const h = (apHot[k].get(rip) || 0) + 1; apHot[k].set(rip, h); if (h <= 2) { globalThis.apMiss++; return 0n; } J.jitCompile(rip); }
  const n = J.jitDispatch(Number(bud)); if (n > 0) { globalThis.apJitN++; globalThis.apJitInstr += n; } else globalThis.apMiss++; return BigInt(n); };
host.env.mem = sharedMem; jits.forEach((j) => j.jitReset());
inst = await WebAssembly.instantiate(mod, { env: host.env });
inst.exports.__sp.value = 0x1000000n; inst.exports.__core.value = 0n;
host.attach(inst); inst.exports.__rt_init();
const dv = () => new DataView(inst.exports.memory.buffer);
const rd = (a) => Number(dv().getBigUint64(a, true));
inst.exports.__main();
const ICOUNT = G("icount"), NCORE = rd(G("g_ncore")), IPI = G("g_ipi_pending");
// set up each AP's jit with ITS core's CCpuState offsets (the APs never call __jit_state themselves)
{ const CST2 = G("g_cpu_st"), ST = 440, oc = (k, o) => CST2 + k * ST + o;
  const TSC = G("tsc"), XLO = G("g_xmm_lo"), XHI = G("g_xmm_hi"), RM = inst.exports.RdMem, WM = inst.exports.WrMem, RH = inst.exports.RasterHLE, MM = inst.exports.memory;
  for (let k = 1; k < NCORE; k++) { jits[k].jitState(oc(k, 0), oc(k, 136), oc(k, 128), gBase, MM, RM, WM, RH); jits[k].jitX87(oc(k, 232), oc(k, 296), oc(k, 312)); jits[k].jitSeg(oc(k, 320), oc(k, 328), TSC, oc(k, 304), XLO + k * 128, XHI + k * 128); } }   // XMM now per-core: g_xmm_lo[k] base = G("g_xmm_lo")+k*128 (16 U64)
const SP_BASE = 0x1000000, setCore = (k) => { inst.exports.__core.value = BigInt(k); inst.exports.__sp.value = BigInt(SP_BASE - k * 0x100000); };
const sleep = (ms) => new Promise((rr) => setTimeout(rr, ms));
const perCore = new Array(NCORE).fill(0);
// one orchestrated macro-step: core 0 frame (JIT) + each AP (RunCore)
let ipiMask = 0; const CST = G("g_cpu_st"); const apHist = [new Map(),new Map(),new Map(),new Map()];
const aprip = (k) => rd(CST + k * 440 + 128);
async function step() { setCore(0); let a = rd(ICOUNT); inst.exports.__main(); perCore[0] += rd(ICOUNT) - a;
  for (let k = 1; k < NCORE; k++) { if (rd(IPI + k * 8)) ipiMask |= 1 << k; setCore(k); a = rd(ICOUNT); inst.exports.RunCore(APB); const d = rd(ICOUNT) - a; perCore[k] += d;
    if (d > 100000) { const rp = aprip(k); const region = rp < 0x1000000 ? "kernel0x"+(rp>>>12<<12).toString(16) : "game0x"+(rp>>>20<<20).toString(16); apHist[k].set(region, (apHist[k].get(region)||0)+1); } } }
async function run(n) { for (let i = 0; i < n; i++) { await step(); if (i % 16 === 0) await sleep(0); if (bad) break; } }
// --- typing (set-1 scancodes) ---
const SC={a:0x1E,b:0x30,c:0x2E,d:0x20,e:0x12,f:0x21,g:0x22,h:0x23,i:0x17,j:0x24,k:0x25,l:0x26,m:0x32,n:0x31,o:0x18,p:0x19,q:0x10,r:0x13,s:0x1F,t:0x14,u:0x16,v:0x2F,w:0x11,x:0x2D,y:0x15,z:0x2C,"0":0x0B,"1":0x02,"2":0x03,"3":0x04,"4":0x05,"5":0x06,"6":0x07,"7":0x08,"8":0x09,"9":0x0A," ":0x39,"=":0x0D,";":0x27,"\n":0x1C,",":0x33,".":0x34,"/":0x35,"-":0x0C,"'":0x28,"[":0x1A,"]":0x1B,"\\":0x2B};
const SH={"*":"8","(":"9",")":"0","&":"7","_":"-","+":"=",":":";","\"":"'","{":"[","}":"]","|":"\\","<":",",">":".","?":"/","!":"1","@":"2","#":"3","$":"4","%":"5","^":"6"};
async function typeStr(s){ for (const ch of s){ const sh=SH[ch]!==undefined||(ch>="A"&&ch<="Z"); const base=SH[ch]!==undefined?SH[ch]:ch.toLowerCase(); const sc=SC[base]; if(sc===undefined)throw new Error("no sc "+JSON.stringify(ch)); if(sh)keyq.push(0x2A); keyq.push(sc);keyq.push(sc|0x80); if(sh)keyq.push(0x2A|0x80); await run(2);} await run(8); }
function pc8(v){v=v-((v>>1)&0x55);v=(v&0x33)+((v>>2)&0x33);return (v+(v>>4))&0x0F;}
function screen(){ if(!lastFrame)return ""; const{a,w,h,u8}=lastFrame,cols=w>>3,rows=h>>3,L=[]; for(let cy=0;cy<rows;cy++){let l="";for(let cx=0;cx<cols;cx++){const pat=new Uint8Array(8);const cm=new Map();for(let y=0;y<8;y++)for(let x=0;x<8;x++){const c=u8[a+(cy*8+y)*w+cx*8+x];cm.set(c,(cm.get(c)||0)+1);}const bg=[...cm.entries()].sort((p,q)=>q[1]-p[1])[0][0];for(let y=0;y<8;y++){let bb=0;for(let x=0;x<8;x++)if(u8[a+(cy*8+y)*w+cx*8+x]!==bg)bb|=1<<x;pat[y]=bb;}let best=32,bs=1e9;for(let g=32;g<127;g++){let sc=0;for(let y=0;y<8;y++)sc+=pc8(pat[y]^FONT[g*8+y]);if(sc<bs){bs=sc;best=g;}}l+=bs<=12?String.fromCharCode(best):(pat.every(v=>!v)?" ":"?");}L.push(l.trimEnd());}return L.filter(x=>x).join("\n"); }
// boot to prompt
console.log("g_ncore =", NCORE);
await run(140);
keyq.push(0x31); keyq.push(0xB1); await run(20);          // 'n' (Take Tour?)
keyq.push(0x01); keyq.push(0x81); await run(40);          // Esc
let ready = false;
for (let t = 0; t < 6 && !ready; t++) { await typeStr("1;\n"); await run(40); if (/C:\/[A-Za-z]*>/.test(screen())) { ready = true; console.log("prompt ready round " + (t + 1)); } else { keyq.push(0x01); keyq.push(0x81); await run(30); } }
const ic0 = rd(ICOUNT); for (let k = 0; k < NCORE; k++) perCore[k] = 0;
await typeStr('#include "::/Demo/Games/Talons";\n');
console.log("launched Talons; running multi-core...");
const FR = Number(process.env.FR || 400);
for (let c = 0; c < FR; c++) { await step(); if (c % 40 === 0) { const t = screen(); console.log(`  f${c} ic=${((rd(ICOUNT)-ic0)/1e9).toFixed(1)}B AP1=${(perCore[1]/1e6).toFixed(0)}M init=${/nitializ/.test(t)?"Y":"n"} | ${(t.split("\n")[0]||"").slice(0,36)}`); } if (bad) break; }
if (lastFrame) dumpPng("/tmp/smp_talons.png", lastFrame.u8.subarray(lastFrame.a, lastFrame.a + lastFrame.w * lastFrame.h), lastFrame.w, lastFrame.h);
// --- FLY PHASE: init is done + game rendering. Press a start key, then steer, and capture a sequence.
// terrain (parallel MPDoPanels render) should appear once the plane is airborne with sane telemetry.
const FLY = Number(process.env.FLY || 0);
if (FLY > 0) {
  // arrow keys are extended set-1 scancodes (0xE0 prefix). hold = press without release each frame.
  const KEY = { up:[0xE0,0x48], dn:[0xE0,0x50], lf:[0xE0,0x4B], rt:[0xE0,0x4D], enter:[0x1C], space:[0x39] };
  const tapK = (n) => { const sc = KEY[n]; keyq.push(...sc); keyq.push(...sc.map(b=>b|0x80)); };
  const STARTK = process.env.STARTK || "enter";        // key to start a round (HUD hints ENTER)
  const HOLD = process.env.HOLD || "";                  // a flight key to hold each frame (e.g. "up")
  console.log(`--- FLY: start='${STARTK}' hold='${HOLD || "(none)"}' for ${FLY} frames ---`);
  tapK(STARTK); await run(4);
  for (let c = 0; c < FLY; c++) {
    if (HOLD) { const sc = KEY[HOLD]; keyq.push(...sc); }  // press (no release) = held
    await step();
    if (c % 50 === 0) { const t = screen(); const ln = t.split("\n"); const hud = (ln[1]||ln[0]||"").slice(0,72);
      console.log(`  fly${c} | ${hud}`);
      dumpPng(`/tmp/smp_fly_${String(c).padStart(4,"0")}.png`, lastFrame.u8.subarray(lastFrame.a, lastFrame.a + lastFrame.w * lastFrame.h), lastFrame.w, lastFrame.h); }
    if (bad) break;
  }
  if (lastFrame) dumpPng("/tmp/smp_fly_last.png", lastFrame.u8.subarray(lastFrame.a, lastFrame.a + lastFrame.w * lastFrame.h), lastFrame.w, lastFrame.h);
  console.log("=== fly screen ===\n" + screen() + "\n=== /fly screen ===");
}
// per-core XMM usage: if any AP region (k>=1) is nonzero, the panel workers DO touch XMM (so per-core XMM matters)
{ const XB = G("g_xmm_lo"); for (let k = 0; k < NCORE; k++) { let nz = 0; for (let i = 0; i < 16; i++) if (rd(XB + k * 128 + i * 8)) nz++; console.log(`  core ${k} XMM nonzero regs: ${nz}/16`); } }
// full HUD text (so we can read the Height telemetry line without the PNG)
console.log("=== screen ===\n" + screen() + "\n=== /screen ===");
console.log(`AP JIT: ${globalThis.apJitN} block-runs, ${(globalThis.apJitInstr/1e9).toFixed(2)}B native instr, ${globalThis.apMiss} interp/miss`);
console.log("=== Talons on multi-core ===");
console.log("IPI slots ever pending: 0b" + ipiMask.toString(2).padStart(NCORE, "0"));
for (let k = 0; k < NCORE; k++) console.log(`  core ${k}: ${perCore[k].toLocaleString()} instr ${k?"(AP)":"(BSP)"}` + (k && apHist[k].size ? "  where: " + [...apHist[k].entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([r,c])=>`${r}×${c}`).join(" ") : ""));
console.log("wrote /tmp/smp_talons.png " + (bad ? "BADOP!" : ""));
process.exit(0);
