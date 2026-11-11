// hemu-worker.js - runs the HolyC x86-64 emulator on a dedicated Worker thread.
//
// This is the "multi-core" engine: emulation happens HERE (one CPU core) while the main thread
// palettizes + blits each framebuffer and services input/UI (a second core). The two overlap -
// while the main thread is drawing frame N, this worker is already emulating frame N+1 - so the
// blit cost leaves the critical path. The canvas stays on the main thread (frames are shipped via
// postMessage), so hemu.html can fall back to its in-line single-thread engine if this ever fails.
import {FrameTop,FrameFps} from "./FrameText.js";
import {SnapshotOpen,SnapshotSave} from "./Snapshot.js";
import {KeyQueue} from "./KeyQueue.js";
import {CaptureBarrier} from "./CoreBarrier.js";
import { createHemuHost } from "./host.js";
import { loadDisk, makeDisk, fat32Upload, fat32List } from "./qcow2.js";
import * as jit from "./jit.js";             // x86-64 -> WASM block JIT (the speed: interp ~6fps -> JIT 30-65fps games)
import {createGuestInput} from "./guestinput.js";
import { createGuestExec } from "./guestexec.js";   // backend guest execution: jobs queued through the OS's own TaskExe, no keystrokes

const keyq=KeyQueue();
let repeatKeys=false,welcomePending=false,refreshRate=0,actualRate=null;
function SettingsApply(rateChanged=true)
{
  instRef.exports.KbdRptSet(BigInt(repeatKeys));
  const ok=!rateChanged || !!instRef.exports.WinRateSet(BigInt(refreshRate));
  if (rateChanged) actualRate=ok?refreshRate:null;
  postMessage({cmd:"settings",ok,rate:actualRate,repeat:repeatKeys,
    msg:ok?"":"This guest has an unknown display timing layout; its rate was not changed."});
}
let curBudget = 1500000, dtMs = 16, dtNs = 16000000;         // guest instr/frame + real wall-clock ms/frame
let outstanding = 0, snap = null, loaded = false, disk = null, gBase = 0, instRef = null;
let paused=false,saving=false,machineBarrier=null,engineBytes=null,hostRef=null,showStoppedFrame=null;
const deferred=[];
function PauseSet(value) {
  if (value && machineBarrier && !machineBarrier.Lock())
    throw new Error("The application cores did not stop; pause again.");
  paused=!!value;
  if (paused) {keyq.Release();showStoppedFrame?.();} else machineBarrier?.Unlock();
  postMessage({cmd:"paused",value:paused});
}
const NOJIT = /[?&]nojit/.test(self.location ? self.location.search : "");   // ?nojit -> pure interpreter (debug/fallback)
// JIT segment/TSC addresses now flow from the guest at runtime via __jit_seg (per-core CCpuState) - no hardcoded offsets to drift.

function GuestCacheInvalidate(lbas)
{//Makes the guest read again the disk blocks a host-side write changed (all
//of them when lbas is null). Each cached CCacheBlk of those blocks gets
//dv=NULL, so DskCacheFind misses it and reads the disk. Only dv is
//written: the hash chains and LRU links stay as the guest made them.
  let want=null,dvw,cap,base,o_ctrl,o_next,o_dv,o_blk,ctrl,p,blk,n=0,
	cleared=0,sample=[];
  function Rd(a)
  {
    if (a>=0 && gBase+a+8<=cap)
      return Number(dvw.getBigUint64(gBase+a,true));
    return 0;
  }
  if (!instRef || !disk || !gx)
    return 0;
  base=gx.varFind("blkdev");
  o_ctrl=gx.memberFind("CBlkDevGlbls","cache_ctrl");
  o_next=gx.memberFind("CCacheBlk","next_lru");
  o_dv=gx.memberFind("CCacheBlk","dv");
  o_blk=gx.memberFind("CCacheBlk","blk");
  if (!base || o_ctrl<0 || o_next<0 || o_dv<0 || o_blk<0)
    return 0;
  if (lbas && lbas.length)
    want=new Set(lbas);
  dvw=new DataView(instRef.exports.memory.buffer);
  cap=dvw.byteLength;
  ctrl=Rd(base+o_ctrl);
  if (!ctrl)
    return 0;
  p=Rd(ctrl+o_next);
  while (p && p!=ctrl && n<0x100000) {
    blk=Rd(p+o_blk);
    if (Rd(p+o_dv) && sample.length<8)
      sample.push(blk);
    if ((!want || want.has(blk)) && gBase+p+o_dv+8<=cap) {
      dvw.setBigUint64(gBase+p+o_dv,0n,true);
      cleared++;
    }
    p=Rd(p+o_next);
    n++;
  }
  if (want)
    console.log("[hemu] cacherefresh: changedLBAs=["+[...want].slice(0,6)+
	  "] sampleCachedBlks=["+sample+"] cleared="+cleared+"/"+want.size);
  return cleared;
}

// ===== BACKEND GUEST EXECUTION (no keystrokes, no per-character TaskMsg) ======================
// Every OS-side operation (FileWrite of an asset, mkdir, #include, running a program, executing source)
// is ONE TempleOS job: the text is staged in the scratch window above the OS's RAM and queued with the
// kernel's own TaskExe() through hemu's injected-call primitive (an interrupt-equivalent call at an IF=1
// instruction boundary, state restored bit-exactly). The target task runs the job itself from JobsHndlr,
// exactly like text typed at its prompt. guestexec.js resolves TaskExe/JobResScan/adam_task/
// sys_focus_task from the running guest's own symbol tables and validates them before any call.
//
// Site protocol (ids are echoed on every reply):
//   osWrite   {id, path|name, bytes, run}   -> fileResult {id, ok, msg, path, size, cluster}; run=true then
//                                             launches the file with id `${id}:run` (its own fileResult)
//   osLaunch  {id, path|src, name, force?}   -> fileResult {id, ok, msg} when the program is RUNNING (or refused/failed)
//   osExec    {id, src, target?}             -> fileResult {id, ok, msg, res} when the source finished (or failed)
//   osInstall {id, files:[{path,bytes}], path?, name?} -> one fileResult at the end (+ per-file guestResult events)
//   guest     {id, op, ...params}            -> guestResult for every state change (queued/posted/dispatched/
//                                             running/stalled/done/failed/error); op = exec|include|launch|
//                                             writeFile|mkdir|popup|info
// Every request also emits guestResult {id, gid, op, state, msg, ...} progress events (informational).
let gx = null, gxProbe = null, gxProbeTries = 0, gxFrames = 0, gxSeq = 0;
const gxWaiters = new Map();                 // gx request id -> { siteId, onEv }
function gxEvent(ev) {
  const w = gxWaiters.get(ev.id);
  const out = { cmd: "guestResult", ...ev, gid: ev.id, id: w ? w.siteId : ev.id };
  postMessage(out);
  if (w) { try { w.onEv(ev); } catch (e) { console.warn("[hemu] guest waiter threw", e); } if (ev.state === "done" || ev.state === "failed" || ev.state === "error") gxWaiters.delete(ev.id); }
}
function gxRequest(op, params, siteId) {     // Promise of the final event (done/failed/error); progress goes out as guestResult
  return new Promise((resolve) => {
    const gid = "g" + (++gxSeq);
    gxWaiters.set(gid, { siteId, onEv: (ev) => { if (ev.state === "done" || ev.state === "failed" || ev.state === "error") resolve(ev); } });
    try { gx[op]({ ...params, id: gid }); }
    catch (e) { gxWaiters.delete(gid); resolve({ id: gid, op, state: "error", ok: false, msg: String(e && e.message || e) }); }
  });
}
function gxLaunchRequest(params, siteId, onRunning) {   // resolves at "running" (the program is up) or at a final state
  return new Promise((resolve) => {
    const gid = "g" + (++gxSeq); let settled = false;
    gxWaiters.set(gid, { siteId, onEv: (ev) => {
      if (!settled && ev.state === "running") { settled = true; resolve(ev); onRunning && onRunning(ev); }
      else if (!settled && (ev.state === "done" || ev.state === "failed" || ev.state === "error")) { settled = true; resolve(ev); } } });
    try { gx.launch({ ...params, id: gid }); }
    catch (e) { gxWaiters.delete(gid); resolve({ id: gid, op: "launch", state: "error", ok: false, msg: String(e && e.message || e) }); }
  });
}
const gxNotReady = () => !gx ? "engine not up" : !gx.ready ? "guest execution API not ready (" + (gxProbe && gxProbe.errors.length ? gxProbe.errors.join("; ") : "probing the guest, retry in a moment") + ")" : "";
const fileResult = (id, ev, extra) => postMessage({ cmd: "fileResult", id, ok: !!ev.ok, msg: ev.msg, state: ev.state, ...(extra || {}), ...(ev.res !== undefined ? { res: ev.res } : {}), ...(ev.path ? { path: ev.path } : {}), ...(ev.size !== undefined ? { size: ev.size } : {}), ...(ev.cluster !== undefined ? { cluster: ev.cluster } : {}), ...(ev.except ? { except: ev.except } : {}) });

async function osWrite(m) {                  // write a file THROUGH the OS (FileWrite + DirMk parents), run=true then launch it
  const nr = gxNotReady(); if (nr) return fileResult(m.id, { ok: false, msg: nr, state: "error" });
  if (!disk) return fileResult(m.id, { ok: false, msg: "disk not loaded yet, wait a moment after boot", state: "error" });
  const path = m.path || ("C:/Home/" + m.name);
  const ev = await gxRequest("writeFile", { path, bytes: new Uint8Array(m.bytes), mkdirs: m.mkdirs !== false, target: m.target || "adam" }, m.id);
  fileResult(m.id, ev);
  if (ev.ok && m.run) osLaunch({ id: String(m.id) + ":run", path, name: m.name || path.split("/").pop(), force: m.force });
}
async function osLaunch(m) {                 // run a program in a user terminal: the focused one if it is at its prompt, else another that is (and focus it)
  const nr = gxNotReady(); if (nr) return fileResult(m.id, { ok: false, msg: nr, state: "error" });
  if (m.src === undefined && !disk) return fileResult(m.id, { ok: false, msg: "disk not loaded yet, wait a moment after boot", state: "error" });
  const ev = await gxLaunchRequest({ path: m.path, src: m.src, name: m.name, target: m.target || "prompt", focus: m.focus !== false, force: !!m.force }, m.id);
  fileResult(m.id, ev.state === "running" ? { ...ev, ok: true } : ev);
}
async function osExec(m) {                   // execute HolyC source text (default: in the focused terminal)
  const nr = gxNotReady(); if (nr) return fileResult(m.id, { ok: false, msg: nr, state: "error" });
  const ev = await gxRequest("exec", { src: m.src, target: m.target || "focus", name: m.name }, m.id);
  fileResult(m.id, ev);
}
async function osInstall(m) {                // write a package (files under absolute guest paths, parents created), then optionally launch its entry
  const nr = gxNotReady(); if (nr) return fileResult(m.id, { ok: false, msg: nr, state: "error" });
  if (!disk) return fileResult(m.id, { ok: false, msg: "disk not loaded yet, wait a moment after boot", state: "error" });
  const files = m.files || []; let written = 0, bytes = 0;
  for (const f of files) {
    const ev = await gxRequest("writeFile", { path: f.path, bytes: new Uint8Array(f.bytes), mkdirs: true, target: "adam", name: f.path }, m.id);
    if (!ev.ok) return fileResult(m.id, { ok: false, msg: `install stopped at ${f.path} (${written}/${files.length} written): ${ev.msg}`, state: ev.state }, { written, total: files.length });
    written++; bytes += f.bytes.byteLength || 0;
    postMessage({ cmd: "guestResult", id: m.id, op: "install", state: "progress", msg: `wrote ${f.path}`, written, total: files.length });
  }
  if (!m.path) return fileResult(m.id, { ok: true, msg: `installed ${written} file(s), ${bytes} bytes`, state: "done" }, { written, total: files.length });
  const ev = await gxLaunchRequest({ path: m.path, name: m.name, target: m.target || "prompt", focus: m.focus !== false, force: !!m.force }, m.id);
  fileResult(m.id, ev.state === "running" ? { ...ev, ok: true, msg: `installed ${written} file(s); ${ev.msg}` } : { ...ev, msg: `installed ${written} file(s), but the launch failed: ${ev.msg}` }, { written, total: files.length });
}
function guestCmd(m) {                       // generic access to the module: every state change is a guestResult with the site's id
  const nr = gxNotReady(); if (nr) return postMessage({ cmd: "guestResult", id: m.id, op: m.op, state: "error", ok: false, msg: nr });
  if (m.op === "info") return postMessage({ cmd: "guestInfo", id: m.id, info: gx.info() });
  if (!["exec", "include", "launch", "writeFile", "mkdir", "popup"].includes(m.op)) return postMessage({ cmd: "guestResult", id: m.id, op: m.op, state: "error", ok: false, msg: "unknown guest op " + m.op });
  const params = { ...m }; delete params.cmd; delete params.op; delete params.id;
  if (params.bytes && !(params.bytes instanceof Uint8Array)) params.bytes = new Uint8Array(params.bytes);
  gxRequest(m.op, params, m.id);             // replies flow through gxEvent
}
function gxTick() {                          // once per emulated frame: service the job queue; probe the guest until it validates
  if (!gx) return;
  gxFrames++;
  if (!gx.ready && gxFrames >= 3 && (gxFrames - 3) % 30 === 0 && gxProbeTries < 40) {
    gxProbeTries++;
    try { gxProbe = gx.probe(); } catch (e) { gxProbe = { ok: false, errors: [String(e && e.message || e)], warnings: [] }; }
    if (gxProbe.ok) { console.log("[hemu] guest execution API ready: " + JSON.stringify({ syms: gxProbe.syms, focusFn: gxProbe.focusFn, warnings: gxProbe.warnings, tasks: gxProbe.tasks.map((t) => t.name + (t.atPrompt ? "(prompt)" : "")) })); postMessage({ cmd: "guestReady", ok: true, probe: gxProbe }); }
    else { console.warn("[hemu] guest probe " + gxProbeTries + ": " + gxProbe.errors.join("; ")); if (gxProbeTries === 40) postMessage({ cmd: "guestReady", ok: false, probe: gxProbe }); }
  }
  if (gx.ready && disk && welcomePending) {
    welcomePending=false;
    gx.exec({src:'PopUp("WinFocus;Ed(\\\"::/Doc/Welcome.DD\\\");");',target:"adam",name:"Welcome"});
  }
  try { gx.tick(); } catch (e) { console.warn("[hemu] guest tick threw", e); }
}

const guestInput = createGuestInput({guest:()=>gx,memory:()=>instRef?.exports.memory,base:()=>gBase,
  onState:state=>postMessage({cmd:"inputMode",...state})});
onmessage = (e) => {
  const m = e.data;
  if (saving && m.cmd!=="ack") {deferred.push(m);return;}
  if (m.cmd === "init") boot(m).catch(err => postMessage({ cmd: "error", msg: String(err?.message || err) }));
  else if (m.cmd === "input") { if (m.keys) keyq.Push(m.keys); if (m.keysUp) keyq.Release(); guestInput.accept(m); }
  else if (m.cmd==="keysUp") keyq.Release();
  else if (m.cmd==="set") {
    const rateChanged=[0,30,60,120].includes(m.rate);
    if (rateChanged) refreshRate=m.rate;
    if (typeof m.repeat==="boolean") repeatKeys=m.repeat;
    if (loaded) SettingsApply(rateChanged);
  }
  else if (m.cmd === "osWrite") osWrite(m).catch(err => fileResult(m.id, { ok: false, msg: String(err?.message || err), state: "error" }));
  else if (m.cmd === "osLaunch") osLaunch(m).catch(err => fileResult(m.id, { ok: false, msg: String(err?.message || err), state: "error" }));
  else if (m.cmd === "osExec") osExec(m).catch(err => fileResult(m.id, { ok: false, msg: String(err?.message || err), state: "error" }));
  else if (m.cmd === "osInstall") osInstall(m).catch(err => fileResult(m.id, { ok: false, msg: String(err?.message || err), state: "error" }));
  else if (m.cmd === "guest") { try { guestCmd(m); } catch (err) { postMessage({ cmd: "guestResult", id: m.id, op: m.op, state: "error", ok: false, msg: String(err?.message || err) }); } }
  else if (m.cmd === "ack") outstanding--;   // main finished a frame - release a flow-control slot
  else if (m.cmd === "pause") {try {PauseSet(m.value);} catch(err) {postMessage({cmd:"error",msg:err.message});}}
  else if (m.cmd === "exportSnapshot") exportImage("snapshot");
  else if (m.cmd === "exportDisk") exportImage("disk");
  else if (m.cmd === "importDisk") { try { disk = makeDisk(new Uint8Array(m.bytes)); GuestCacheInvalidate(); postMessage({ cmd: "diskInfo", ok: true, msg: "disk imported (" + (m.bytes.byteLength / 1048576).toFixed(0) + " MB)" }); } catch (err) { postMessage({ cmd: "diskInfo", ok: false, msg: String(err.message || err) }); } }
  else if (m.cmd === "uploadFile") {
    try { if (!disk) throw new Error("disk not loaded yet - wait a moment after boot");
      const before = new Set(disk.overlay.keys());                       // which sectors are already overlaid
      const r = fat32Upload(disk, m.name, new Uint8Array(m.bytes), m.dir || "Home");
      const changed = []; for (const k of disk.overlay.keys()) if (!before.has(k)) changed.push(k);   // sectors this write touched
      const cleared = GuestCacheInvalidate(changed);			 // refresh ONLY those in the guest cache
      postMessage({ cmd: "fileResult", id: m.id, ok: true, msg: `wrote ${m.name} to /${m.dir || "Home"} (${r.clusters} clusters; ${changed.length} sectors, ${cleared} cached refreshed)` });
    } catch (err) { postMessage({ cmd: "fileResult", id: m.id, ok: false, msg: String(err.message || err) }); }
  }
  else if (m.cmd === "listDir") { try { postMessage({ cmd: "dirList", id: m.id, ok: true, dir: m.dir, files: disk ? fat32List(disk, m.dir || "Home").map(e => ({ name: e.name, size: e.size, dir: !!(e.attr & 0x10) })) : [] }); } catch (err) { postMessage({ cmd: "dirList", id: m.id, ok: false, msg: String(err.message || err) }); } }
};

async function exportImage(kind) {
  let locked=false;
  try {
    if (!loaded || !disk || !gx?.ready) throw new Error("Wait for the machine and disk to finish loading.");
    if (machineBarrier && !machineBarrier.Lock()) throw new Error("The application cores did not stop; save again.");
    locked=true;saving=true;
    const launch=gx.snapshot();
    const meta={cores:smpCfg?.ncore||1,base:gBase,heapPtr:hostRef.state.heapPtr,
      sp:Number(instRef.exports.__sp.value),ipiAddr:smpCfg?.ipiAddr||0,
      paused,rate:refreshRate,actualRate,repeat:repeatKeys,budget:curBudget,
      keyboard:keyq.Save(),pointer:guestInput.save(),launch};
    const buf=kind==="snapshot"?await SnapshotSave({meta,wasm:engineBytes,memory:instRef.exports.memory,disk}):await DiskImage();
    postMessage({cmd:"exportResult",kind,ok:true,buf},[buf]);
  } catch(err) {postMessage({cmd:"exportResult",kind,ok:false,msg:err.message});}
  finally {
    if (locked && !paused) machineBarrier?.Unlock();
    saving=false;
    for (const m of deferred.splice(0)) onmessage({data:m});
  }
}
async function DiskImage() {
  let off=0;
  const stream=new ReadableStream({pull(c) {
    if (off===disk.virtualSize) {c.close();return;}
    const bytes=new Uint8Array(Math.min(131072,disk.virtualSize-off));
    disk.readInto(off/512,bytes.length/512,bytes,0);off+=bytes.length;c.enqueue(bytes);
  }});
  return new Response(stream.pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
}

// Stream-decompress into ONE preallocated buffer: Response.arrayBuffer() would hold all the
// inflate chunks AND the assembled copy at once (~2x peak) - phones live or die on this.
async function gunzipInto(gz, size) {
  const out = new Uint8Array(size);
  const rd = new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
  let off = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break;
    if (off + value.length > size) throw new Error("snapshot larger than expected");
    out.set(value, off); off += value.length; }
  if (off!==size) throw new Error("snapshot shorter than expected");
  return out;
}

// `smp` (optional) = { mem: shared WebAssembly.Memory, ctrl: SharedArrayBuffer, ipiAddr, ncore } - when
// present this worker is the SMP BSP (core 0): it instantiates the shared-memory engine over `mem`, and
// after the desktop settles it releases the AP workers (which run RunCore over the same memory) so games
// that spawn parallel jobs (Talons, Varoom) actually complete. No `smp` => the original single-core path,
// byte-for-byte unchanged.
let smpCfg = null, apsReleased = false, bootFrames = 0;
async function boot({ gz, wasmUrl, fixedB, diskBytes, smp, repeat, welcome, rate }) {
  if ([0,30,60,120].includes(rate)) refreshRate=rate;
  if (typeof repeat==="boolean") repeatKeys=repeat;
  welcomePending=!!welcome;
  smpCfg = smp || null;
  if (fixedB) curBudget = fixedB;
  postMessage({cmd:"progress",text:"reading saved machine…",pct:60});
  const saved=await SnapshotOpen(gz);
  if (saved && saved.meta.cores!==(smpCfg?.ncore||1)) {await saved.Close();throw new Error("Snapshot core count does not match the worker topology");}
  if (!saved) snap=await gunzipInto(gz,402653184);
  gz=null;
  if (!saved && diskBytes) disk=makeDisk(new Uint8Array(diskBytes));
  engineBytes=saved?saved.wasm:new Uint8Array(await (await fetch(wasmUrl,{cache:"no-cache"})).arrayBuffer());
  const mod=await WebAssembly.compile(engineBytes);

  let sequence=0,lastFrame=null;
  function SendFrame(addr,w,h,u8,force=false) {
    if (!force && outstanding>=2) return;
    const buf=u8.slice(addr,addr+w*h),top=FrameTop(buf,w);
    outstanding++;
    postMessage({cmd:"frame",buf:buf.buffer,w,h,fps:FrameFps(top),updates:++sequence,top},[buf.buffer]);
  }
  showStoppedFrame=()=>{
    if (lastFrame) SendFrame(...lastFrame,new Uint8Array(instRef.exports.memory.buffer),true);
  };
  const barrier=machineBarrier=smpCfg?CaptureBarrier(new Int32Array(smpCfg.ctrl),
        smpCfg.ncore,()=>apsReleased):null;
  const host=hostRef=createHemuHost({
    captureLock:()=>barrier?barrier.Lock():true,
    captureUnlock:()=>barrier?.Unlock(),
    palette:(index,rgb)=>postMessage({cmd:"palette",index,rgb}),
    onText: (s) => { if (s && s.indexOf("BADOP") >= 0) console.log("[hemu]", s.trim()); },
    snd: { tone: (f) => postMessage({ cmd: "snd", f: Number(f) }) },   // AudioContext lives on the main thread
    snapLoad: (base, u8) => { gBase = base; u8.set(snap, base); },   // capture gBase for the JIT
    diskRead: (lba, count, u8, dst) => { if (disk) disk.readInto(lba, count, u8, dst); },   // ATA -> real C: sectors
    diskWrite: (lba, count, u8, src) => { if (disk) disk.writeInto(lba, count, u8, src); },  // ATA writes -> in-session overlay
    present: (addr,w,h,u8)=>{
      lastFrame=[addr,w,h];SendFrame(addr,w,h,u8);
    },
  });
  // |0 on every BigInt crossing: a fractional value (trackpad movementX, joystick velocity)
  // throws "Not an integer" in BigInt() and traps the whole emulator.
  host.env.__host_msx = guestInput.x;
  host.env.__host_msy = guestInput.y;
  host.env.__host_msb = guestInput.buttons;
  host.env.__host_wheel = guestInput.wheel;
  host.env.__host_key=keyq.Read;
  host.env.__host_budget = () => BigInt(curBudget | 0);
  host.env.__host_dt = () => BigInt(dtMs | 0);
  host.env.__host_ns = () => BigInt(dtNs);
  // ---- JIT wiring: blocks read hemu's shared state at the offsets passed via __jit_state/__jit_x87/__jit_chain;
  //      __jit_state returns 1 to ENABLE (return 0n / ?nojit -> pure interpreter). See jit.js. ----
  let inst;
  if (!NOJIT) {
    host.env.__jit_state = (rg, fl, rp) => { jit.jitState(rg, fl, rp, gBase, inst.exports.memory, inst.exports.RdMem, inst.exports.WrMem, inst.exports.RasterHLE); return 1n; };
    host.env.__jit_compile = (rip) => BigInt(jit.jitCompile(Number(rip)));
    host.env.__jit_run = (rip) => BigInt(jit.jitRun(Number(rip)));
    host.env.__jit_x87 = (a, b, c) => jit.jitX87(a, b, c);
    host.env.__jit_dispatch = (b) => BigInt(jit.jitDispatch(Number(b)));
    host.env.__jit_chain = (a, b) => jit.jitChain(a, b);
    host.env.__jit_seg = (...a) => jit.jitSeg(...a.map(Number));
    jit.jitReset();
    console.log("[hemu] JIT enabled (x86-64 -> WASM)");
  } else console.log("[hemu] JIT disabled (?nojit) - pure interpreter");

  if (smpCfg) host.env.mem = smpCfg.mem;                          // SMP BSP: instantiate over the shared memory (hemu-smp.wasm imports env.mem)
  inst = await WebAssembly.instantiate(mod, { env: host.env });
  instRef = inst;
  host.attach(inst);
  if (smpCfg) {
    const ctrl=new Int32Array(smpCfg.ctrl),until=performance.now()+10000;
    for (let core=1;core<smpCfg.ncore;core++)
      while (!Atomics.load(ctrl,8+core)) {
        if (performance.now()>until) throw new Error("Application core did not initialize");
        await new Promise(r=>setTimeout(r,10));
      }
  }
  if (saved) {
    disk=await saved.Restore(inst.exports.memory);
    const m=saved.meta;
    gBase=m.base;host.state.heapPtr=m.heapPtr;inst.exports.__sp.value=BigInt(m.sp);
    if (Number(inst.exports.RamBase())!==gBase) throw new Error("Snapshot RAM base does not match its engine");
    paused=m.paused;refreshRate=m.rate;actualRate=m.actualRate;repeatKeys=m.repeat;
    curBudget=m.budget;keyq.Restore(m.keyboard);guestInput.restore(m.pointer);welcomePending=false;
    loaded=true;inst.exports.SnapshotResume();
    gx=createGuestExec({inst,gBase,onEvent:gxEvent});gxProbe=gx.probe();
    if (!gxProbe.ok) throw new Error("Saved guest API could not be restored: "+gxProbe.errors.join("; "));
    gx.restoreLaunch(m.launch);
    postMessage({cmd:"guestReady",ok:true,probe:gxProbe,restored:true});
    postMessage({cmd:"settings",ok:true,rate:actualRate,repeat:repeatKeys});
    postMessage({cmd:"paused",value:paused});
    if (smpCfg) {
      const c=new Int32Array(smpCfg.ctrl);
      //Hold a paused restore before any AP can execute its first instruction.
      if (paused) Atomics.store(c,2,1);
      apsReleased=true;Atomics.store(c,0,1);Atomics.notify(c,0);
      if (paused && !barrier.Lock()) throw new Error("Restored application cores did not stop");
      postMessage({cmd:"smpReady",ncore:smpCfg.ncore});
    }
    postMessage({cmd:"restored",cores:m.cores,paused});
  } else inst.exports.__rt_init();
  postMessage({cmd:"progress",text:"starting TempleOS…",pct:100});

  // Fast yield via MessageChannel: drains input/ack messages between iterations without the
  // setTimeout 4 ms clamp (used when the frame already ran long and there's nothing to sleep).
  const tick = new MessageChannel();
  let resume = null;
  tick.port1.onmessage = () => { const r = resume; resume = null; r && r(); };
  const yieldTick = () => new Promise(r => { resume = r; tick.port2.postMessage(0); });
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Pace the loop at ~60 __main/s. Pre-JIT, emulation was slow enough to self-pace near 60; the JIT
  // made __main fast, so the unthrottled loop spun 150-220+/s and every per-refresh animation (title
  // marquee, window wiggle, cursor) ran that much faster - the "everything ~2x speed" bug. The guest's
  // own refresh gate now paces drawing at ~31fps (snapshot.HC); 60Hz here keeps input/present snappy.
  // dt carries a fractional accumulator so integer ms truncation doesn't slow the guest clock (~12%
  // at 240Hz, ~4% at 60Hz - jiffies/tS now track wall-clock exactly).
  const FRAME_MS = 1000 / 60;
  let lastT = performance.now(), dtAcc = 0;
  for (;;) {
    const now = performance.now();
    dtAcc+=Math.max(0,now-lastT)*1000000;
    lastT=now;
    dtNs=Math.min(100000000,Math.floor(dtAcc));
    dtAcc-=Math.floor(dtAcc);
    dtMs=dtNs/1000000;
    if (paused || saving) {
      await sleep(80);
      lastT=performance.now();
      dtAcc=0;
      continue;
    }
    try { guestInput.beforeFrame(); inst.exports.__main(); guestInput.afterFrame(); }                                 // emulate one TempleOS frame (+ present via the host)
    catch (err) { postMessage({ cmd: "error", msg: "hemu trap: " + err.message }); return; }
    if (smpCfg && !apsReleased && ++bootFrames > 120) {            // desktop settled -> release the AP workers (parallel from here)
      const dvm = new DataView(smpCfg.mem.buffer);
      for (let k = 1; k < smpCfg.ncore; k++) dvm.setBigUint64(smpCfg.ipiAddr + k * 8, 0n, true);   // drop stale boot-IPIs
      const c = new Int32Array(smpCfg.ctrl); Atomics.store(c, 0, 1); Atomics.notify(c, 0);          // CTRL.READY = 1
      apsReleased = true; postMessage({ cmd: "smpReady", ncore: smpCfg.ncore });
    }
    if (!loaded) { loaded = true; SettingsApply(); snap = null;                     // snapshot now in WASM RAM - free the 384 MB copy
      // Load the C: disk AFTER boot settles (file I/O works once it lands; the desktop runs from
      // cached RAM). Deferring it keeps the disk decompress out of the boot memory spike - the
      // difference between living and dying on iOS Safari's per-tab memory budget.
      if (!disk) setTimeout(() => loadDisk("../vendor/images/templeos-hd.qcow2.gz").then(d => {disk=d;postMessage({cmd:"diskInfo",ok:true,msg:"Disk ready"});}).catch(err => {disk=null;postMessage({cmd:"diskInfo",ok:false,msg:err.message});}), 2500);
      // guest execution API: bound to this instance now that gBase is known (snapLoad ran in the first frame)
      try { gx = createGuestExec({ inst, gBase, onEvent: gxEvent, log: (s) => console.log("[hemu gx] " + s) }); }
      catch (e) { console.warn("[hemu] guest execution API unavailable: " + e.message); postMessage({ cmd: "guestReady", ok: false, probe: { ok: false, errors: [String(e.message || e)], warnings: [] } }); }
    }
    gxTick();                                                      // between frames: probe once, then service queued jobs
    const work = performance.now() - now;
    if (!fixedB) {                                                 // size budget to fill the frame (games need the MIPS;
      if (work > 15 && curBudget > 900000) curBudget = (curBudget * 0.90) | 0;        // slow machines auto-shrink)
      else if (work < 11 && curBudget < 24000000) curBudget = Math.min(24000000,(curBudget * 1.07) | 0);
    }
    const wait = FRAME_MS - (performance.now() - now);
    if (wait > 1) await sleep(wait); else await yieldTick();
  }
}
