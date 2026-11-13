// find-delta.mjs - locate the relocation delta between the single-core (live.bin) and multi-core
// (live-smp.bin) snapshots by finding known code signatures (the hardcoded present addresses) from
// live.bin inside live-smp.bin. If a constant delta exists, the multi-core present addresses =
// single-core address + delta.
import { readFileSync } from "node:fs";
const a = readFileSync("/tmp/live.bin");          // single-core (present addresses known)
const b = readFileSync("/tmp/hemusnap/live-smp.bin");
const known = { g_capture_rip: 0x119b828f, g_hle_blit: 0x119c8428, g_dc2_area: 0x119ad3d8, g_skip_bg: 0x11655828, winmgr: 0x1140cc08 };
function findSig(addr, len = 48) {
  const sig = a.subarray(addr, addr + len);
  if (sig.every((v) => v === 0)) return { addr, note: "all-zero sig (skip)" };
  // search b for the exact sig within +/- 8MiB of addr first (fast), then whole file
  const lo = Math.max(0, addr - 0x800000), hi = Math.min(b.length - len, addr + 0x800000);
  const idx0 = b.indexOf(sig, lo);
  let found = (idx0 >= 0 && idx0 <= hi) ? idx0 : b.indexOf(sig);
  if (found < 0) return { addr, note: "NOT FOUND" };
  return { addr, found, delta: found - addr };
}
for (const [name, addr] of Object.entries(known)) {
  const r = findSig(addr);
  if (r.found != null) console.log(`${name.padEnd(14)} 0x${addr.toString(16)} -> 0x${r.found.toString(16)}  delta=${r.delta >= 0 ? "+" : ""}0x${Math.abs(r.delta).toString(16)}${r.delta<0?" (neg)":""}`);
  else console.log(`${name.padEnd(14)} 0x${addr.toString(16)}  ${r.note}`);
}
