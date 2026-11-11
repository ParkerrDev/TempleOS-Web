import {SnapshotRead,DiskRead} from "./Fixtures.mjs";
// jitrecycle.mjs: regression test for JIT correctness when TempleOS recycles compiled-code memory.
// Every command-line statement is JIT-compiled by the OS into a fresh MAlloc'd block, executed and
// freed; the next statement usually lands at the SAME address with DIFFERENT machine code. A block
// cache keyed by rip alone would then run the previous statement's native code. This test runs two
// hot loops (each compiled by hemu's JIT) back to back in Adam through the guest execution API and
// checks both results, then a third loop that writes over its own predecessor's address again.
//   node --max-old-space-size=3072 jitrecycle.mjs        (NOJIT=1 for the interpreter baseline)
// Exit 0 = both results exact, 1 = a stale block (or a crash) produced a wrong result.
import { compileHemu } from "../../engine/compile.js";
import { createHemuHost } from "../../engine/host.js";
import * as jit from "../../engine/jit.js";
import { createGuestExec } from "../../engine/guestexec.js";
import { readFileSync } from "node:fs";
const RAMSZ = 402653184;
const liveBuf = SnapshotRead(), disk = DiskRead();
const r = compileHemu();
const mod = await WebAssembly.compile(r.bytes);
let gBase = 0, inst; const ovl = disk.overlay; const badops = [];
const host = createHemuHost({ onText: (s) => { if (s && s.indexOf("BADOP") >= 0) badops.push(s.trim()); }, snd: { tone: () => {} },
  snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); },
  diskRead:(lba,count,bytes,offset)=>disk.readInto(lba,count,bytes,offset),
  diskWrite:(lba,count,bytes,offset)=>disk.writeInto(lba,count,bytes,offset),
  present: () => {} });
host.env.__host_key = () => -1n; host.env.__host_budget = () => 12000000n; host.env.__host_dt = () => 16n;
const NOJIT = !!process.env.NOJIT;
if (!NOJIT) {
  host.env.__jit_state = (rg, fl, rp) => { jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem, inst.exports.RasterHLE); return 1n; };
  host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip)));
  host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
  host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c);
  host.env.__jit_dispatch = (b) => BigInt(jit.jitDispatch(Number(b)));
  host.env.__jit_chain = (a, b) => jit.jitChain(a, b); host.env.__jit_seg = (...a) => jit.jitSeg(...a.map(Number));
  if (jit.jitCodeMap) host.env.__jit_inval = (lo, hi) => jit.jitInvalidate(Number(lo), Number(hi));
  jit.jitReset();
}
inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
let gx = null, frames = 0;
async function run(n) { for (let i = 0; i < n; i++) { inst.exports.__main(); frames++; if (gx) gx.tick(); await new Promise((r) => setImmediate(r)); } }
const t0 = performance.now(), say = (s) => console.log(`[${((performance.now() - t0) / 1000).toFixed(1)}s] ${s}`);
await run(120);
gx = createGuestExec({ inst, gBase, onEvent: (ev) => { if (ev.state === "failed" || ev.state === "error") say(`  ev #${ev.id} ${ev.state} | ${ev.msg}`); } });
const p = gx.probe(); if (!p.ok) { say("probe failed: " + p.errors.join("; ")); process.exit(2); }
const A = gx.scratch.base + 0xA00;
async function loop(id, name, body, expect, slot) {
  gx.wr64(A + slot * 8, -1);
  const rid = gx.exec({ id, target: "adam", name, src: body.replace("%R%", "0x" + (A + slot * 8).toString(16)) });
  for (let f = 0; f < 3000; f += 5) { await run(5); const s = gx.status(rid); if (s && ["done", "failed", "error"].includes(s.state)) break; }
  const st = gx.status(rid), got = BigInt.asIntN(64, gx.rd64b ? gx.rd64b(A + slot * 8) : BigInt(gx.rd64(A + slot * 8)));
  const ok = st && st.state === "done" && got === expect;
  say(`${ok ? "PASS" : "FAIL"} ${name}: state=${st && st.state} result=${got} expected=${expect}${st && st.except ? " except=" + st.except : ""}`);
  return ok;
}
// loop 1: sum of i (hot enough to be JIT-compiled: 300k iterations of the body block)
const ok1 = await loop("l1", "sum i", "I64 ra_,rs_=0;for(ra_=0;ra_<300000;ra_++)rs_+=ra_;*(%R%)(I64*)=rs_;", 44999850000n, 0);
// loop 2: different body, same statement shape -> lands at the recycled address of loop 1's code
const ok2 = await loop("l2", "sum 3*i+7", "I64 rb_,rt_=0;for(rb_=0;rb_<300000;rb_++)rt_+=3*rb_+7;*(%R%)(I64*)=rt_;", 134999550000n + 2100000n, 1);
// loop 3: yet another body (xor accumulate), recycles again
const ok3 = await loop("l3", "xor i*5", "I64 rc_,ru_=0;for(rc_=0;rc_<300000;rc_++)ru_^=rc_*5;*(%R%)(I64*)=ru_;", (() => { let u = 0n; for (let i = 0n; i < 300000n; i++) u ^= i * 5n; return u; })(), 2);
say(`jit=${NOJIT ? "off" : "on"} frames=${frames} badops=${badops.length} calls=${gx.info().calls}`);
console.log(`=== jitrecycle: ${[ok1, ok2, ok3].filter(Boolean).length}/3 passed (${NOJIT ? "interpreter" : "JIT"}) ===`);
process.exit(ok1 && ok2 && ok3 ? 0 : 1);
