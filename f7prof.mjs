// f7prof.mjs — pinpoint the IDIV-w64 chain-break: histogram the breaking guest RIPs and bucket the
// runtime divisor (rm operand) as 0 / -1 / other. Decides the fix: divisor==-1 can be inlined as
// RAX=-RAX,RDX=0 (kill the break); divisor==0 is a guest fault that must match cpu.HC.
import { compileHolyC } from "./holyc-wasm/src/compiler.js";
import { createHost } from "./holyc-wasm/src/runtime/host.js";
import * as jit from "./jit.js";
import { readFileSync, writeFileSync } from "node:fs";
const RAMSZ = 402653184;
const liveBuf = readFileSync("/tmp/live.bin");
const diskBuf = readFileSync("/tmp/templeos.raw");
const dir = "./hemu-wasm/src";
const src = readFileSync(dir + "/snapshot.HC", "latin1");
const r = compileHolyC(src, { filename: "snapshot.HC", lenient: false, includeResolver: (p) => { try { return readFileSync(dir + "/" + p, "latin1"); } catch { return null; } } });
const G = (n) => Number(r.globals.get(n).addr);
const REGOFF = G("g_cpu_st");                 // CCpuState[0].f_reg base
const mod = await WebAssembly.compile(r.bytes);

let mx = 320, my = 240, mb = 0, gBase = 0, inst, bad = false;
let curBudget = 1500000, dtMs = 16, RIPOFF = 0;
const keyq = []; const ovl = new Map();
const host = createHost({ onText: (s) => { if (s && s.indexOf("BADOP") >= 0) { bad = true; process.stdout.write("GUEST: " + s); } }, snd: { tone: () => {} },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
  diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
  present: () => {} });
host.env.__host_msx = () => BigInt(mx); host.env.__host_msy = () => BigInt(my); host.env.__host_msb = () => BigInt(mb); host.env.__host_wheel = () => 0n;
host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n; host.env.__host_prof = () => {};
host.env.__host_budget = () => BigInt(curBudget | 0); host.env.__host_dt = () => BigInt(dtMs | 0);

const ripHist = new Map(); let bMinus1 = 0, bZero = 0, bOther = 0;
let measuring = false;
// decode the F7 rm operand at break time and read its current 64-bit value from guest state
function readRm(a, m, dv) {
  let p = a, rexB = 0, rexX = 0, rexR = 0;
  for (;;) { const x = m[p]; if (x >= 0x40 && x <= 0x4F) { rexB = x & 1; rexX = (x >> 1) & 1; rexR = (x >> 2) & 1; p++; } else if (x === 0x66 || x === 0x67 || x === 0xF0 || x === 0xF2 || x === 0xF3 || x === 0x2E || x === 0x36 || x === 0x3E || x === 0x26 || x === 0x64 || x === 0x65) p++; else break; }
  p++; // skip F7
  const modrm = m[p], mod = modrm >> 6, rm = (modrm & 7) | (rexB << 3);
  if (mod === 3) return dv.getBigInt64(REGOFF + rm * 8, true);   // register operand
  return null;                                                   // memory operand: skip (rare for the hot divide)
}
host.env.__jit_state = (rg, fl, rp) => { RIPOFF = Number(rp); jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem); return 1n; };
host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip)));
host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c);
host.env.__jit_dispatch = (b) => { const n = jit.jitDispatch(Number(b));
  if (measuring) { const m = new Uint8Array(inst.exports.memory.buffer); const dv = new DataView(inst.exports.memory.buffer);
    let a = gBase + Number(dv.getBigUint64(RIPOFF, true)), rexW = 0;
    for (;;) { const x = m[a]; if (x === 0x66 || x === 0x67 || x === 0xF0 || x === 0xF2 || x === 0xF3 || x === 0x2E || x === 0x36 || x === 0x3E || x === 0x26 || x === 0x64 || x === 0x65 || (x >= 0x40 && x <= 0x4F)) { if (x >= 0x40 && x <= 0x4F) rexW = (x >> 3) & 1; a++; } else break; }
    if (m[a] === 0xF7 && rexW && ((m[a + 1] >> 3) & 7) === 7) {   // idiv w64
      const rip = a - gBase; ripHist.set(rip, (ripHist.get(rip) || 0) + 1);
      const d = readRm(gBase + Number(dv.getBigUint64(RIPOFF, true)), m, dv);
      if (d === 0n) bZero++; else if (d === -1n) bMinus1++; else bOther++;
    } }
  return BigInt(n); };
host.env.__jit_chain = (a, b) => {};      // disable native chaining so every break is observable in JS
host.env.__jit_seg = (a, b, c) => jit.jitSeg(Number(a), Number(b), Number(c));
jit.jitReset();
inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
const dv = () => new DataView(inst.exports.memory.buffer);

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
const run = async (n) => { for (let i = 0; i < n; i++) await step(); };
const key = async (...scs) => { for (const s of scs) { keyq.push(s); await run(4); } };
await run(150);
await key(0x31, 0xB1); await run(30); await key(0x1D, 0x32, 0xB2, 0x9D); await run(50);
mx = 225; my = 325; await run(6); mb = 1; await run(10); mb = 0; await run(300);
measuring = true; const t0 = performance.now();
while (performance.now() - t0 < (Number(process.env.SECS || 8)) * 1000) await step();
measuring = false;
const wall = (performance.now() - t0) / 1000;
console.log(`=== IDIV-w64 break analysis (${wall.toFixed(1)}s) ${bad ? "BADOP!" : ""} ===`);
console.log(`divisor buckets:  ==0: ${bZero}   ==-1: ${bMinus1}   other: ${bOther}`);
const top = [...ripHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log(`top breaking RIPs:`);
const u8 = new Uint8Array(inst.exports.memory.buffer);
const dump = [];
for (const [rip, c] of top) { console.log(`  0x${rip.toString(16)}  ${c}`); dump.push({ rip, c, bytes: Buffer.from(u8.subarray(gBase + rip - 24, gBase + rip + 16)).toString("hex"), pre: -24 }); }
writeFileSync("/tmp/idiv_breaks.json", JSON.stringify(dump));
console.log("wrote /tmp/idiv_breaks.json (top rips + surrounding bytes)");
