// qcow2.js — minimal read-only qcow2 reader for hemu's ATA disk (browser, no deps).
// hemu's __host_disk(lba,count,buf) calls reader.readInto(lba,count,u8,dst) to stage
// real C: sectors into guest RAM. Sparse: unallocated clusters read back as zeros.
// All multi-byte fields are big-endian (qcow2 spec).

export function makeQcow2(buf) {                       // buf: Uint8Array of the decompressed .qcow2
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0) !== 0x514649fb) throw new Error("not a qcow2 image");
  const clusterBits = dv.getUint32(20), clusterSize = 1 << clusterBits;
  const l1Size = dv.getUint32(36), l1Off = Number(dv.getBigUint64(40));
  const l2Entries = clusterSize >> 3, l2Mask = l2Entries - 1, l2Bits = clusterBits - 3;
  const OFF = 0x00fffffffffffe00n;                     // bits 9..55 = cluster-aligned host offset
  function clusterAt(gIdx) {                           // host file offset of a guest cluster, or -1 (unallocated)
    const l1i = gIdx >> l2Bits; if (l1i >= l1Size) return -1;
    const l1e = dv.getBigUint64(l1Off + l1i * 8) & OFF; if (l1e === 0n) return -1;
    const l2e = dv.getBigUint64(Number(l1e) + (gIdx & l2Mask) * 8);
    if (l2e & (1n << 62n)) throw new Error("qcow2 compressed cluster (unsupported)");
    const off = l2e & OFF; return off === 0n ? -1 : Number(off);
  }
  const overlay = new Map();                          // lba -> Uint8Array(512): in-session writes (the .qcow2 stays pristine)
  const virtualSize = Number(dv.getBigUint64(24));
  return {
    virtualSize,
    overlay,
    readInto(lba, count, dst, dstOff) {               // fill count*512 bytes at dst[dstOff]
      for (let s = 0; s < count; s++) {
        const o = dstOff + s * 512, ov = overlay.get(lba + s);
        if (ov) { dst.set(ov, o); continue; }          // a prior write wins
        const gOff = (lba + s) * 512, gIdx = Math.floor(gOff / clusterSize), inC = gOff % clusterSize;
        const c = clusterAt(gIdx);
        if (c < 0) dst.fill(0, o, o + 512);
        else dst.set(buf.subarray(c + inC, c + inC + 512), o);
      }
    },
    writeInto(lba, count, src, srcOff) {              // ATA writes land in the overlay (so reads see them back)
      for (let s = 0; s < count; s++) overlay.set(lba + s, src.slice(srcOff + s * 512, srcOff + s * 512 + 512));
    }
  };
}

// A raw-image reader with the same interface (for user-imported saves).
export function makeRaw(buf) {
  const overlay = new Map();
  return {
    virtualSize: buf.length,
    overlay,
    readInto(lba, count, dst, dstOff) {
      for (let s = 0; s < count; s++) {
        const o = dstOff + s * 512, ov = overlay.get(lba + s);
        if (ov) { dst.set(ov, o); continue; }
        const off = (lba + s) * 512;
        if (off + 512 <= buf.length) dst.set(buf.subarray(off, off + 512), o);
        else dst.fill(0, o, o + 512);
      }
    },
    writeInto(lba, count, src, srcOff) {
      for (let s = 0; s < count; s++) overlay.set(lba + s, src.slice(srcOff + s * 512, srcOff + s * 512 + 512));
    }
  };
}

export function makeDisk(buf) {            // qcow2 or raw, by magic
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return buf.length >= 4 && dv.getUint32(0) === 0x514649fb ? makeQcow2(buf) : makeRaw(buf);
}

// Fetch a gzipped disk image (qcow2 or raw) and return a reader (main thread or worker).
export async function loadDisk(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("disk fetch " + resp.status);
  const buf = new Uint8Array(await new Response(resp.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
  return makeDisk(buf);
}

// ---- RedSea host-side file injection (writes go to the reader's overlay) ----
// Format per ::/Doc/RedSea.DD: CRedSeaBoot at the partition start (sig 0x88 / 0xAA55),
// allocation bitmap right after the boot blk, 64-byte CDirEntry, files CONTIGUOUS.
const SEC = 512;
function rd(reader, lba, count) { const b = new Uint8Array(count * SEC); reader.readInto(lba, count, b, 0); return b; }
function wr(reader, lba, bytes) { // bytes length multiple of 512
  reader.writeInto(lba, bytes.length / SEC, bytes, 0);
}
function findRedSea(reader) {
  // partition 1 from the MBR, else the image itself starts with the boot blk
  const mbr = rd(reader, 0, 1), mdv = new DataView(mbr.buffer);
  const cands = [];
  if (mdv.getUint16(510, true) === 0xAA55) for (let p = 0; p < 4; p++) cands.push(mdv.getUint32(446 + p * 16 + 8, true));
  cands.unshift(0);
  for (const off of cands) {
    const b = rd(reader, off, 1), v = new DataView(b.buffer);
    if (b[3] === 0x88 && v.getUint16(510, true) === 0xAA55)
      return { off, sects: Number(v.getBigInt64(16, true)), rootClus: Number(v.getBigInt64(24, true)),
               bitmapSects: Number(v.getBigInt64(32, true)) };
  }
  throw new Error("no RedSea filesystem found");
}
function readDirEntries(reader, clus, size) {
  const secs = Math.max(1, Math.ceil(size / SEC));
  const b = rd(reader, clus, secs), v = new DataView(b.buffer), out = [];
  for (let o = 0; o + 64 <= b.length; o += 64) {
    out.push({ off: o, attr: v.getUint16(o, true),
      name: (() => { let s = ""; for (let i = 0; i < 38; i++) { const c = b[o + 2 + i]; if (!c) break; s += String.fromCharCode(c); } return s; })(),
      clus: Number(v.getBigInt64(o + 40, true)), size: Number(v.getBigInt64(o + 48, true)),
      datetime: v.getBigInt64(o + 56, true) });
  }
  return { buf: b, entries: out };
}
// Upload a file into a directory (default /Home). Replaces an existing entry of the same name.
export function redseaUpload(reader, filename, bytes, dirPath = "Home") {
  const fs = findRedSea(reader);
  const RS_ATTR_DIR = 0x10;
  let dirClus = fs.rootClus, dirSize = SEC * 4;
  { const root = readDirEntries(reader, fs.rootClus, SEC);     // root's own first entry gives its size
    const self = root.entries[0]; if (self && self.attr & RS_ATTR_DIR && self.clus === fs.rootClus) dirSize = self.size; }
  for (const part of dirPath.split("/").filter(Boolean)) {
    const d = readDirEntries(reader, dirClus, dirSize);
    const e = d.entries.find(e => (e.attr & RS_ATTR_DIR) && e.name.toUpperCase() === part.toUpperCase());
    if (!e) throw new Error("directory not found: " + part);
    dirClus = e.clus; dirSize = e.size;
  }
  const dir = readDirEntries(reader, dirClus, dirSize);
  if (filename.length > 37) throw new Error("filename too long");
  // bitmap helpers (bit i = absolute block i; bitmap lives at fs.off+1)
  const bmSecs = fs.bitmapSects, bm = rd(reader, fs.off + 1, bmSecs);
  const bget = (i) => (bm[i >> 3] >> (i & 7)) & 1;
  const bset = (i) => { bm[i >> 3] |= 1 << (i & 7); };
  const bclr = (i) => { bm[i >> 3] &= ~(1 << (i & 7)); };
  // free any existing file of the same name
  let slot = null;
  const existing = dir.entries.find(e => e.name.toUpperCase() === filename.toUpperCase() && !(e.attr & RS_ATTR_DIR) && e.name);
  if (existing) { for (let i = 0; i < Math.ceil(existing.size / SEC); i++) bclr(existing.clus + i); slot = existing.off; }
  if (slot === null) {
    const free = dir.entries.find(e => e.off >= 64 && (!e.name || e.attr === 0) && !(e.attr & RS_ATTR_DIR));
    if (!free) throw new Error("directory is full");
    slot = free.off;
  }
  // allocate a contiguous run
  const need = Math.max(1, Math.ceil(bytes.length / SEC));
  const lo = fs.off + fs.bitmapSects, hi = fs.off + fs.sects;
  let run = 0, start = -1;
  for (let b2 = lo; b2 < hi; b2++) {
    if (!bget(b2)) { if (!run) start = b2; if (++run === need) break; } else run = 0;
  }
  if (run < need) throw new Error("disk full");
  for (let i = 0; i < need; i++) bset(start + i);
  // write data (padded), bitmap, dir entry
  const padded = new Uint8Array(need * SEC); padded.set(bytes);
  wr(reader, start, padded);
  wr(reader, fs.off + 1, bm);
  const db = dir.buf, dvv = new DataView(db.buffer);
  const tmpl = dir.entries.find(e => e.name && !(e.attr & RS_ATTR_DIR));
  db.fill(0, slot, slot + 64);
  dvv.setUint16(slot, tmpl ? tmpl.attr : 0, true);
  for (let i = 0; i < filename.length; i++) db[slot + 2 + i] = filename.charCodeAt(i);
  dvv.setBigInt64(slot + 40, BigInt(start), true);
  dvv.setBigInt64(slot + 48, BigInt(bytes.length), true);
  dvv.setBigInt64(slot + 56, tmpl ? tmpl.datetime : 0n, true);
  wr(reader, dirClus, db);
  return { clus: start, sects: need };
}
// List a directory (for tests/UI feedback).
export function redseaList(reader, dirPath = "Home") {
  const fs = findRedSea(reader);
  let dirClus = fs.rootClus, dirSize = SEC * 4;
  { const root = readDirEntries(reader, fs.rootClus, SEC);
    const self = root.entries[0]; if (self && self.clus === fs.rootClus) dirSize = self.size; }
  for (const part of dirPath.split("/").filter(Boolean)) {
    const d = readDirEntries(reader, dirClus, dirSize);
    const e = d.entries.find(e => (e.attr & 0x10) && e.name.toUpperCase() === part.toUpperCase());
    if (!e) throw new Error("directory not found: " + part);
    dirClus = e.clus; dirSize = e.size;
  }
  return readDirEntries(reader, dirClus, dirSize).entries.filter(e => e.name);
}
// Read one file's bytes (for tests).
export function redseaRead(reader, dirPath, filename) {
  const e = redseaList(reader, dirPath).find(e => e.name.toUpperCase() === filename.toUpperCase());
  if (!e) return null;
  return rd(reader, e.clus, Math.max(1, Math.ceil(e.size / SEC))).subarray(0, e.size);
}
// Stream the whole virtual disk as raw sectors in chunks (for export).
export function* exportRawChunks(reader, totalBytes, chunkSects = 2048) {
  const total = Math.ceil(totalBytes / SEC);
  for (let lba = 0; lba < total; lba += chunkSects) {
    const n = Math.min(chunkSects, total - lba);
    const b = new Uint8Array(n * SEC);
    reader.readInto(lba, n, b, 0);
    yield b;
  }
}

// ---- FAT32 host-side file injection (this distro's C: is FAT32, not RedSea) ----
function f32Parse(reader, off) {
  const b = rd(reader, off, 1), v = new DataView(b.buffer);
  const bytesPerSec = v.getUint16(11, true), secPerClus = b[13], rsvd = v.getUint16(14, true);
  const nFats = b[16], fatSz = v.getUint32(36, true), rootClus = v.getUint32(44, true);
  if (bytesPerSec !== 512) throw new Error("unsupported sector size");
  return { off, secPerClus, rsvd, nFats, fatSz, rootClus,
           fatLba: off + rsvd, dataLba: off + rsvd + nFats * fatSz };
}
function f32Boot(reader) {
  const mbr = rd(reader, 0, 1), mdv = new DataView(mbr.buffer);
  if (mdv.getUint16(510, true) === 0xAA55)
    for (let p = 0; p < 4; p++) {
      const typ = mbr[446 + p * 16 + 4], start = mdv.getUint32(446 + p * 16 + 8, true);
      if (typ === 0x0b || typ === 0x0c) return f32Parse(reader, start);
    }
  return f32Parse(reader, 0);
}
const f32ClusLba = (fs, c) => fs.dataLba + (c - 2) * fs.secPerClus;
function f32Fat(reader, fs) {                       // whole FAT as Uint32Array (a few MB at most)
  const b = rd(reader, fs.fatLba, fs.fatSz);
  return new Uint32Array(b.buffer, 0, fs.fatSz * 128);
}
function f32Chain(fat, c) {
  const out = [];
  while (c >= 2 && c < 0x0FFFFFF8) { out.push(c); c = fat[c] & 0x0FFFFFFF; if (out.length > 1 << 20) break; }
  return out;
}
function f32ReadDir(reader, fs, fat, clus) {        // -> { chain, bytes, entries:[{name, attr, clus, size, off}] }
  const chain = f32Chain(fat, clus);
  const bytes = new Uint8Array(chain.length * fs.secPerClus * SEC);
  chain.forEach((c, i) => reader.readInto(f32ClusLba(fs, c), fs.secPerClus, bytes, i * fs.secPerClus * SEC));
  const v = new DataView(bytes.buffer), entries = [];
  let lfn = "";
  for (let o = 0; o < bytes.length; o += 32) {
    const first = bytes[o], attr = bytes[o + 11];
    if (first === 0) break;
    if (first === 0xE5) { lfn = ""; continue; }
    if (attr === 0x0F) {                            // LFN piece (stored reversed)
      let part = "";
      for (const [a, n] of [[1, 5], [14, 6], [28, 2]])
        for (let i = 0; i < n; i++) { const ch = v.getUint16(o + a + i * 2, true); if (ch && ch !== 0xFFFF) part += String.fromCharCode(ch); }
      lfn = part + lfn; continue;
    }
    let short = "";
    for (let i = 0; i < 8; i++) { const c = bytes[o + i]; if (c !== 32) short += String.fromCharCode(c); }
    let ext = "";
    for (let i = 8; i < 11; i++) { const c = bytes[o + i]; if (c !== 32) ext += String.fromCharCode(c); }
    const name = lfn || (ext ? short + "." + ext : short);
    entries.push({ name, attr, off: o,
      clus: (v.getUint16(o + 20, true) << 16) | v.getUint16(o + 26, true),
      size: v.getUint32(o + 28, true) });
    lfn = "";
  }
  return { chain, bytes, entries };
}
function f32FindDir(reader, fs, fat, path) {
  let clus = fs.rootClus;
  for (const part of path.split("/").filter(Boolean)) {
    const d = f32ReadDir(reader, fs, fat, clus);
    const e = d.entries.find(e => (e.attr & 0x10) && e.name.toUpperCase() === part.toUpperCase());
    if (!e) throw new Error("directory not found: " + part);
    clus = e.clus;
  }
  return clus;
}
function f32WriteFatBoth(reader, fs, fat) {
  const b = new Uint8Array(fat.buffer, 0, fs.fatSz * SEC);
  for (let f = 0; f < fs.nFats; f++) wr(reader, fs.fatLba + f * fs.fatSz, b);
}
export function fat32List(reader, dirPath = "Home") {
  const fs = f32Boot(reader), fat = f32Fat(reader, fs);
  return f32ReadDir(reader, fs, fat, f32FindDir(reader, fs, fat, dirPath)).entries
    .filter(e => e.name && e.name !== "." && e.name !== "..");
}
export function fat32Read(reader, dirPath, filename) {
  const fs = f32Boot(reader), fat = f32Fat(reader, fs);
  const d = f32ReadDir(reader, fs, fat, f32FindDir(reader, fs, fat, dirPath));
  const e = d.entries.find(e => e.name.toUpperCase() === filename.toUpperCase());
  if (!e) return null;
  const chain = f32Chain(fat, e.clus), out = new Uint8Array(chain.length * fs.secPerClus * SEC);
  chain.forEach((c, i) => reader.readInto(f32ClusLba(fs, c), fs.secPerClus, out, i * fs.secPerClus * SEC));
  return out.subarray(0, e.size);
}
export function fat32Upload(reader, filename, bytes, dirPath = "Home") {
  const fs = f32Boot(reader), fat = f32Fat(reader, fs);
  const dirClus = f32FindDir(reader, fs, fat, dirPath);
  let dir = f32ReadDir(reader, fs, fat, dirClus);
  // free an existing same-named file
  const existing = dir.entries.find(e => !(e.attr & 0x10) && e.name.toUpperCase() === filename.toUpperCase());
  if (existing) {
    for (const c of f32Chain(fat, existing.clus)) fat[c] = 0;
    // wipe its dir entry + preceding LFN run
    let o = existing.off; dir.bytes[o] = 0xE5;
    for (let p = o - 32; p >= 0 && dir.bytes[p + 11] === 0x0F; p -= 32) dir.bytes[p] = 0xE5;
  }
  // allocate the data chain
  const clusBytes = fs.secPerClus * SEC, need = Math.max(1, Math.ceil(bytes.length / clusBytes));
  const free = [];
  for (let c = 2; c < fat.length && free.length < need; c++) if ((fat[c] & 0x0FFFFFFF) === 0) free.push(c);
  if (free.length < need) throw new Error("disk full");
  free.forEach((c, i) => fat[c] = i + 1 < need ? free[i + 1] : 0x0FFFFFFF);
  // write the data
  for (let i = 0; i < need; i++) {
    const part = new Uint8Array(clusBytes);
    part.set(bytes.subarray(i * clusBytes, Math.min((i + 1) * clusBytes, bytes.length)));
    wr(reader, f32ClusLba(fs, free[i]), part);
  }
  // build LFN + 8.3 entries
  const up = filename.toUpperCase().replace(/[^A-Z0-9_.]/g, "_");
  const dot = up.lastIndexOf(".");
  let base = (dot > 0 ? up.slice(0, dot) : up).replace(/\./g, ""), ext = dot > 0 ? up.slice(dot + 1) : "";
  const fits83 = base.length <= 8 && ext.length <= 3 && up === filename.toUpperCase();
  if (!fits83) base = (base.slice(0, 6) + "~1").padEnd(8).slice(0, 8);
  const short = base.padEnd(8).slice(0, 8) + ext.padEnd(3).slice(0, 3);
  let sum = 0;
  for (let i = 0; i < 11; i++) sum = ((sum >> 1) | ((sum & 1) << 7)) + short.charCodeAt(i) & 0xFF;
  const lfnPieces = [];
  if (!fits83 || filename !== up) {                 // need LFN to preserve the real name
    const n = Math.ceil(filename.length / 13);
    for (let i = 0; i < n; i++) {
      const e = new Uint8Array(32); const v = new DataView(e.buffer);
      e[0] = (i + 1) | (i === n - 1 ? 0x40 : 0); e[11] = 0x0F; e[13] = sum;
      for (let j = 0; j < 13; j++) {
        const idx = i * 13 + j, ch = idx < filename.length ? filename.charCodeAt(idx) : (idx === filename.length ? 0 : 0xFFFF);
        const [a] = j < 5 ? [1 + j * 2] : j < 11 ? [14 + (j - 5) * 2] : [28 + (j - 11) * 2];
        v.setUint16(a, ch, true);
      }
      lfnPieces.unshift(e);
    }
  }
  const main = new Uint8Array(32); const mv = new DataView(main.buffer);
  for (let i = 0; i < 11; i++) main[i] = short.charCodeAt(i);
  main[11] = 0x20;                                  // archive
  mv.setUint16(24, ((2026 - 1980) << 9) | (6 << 5) | 11, true);   // date
  mv.setUint16(20, (free[0] >> 16) & 0xFFFF, true);
  mv.setUint16(26, free[0] & 0xFFFF, true);
  mv.setUint32(28, bytes.length, true);
  const needSlots = lfnPieces.length + 1;
  // find a run of free 32-byte slots; extend the dir with a fresh cluster if necessary
  let run = 0, at = -1;
  for (let o = 0; o < dir.bytes.length; o += 32) {
    const f = dir.bytes[o];
    if (f === 0 || f === 0xE5) { if (!run) at = o; if (++run === needSlots) break; } else run = 0;
  }
  if (run < needSlots) {
    let c2 = 2; while (c2 < fat.length && (fat[c2] & 0x0FFFFFFF) !== 0) c2++;
    if (c2 >= fat.length) throw new Error("disk full (dir)");
    const last = dir.chain[dir.chain.length - 1];
    fat[last] = c2; fat[c2] = 0x0FFFFFFF;
    wr(reader, f32ClusLba(fs, c2), new Uint8Array(clusBytes));
    at = dir.bytes.length; run = needSlots;
    const nb = new Uint8Array(dir.bytes.length + clusBytes); nb.set(dir.bytes);
    dir = { chain: [...dir.chain, c2], bytes: nb, entries: dir.entries };
  }
  [...lfnPieces, main].forEach((e, i) => dir.bytes.set(e, at + i * 32));
  // write the dir clusters + both FATs
  dir.chain.forEach((c, i) => {
    const part = dir.bytes.subarray(i * clusBytes, (i + 1) * clusBytes);
    wr(reader, f32ClusLba(fs, c), part);
  });
  f32WriteFatBoth(reader, fs, fat);
  return { clus: free[0], clusters: need };
}
