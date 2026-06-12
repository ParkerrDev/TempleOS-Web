// smprof.mjs — sample the remaining hot blocks AFTER the raster HLE: force the JS dispatch path
// (__jit_chain = noop so no native RUNDISP) and histogram the rip at every dispatch entry.
// Frequency-weighted (not instr-weighted) but plenty to rank hot regions for the next HLE.
import { compileHolyC } from "./holyc-wasm/src/compiler.js";
import { createHost } from "./holyc-wasm/src/runtime/host.js";
import * as jit from "./jit.js";
import { readFileSync, writeFileSync } from "node:fs";
const RAMSZ = 402653184;
const liveBuf = readFileSync("/tmp/live.bin"), diskBuf = readFileSync("/tmp/templeos.raw");
const dir = "./hemu-wasm/src";
const src = readFileSync(dir + "/snapshot.HC", "latin1");
const r = compileHolyC(src, { filename: "snapshot.HC", lenient: false, includeResolver: (p) => { try { return readFileSync(dir + "/" + p, "latin1"); } catch { return null; } } });
const G = (n) => Number(r.globals.get(n).addr);
const mod = await WebAssembly.compile(r.bytes);
let mx = 320, my = 240, mb = 0, gBase = 0, inst, RIPOFF = 0;
const keyq = []; const ovl = new Map();
const host = createHost({ onText: () => {}, snd: { tone: () => {} },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
  diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
  present: () => {} });
host.env.__host_msx = () => BigInt(mx); host.env.__host_msy = () => BigInt(my); host.env.__host_msb = () => BigInt(mb); host.env.__host_wheel = () => 0n;
host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n; host.env.__host_prof = () => {};
host.env.__host_budget = () => 4000000n; host.env.__host_dt = () => 16n;
let measuring = false; const hist = new Map();
host.env.__jit_state = (rg, fl, rp) => { RIPOFF = Number(rp); jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem); return 1n; };
host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip)));
host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c);
host.env.__jit_dispatch = (b) => { if (measuring) { const rip = Number(new DataView(inst.exports.memory.buffer).getBigUint64(RIPOFF, true)); hist.set(rip, (hist.get(rip) || 0) + 1); } return BigInt(jit.jitDispatch(Number(b))); };
host.env.__jit_chain = () => {};   // no RUNDISP -> JS dispatch -> every chain entry observable
host.env.__jit_seg = (...a) => jit.jitSeg(...a.map(Number));
jit.jitReset();
inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
const run = (n) => { for (let i = 0; i < n; i++) inst.exports.__main(); };
const key = (...scs) => { for (const s of scs) { keyq.push(s); run(4); } };
run(150); key(0x31, 0xB1); run(30); key(0x1D, 0x32, 0xB2, 0x9D); run(50);
mx = 225; my = 325; run(6); mb = 1; run(10); mb = 0; run(300);
measuring = true; run(Number(process.env.N || 120)); measuring = false;
const dv = new DataView(inst.exports.memory.buffer);
console.log(`HLE: n=${Number(dv.getBigInt64(G("g_raster_n"), true))} calls=${Number(dv.getBigInt64(G("g_raster_calls"), true))}`);
const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24);
const tot = [...hist.values()].reduce((s, c) => s + c, 0);
console.log(`top dispatch-entry rips (${tot} samples):`);
const u8 = new Uint8Array(inst.exports.memory.buffer); const dump = [];
for (const [a, c] of top) { console.log(`  0x${a.toString(16).padStart(8, "0")}  ${(100 * c / tot).toFixed(2).padStart(5)}%  (${c})`);
  dump.push({ addr: a, pct: +(100 * c / tot).toFixed(2), bytes: Buffer.from(u8.subarray(gBase + a, gBase + a + 64)).toString("hex") }); }
writeFileSync("/tmp/smprof.json", JSON.stringify(dump));
