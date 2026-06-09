// find-render.mjs — extract Option A's addresses (JobQue, MPUpdateWin, mp_cnt) by observing Varoom's render.
// Launch with the JIT (fast enough to get Varoom rendering), THEN set g_jit_on=0 so the capture runs in the
// interpreter (every guest CALL hits cpu.HC's LogCall). Filter the log to calls FROM the game region (DrawIt) and
// find the one passing a code-pointer fn entry = JobQue(&MPUpdateWin, dc, i).
import { compileHolyC } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/compiler.js";
import { createHost } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/runtime/host.js";
import * as jit from "/Users/parkerh/Dev/TempleOS-wasm/jit.js";
import { readFileSync } from "node:fs";
const RAMSZ = 402653184;
const liveBuf = readFileSync(process.env.LIVE || "/tmp/live.bin");
const diskBuf = readFileSync(process.env.RAW || "/tmp/templeos.raw");
const dir = "/Users/parkerh/Dev/hemu-wasm/src";
const src = readFileSync(dir + "/snapshot.HC", "latin1");
const r = compileHolyC(src, { filename: "snapshot.HC", lenient: false, includeResolver: (p) => { try { return readFileSync(dir + "/" + p, "latin1"); } catch { return null; } } });
const G = (n) => Number(r.globals.get(n).addr);
const mod = await WebAssembly.compile(r.bytes);
let mx = 320, my = 240, mb = 0, gBase = 0, fb = null; const keyq = []; const ovl = new Map();
let inst;
const host = createHost({ onText: () => {}, snd: { tone: () => {} },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
  diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
  present: (a, w, h, u8) => { fb = u8.subarray(a, a + w * h); } });
host.env.__host_msx = () => BigInt(mx); host.env.__host_msy = () => BigInt(my); host.env.__host_msb = () => BigInt(mb); host.env.__host_wheel = () => 0n;
host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n; host.env.__host_budget = () => 1500000n; host.env.__host_dt = () => 33n; host.env.__host_prof = () => {}; host.env.__host_time = () => 0n;
host.env.__jit_state = (rg, fl, rp) => { jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem); return 1n; };
host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip)));
host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c);
host.env.__jit_dispatch = (b) => BigInt(jit.jitDispatch(Number(b)));
host.env.__jit_chain = (a, b) => jit.jitChain(a, b);
host.env.__jit_seg = (fs, gs, tsc) => jit.jitSeg(Number(fs), Number(gs), Number(tsc));
jit.jitReset();
inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
const run = (n) => { for (let i = 0; i < n; i++) inst.exports.__main(); };
const key = (...scs) => { for (const s of scs) { keyq.push(s); run(4); } };
const dv = () => new DataView(inst.exports.memory.buffer);
const u8 = () => new Uint8Array(inst.exports.memory.buffer);
// boot + launch Varoom WITH THE JIT (fast)
run(120); key(0x31, 0xB1); run(30); key(0x1D, 0x32, 0xB2, 0x9D); run(50);
mx = 225; my = 325; run(6); mb = 1; run(10); mb = 0; run(400);
let nz = 0; if (fb) for (let i = 0; i < fb.length; i += 7) if (fb[i]) nz++;
console.log(`after JIT launch: game frame non-black ${fb ? (100 * nz / (fb.length / 7)).toFixed(0) : "n/a"}% (Varoom rendering)`);
// switch to INTERP for the capture so CALLs hit LogCall
dv().setBigUint64(G("g_jit_on"), 0n, true);
const isProlog = (a) => { const m = u8(); return m[gBase + a] === 0x55 && m[gBase + a + 1] === 0x48 && m[gBase + a + 2] === 0x8b && m[gBase + a + 3] === 0xec; };
const BUF = 0x16800000, MAX = 6000;
dv().setBigUint64(G("g_calllog_buf"), BigInt(BUF), true);
dv().setBigUint64(G("g_calllog_max"), BigInt(MAX), true);
dv().setBigUint64(G("g_calllog_lo"), BigInt(0x11000000), true);
dv().setBigUint64(G("g_calllog_hi"), BigInt(0x12000000), true);
const drawItFromGUS = new Map();   // targets called from GrUpdateScrn (0x119b8xxx) = window draw_it fns
const jobqueCand = new Map();       // (tgt,fp) where one arg is a fn-entry and another is a small int 0..7
let totalGameCalls = 0;
for (let pass = 0; pass < 120; pass++) {
  dv().setBigUint64(G("g_calllog_n"), 0n, true);
  dv().setBigUint64(G("g_calllog"), 1n, true);
  run(8);
  dv().setBigUint64(G("g_calllog"), 0n, true);
  const n = Number(dv().getBigUint64(G("g_calllog_n"), true)); totalGameCalls += n;
  for (let i = 0; i < n; i++) {
    const p = gBase + BUF + i * 40, d = dv();
    const tgt = Number(d.getBigUint64(p, true)), ret = Number(d.getBigUint64(p + 8, true));
    const args = [Number(d.getBigUint64(p + 16, true)), Number(d.getBigUint64(p + 24, true)), Number(d.getBigUint64(p + 32, true))];
    if (ret >= 0x119b8000 && ret < 0x119b9000 && tgt > 0x10000000 && tgt < RAMSZ)   // call FROM GrUpdateScrn -> a draw_it fn
      drawItFromGUS.set(tgt, (drawItFromGUS.get(tgt) || 0) + 1);
    // JobQue(fp, data, cpu): a fn-entry arg + a small-int (0..7) arg (the slice/cpu)
    const fp = args.find(a => a > 0x10000000 && a < RAMSZ && isProlog(a));
    const small = args.find(a => a <= 7);
    if (fp !== undefined && small !== undefined) {
      const k = `JobQue=0x${tgt.toString(16)} MPUpdateWin=0x${fp.toString(16)}`;
      jobqueCand.set(k, (jobqueCand.get(k) || 0) + 1);
    }
  }
}
console.log(`total game-region calls: ${totalGameCalls}`);
console.log(`\nDrawIt candidates (targets called FROM GrUpdateScrn 0x119b8xxx):`);
for (const [t, c] of [...drawItFromGUS.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`   ${c}x  draw_it=0x${t.toString(16)}`);
console.log(`\nJobQue candidates (fn-entry arg + small-int slice arg), frequency-ranked:`);
for (const [k, c] of [...jobqueCand.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`   ${c}x  ${k}`);
// dump Varoom's whole code region from the RUNNING emulator (runtime-compiled) for an MPUpdateWin signature scan
import { writeFileSync } from "node:fs";
const m = u8();
const LO = 0x11500000, HI = 0x11b00000;
writeFileSync("/tmp/varoom_code.bin", Buffer.from(m.subarray(gBase + LO, gBase + HI)));
console.log(`dumped Varoom code 0x${LO.toString(16)}-0x${HI.toString(16)} -> /tmp/varoom_code.bin`);
