// rasterverify.mjs — verify the native span-filler HLE (cpu.HC RasterHLE). Boot Varoom, arm the hook
// (g_raster_hle=0x1152cc28 after the game is loaded), run, and check: (1) the hook actually fires
// (g_raster_calls>0 -> address correct), (2) no BADOP/crash, (3) the frame is reasonable (non-black% ~
// like emulated). Also runs an emulated (HLE-off) reference and reports both. Bit-exact per-call diff is
// the next step; this is the "doesn't crash + renders + hook lands" first gate.
import { compileHolyC } from "./holyc-wasm/src/compiler.js";
import { createHost } from "./holyc-wasm/src/runtime/host.js";
import * as jit from "./jit.js";
import { readFileSync } from "node:fs";
const RAMSZ = 402653184;
const RASTER = Number(process.env.RASTER || 0x1152cc28);
const liveBuf = readFileSync("/tmp/live.bin"), diskBuf = readFileSync("/tmp/templeos.raw");
const dir = "./hemu-wasm/src";
const src = readFileSync(dir + "/snapshot.HC", "latin1");
const r = compileHolyC(src, { filename: "snapshot.HC", lenient: false, includeResolver: (p) => { try { return readFileSync(dir + "/" + p, "latin1"); } catch { return null; } } });
const G = (n) => Number(r.globals.get(n).addr);
const mod = await WebAssembly.compile(r.bytes);

async function boot(armHLE) {
  let mx = 320, my = 240, mb = 0, gBase = 0, inst, bad = false, lastFb = null;
  let curBudget = 1500000, dtMs = 16;
  const keyq = []; const ovl = new Map();
  const host = createHost({ onText: (s) => { if (s && s.indexOf("BADOP") >= 0) { bad = true; process.stdout.write((armHLE ? "HLE " : "EMU ") + s); } }, snd: { tone: () => {} },
    snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
    diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
    diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
    present: (a, w, h, u8) => { lastFb = Buffer.from(u8.subarray(a, a + w * h)); } });
  host.env.__host_msx = () => BigInt(mx); host.env.__host_msy = () => BigInt(my); host.env.__host_msb = () => BigInt(mb); host.env.__host_wheel = () => 0n;
  host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n; host.env.__host_prof = () => {};
  host.env.__host_budget = () => BigInt(curBudget | 0); host.env.__host_dt = () => BigInt(dtMs | 0);
  host.env.__jit_state = (rg, fl, rp) => { jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem, inst.exports.RasterHLE); return 1n; };
  // deploy mechanism A (REFUSE=1): host refuses to JIT the span-filler by prologue signature. Mechanism B
  // (default, guest-side-feasible): normal JIT + invalidate g_jit_n[slot] on arm so RUNDISP breaks there.
  host.env.__jit_compile = (rip) => { if (armHLE && process.env.REFUSE) { const m = new Uint8Array(inst.exports.memory.buffer), a = gBase + Number(rip);
      if (m[a] === 0x55 && m[a+1] === 0x48 && m[a+2] === 0x8b && m[a+3] === 0xec && m[a+4] === 0x48 && m[a+5] === 0x83 && m[a+6] === 0xec && m[a+7] === 0x78 && m[a+8] === 0x56 && m[a+9] === 0x57 && m[a+10] === 0x49 && m[a+11] === 0x52) return 0n; }
    return BigInt(jit.jitCompile(Number(rip))); };
  host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
  host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c);
  host.env.__jit_dispatch = (b) => BigInt(jit.jitDispatch(Number(b)));
  host.env.__jit_chain = (a, b) => jit.jitChain(a, b);
  host.env.__jit_seg = (...a) => jit.jitSeg(...a.map(Number));
  jit.jitReset();
  inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
  const dv = () => new DataView(inst.exports.memory.buffer);
  const run = (n) => { for (let i = 0; i < n; i++) inst.exports.__main(); };
  const key = (...scs) => { for (const s of scs) { keyq.push(s); run(4); } };
  run(150); key(0x31, 0xB1); run(30); key(0x1D, 0x32, 0xB2, 0x9D); run(50);
  mx = 225; my = 325; run(6); mb = 1; run(10); mb = 0; run(250);
  // scan the game region for the span-filler PROLOGUE (55 48 89 e5 48 83 ec 78 56 57 41 52 41 53 41 54)
  // to find its ACTUAL address this boot (test whether 0x1152cc28 is stable across boots/runs)
  const m8 = new Uint8Array(inst.exports.memory.buffer);
  const sig = [0x55,0x48,0x8b,0xec,0x48,0x83,0xec,0x78,0x56,0x57,0x49,0x52,0x49,0x53,0x49,0x54];
  let found = 0;
  for (let a = 0x11000000; a < 0x11c00000 && !found; a++) { let ok = 1; for (let k = 0; k < sig.length; k++) if (m8[gBase + a + k] !== sig[k]) { ok = 0; break; } if (ok) found = a; }
  const addr = RASTER;   // arm the known address directly; `found` is just diagnostic (prologue sig is generic -> false matches)
  if (armHLE && process.env.NOARM) {           // NOARM: rely on snapshot.HC's ArmRaster() guest-side auto-arm
    if (process.env.VERIFY) dv().setBigUint64(G("g_raster_verify"), 1n, true);
    console.log(`  [auto-arm] relying on snapshot.HC ArmRaster(); guest set g_raster_hle=0x${Number(dv().getBigUint64(G("g_raster_hle"), true)).toString(16)}`);
  } else if (armHLE) {
    dv().setBigUint64(G("g_raster_hle"), BigInt(addr), true);            // slot 0 of the active array
    dv().setBigInt64(G("g_raster_n"), 1n, true);
    new Uint8Array(inst.exports.memory.buffer)[G("g_hooktbl") + (addr & 0xFF)] = 1;
    if (!process.env.REFUSE) dv().setBigInt64(G("g_jit_n") + (addr & 0xFFFF) * 8, 0n, true);   // mechanism B: invalidate the compiled block so RUNDISP breaks -> Step -> hook
    if (process.env.VERIFY) { dv().setBigUint64(G("g_raster_verify"), 1n, true); dv().setBigUint64(G("g_raster_cand"), BigInt(addr), true); dv().setBigInt64(G("g_raster_n"), 0n, true); }  // verify the candidate instead
    console.log(`  [arm] span-filler at 0x${addr.toString(16)}  verify=${process.env.VERIFY ? "on" : "off"}`);
  }
  const IC = G("icount"); let ic0 = Number(dv().getBigUint64(IC, true)), fr0 = 0;
  const presents0 = lastFb; run(Number(process.env.VRUN||200));
  const icAfter = Number(dv().getBigUint64(IC, true));
  let nz = 0; if (lastFb) for (let i = 0; i < lastFb.length; i++) if (lastFb[i]) nz++;
  const calls = Number(dv().getBigUint64(G("g_raster_calls"), true));
  const checks = Number(dv().getBigUint64(G("g_raster_checks"), true)), diffs = Number(dv().getBigUint64(G("g_raster_diffs"), true)), bodydiff = Number(dv().getBigUint64(G("g_rv_bodydiff"), true));
  const rn = Number(dv().getBigInt64(G("g_raster_n"), true)), rverify = Number(dv().getBigUint64(G("g_raster_verify"), true));
  const slots = []; for (let k = 0; k < rn; k++) slots.push("0x" + Number(dv().getBigUint64(G("g_raster_hle") + k * 8, true)).toString(16));
  const scanFrom = Number(dv().getBigUint64(G("g_raster_scan_from"), true)), cand = Number(dv().getBigUint64(G("g_raster_cand"), true));
  return { nz: lastFb ? (100 * nz / lastFb.length) : 0, calls, bad, fb: lastFb, ic: icAfter - ic0, checks, diffs, bodydiff, rn, slots, rverify, scanFrom, cand };
}
const emu = await boot(false);
console.log(`EMU (HLE off): non-black ${emu.nz.toFixed(1)}%  raster_calls=${emu.calls}  ${emu.bad ? "BADOP!" : "ok"}`);
const hle = await boot(true);
console.log(`HLE (armed):   non-black ${hle.nz.toFixed(1)}%  raster_calls=${hle.calls}  ${hle.bad ? "BADOP!" : "ok"}`);
if (process.env.NOARM) {
  console.log(`  AUTO-ARM final: ${hle.rn} active [${hle.slots.join(" ")}]  checks=${hle.checks} diffs=${hle.diffs}  raster_calls=${hle.calls}  scan_from=0x${hle.scanFrom.toString(16)} cand=0x${hle.cand.toString(16)}`);
}
if (process.env.VERIFY) {
  console.log(`SHADOW-VERIFY (native vs emulated per call): ${hle.checks} calls checked`);
  console.log(`  z-buffer+collision mismatches: ${hle.diffs}  ${hle.diffs === 0 ? "✓ GEOMETRY+GAMEPLAY BIT-EXACT" : "✗ GEOMETRY BUG"}`);
  console.log(`  body-pixel diffs (dither colors, expected nonzero): ${hle.bodydiff}`);
} else console.log(hle.calls > 0 ? `hook FIRED (${hle.calls} native span fills)` : `hook NEVER fired`);
