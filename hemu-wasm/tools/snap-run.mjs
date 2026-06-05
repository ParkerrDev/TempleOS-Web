// snap-run.mjs — boot real TempleOS in hemu from the qemu core.elf RAM snapshot.
import { compileHolyC } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/compiler.js";
import { createHost } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/runtime/host.js";
import { readFileSync, openSync, readSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PALETTE = [[0,0,0],[0,0,0xaa],[0,0xaa,0],[0,0xaa,0xaa],[0xaa,0,0],[0xaa,0,0xaa],[0xaa,0x55,0],[0xaa,0xaa,0xaa],
  [0x55,0x55,0x55],[0x55,0x55,0xff],[0x55,0xff,0x55],[0x55,0xff,0xff],[0xff,0x55,0x55],[0xff,0x55,0xff],[0xff,0xff,0x55],[0xff,0xff,0xff]];
const RAMSZ = 402653184;
const ELF = process.env.ELF || process.argv[2] || "/tmp/hemusnap/core7.elf";   // VM-paused capture

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const src = readFileSync(resolve(srcDir, "snapshot.HC"), "latin1");
const includeResolver = (p) => { try { return readFileSync(resolve(srcDir, p), "latin1"); } catch { return null; } };
const r = compileHolyC(src, { filename: "snapshot.HC", lenient: false, includeResolver });
console.log(`compiled snapshot.HC: ${r.bytes.length} bytes, ${r.warnings.length} warnings`);

// A ".bin" snapshot is a FLAT image (offset == guest physical address) — e.g. live.bin extracted
// from a qemu migration stream.  A ".elf" is a core dump (PT_LOAD segments).
const FLAT = ELF.endsWith(".bin");
const fd = openSync(ELF, "r");
const segs = [];
if (!FLAT) {
  const eh = Buffer.alloc(64); readSync(fd, eh, 0, 64, 0);
  const phoff = Number(eh.readBigUInt64LE(0x20)), phnum = eh.readUInt16LE(0x38), phentsz = eh.readUInt16LE(0x36);
  for (let i = 0; i < phnum; i++) {
    const p = Buffer.alloc(phentsz); readSync(fd, p, 0, phentsz, phoff + i * phentsz);
    if (p.readUInt32LE(0) !== 1) continue;
    segs.push({ off: Number(p.readBigUInt64LE(8)), paddr: Number(p.readBigUInt64LE(24)), filesz: Number(p.readBigUInt64LE(32)) });
  }
}

let presented = null;
let presentCount = 0;
let toneCount = 0;
let prevFrame = null;
const host = createHost({
  onText: (s) => process.stdout.write(s),
  snd: { tone: (freq) => { if (freq > 0) { toneCount++; console.log(`[sound] PC speaker tone ${freq.toFixed(0)} Hz`); } } },
  snapLoad: (base, u8) => {
    let loaded = 0;
    if (FLAT) {
      const buf = readFileSync(ELF);
      const n = Math.min(buf.length, RAMSZ);
      u8.set(buf.subarray(0, n), base); loaded = n;
    } else for (const s of segs) {
      if (s.paddr >= RAMSZ) continue;
      const n = Math.min(s.filesz, RAMSZ - s.paddr);
      const buf = Buffer.alloc(n); readSync(fd, buf, 0, n, s.off);
      u8.set(buf, base + s.paddr); loaded += n;
    }
    console.log(`[snapLoad] ${(loaded / 1048576).toFixed(0)}MB into guest RAM (base ${base}, ${FLAT?"flat":"elf"})`);
  },
  present: (addr, w, h, u8) => {
    const ppm = Buffer.alloc(w * h * 3);
    for (let i = 0; i < w * h; i++) { const c = u8[addr + i] & 15; const [r2, g, b] = PALETTE[c]; ppm[i*3]=r2; ppm[i*3+1]=g; ppm[i*3+2]=b; }
    const name = `/tmp/hemusnap/frame${presentCount}.ppm`;
    writeFileSync(name, Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`), ppm]));
    writeFileSync("/tmp/hemusnap/screen.ppm", Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`), ppm]));
    let nonzero = 0; for (let i = 0; i < w*h; i++) if (u8[addr+i]) nonzero++;
    // frame-to-frame diff: nonzero across frames == the screen is animating (clock, cursor, ...)
    const cur = Buffer.from(u8.subarray(addr, addr + w*h));
    let diff = 0;
    if (prevFrame) for (let i = 0; i < w*h; i++) if (cur[i] !== prevFrame[i]) diff++;
    prevFrame = cur;
    presented = { w, h, nonzero };
    console.log(`[present #${presentCount}] ${w}x${h}, ${(100*nonzero/(w*h)).toFixed(0)}% non-black, diff=${diff}px -> ${name}`);
    presentCount++;
  },
});

// Host-driven input (snapshot.HC pulls these each frame). Headless: synthetic cursor sweep +
// a '1' keystroke (set-1 make 0x02 / break 0x82) every 8 frames, to prove cursor + keyboard echo.
const keyq = [];
host.env.__host_msx = () => { const f = presentCount; if (f % 8 === 2) keyq.push(0x02); if (f % 8 === 3) keyq.push(0x82); return BigInt(60 + (f * 4) % 520); };
host.env.__host_msy = () => BigInt(100 + (presentCount * 3) % 280);
host.env.__host_msb = () => 0n;
host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n;
host.env.__host_budget = () => BigInt(process.env.BUDGET || 4000000);
const prof = new Map();
host.env.__host_prof = (rip) => { const b = Number(rip) >>> 14; prof.set(b, (prof.get(b) || 0) + 1); };

const mod = await WebAssembly.compile(r.bytes);
const inst = await WebAssembly.instantiate(mod, { env: host.env });
host.attach(inst);
inst.exports.__rt_init();
const t0 = performance.now();
const ft = [];
try { for (let i = 0; i < 120; i++) { const a = performance.now(); inst.exports.__main(); ft.push(performance.now() - a); } }   // __main runs ONE frame per call
catch (e) { console.log("WASM TRAP:", e.message); }
const steady = ft.slice(5);                                     // skip warmup (frame 0 = snapshot load)
const avg = steady.reduce((s, x) => s + x, 0) / steady.length;
const sorted = [...steady].sort((a, b) => a - b), p95 = sorted[Math.floor(sorted.length * 0.95)];
console.log(`ran in ${((performance.now() - t0) / 1000).toFixed(2)}s; presented=${JSON.stringify(presented)}`);
console.log(`PERF: avg ${avg.toFixed(1)} ms/frame = ${(1000/avg).toFixed(1)} fps | p95 ${p95.toFixed(1)} ms | frame0 ${ft[0].toFixed(0)} ms`);
const top = [...prof.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
const tot = [...prof.values()].reduce((s, x) => s + x, 0);
console.log("PROFILE (hot 16KB rip buckets):");
for (const [b, c] of top) console.log(`  0x${(b<<14).toString(16)}-0x${((b<<14)+0x3fff).toString(16)}  ${(100*c/tot).toFixed(1)}%  (${c})`);
