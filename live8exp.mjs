// live8exp.mjs — unblock test: does the multi-core snapshot (live8.bin) render if we shift the render-critical
// hooks by the kernel relocation delta (-0x91da00) and disable the HLE/skip optimizations (address-specific)?
// Single instance, interp. If the desktop renders, the delta works and SMP bring-up is unblocked.
import { compileHolyC } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/compiler.js";
import { createHost } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/runtime/host.js";
import { readFileSync } from "node:fs";
const RAMSZ = 402653184, D = -0x91da00;
const liveBuf = readFileSync(process.env.LIVE || "/tmp/live8.bin");
const dir = "/Users/parkerh/Dev/hemu-wasm/src";
const src = readFileSync(dir + "/snapshot.HC", "latin1");
const r = compileHolyC(src, { filename: "snapshot.HC", lenient: false, includeResolver: (p) => { try { return readFileSync(dir + "/" + p, "latin1"); } catch { return null; } } });
const G = (n) => Number(r.globals.get(n).addr);
const mod = await WebAssembly.compile(r.bytes);
let gBase = 0, fb = null;
const host = createHost({ onText: (s) => { if (s && s.indexOf("BADOP") >= 0) process.stdout.write("GUEST: " + s); }, snd: { tone: () => {} },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead: () => {}, diskWrite: () => {}, present: (a, w, h, u8) => { fb = Uint8Array.from(u8.subarray(a, a + w * h)); } });
host.env.__host_msx = () => 0n; host.env.__host_msy = () => 0n; host.env.__host_msb = () => 0n; host.env.__host_wheel = () => 0n;
host.env.__host_key = () => -1n; host.env.__host_budget = () => 1000000n; host.env.__host_dt = () => 33n; host.env.__host_prof = () => {}; host.env.__host_time = () => 0n;
const inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
const dv = () => new DataView(inst.exports.memory.buffer);
const u8 = () => new Uint8Array(inst.exports.memory.buffer);
// let core 0 init (loads live8.bin, sets the WRONG single-core hook addresses), then OVERRIDE with shifted addrs
for (let i = 0; i < 12 && gBase === 0; i++) inst.exports.__main();
const setU64 = (name, v) => dv().setBigUint64(G(name), BigInt(v), true);
const CAP = 0x119b828f + D, DC2 = 0x119AD3D8 + D;
setU64("g_capture_rip", CAP);
setU64("g_dc2", DC2);
setU64("g_hle_blit", 0); setU64("g_skip_c4", 0); setU64("g_skip_vga", 0); setU64("g_skip_xlat", 0); setU64("g_skip_bg", 0);   // disable HLE/skip (addr-specific)
u8()[G("g_hooktbl") + (CAP & 0xFF)] = 1;                                  // re-arm the per-instr hook gate for the new capture rip
// winmgr refresh fixup at the shifted address (so the WinMgr re-arms its timer instead of re-parking)
const WM = 0x1140cc10 + D; dv().setBigUint64(gBase + WM, 0n, true); dv().setBigUint64(gBase + WM + 8, 0n, true);
console.log(`overrode: g_capture_rip=0x${CAP.toString(16)} g_dc2=0x${DC2.toString(16)} (delta ${D})`);
fb = null; for (let i = 0; i < 400; i++) inst.exports.__main();
let nz = 0; if (fb) for (let i = 0; i < (fb ? fb.length : 0); i++) if (fb[i]) nz++;
console.log(`present fired: ${fb ? "YES" : "NO"}   non-black: ${fb ? (100 * nz / fb.length).toFixed(1) + "%" : "n/a"}   ${fb && nz > fb.length * 0.05 ? "✓ live8.bin RENDERS with the delta" : ""}`);
