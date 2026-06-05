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
  return {
    readInto(lba, count, dst, dstOff) {               // fill count*512 bytes at dst[dstOff]
      for (let s = 0; s < count; s++) {
        const gOff = (lba + s) * 512, gIdx = Math.floor(gOff / clusterSize), inC = gOff % clusterSize, o = dstOff + s * 512;
        const c = clusterAt(gIdx);
        if (c < 0) dst.fill(0, o, o + 512);
        else dst.set(buf.subarray(c + inC, c + inC + 512), o);
      }
    }
  };
}

// Fetch a gzipped qcow2 and return a reader (works on the main thread and in a worker).
export async function loadDisk(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("disk fetch " + resp.status);
  const buf = new Uint8Array(await new Response(resp.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
  return makeQcow2(buf);
}
