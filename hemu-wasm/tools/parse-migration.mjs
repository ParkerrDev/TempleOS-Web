// parse-migration.mjs — extract the pc.ram block from a qemu migration stream (snapshot.bin)
// into a flat 384 MiB image (live.bin).  This is the LIVE guest RAM qemu-wasm resumes & animates.
// qemu migration is BIG-ENDIAN.  RAM page stream: each entry = u64(addr|flags); flag bits:
//   ZERO=0x02 MEM_SIZE=0x04 PAGE=0x08 EOS=0x10 CONTINUE=0x20 XBZRLE=0x40 HOOK=0x80 COMPRESS=0x100
import { readFileSync, writeFileSync, openSync, writeSync, ftruncateSync, closeSync } from "node:fs";

const RAMSZ = 402653184;                       // 384 MiB
const buf = readFileSync("/tmp/hemusnap/snapshot.bin");
let p = 0;
const u8  = () => buf[p++];
const u16 = () => { const v = buf.readUInt16BE(p); p += 2; return v; };
const u32 = () => { const v = buf.readUInt32BE(p); p += 4; return v; };
const u64 = () => { const v = buf.readBigUInt64BE(p); p += 8; return v; };
const str = (n) => { const s = buf.toString("latin1", p, p + n); p += n; return s; };

if (str(4) !== "QEVM") throw new Error("bad magic");
const ver = u32();
console.log(`QEVM version ${ver}`);

// Skip the (subsection-bearing) config section: scan for the "ram" SECTION_START signature
// 0x01 <section_id:4> 0x03 "ram", and start there.
const needle = Buffer.from([0x03, 0x72, 0x61, 0x6d]); // len=3, "ram"
let rs = 0;
while ((rs = buf.indexOf(needle, rs)) !== -1) { if (rs >= 5 && buf[rs - 5] === 0x01) break; rs++; }
if (rs < 5) throw new Error("ram START not found");
p = rs - 5;
console.log(`ram START @ 0x${p.toString(16)}`);

// flat output (sparse-written)
const out = openSync("/tmp/hemusnap/live.bin", "w");
ftruncateSync(out, RAMSZ);
let pages = 0, zeros = 0, pcram_len = 0n, curBlock = "";

const SEC = { EOF:0x00, START:0x01, PART:0x02, END:0x03, FULL:0x04, CONFIG:0x07, FOOTER:0x7E };
const F = { ZERO:0x02, MEM_SIZE:0x04, PAGE:0x08, EOS:0x10, CONTINUE:0x20, XBZRLE:0x40, HOOK:0x80, COMPRESS:0x100 };

// parse the RAM page stream (used inside the "ram" section's START/PART data)
let dbg = 0;
function parseRamData() {
  for (;;) {
    if (p + 8 > buf.length) return;
    const af = u64();
    const flags = Number(af & 0xFFFn);
    const addr = af & ~0xFFFn;
    if (dbg++ < 8) console.log(`  entry @${(p-8).toString(16)} flags=0x${flags.toString(16)} addr=0x${addr.toString(16)} block=${curBlock}`);
    if (flags & F.EOS) return;          // standalone marker — no block name, no data
    if (flags & F.MEM_SIZE) {
      // addr field = total ram bytes; then block descriptors until that many bytes accounted
      let remaining = addr;
      while (remaining > 0n) {
        const nlen = u8(); const name = str(nlen); const blen = u64();
        if (name === "pc.ram") pcram_len = blen;
        console.log(`    block "${name}" len=0x${blen.toString(16)} (rem now 0x${(remaining-blen).toString(16)})`);
        remaining -= blen;
      }
      continue;
    }
    if (!(flags & F.CONTINUE)) { const nlen = u8(); curBlock = str(nlen); }
    if (flags & F.ZERO) {
      const z = u8();
      if (curBlock === "pc.ram") { const pg = Buffer.alloc(4096, z); writeSync(out, pg, 0, 4096, Number(addr)); zeros++; }
    } else if (flags & F.PAGE) {
      const pg = buf.subarray(p, p + 4096); p += 4096;
      if (curBlock === "pc.ram" && Number(addr) + 4096 <= RAMSZ) { writeSync(out, pg, 0, 4096, Number(addr)); pages++; }
    } else if (flags & (F.XBZRLE | F.COMPRESS)) {
      throw new Error(`unsupported page encoding flags=0x${flags.toString(16)} @${p}`);
    } else if (flags === 0) {
      // a bare page with no data flag — shouldn't happen; bail
      console.log(`bare entry addr=0x${addr.toString(16)} @${p}`); return;
    }
  }
}

function maybeFooter() { if (p < buf.length && buf[p] === SEC.FOOTER) { p++; u32(); } }

// walk top-level sections; only "ram" is parseable (we don't know other sections' lengths),
// but ram comes first (START + PARTs + END), so stop once a non-ram section appears.
let ramId = -1, guard = 0;
for (;;) {
  if (p >= buf.length || guard++ > 100000) break;
  const t = u8();
  if (t === SEC.EOF) { console.log("EOF"); break; }
  if (t === SEC.CONFIG) { const n = u32(); console.log(`config: ${str(n)}`); continue; }
  if (t === SEC.START || t === SEC.FULL) {
    const sid = u32(); const nlen = u8(); const idstr = str(nlen); u32(); u32();
    if (idstr === "ram") { ramId = sid; parseRamData(); maybeFooter(); }
    else { console.log(`reached non-ram section "${idstr}" — stop`); break; }
  } else if (t === SEC.PART || t === SEC.END) {
    const sid = u32();
    if (sid === ramId) { parseRamData(); maybeFooter(); if (t === SEC.END) console.log("ram END"); }
    else { console.log(`non-ram part sid=${sid} — stop`); break; }
  } else { console.log(`unknown section type 0x${t.toString(16)} @${p}; stop`); break; }
}
closeSync(out);
console.log(`done: wrote live.bin (${pages} data pages, ${zeros} zero pages)`);
