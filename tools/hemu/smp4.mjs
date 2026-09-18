// smp4.mjs - M4 interleaved multi-core run (correctness-first, pure interpreter, one thread).
// Orchestrator: each macro-step runs core 0's full frame (__main: devices/input/present + Run),
// then runs each AP (RunCore) which delivers its pending I_WAKE IPI and executes until idle.
// Decisive question: do all cores cooperate so the multi-core desktop renders (present fires)?
import { compileHemu } from "../../engine/compile.js";
import { createHemuHost } from "../../engine/host.js";
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
const PAL=[[0,0,0],[0,0,0xaa],[0,0xaa,0],[0,0xaa,0xaa],[0xaa,0,0],[0xaa,0,0xaa],[0xaa,0x55,0],[0xaa,0xaa,0xaa],[0x55,0x55,0x55],[0x55,0x55,0xff],[0x55,0xff,0x55],[0x55,0xff,0xff],[0xff,0x55,0x55],[0xff,0x55,0xff],[0xff,0xff,0x55],[0xff,0xff,0xff]];
function crc32(b){let c=~0;for(let i=0;i<b.length;i++){c^=b[i];for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1));}return ~c>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const tt=Buffer.from(t,"latin1");const cr=Buffer.alloc(4);cr.writeUInt32BE(crc32(Buffer.concat([tt,d])));return Buffer.concat([l,tt,d,cr]);}
function dumpPng(p,idx,w,h){const raw=Buffer.alloc((w*3+1)*h);let o=0;for(let y=0;y<h;y++){raw[o++]=0;for(let x=0;x<w;x++){const c=PAL[idx[y*w+x]&15];raw[o++]=c[0];raw[o++]=c[1];raw[o++]=c[2];}}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;writeFileSync(p,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw)),chunk("IEND",Buffer.alloc(0))]));}
const RAMSZ = 402653184;
const liveBuf = readFileSync("/tmp/hemusnap/live-smp.bin");
const diskBuf = readFileSync("/tmp/templeos.raw");
const r = compileHemu({ smp: true });
const G = (n) => Number(r.globals.get(n).addr);
const mod = await WebAssembly.compile(r.bytes);
const sharedMem = new WebAssembly.Memory({ initial: 512, maximum: 8192, shared: true });
let mx = 320, my = 240, mb = 0, gBase = 0, inst, bad = false;
let measuring = false, present = 0, nonblack = 0;
const keyq = []; const ovl = new Map();
const host = createHemuHost({ onText: (s) => { if (s && s.indexOf("BADOP") >= 0) { bad = true; process.stdout.write("GUEST: " + s.slice(0, 80)); } }, snd: { tone: () => {} },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
  diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
  present: (a, w, h, u8) => { if (!measuring) return; let nz = 0; for (let i = 0; i < w * h; i++) if (u8[a + i]) nz++; present++; nonblack = nz / (w * h); lastFrame = { a, w, h, u8: u8.slice(a, a + w * h) }; } });
let lastFrame = null;
host.env.__host_msx = () => BigInt(mx); host.env.__host_msy = () => BigInt(my); host.env.__host_msb = () => BigInt(mb); host.env.__host_wheel = () => 0n;
host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n;
host.env.__host_budget = () => 4000000n; host.env.__host_dt = () => 16n;
// pure interpreter on every core (shared JIT can't bake per-core reg offsets): __jit_state -> 0 disables it.
host.env.__jit_state = () => 0n; host.env.__jit_compile = () => 0n; host.env.__jit_run = () => 0n;
host.env.__jit_x87 = () => {}; host.env.__jit_dispatch = () => 0n; host.env.__jit_chain = () => {}; host.env.__jit_seg = () => {};
host.env.mem = sharedMem;
inst = await WebAssembly.instantiate(mod, { env: host.env });
inst.exports.__sp.value = 0x1000000n; inst.exports.__core.value = 0n;
host.attach(inst); inst.exports.__rt_init();
const dv = () => new DataView(inst.exports.memory.buffer);
const rd = (a) => Number(dv().getBigUint64(a, true));
inst.exports.__main();                            // first frame: loads live-smp.bin + SetSnapRegs (sets g_ncore + all cores)
const ICOUNT = G("icount"), NCORE = rd(G("g_ncore")), IPI = G("g_ipi_pending");
console.log("g_ncore =", NCORE);
if (NCORE < 2) { console.log("FAIL: g_ncore<2 - SMP snapregs not applied"); process.exit(1); }
{ const base = G("g_cpu_st"), ST = 440;          // dump each core's seeded state (rip@128 rfl@136 halted@144)
  for (let k = 0; k < NCORE; k++) console.log(`  core ${k} seeded: rip=0x${rd(base+k*ST+128).toString(16)} rfl=0x${rd(base+k*ST+136).toString(16)} halted=${rd(base+k*ST+144)} IF=${(rd(base+k*ST+136)>>9)&1}`); }
if (process.env.DUMP) process.exit(0);
const SP_BASE = 0x1000000;                       // per-core shadow stack: core k at 16MiB - k*1MiB
const setCore = (k) => { inst.exports.__core.value = BigInt(k); inst.exports.__sp.value = BigInt(SP_BASE - k * 0x100000); };
const sleep = (ms) => new Promise((rr) => setTimeout(rr, ms));
const perCore = new Array(NCORE).fill(0);
let ipiSeen = 0;
const SECS = Number(process.env.SECS || 25);
measuring = true;
const t0 = performance.now();
let macro = 0;
while (performance.now() - t0 < SECS * 1000) {
  setCore(0); const a0 = rd(ICOUNT); inst.exports.__main(); perCore[0] += rd(ICOUNT) - a0;
  for (let k = 1; k < NCORE; k++) { if (rd(IPI + k * 8)) ipiSeen++; setCore(k); const a = rd(ICOUNT); inst.exports.RunCore(2000000n); perCore[k] += rd(ICOUNT) - a; }
  macro++;
  if ((macro & 63) === 0) await sleep(0);          // let the event loop breathe
  if (bad) break;
}
const wall = (performance.now() - t0) / 1000;
console.log(`=== interleaved ${NCORE}-core, ${wall.toFixed(1)}s, ${macro} macro-steps ===`);
console.log(`present frames: ${present} (${(present/wall).toFixed(1)}/s), last non-black: ${(nonblack*100).toFixed(1)}%  ${bad ? "BADOP!" : "(no fault)"}`);
console.log(`IPIs delivered to APs: ${ipiSeen}`);
for (let k = 0; k < NCORE; k++) console.log(`  core ${k}: ${perCore[k].toLocaleString()} instr executed (${k ? "AP, IPI-woken" : "BSP/devices"})`);
if (lastFrame) { dumpPng("/tmp/smp_desktop.png", lastFrame.u8, lastFrame.w, lastFrame.h); console.log("wrote /tmp/smp_desktop.png"); }
process.exit(bad ? 1 : 0);
