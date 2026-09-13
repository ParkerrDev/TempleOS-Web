// hemu-smp-worker.js - one Web Worker == one emulated core, over ONE shared WebAssembly.Memory.
//   role "bsp" (core 0): loads the snapshot, owns devices/present/input, runs __main frames.
//   role "ap"  (core k): barrier-waits, wires its per-core JIT, runs RunCore (IPI-woken) in parallel.
// This is the browser port of smpmt.mjs (proven in node worker_threads): real parallel SMP. Each Web
// Worker realm gets its OWN jit.js module instance, so the per-core block cache is automatic.
//
// EXPERIMENTAL / opt-in (hemu-smp.html). The single-core hemu-worker.js + the default site are untouched.
import { createHost } from "./holyc-wasm/src/runtime/host.js";
import * as jit from "./hemu-wasm/jit.js";
import {createGuestInput} from "./hemu-wasm/guestinput.js";
import {createGuestExec} from "./hemu-wasm/guestexec.js";
import {loadDisk} from "./hemu-wasm/qcow2.js";
import {installGame} from "./game-packages.js";

const CTRL = { READY: 0, STOP: 1 };               // shared Int32 control: APs wait on READY; STOP ends all
let core = 0, role = "bsp", mem = null, ctrl = null, sc = null;
let gBase = 0, inst = null, host = null, lastFrame = null;
let msX = 320, msY = 240, msB = 0, wheel = 0, curBudget = 4000000, dtMs = 16, outstanding = 0;
const keyq = [];
let disk=null,gx=null;const requests=new Map();
const guestInput=createGuestInput({guest:()=>gx,memory:()=>inst?.exports.memory,base:()=>gBase,
  onState:state=>postMessage({cmd:"inputMode",...state})});

onmessage = (e) => {
  const m = e.data;
  if (m.cmd === "init") boot(m).catch(err => postMessage({ cmd: "error", msg: String(err?.message || err) }));
  else if (m.cmd === "input") { guestInput.accept(m); msX = m.x; msY = m.y; msB = m.b; if (m.wheel !== undefined) wheel = m.wheel; if (m.keys) for (const k of m.keys) keyq.push(k); }
  else if (m.cmd === "keys") { for (const k of m.keys) keyq.push(k); }       // physical keyboard events from the page
  else if (m.cmd === "ack") outstanding--;
};

// stream-decompress the snapshot into one preallocated buffer (BSP only) - same as hemu-worker.js
async function gunzipInto(gz, size) {
  const out = new Uint8Array(size);
  const rd = new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
  let off = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; out.set(value, off); off += value.length; }
  return out;
}

async function boot(m) {
  role = m.role; core = m.core; mem = m.mem; ctrl = new Int32Array(m.ctrl); sc = m.sc;
  if (role !== "bsp") curBudget = 0;
  else disk=await loadDisk("./vendor/images/templeos-hd.qcow2.gz");
  const mod = await WebAssembly.compile(m.wasmBytes);
  let snap = role === "bsp" ? await gunzipInto(m.snapGz, 402653184) : null;

  host = createHost({
    palette:(index,rgb)=>{if(role==="bsp")postMessage({cmd:"palette",index,rgb});},
    diskRead:(lba,count,u8,dst)=>disk?.readInto(lba,count,u8,dst),
    diskWrite:(lba,count,u8,src)=>disk?.writeInto(lba,count,u8,src),
    onText: (s) => { if (s && s.indexOf("BADOP") >= 0) postMessage({ cmd: "log", msg: `core${core} ` + s.trim() }); },
    snd: { tone: (f) => { if (role === "bsp") postMessage({ cmd: "snd", f: Number(f) }); } },
    snapLoad: (base, u8) => { gBase = base; if (snap) { u8.set(snap, base); snap = null; } },   // BSP loads snapshot into shared mem
    present: role === "bsp" ? (addr, w, h, u8) => {
      lastFrame = { addr, w, h };                            // for prompt-detect OCR during game launch
      if (outstanding >= 2) return;                          // main hasn't caught up - drop, keep emulating
      const buf = new Uint8Array(w * h); buf.set(u8.subarray(addr, addr + w * h));
      outstanding++; postMessage({ cmd: "frame", buf: buf.buffer, w, h }, [buf.buffer]);
    } : null,
  });
  host.env.mem = mem;                                        // import the shared memory
  host.env.__host_msx = guestInput.x; host.env.__host_msy = guestInput.y;
  host.env.__host_msb = guestInput.buttons; host.env.__host_wheel = guestInput.wheel;
  host.env.__host_key = () => keyq.length ? BigInt(keyq.shift() | 0) : -1n;
  host.env.__host_budget = () => BigInt(curBudget | 0); host.env.__host_dt = () => BigInt(dtMs | 0);
  host.env.__jit_state = (rg, fl, rp) => { jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem, inst.exports.RasterHLE); return 1n; };
  host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip)));
  host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
  host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c);
  host.env.__jit_dispatch = (b) => BigInt(jit.jitDispatch(Number(b)));
  host.env.__jit_chain = (a, b) => jit.jitChain(a, b);
  host.env.__jit_seg = (...a) => jit.jitSeg(...a.map(Number));
  const apHot = new Map();                                   // AP per-core JIT chain (no shared g_jit_rip)
  host.env.__ap_run = (rip, bud) => { rip = Number(rip); if (!jit.jitInspect(rip).cached) { const h = (apHot.get(rip) || 0) + 1; apHot.set(rip, h); if (h <= 2) return 0n; jit.jitCompile(rip); } return BigInt(jit.jitDispatch(Number(bud))); };
  jit.jitReset();

  inst = await WebAssembly.instantiate(mod, { env: host.env });
  inst.exports.__core.value = BigInt(core);
  inst.exports.__sp.value = BigInt(0x1000000 - core * 0x100000);   // per-core shadow stack (region is shared)
  host.attach(inst);
  if (role === "bsp") await runBsp(); else await runAp();
}

const dv = () => new DataView(inst.exports.memory.buffer);
const rd = (a) => Number(dv().getBigUint64(a, true));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function runBsp() {
  inst.exports.__rt_init();
  inst.exports.__main();                                     // first frame: SetSnapRegs seeds g_cpu_st + g_ncore
  const frame = () => { try { guestInput.beforeFrame(); inst.exports.__main(); guestInput.afterFrame(); } catch (e) { postMessage({ cmd: "error", msg: "bsp trap: " + e.message }); } };
  const runN = async (n) => { for (let i = 0; i < n; i++) { frame(); if (i % 16 === 0) await sleep(0); } };
  await runN(220);
  gx=createGuestExec({inst,gBase,onEvent:event=>{
    postMessage({cmd:'guestResult',...event});
    const resolve=requests.get(event.id);
    if(resolve && ['done','failed','error'].includes(event.state)){requests.delete(event.id);resolve(event);}
  }});
  const probe=gx.probe();if(!probe.ok)postMessage({cmd:'error',msg:probe.errors.join('; ')});
  for(let k=1;k<sc.ncore;k++)dv().setBigUint64(sc.globals.g_ipi_pending+k*8,0n,true);
  Atomics.store(ctrl,CTRL.READY,1);Atomics.notify(ctrl,CTRL.READY);
  postMessage({cmd:'ready'});
  if(sc.game && probe.ok){
    const name=String(sc.game).replace(/\.HC$/i,'');let sequence=0;
    const write=(path,bytes)=>new Promise(resolve=>{const id='asset-'+(++sequence);requests.set(id,resolve);gx.writeFile({id,path,bytes});});
    installGame(name==='TOOM'?'toom':'tinker-'+name,write).then(options=>gx.launch(options)).catch(error=>postMessage({cmd:'error',msg:error.message}));
  }

  const FRAME_MS = 1000 / 60; let lastT = performance.now(), dtAcc = 0;
  for (;;) {
    const now = performance.now(); dtAcc += now - lastT; lastT = now; if (dtAcc > 100) dtAcc = 100;
    dtMs = Math.max(1, Math.min(100, Math.floor(dtAcc))); dtAcc -= dtMs;
    try { guestInput.beforeFrame(); inst.exports.__main(); guestInput.afterFrame(); } catch (err) { postMessage({ cmd: "error", msg: "bsp trap: " + err.message }); return; }
    gx?.tick();
    const work = performance.now() - now;
    if (work > 15 && curBudget > 900000) curBudget = (curBudget * 0.9) | 0;
    else if (work < 11 && curBudget < 24000000) curBudget = (curBudget * 1.07) | 0;
    const wait = FRAME_MS - (performance.now() - now);
    await sleep(wait > 1 ? wait : 0);
  }
}

async function runAp() {
  Atomics.wait(ctrl, CTRL.READY, 0);                         // block until BSP loaded snapshot + seeded regs
  gBase = rd(sc.globals.mem);                                // guest RAM base from the shared `mem` global (APs never run snapLoad)
  const g = sc.globals, cc = sc.ccpu, oc = (o) => g.g_cpu_st + core * cc.stride + o;
  jit.jitState(oc(cc.reg), oc(cc.rfl), oc(cc.rip), gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem, inst.exports.RasterHLE);
  jit.jitX87(oc(cc.fpr), oc(cc.fsp), oc(cc.x87_sw));
  jit.jitSeg(oc(cc.fsbase), oc(cc.gsbase), g.tsc, oc(cc.x87_cw), g.g_xmm_lo + core * sc.xmmStride, g.g_xmm_hi + core * sc.xmmStride);
  postMessage({ cmd: "log", msg: `AP${core} parallel` });
  const APB = 2000000n; let spins = 0, apFaulted = false;
  const PAUSE_REQ = 2, PAUSE_ACK = 3;                         // ctrl indices (BSP pauses APs to capture a consistent frame)
  while (!Atomics.load(ctrl, CTRL.STOP)) {
    if (Atomics.load(ctrl, PAUSE_REQ)) {                      // BSP is capturing a frame -> hold still (no concurrent writes)
      Atomics.add(ctrl, PAUSE_ACK, 1);                        // ack: the seq-cst handshake also RELEASES our writes to the BSP
      while (Atomics.load(ctrl, PAUSE_REQ) && !Atomics.load(ctrl, CTRL.STOP)) Atomics.wait(ctrl, PAUSE_REQ, 1, 20);
      continue;
    }
    const before = rd(g.icount);
    inst.exports.RunCore(APB);
    const did = rd(g.icount) - before;
    const halted = rd(oc(144));                              // f_halted: >=2 means this AP faulted (bad op / #DE)
    if (halted >= 2 && !apFaulted) { apFaulted = true; postMessage({ cmd: "log", msg: `AP${core} FAULTED halted=${halted} rip=0x${rd(oc(cc.rip)).toString(16)} - recovering` });
      dv().setBigUint64(oc(144), 0n, true); }              // clear the fault so the AP keeps serving jobs instead of dying (best-effort recovery)
    if (did < 1000) { spins++; if (spins > 4) { await sleep(0); spins = 0; } }   // idle -> yield (don't pin a core)
    else { spins = 0; if (Math.random() < 0.003) await sleep(0); }
  }
}
