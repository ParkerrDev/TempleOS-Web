import { compileHolyC } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/compiler.js";
import { createHost } from "/Users/parkerh/Dev/TempleOS/holyc-wasm/src/runtime/host.js";
import * as jit from "/Users/parkerh/Dev/TempleOS-wasm/jit.js";
import { readFileSync } from "node:fs";
const RAMSZ = 402653184, SCRATCH = 0x300000, MOPND = 0x310000;
const liveBuf = readFileSync("/tmp/live.bin");
const dir = "/Users/parkerh/Dev/hemu-wasm/src";
const src = readFileSync(dir + "/snapshot.HC", "latin1");
const r = compileHolyC(src, { filename: "snapshot.HC", lenient: false, includeResolver: (p) => { try { return readFileSync(dir + "/" + p, "latin1"); } catch { return null; } } });
const G = (n) => Number(r.globals.get(n).addr);
const REG = G("reg"), RFL = G("rfl"), RIP = G("rip"), FPR = G("fpr"), FSP = G("fsp"), X87 = G("x87_sw"), HALTED = G("halted"), MEMG = G("mem");
const mod = await WebAssembly.compile(r.bytes);
let gBase = 0, inst;
const host = createHost({ onText: () => {}, snd: { tone: () => {} }, snapLoad: (base, u8) => { gBase = base; u8.set(liveBuf.subarray(0, RAMSZ), base); }, diskRead: () => {}, diskWrite: () => {}, present: () => {} });
for (const k of ["__host_msx", "__host_msy", "__host_msb", "__host_wheel", "__host_key", "__host_prof", "__host_time"]) host.env[k] = () => 0n;
host.env.__host_budget = () => 1000000n; host.env.__host_dt = () => 33n; host.env.__host_key = () => -1n;
inst = await WebAssembly.instantiate(mod, { env: host.env }); host.attach(inst); inst.exports.__rt_init();
jit.jitState(REG, RFL, RIP, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem); jit.jitX87(FPR, FSP, X87);
const dv = () => new DataView(inst.exports.memory.buffer); const u8 = () => new Uint8Array(inst.exports.memory.buffer);
console.log("gBase=0x" + gBase.toString(16), "mem global holds=0x" + dv().getBigUint64(MEMG, true).toString(16));

function go(bytes, reg, rfl, mem) {
  const m = u8(); for (let k = 0; k < bytes.length; k++) m[gBase + SCRATCH + k] = bytes[k]; m[gBase + SCRATCH + bytes.length] = 0xCC;
  const apply = () => { for (let i = 0; i < 16; i++) dv().setBigUint64(REG + i * 8, BigInt.asUintN(64, BigInt(reg[i] ?? 0n)), true); dv().setBigUint64(RFL, BigInt(rfl), true); if (mem) for (const [a, v] of mem) dv().setBigUint64(gBase + a, BigInt.asUintN(64, BigInt(v)), true); dv().setBigUint64(HALTED, 0n, true); dv().setBigUint64(RIP, BigInt(SCRATCH), true); };
  apply(); inst.exports.Step();
  const iR0 = dv().getBigUint64(REG, true), iR6 = dv().getBigUint64(REG + 48, true), iR7 = dv().getBigUint64(REG + 56, true), iRfl = dv().getBigUint64(RFL, true), iM = mem ? mem.map(([a]) => dv().getBigUint64(gBase + a, true)) : [];
  apply(); jit.jitReset(); jit.jitCompile(SCRATCH); jit.jitRun(SCRATCH);
  const jR0 = dv().getBigUint64(REG, true), jR6 = dv().getBigUint64(REG + 48, true), jR7 = dv().getBigUint64(REG + 56, true), jRfl = dv().getBigUint64(RFL, true), jM = mem ? mem.map(([a]) => dv().getBigUint64(gBase + a, true)) : [];
  return { iR0, iR6, iR7, iRfl, iM, jR0, jR6, jR7, jRfl, jM };
}
const h = (x) => "0x" + x.toString(16);
let R = go([0x66, 0x11, 0xD8], { 0: 0x1234n, 3: 0x1111n }, 0x2n);   // adc ax,bx, cin=0 -> ax=0x2345
console.log("adc ax,bx 0x1234+0x1111: int r0=" + h(R.iR0) + " rfl=" + h(R.iRfl) + " | jit r0=" + h(R.jR0) + " rfl=" + h(R.jRfl));
R = go([0x48, 0xA5], { 6: BigInt(MOPND), 7: BigInt(MOPND + 0x1000) }, 0x2n, [[MOPND, 0xDEADBEEFCAFEn], [MOPND + 0x1000, 0n]]);
console.log("movsq: int rsi=" + h(R.iR6) + " rdi=" + h(R.iR7) + " mem[dst]=" + h(R.iM[1]) + " | jit rsi=" + h(R.jR6) + " rdi=" + h(R.jR7) + " mem[dst]=" + h(R.jM[1]));
R = go([0x48, 0xAD], { 6: BigInt(MOPND) }, 0x2n, [[MOPND, 0x1122334455667788n]]);
console.log("lodsq: int rax=" + h(R.iR0) + " rsi=" + h(R.iR6) + " | jit rax=" + h(R.jR0) + " rsi=" + h(R.jR6));
R = go([0x48, 0xAB], { 0: 0x99n, 7: BigInt(MOPND) }, 0x2n, [[MOPND, 0n]]);
console.log("stosq: int mem=" + h(R.iM[0]) + " rdi=" + h(R.iR7) + " | jit mem=" + h(R.jM[0]) + " rdi=" + h(R.jR7));
