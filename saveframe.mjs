// Capture the in-game framebuffer (interp + JIT) to PNG so we can SEE the game renders correctly.
import { compileHolyC } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/compiler.js";
import { createHost } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/runtime/host.js";
import { PALETTE } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/abi.js";
import * as jit from "/Users/parkerh/Dev/TempleOS-wasm/jit.js";
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
const RAMSZ = 402653184, W = 640, H = 480;
const liveBuf = readFileSync(process.env.LIVE || "/tmp/live.bin");
const diskBuf = readFileSync(process.env.RAW || "/tmp/templeos.raw");
const dir = "/Users/parkerh/Dev/hemu-wasm/src";
const src = readFileSync(dir + "/snapshot.HC", "latin1");
const r = compileHolyC(src, { filename: "snapshot.HC", lenient: false, includeResolver: (p) => { try { return readFileSync(dir + "/" + p, "latin1"); } catch { return null; } } });
const mod = await WebAssembly.compile(r.bytes);
jit.jitSeg(Number(r.globals.get("msr_fsbase").addr), Number(r.globals.get("msr_gsbase").addr), Number(r.globals.get("tsc").addr));
const NF = Number(process.env.NF || 700);

function png(idx) {                                         // 8-bit indexed -> RGB PNG
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0;   // filter byte 0
    for (let x = 0; x < W; x++) { const [r0, g0, b0] = PALETTE[idx[y * W + x] & 15]; const o = y * (W * 3 + 1) + 1 + x * 3; raw[o] = r0; raw[o + 1] = g0; raw[o + 2] = b0; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  const chunk = (t, d) => { const c = Buffer.concat([Buffer.from(t), d]); const len = Buffer.alloc(4); len.writeUInt32BE(d.length, 0); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(c) >>> 0, 0); return Buffer.concat([len, c, crc]); };
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const CT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CT[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return c ^ 0xffffffff; }

async function boot(useJit) {
  if (useJit) jit.jitReset();
  let mx = 320, my = 240, mb = 0, gBase = 0; const keyq = []; const ovl = new Map(); let inst, fb = null;
  const host = createHost({ onText: () => {}, snd: { tone: () => {} },
    snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
    diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
    diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
    present: (a, w, h, u8) => { fb = Buffer.from(u8.subarray(a, a + w * h)); } });
  host.env.__host_msx = () => BigInt(mx); host.env.__host_msy = () => BigInt(my); host.env.__host_msb = () => BigInt(mb); host.env.__host_wheel = () => 0n;
  host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n; host.env.__host_budget = () => 1500000n; host.env.__host_dt = () => 33n; host.env.__host_prof = () => {};
  if (useJit) {
    host.env.__jit_state = (rg, fl, rp) => { jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem); return 1n; };
    host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip))); host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
    host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c); host.env.__jit_dispatch = (b) => BigInt(jit.jitDispatch(Number(b))); host.env.__jit_chain = (a, b) => jit.jitChain(a, b);
  }
  inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
  const run = (n) => { for (let i = 0; i < n; i++) inst.exports.__main(); };
  const key = (...scs) => { for (const s of scs) { keyq.push(s); run(4); } };
  run(120); key(0x31, 0xB1); run(30); key(0x1D, 0x32, 0xB2, 0x9D); run(50); mx = 108; my = 325; run(6); mb = 1; run(10); mb = 0;
  run(NF); return fb;
}
const fi = await boot(false); writeFileSync("/tmp/game_interp.png", png(fi));
const fj = await boot(true);  writeFileSync("/tmp/game_jit.png", png(fj));
console.log("wrote /tmp/game_interp.png and /tmp/game_jit.png");
