// smpmt.mjs - REAL multi-threaded SMP: one BSP worker + (NCORE-1) AP workers, each a hemu instance
// over ONE shared WebAssembly.Memory, running in PARALLEL (not interleaved). This is the M6 engine
// core: the browser port is the same shape with Web Workers + OffscreenCanvas instead of node
// worker_threads + a PNG dump. Proves real-parallel SMP works (desktop renders; games run on all cores).
//
//   GAME=Talons FR=4000 node --max-old-space-size=3072 smpmt.mjs   (default: boot+desktop, GAME="" )
import { Worker, isMainThread, workerData, parentPort } from "node:worker_threads";
import { compileHemu } from "../../engine/compile.js";
import { createHemuHost } from "../../engine/host.js";
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { FONT } from "../../holyc-wasm/src/runtime/font.js";

const NCORE = 4, RAMSZ = 402653184, SP_BASE = 0x1000000;
const PAL=[[0,0,0],[0,0,0xaa],[0,0xaa,0],[0,0xaa,0xaa],[0xaa,0,0],[0xaa,0,0xaa],[0xaa,0x55,0],[0xaa,0xaa,0xaa],[0x55,0x55,0x55],[0x55,0x55,0xff],[0x55,0xff,0x55],[0x55,0xff,0xff],[0xff,0x55,0x55],[0xff,0x55,0xff],[0xff,0xff,0x55],[0xff,0xff,0xff]];

// ---- shared control region (separate SAB): [0]=barrier (BSP sets 1 when snapshot+regs ready), [1]=stop ----
const CTRL = { READY: 0, STOP: 1 };

if (isMainThread) {
  const GAME = process.env.GAME || "";
  const FR = Number(process.env.FR || 1500);
  // compile the shared-memory SMP module ONCE; all workers instantiate it over the shared memory
  const r = compileHemu({ smp: true });
  const globals = {}; for (const n of ["icount","g_ncore","g_ipi_pending","g_cpu_st","tsc","xmm_lo","xmm_hi","g_xmm_lo","g_xmm_hi","mem"]) { const g = r.globals.get(n); if (g) globals[n] = Number(g.addr); }
  const mem = new WebAssembly.Memory({ initial: 512, maximum: 8192, shared: true });
  const ctrl = new Int32Array(new SharedArrayBuffer(64));
  const t0 = performance.now();
  const workers = [];
  for (let k = 0; k < NCORE; k++) {
    const w = new Worker(new URL(import.meta.url), { workerData: { role: k === 0 ? "bsp" : "ap", core: k, bytes: r.bytes, mem, ctrl: ctrl.buffer, globals, GAME, FR } });
    w.on("message", (m) => {
      if (m.log) console.log(m.log);
      if (m.done) { const ms = (performance.now() - t0) / 1000; console.log(`=== smpmt DONE in ${ms.toFixed(1)}s (real parallel ${NCORE} workers) ===`); Atomics.store(ctrl, CTRL.STOP, 1); Promise.all(workers.map(x => x.terminate())).then(() => process.exit(0)); }
    });
    w.on("error", (e) => { console.error(`core ${k} ERROR:`, e.message); });
    workers.push(w);
  }
} else {
  // ---------------- WORKER (BSP or AP) ----------------
  const { role, core, bytes, mem, ctrl: ctrlBuf, globals, GAME, FR } = workerData;
  const ctrl = new Int32Array(ctrlBuf);
  const jit = await import(`./jit.js?core=${core}`);            // per-core jit.js instance (own block cache)
  const log = (s) => parentPort.postMessage({ log: s });
  const liveBuf = role === "bsp" ? readFileSync("/tmp/hemusnap/live-smp.bin") : null;
  const diskBuf = role === "bsp" ? readFileSync("/tmp/templeos.raw") : null;
  let gBase = 0, inst, bad = false, lastFrame = null, mx = 320, my = 240, mb = 0;
  const keyq = []; const ovl = new Map();
  const host = createHemuHost({
    onText: (s) => { if (s && s.indexOf("BADOP") >= 0) { bad = true; log("GUEST:" + s.slice(0, 80)); } }, snd: { tone: () => {} },
    snapLoad: (base, u8) => { gBase = base; if (liveBuf) u8.set(liveBuf.subarray(0, RAMSZ), base); },   // BSP loads the snapshot into shared mem
    diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else if (diskBuf) u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
    diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
    present: (a, w, h, u8) => { lastFrame = { a, w, h, u8 }; } });
  host.env.mem = mem;
  host.env.__host_msx = () => BigInt(mx); host.env.__host_msy = () => BigInt(my); host.env.__host_msb = () => BigInt(mb); host.env.__host_wheel = () => 0n;
  host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n;
  host.env.__host_budget = () => BigInt(role === "bsp" ? 4000000 : 0); host.env.__host_dt = () => 16n;
  const cur = () => Number(inst.exports.__core.value);
  host.env.__jit_state = (rg, fl, rp) => { jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem, inst.exports.RasterHLE); return 1n; };
  host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip)));
  host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
  host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c);
  host.env.__jit_dispatch = (b) => BigInt(jit.jitDispatch(Number(b)));
  host.env.__jit_chain = (a, b) => jit.jitChain(a, b); host.env.__jit_seg = (...a) => jit.jitSeg(...a.map(Number));
  // AP per-core JIT block chain (no shared g_jit_rip): hotness then compile, then dispatch
  const apHot = new Map();
  host.env.__ap_run = (rip, bud) => { rip = Number(rip); if (!jit.jitInspect(rip).cached) { const h = (apHot.get(rip) || 0) + 1; apHot.set(rip, h); if (h <= 2) return 0n; jit.jitCompile(rip); } return BigInt(jit.jitDispatch(Number(bud))); };
  jit.jitReset();
  inst = await WebAssembly.instantiate(await WebAssembly.compile(bytes), { env: host.env });
  inst.exports.__core.value = BigInt(core);
  inst.exports.__sp.value = BigInt(SP_BASE - core * 0x100000);          // per-core shadow stack (region is shared)
  host.attach(inst);
  const dv = () => new DataView(inst.exports.memory.buffer);
  const rd = (a) => Number(dv().getBigUint64(a, true));

  if (role === "bsp") { await bsp(); } else { await ap(); }

  // ---- BSP: init shared state, run __main frames, drive the game, present ----
  async function bsp() {
    inst.exports.__rt_init();                              // ONLY the BSP initializes shared globals
    inst.exports.__main();                                 // first frame -> SetSnapRegs seeds g_cpu_st[0..3] + g_ncore
    log(`BSP: g_ncore=${rd(globals.g_ncore)} - booting (APs held until prompt)`);
    // typing helpers (set-1 scancodes)
    const SC={a:0x1E,b:0x30,c:0x2E,d:0x20,e:0x12,f:0x21,g:0x22,h:0x23,i:0x17,j:0x24,k:0x25,l:0x26,m:0x32,n:0x31,o:0x18,p:0x19,q:0x10,r:0x13,s:0x1F,t:0x14,u:0x16,v:0x2F,w:0x11,x:0x2D,y:0x15,z:0x2C,"0":0x0B,"1":0x02,"2":0x03,"3":0x04,"4":0x05,"5":0x06,"6":0x07,"7":0x08,"8":0x09,"9":0x0A," ":0x39,"=":0x0D,";":0x27,"\n":0x1C,",":0x33,".":0x34,"/":0x35,"-":0x0C,"'":0x28,"[":0x1A,"]":0x1B,"\\":0x2B};
    const SH={"*":"8","(":"9",")":"0","&":"7","_":"-","+":"=",":":";","\"":"'","{":"[","}":"]","|":"\\","<":",",">":".","?":"/","!":"1","@":"2","#":"3","$":"4","%":"5","^":"6"};
    const sleep = () => new Promise(r => setTimeout(r, 0));
    const frame = () => { try { inst.exports.__main(); } catch (e) { bad = true; log("BSP trap: " + e.message); } };
    async function runN(n){ for(let i=0;i<n;i++){ frame(); if(i%16===0) await sleep(); if(bad) break; } }
    async function typeStr(s){ for(const ch of s){ const sh=SH[ch]!==undefined||(ch>="A"&&ch<="Z"); const base=SH[ch]!==undefined?SH[ch]:ch.toLowerCase(); const sc=SC[base]; if(sc===undefined)continue; if(sh)keyq.push(0x2A); keyq.push(sc);keyq.push(sc|0x80); if(sh)keyq.push(0x2A|0x80); await runN(2);} await runN(8); }
    await runN(140);
    keyq.push(0x31); keyq.push(0xB1); await runN(20);     // 'n'
    keyq.push(0x01); keyq.push(0x81); await runN(40);     // Esc
    for (let t=0;t<6;t++){ await typeStr("1;\n"); await runN(40); if (/C:\/[A-Za-z]*>/.test(screen())) { log("BSP: prompt ready"); break; } keyq.push(0x01); keyq.push(0x81); await runN(30); }
    for (let k = 1; k < NCORE; k++) dv().setBigUint64(globals.g_ipi_pending + k * 8, 0n, true);   // drop IPIs queued to held APs during boot (would service a stale wake)
    Atomics.store(ctrl, CTRL.READY, 1); Atomics.notify(ctrl, CTRL.READY);   // boot settled -> release the APs (parallel from here)
    log("BSP: APs released (parallel)");
    await runN(20);                                        // let APs spin up
    if (GAME) { await typeStr(`#include "::/Demo/Games/${GAME}";\n`); log(`BSP: launched ${GAME}`); }
    const ICOUNT = globals.icount;
    let last = rd(ICOUNT);
    for (let c = 0; c < FR; c++) { frame();
      if (c % 200 === 0) { const t = screen(); let nz=0; const f=lastFrame; if(f) for(let i=0;i<f.w*f.h;i++){const px=f.u8[f.a+i]; if(px&&px!==1)nz++;}
        const ap1 = rd(globals.g_cpu_st + 1*440 + 0/*placeholder*/); // (per-core icount not separate; report via instr delta instead)
        log(`  f${c} nonbg=${f?(100*nz/(f.w*f.h)).toFixed(1):"?"}% | ${(t.split("\n")[0]||"").slice(0,40)}`);
        dump(`/tmp/smpmt_${GAME||"desktop"}.png`); }
      if (c % 8 === 0) await sleep(); if (bad) break; }
    dump(`/tmp/smpmt_${GAME||"desktop"}.png`);
    log(`BSP: final screen:\n` + screen());
    parentPort.postMessage({ done: true });
  }

  // ---- AP: wait for BSP barrier, set per-core JIT offsets, run RunCore continuously (IPI-woken) ----
  async function ap() {
    Atomics.wait(ctrl, CTRL.READY, 0);                    // block until BSP has loaded snapshot + seeded regs
    gBase = rd(globals.mem);                               // guest RAM base = the shared `mem` global (BSP set it in __rt_init). APs never run snapLoad, so this was 0 -> JIT addressed mem from 0 -> garbage -> BADOP
    const CST = globals.g_cpu_st, ST = 440, oc = (o) => CST + core * ST + o;
    const XLO = globals.g_xmm_lo, XHI = globals.g_xmm_hi, TSC = globals.tsc;
    const RM = inst.exports.RdMem, WM = inst.exports.WrMem, RH = inst.exports.RasterHLE, MM = inst.exports.memory;
    jit.jitState(oc(0), oc(136), oc(128), gBase, MM, RM, WM, RH);
    jit.jitX87(oc(232), oc(296), oc(312));
    jit.jitSeg(oc(320), oc(328), TSC, oc(304), XLO + core * 128, XHI + core * 128);
    log(`AP${core}: started (parallel)`);
    const APB = 2000000n;
    const sleep = () => new Promise(r => setTimeout(r, 0));
    const RIPOFF = oc(128);                                   // this AP's f_rip in g_cpu_st
    let spins = 0, total = 0, ipis = 0, lastIpi = -1, busy = 0; const hist = new Map(); let nextLog = 1500;
    while (!Atomics.load(ctrl, CTRL.STOP)) {
      const ip = rd(globals.g_ipi_pending + core * 8); if (ip && ip !== lastIpi) { ipis++; lastIpi = ip; } else if (!ip) lastIpi = -1;
      const before = rd(globals.icount);
      inst.exports.RunCore(APB);
      const did = rd(globals.icount) - before; total += did;
      if (did > 1000) { busy++; const rp = rd(RIPOFF); const reg = rp < 0x1000000 ? "k" + (rp >>> 12 << 12).toString(16) : "g" + (rp >>> 20 << 20).toString(16); hist.set(reg, (hist.get(reg) || 0) + 1); }
      if (total > nextLog * 1e6) { nextLog += 1500; const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r, c]) => `${r}x${c}`).join(" "); log(`AP${core}: ${(total / 1e6).toFixed(0)}M instr, ${ipis} IPIs, busy=${busy}, where: ${top}`); }
      if (did < 1000) { spins++; if (spins > 4) { await sleep(); spins = 0; } }   // idle -> yield (don't busy-spin a core)
      else { spins = 0; if (Math.random() < 0.002) await sleep(); }               // busy -> rare yield to drain
    }
    log(`AP${core}: stopped (${(total / 1e6).toFixed(0)}M instr, ${ipis} IPIs)`);
  }

  // ---- framebuffer -> PNG + 8x8 FONT OCR (same as smptalons) ----
  function crc32(x){let c=~0;for(let i=0;i<x.length;i++){c^=x[i];for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1));}return ~c>>>0;}
  function ch(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const tt=Buffer.from(t,"latin1");const cr=Buffer.alloc(4);cr.writeUInt32BE(crc32(Buffer.concat([tt,d])));return Buffer.concat([l,tt,d,cr]);}
  function dump(p){ if(!lastFrame)return; const{a,w,h,u8}=lastFrame; const raw=Buffer.alloc((w*3+1)*h);let o=0;for(let y=0;y<h;y++){raw[o++]=0;for(let x=0;x<w;x++){const c=PAL[u8[a+y*w+x]&15];raw[o++]=c[0];raw[o++]=c[1];raw[o++]=c[2];}}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;writeFileSync(p,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),ch("IHDR",ih),ch("IDAT",deflateSync(raw)),ch("IEND",Buffer.alloc(0))])); }
  function pc8(v){v=v-((v>>1)&0x55);v=(v&0x33)+((v>>2)&0x33);return (v+(v>>4))&0x0F;}
  function screen(){ if(!lastFrame)return ""; const{a,w,h,u8}=lastFrame,cols=w>>3,rows=h>>3,L=[]; for(let cy=0;cy<rows;cy++){let l="";for(let cx=0;cx<cols;cx++){const pat=new Uint8Array(8);const cm=new Map();for(let y=0;y<8;y++)for(let x=0;x<8;x++){const c=u8[a+(cy*8+y)*w+cx*8+x];cm.set(c,(cm.get(c)||0)+1);}const bg=[...cm.entries()].sort((p,q)=>q[1]-p[1])[0][0];for(let y=0;y<8;y++){let bb=0;for(let x=0;x<8;x++)if(u8[a+(cy*8+y)*w+cx*8+x]!==bg)bb|=1<<x;pat[y]=bb;}let best=32,bs=1e9;for(let g=32;g<127;g++){let sc=0;for(let y=0;y<8;y++)sc+=pc8(pat[y]^FONT[g*8+y]);if(sc<bs){bs=sc;best=g;}}l+=bs<=12?String.fromCharCode(best):(pat.every(v=>!v)?" ":"?");}L.push(l.trimEnd());}return L.filter(x=>x).join("\n"); }
}
