// f6prof.mjs — fine-grained PURE-INTERP rip profile: desktop vs GodSong-form. Small fixed budget
// (50k instr per __main) + sample rip after every call => statistical profile of where the guest
// spends instructions. The JIT is disabled but __jit_state still hands us the rip offset.
import { createHost } from "./holyc-wasm/src/runtime/host.js";
import { readFileSync } from "node:fs";
const RAMSZ = 402653184;
const liveBuf = readFileSync("/tmp/live.bin");
const diskBuf = readFileSync("/tmp/templeos.raw");
const mod = await WebAssembly.compile(readFileSync("./hemu-wasm/snapshot.wasm"));

let gBase = 0, inst, ripOff = 0, bad = false;
const keyq = []; const ovl = new Map();
const host = createHost({ onText: (s) => { if (s && s.indexOf("BADOP") >= 0) { bad = true; process.stdout.write("GUEST: " + s); } }, snd: { tone: () => {} },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead: (lba, cnt, u8, dst) => { for (let s = 0; s < cnt; s++) { const o = ovl.get(lba + s); if (o) u8.set(o, dst + s * 512); else u8.set(diskBuf.subarray((lba + s) * 512, (lba + s) * 512 + 512), dst + s * 512); } },
  diskWrite: (lba, cnt, u8, src) => { for (let s = 0; s < cnt; s++) ovl.set(lba + s, u8.slice(src + s * 512, src + s * 512 + 512)); },
  present: () => {} });
host.env.__host_msx = () => 320n; host.env.__host_msy = () => 240n; host.env.__host_msb = () => 0n; host.env.__host_wheel = () => 0n;
host.env.__host_key = () => keyq.length ? BigInt(keyq.shift()) : -1n; host.env.__host_prof = () => {};
host.env.__host_budget = () => 50000n; host.env.__host_dt = () => 1n;
host.env.__jit_state = (rg, fl, rp) => { ripOff = Number(rp); return 0n; };   // JIT OFF; just capture the rip offset
let fsOff = 0;
host.env.__jit_seg = (fs, gs, tsc) => { fsOff = Number(fs); };                // &msr_fsbase = current CTask* (Fs)
inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
const dv = () => new DataView(inst.exports.memory.buffer);
const rip = () => Number(dv().getBigUint64(ripOff, true));

const run = (n) => { for (let i = 0; i < n; i++) inst.exports.__main(); };
const key = (...scs) => { for (const s of scs) { keyq.push(s); run(40); } };

const fsTask = () => Number(dv().getBigUint64(fsOff, true));
const taskInfo = (t) => {     // read the CTask's embedded ASCII strings (name/title live in the struct)
  const m = new Uint8Array(inst.exports.memory.buffer);
  let best = "";
  for (let o = 0; o < 0x600; o++) {
    let s = "", i = 0;
    while (i < 40) { const c = m[gBase + t + o + i]; if (c >= 32 && c < 127) { s += String.fromCharCode(c); i++; } else break; }
    if (s.length >= 4 && s.length > best.length) best = s;
    o += i;
  }
  return best;
};
const profile = (label, n) => {
  const h = new Map(), tk = new Map();
  for (let i = 0; i < n; i++) { inst.exports.__main(); const r = rip(); h.set(r, (h.get(r) || 0) + 1); const t = fsTask(); tk.set(t, (tk.get(t) || 0) + 1); }
  const top = [...h.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log(`== ${label} (${n} samples x50k instr) ==`);
  for (const [r, c] of top) console.log(`  0x${r.toString(16).padStart(6)}  ${(c * 100 / n).toFixed(1)}%`);
  console.log(`-- tasks (Fs at sample) --`);
  for (const [t, c] of [...tk.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8))
    console.log(`  Fs=0x${t.toString(16)}  ${(c * 100 / n).toFixed(1)}%  "${taskInfo(t)}"`);
};

run(2500);                                  // boot (small budget -> more calls)
profile("DESKTOP", 4000);
key(0x31, 0xB1); run(400); key(0x1C, 0x9C); run(600);   // dismiss Tour prompt: n, Enter
console.log("-- pressing F6 --");
key(0x40, 0xC0);
run(1500);                                  // let the form spawn
profile("FORM-UP", 8000);
console.log(bad ? "FAULT!" : "no fault");
