// host.js - the WASM side of HEMU's host contract (HEMU/src/host.HC). createHemuHost() is holyc-wasm's
// generic createHost() plus every import hemu declares: the snapshot / present / disk / palette adapters
// (from opts) and default stubs for input, pacing and the optional JIT hooks. Runners override
// env.__host_* and env.__jit_* on the returned env before instantiating (hemu-worker.js, the harnesses
// here). With the stubs alone, __jit_state returns 0 and hemu runs as a pure interpreter.
//   opts (beyond createHost's): present(addr,w,h,u8)  snapLoad(memBase,u8)  palette(index,rgb24)
//                               diskRead(lba,count,u8,dst)  diskWrite(lba,count,u8,src)
import { createHost } from "../holyc-wasm/src/runtime/host.js";

export function createHemuHost(opts = {}) {
  const host = createHost(opts);
  const u8 = () => new Uint8Array(host.state.mem.buffer);
  Object.assign(host.env, {
    __snap_load(base) { opts.snapLoad?.(Number(base), u8()); },
    __present(addr, w, h) { opts.present?.(Number(addr), Number(w), Number(h), u8()); },
    __host_palette(index, rgb) { opts.palette?.(Number(index), Number(rgb)); },
    __host_disk(lba, count, buf) { opts.diskRead?.(Number(lba), Number(count), u8(), Number(buf)); },
    __host_disk_wr(lba, count, buf) { opts.diskWrite?.(Number(lba), Number(count), u8(), Number(buf)); },
    // input + pacing: headless defaults (no cursor, no keys, 1M instructions per 16 ms frame)
    __host_msx() { return 0n; }, __host_msy() { return 0n; }, __host_msb() { return 0n; }, __host_wheel() { return 0n; },
    __host_key() { return -1n; }, __host_budget() { return 1000000n; }, __host_dt() { return 16n; },
    // CMOS RTC fields from the host wall clock, so the guest's Now() tracks real date/time (not the
    // snapshot's frozen clock). idx = the CMOS register the guest selected via OUT 0x70.
    __host_time(idx) {
      const d = new Date(); idx = Number(idx);
      if (idx === 0) return BigInt(d.getSeconds());
      if (idx === 2) return BigInt(d.getMinutes());
      if (idx === 4) return BigInt(d.getHours());
      if (idx === 6) return BigInt(d.getDay());           // 0=Sun..6=Sat
      if (idx === 7) return BigInt(d.getDate());          // day of month 1..31
      if (idx === 8) return BigInt(d.getMonth() + 1);     // month 1..12
      if (idx === 9) return BigInt(d.getFullYear() - 2000); // kernel adds 2000
      return 0n;
    },
    // optional accelerator hooks - stubs = no JIT. A JIT-aware runner overrides all of them (jit.js).
    __jit_state(_r, _f, _p) { return 0n; }, __jit_compile(_rip) { return 0n; }, __jit_run(rip) { return rip; },
    __jit_x87(_a, _b, _c) {}, __jit_dispatch(_b) { return 0n; }, __jit_chain(_a, _b) {}, __jit_seg(..._a) {},
    __ap_run(_rip, _bud) { return 0n; },
  });
  return host;
}
