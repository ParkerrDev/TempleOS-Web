// findvaroom.mjs — launch Varoom, then locate its render-dispatch in the RUNNING image:
// scan for E8 rel32 CALLs targeting JobQue (0x1fd72, verified) inside Varoom's runtime-compiled
// code; the call site lives in DrawIt's `for(i=0;i<mp_cnt;i++) JobQue(&MPUpdateWin,dc,i)` loop.
// Dump a disasm window around each hit to extract &MPUpdateWin / &mp_not_done_flags / DrawIt.
import { compileHolyC } from "./holyc-wasm/src/compiler.js";
import { createHost } from "./holyc-wasm/src/runtime/host.js";
import * as jit from "./jit.js";
import { readFileSync, writeFileSync } from "node:fs";
const RAMSZ = 402653184, JOBQUE = 0x1fd72;
const liveBuf = readFileSync("/tmp/live.bin");
const diskBuf = readFileSync("/tmp/templeos.raw");
const dir = "./hemu-wasm/src";
const src = readFileSync(dir + "/snapshot.HC", "latin1");
const r = compileHolyC(src, { filename: "snapshot.HC", lenient: false, includeResolver: (p) => { try { return readFileSync(dir + "/" + p, "latin1"); } catch { return null; } } });
const G = (n) => Number(r.globals.get(n).addr);
const mod = await WebAssembly.compile(r.bytes);
let mx = 320, my = 240, mb = 0, gBase = 0, inst; const keyq = []; const ovl = new Map();
const host = createHost({ onText: () => {}, snd: { tone: () => {} },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
  diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
  present: () => {} });
host.env.__host_msx = () => BigInt(mx); host.env.__host_msy = () => BigInt(my); host.env.__host_msb = () => BigInt(mb); host.env.__host_wheel = () => 0n;
host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n; host.env.__host_prof = () => {};
host.env.__host_budget = () => 8000000n; host.env.__host_dt = () => 16n; host.env.__host_time = () => 0n;
host.env.__jit_state = (rg, fl, rp) => { jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem); return 1n; };
host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip)));
host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c);
host.env.__jit_dispatch = (b) => BigInt(jit.jitDispatch(Number(b)));
host.env.__jit_chain = (a, b) => jit.jitChain(a, b); host.env.__jit_seg = (a, b, c) => jit.jitSeg(Number(a), Number(b), Number(c));
jit.jitReset();
inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
const run = (n) => { for (let i = 0; i < n; i++) inst.exports.__main(); };
const key = (...scs) => { for (const s of scs) { keyq.push(s); run(4); } };
run(150); key(0x31, 0xB1); run(30); key(0x1D, 0x32, 0xB2, 0x9D); run(50);
mx = 225; my = 325; run(6); mb = 1; run(10); mb = 0; run(400);          // Varoom up
const m = new Uint8Array(inst.exports.memory.buffer);
const LO = 0x11000000, HI = 0x12000000;
const hits = [];
for (let a = LO; a < HI; a++) {
  if (m[gBase + a] !== 0xE8) continue;
  const rel = (m[gBase + a + 1] | (m[gBase + a + 2] << 8) | (m[gBase + a + 3] << 16) | (m[gBase + a + 4] << 24)) | 0;
  if (a + 5 + rel === JOBQUE) hits.push(a);
}
console.log(`E8 calls -> JobQue(0x1fd72) in game region: ${hits.length}: ${hits.map(h => "0x" + h.toString(16)).join(", ")}`);
for (const h of hits) {                                  // dump a window around each call site for disasm
  const start = h - 0x100;
  writeFileSync(`/tmp/drawit_${h.toString(16)}.bin`, Buffer.from(m.subarray(gBase + start, gBase + start + 0x200)));
  console.log(`dumped 0x${start.toString(16)}..+0x200 -> /tmp/drawit_${h.toString(16)}.bin`);
}
