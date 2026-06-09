// Render the Ctrl+M game menu to find Varoom (and see what the menu looks like).
import { createHost } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/runtime/host.js";
import { PALETTE } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/abi.js";
import * as jit from "/Users/parkerh/Dev/TempleOS-wasm/jit.js";
import { compileHolyC } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/compiler.js";
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
const RAMSZ = 402653184, W = 640, H = 480;
const liveBuf = readFileSync("/tmp/live.bin"), diskBuf = readFileSync("/tmp/templeos.raw");
const dir = "/Users/parkerh/Dev/hemu-wasm/src";
const r = compileHolyC(readFileSync(dir + "/snapshot.HC", "latin1"), { filename: "snapshot.HC", lenient: false, includeResolver: (p) => { try { return readFileSync(dir + "/" + p, "latin1"); } catch { return null; } } });
const mod = await WebAssembly.compile(r.bytes);
jit.jitSeg(Number(r.globals.get("msr_fsbase").addr), Number(r.globals.get("msr_gsbase").addr), Number(r.globals.get("tsc").addr));
const CT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CT[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function png(idx) { const raw = Buffer.alloc((W * 3 + 1) * H); for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; for (let x = 0; x < W; x++) { const [r0, g0, b0] = PALETTE[idx[y * W + x] & 15]; const o = y * (W * 3 + 1) + 1 + x * 3; raw[o] = r0; raw[o + 1] = g0; raw[o + 2] = b0; } } const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 2; const ch = (t, d) => { const c = Buffer.concat([Buffer.from(t), d]); const L = Buffer.alloc(4); L.writeUInt32BE(d.length, 0); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(c), 0); return Buffer.concat([L, c, cr]); }; return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch("IHDR", ih), ch("IDAT", deflateSync(raw)), ch("IEND", Buffer.alloc(0))]); }

let mx = 320, my = 240, mb = 0, gBase = 0; const keyq = []; const ovl = new Map(); let inst, fb = null;
const host = createHost({ onText: () => {}, snd: { tone: () => {} },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
  diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
  present: (a, w, h, u8) => { fb = Buffer.from(u8.subarray(a, a + w * h)); } });
host.env.__host_msx = () => BigInt(mx); host.env.__host_msy = () => BigInt(my); host.env.__host_msb = () => BigInt(mb); host.env.__host_wheel = () => 0n;
host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n; host.env.__host_budget = () => 1500000n; host.env.__host_dt = () => 33n; host.env.__host_prof = () => {}; host.env.__host_time = () => 0n;
host.env.__jit_state = (rg, fl, rp) => { jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem); return 1n; };
host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip))); host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c); host.env.__jit_dispatch = (b) => BigInt(jit.jitDispatch(Number(b))); host.env.__jit_chain = (a, b) => jit.jitChain(a, b);
jit.jitReset();
inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
const run = (n) => { for (let i = 0; i < n; i++) inst.exports.__main(); };
const key = (...scs) => { for (const s of scs) { keyq.push(s); run(4); } };
run(120); key(0x31, 0xB1); run(30);            // N -> decline "Take Tour?"
key(0x1D, 0x32, 0xB2, 0x9D); run(80);          // Ctrl+M -> game launcher sprite menu
writeFileSync("/tmp/menu.png", png(fb));
console.log("wrote /tmp/menu.png");
