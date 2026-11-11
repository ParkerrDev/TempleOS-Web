// guestexec.js: the backend guest-execution API for hemu (shared by the site worker and the node
// harnesses). Runs HolyC source, disk includes, game launches, directory creation and native FileWrite
// inside the emulated TempleOS with NO synthetic keystrokes and NO per-character TaskMsg injection.
//
// How it works (see src/guestcall.HC for the CPU-side primitive):
//   1. probe(): looks up the kernel entry points (TaskExe, JobResScan, PopUp), the globals
//	(adam_task, sys_focus_task) and the CTask, CJob and CJobCtrl members by name, through HEMU's
//	own lookup over the guest's hash tables (src/sym.HC). Every address is checked (task
//	signatures, function prologues, arg counts) before use.
//   2. A request becomes ONE TempleOS job: the source text is staged in the scratch window above the OS's
//      RAM, and TaskExe(target, NULL, src, 0) is called through the injected-call primitive. TaskExe copies
//      the text into Adam's heap and queues a JOBT_EXE_STR job; the TARGET task runs it itself from
//      JobsHndlr (ScanMsg / SrvTaskCont) in its own context, exactly like text typed at its prompt.
//   3. The job is wrapped with two mailbox stores (started / finished) so compile errors and runtime
//      exceptions are detected honestly, the CJob's JOBf_DONE flag signals completion, and the job is
//      reaped with JobResScan so the OS frees it. Request IDs correlate every event.
//
// Usage: const gx = createGuestExec({ inst, gBase, onEvent }); after the desktop settles: gx.probe();
// then per emulated frame (between __main calls): gx.tick(); requests: gx.exec / include / launch /
// writeFile / mkdir return an id; events arrive through onEvent({ id, op, state, ... }).
const HEMU_CALLS=["GuestCallPost","GuestCallTry","GuestCallRes","GuestCallAck","GuestInfo",
  "GuestFun","GuestArgCnt","GuestVar","GuestMember"];
const TASK_SIG=0x536B7354;	//'TskS', CTask.task_signature
//Flag bits from V5.03 Kernel/KernelA.HH.
const JOBf = { DONE: 1 << 5, DISPATCHED: 1 << 6 };
const TASKf = { IDLE: 1 << 3, CMD_LINE_PMT: 1 << 4, AWAITING_MSG: 1 << 9 };
// Scratch window layout (offsets from the window base = RAM_SIZE): call args, request mailboxes, the
// two names of a lookup, job source text, file payloads. The last 16 bytes hold the call sentinel
// (guestcall.HC).
const SCR = { ARGS: 0x0000, MBOX: 0x0100, MBOX_N: 64, MBOX_SZ: 32, NAME: 0x0A00, MEMBER: 0x0A80, TEXT: 0x10000, TEXT_SZ: 0xF0000, DATA: 0x100000 };
const NAME_LEN=128;
const CALL_BUDGET = 8000000;                       // interpreter steps allowed for one injected call (TaskExe takes a few thousand)
const TASK_MEMBERS=["addr","task_signature","task_flags","next_task","task_name","except_ch",
  "hash_table","srv_ctrl","popup_task","win_inhibit","draw_it"];
const JOB_MEMBERS=["ctrl","job_code","flags","aux_str","res","master_task"];
const JOB_CTRL_MEMBERS=["next_waiting","last_waiting","next_done","last_done","flags"];

const hex = (v) => "0x" + Number(v).toString(16);
const cstr = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');   // HolyC string-literal escaping
const toLatin1 = (s) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xFF; return b; };
const i64str = (v) => { let s = ""; for (let i = 0n; i < 8n; i++) { const c = Number((v >> (8n * i)) & 0xFFn); if (!c) break; s += String.fromCharCode(c); } return s; };   // 'Compiler' style I64 char constants

export function createGuestExec(opts) {
  const inst = opts.inst, gBase = opts.gBase | 0, ex = inst.exports;
  const log = opts.log || (() => {});
  const onEvent = opts.onEvent || (() => {});
  for (const n of HEMU_CALLS) if (typeof ex[n] !== "function") throw new Error("hemu.wasm lacks export " + n + " (rebuild: node engine/build.mjs)");
  const memSize = Number(ex.GuestInfo(0n)), scrBase = Number(ex.GuestInfo(1n)), scrSize = Number(ex.GuestInfo(2n));
  const dataSize = Math.floor((scrSize - SCR.DATA - 256) / 512) * 512;       // payload area (leaves the sentinel alone)
  let bufRef = null, dv = null, u8 = null;
  const views = () => { const b = ex.memory.buffer; if (b !== bufRef) { bufRef = b; dv = new DataView(b); u8 = new Uint8Array(b); } };
  const inRam = (a) => a > 0 && a + 8 <= memSize;
  const rd64 = (a) => { views(); return inRam(a) ? Number(dv.getBigUint64(gBase + a, true)) : 0; };
  const rd64b = (a) => { views(); return inRam(a) ? dv.getBigUint64(gBase + a, true) : 0n; };
  const rd32 = (a) => { views(); return inRam(a) ? dv.getUint32(gBase + a, true) : 0; };
  const rd8 = (a) => { views(); return (a >= 0 && a < memSize) ? u8[gBase + a] : 0; };
  const wr64 = (a, v) => { views(); dv.setBigUint64(gBase + a, BigInt.asUintN(64, BigInt(v)), true); };
  const wrBytes = (a, bytes) => { views(); u8.set(bytes, gBase + a); };
  const rdBytes = (a, n) => { views(); return u8.slice(gBase + a, gBase + a + n); };
  const rdStr = (a, max = 96) => { let s = ""; for (let i = 0; i < max; i++) { const c = rd8(a + i); if (!c) break; s += String.fromCharCode(c); } return s; };

  const S = {}, G = {};                             // resolved functions / global variable addresses
  const CT = {}, CJ = {}, CJC = {}, INPUT = {}, DISPLAY = {};
  let ready = false, probeResult = null, seth_task = -1;
  const stats = { calls: 0, steps: 0, jobs: 0 };

  // ---------------------------------------------------------------- guest introspection
  function NameStage(off,st)
  {//st as a C string in the scratch window. Returns its address in the
  //engine's memory, which is what HEMU's U8 * arguments hold.
    let a=gBase+scrBase+off,i;
    views();
    for (i=0;i<st.length && i<NAME_LEN-1;i++)
      u8[a+i]=st.charCodeAt(i)&0xFF;
    u8[a+i]=0;
    return BigInt(a);
  }

  function FunFind(st)
  {//Where the guest's function st starts, 0 if it has none.
    return Number(ex.GuestFun(NameStage(SCR.NAME,st)));
  }

  function ArgCntFind(st)
  {//How many arguments the guest's function st takes, -1 if none.
    return Number(ex.GuestArgCnt(NameStage(SCR.NAME,st)));
  }

  function VarFind(st)
  {//Where the guest's global st lives, 0 if it has none.
    return Number(ex.GuestVar(NameStage(SCR.NAME,st)));
  }

  function MemberFind(cls,st)
  {//Offset of member st in the guest's class cls, -1 if it has none.
    return Number(ex.GuestMember(NameStage(SCR.NAME,cls),NameStage(SCR.MEMBER,st)));
  }

  function isTask(a) { return inRam(a) && rd64(a + CT.addr) === a && rd32(a + CT.task_signature) === TASK_SIG; }
  function taskRing() {
    const gs = Number(ex.GuestInfo(4n)), seth = rd64(gs + seth_task), out = [];
    let t = seth, n = 0;
    while (isTask(t) && n < 64) { out.push(t); t = rd64(t + CT.next_task); n++; if (t === seth) break; }
    return out;
  }
  function taskInfo(a) {
    if (!isTask(a)) return { addr: a, valid: false };
    const flags = rd32(a + CT.task_flags), ctrl = a + CT.srv_ctrl;
    // each CQue list is circular through its own head field: waiting ends at &next_waiting (= ctrl), done at &next_done
    let waiting = 0, p = rd64(ctrl + CJC.next_waiting); while (p && p !== ctrl + CJC.next_waiting && waiting < 4096) { waiting++; p = rd64(p); }
    let done = 0; p = rd64(ctrl + CJC.next_done); while (p && p !== ctrl + CJC.next_done && done < 4096) { done++; p = rd64(p); }
    const popup = rd64(a + CT.popup_task);
    const b = busy.get(a);
    return { addr: a, valid: true, name: rdStr(a + CT.task_name, 32), flags, idle: !!(flags & TASKf.IDLE), atPrompt: !!(flags & TASKf.CMD_LINE_PMT), busy: b ? { id: b.id, name: b.name, state: b.state } : null,
      awaitingMsg: !!(flags & TASKf.AWAITING_MSG), popup: popup ? { addr: popup, name: isTask(popup) ? rdStr(popup + CT.task_name, 32) : "?" } : null,
      jobsWaiting: waiting, jobsDone: done, exceptCh: i64str(rd64b(a + CT.except_ch)) };
  }

  function FunResolve(name,argc,errors)
  {//A function the probe needs: found by name, then checked for its
  //argument count and its prologue (push rbp; mov rbp,rsp).
    let a=FunFind(name),ac=ArgCntFind(name);
    if (!a || !inRam(a) || a>=scrBase) {
      errors.push(name+": not found in the guest symbol tables");
      return 0;
    }
    if (argc>=0 && ac>=0 && ac!=argc) {
      errors.push(name+": guest arg_cnt "+ac+" != expected "+argc);
      return 0;
    }
    if (rd8(a)!=0x55 || rd8(a+1)!=0x48 || rd8(a+2)!=0x8B || rd8(a+3)!=0xEC) {
      errors.push(name+" @"+hex(a)+": unexpected prologue "+
	    rd8(a).toString(16)+" "+rd8(a+1).toString(16)+" "+
	    rd8(a+2).toString(16)+" "+rd8(a+3).toString(16));
      return 0;
    }
    log("sym "+name+" = "+hex(a));
    return a;
  }

  function VarResolve(name,sys_name,errors)
  {//A global the probe needs, by its name or its exported label.
    let a=VarFind(name);
    if (!inRam(a) && sys_name)
      a=VarFind(sys_name);
    if (!inRam(a)) {
      errors.push(name+": not found in the guest symbol tables");
      return 0;
    }
    log("var "+name+" @ "+hex(a)+" -> "+hex(rd64(a)));
    return a;
  }

  function MembersGet(dst,cls,names,errors)
  {//Offsets of names in the guest's class cls into dst.
    let i,o;
    for (i=0;i<names.length;i++) {
      o=MemberFind(cls,names[i]);
      if (o<0)
	errors.push("class member "+cls+"."+names[i]+" missing");
      else
	dst[names[i]]=o;
    }
  }

  function MemberAddr(base,cls,st)
  {//Address of member st of the guest's global at base, 0 if either is missing.
    let o=MemberFind(cls,st);
    if (!base || o<0)
      return 0;
    return base+o;
  }

  function Probe()
  {//Finds what the requests need in this guest. Ready when nothing is missing.
    let errors=[],warnings=[],adam;
    try {
      MembersGet(CT,"CTask",TASK_MEMBERS,errors);
      MembersGet(CJ,"CJob",JOB_MEMBERS,errors);
      MembersGet(CJC,"CJobCtrl",JOB_CTRL_MEMBERS,errors);
      seth_task=MemberFind("CCPU","seth_task");
      if (seth_task<0)
	errors.push("class member CCPU.seth_task missing");
      if (errors.length)
	return finishProbe(errors,warnings);
      S.TaskExe=FunResolve("TaskExe",4,errors);
      S.JobResScan=FunResolve("JobResScan",2,errors);
      S.PopUp=FunResolve("PopUp",3,errors);
      G.adam_task=VarResolve("adam_task","ADAM_TASK",errors);
      G.sys_focus_task=VarResolve("sys_focus_task","SYS_FOCUS_TASK",errors);
      G.kbd=VarResolve("kbd","KBD",warnings);
      G.ms=VarResolve("ms","MS",warnings);
      G.winmgr=VarResolve("winmgr","WINMGR",warnings);
      DISPLAY.fps=MemberAddr(G.winmgr,"CWinMgrGlbls","fps");
      DISPLAY.updates=MemberAddr(G.winmgr,"CWinMgrGlbls","updates");
      INPUT.down=MemberAddr(G.kbd,"CKbdStateGlbls","down_bitmap");
      INPUT.pos=MemberAddr(G.ms,"CMsStateGlbls","pos");
      INPUT.lb=MemberAddr(G.ms,"CMsStateGlbls","lb");
      INPUT.rb=MemberAddr(G.ms,"CMsStateGlbls","rb");
      INPUT.show=MemberAddr(G.ms,"CMsStateGlbls","show");
      //The OS's own "focus my window" call, for launch({focus:true}) from
      //the target task: WinFocus on V5.03, SetSysFocusTask on TinkerOS.
      S.focusFn="";
      if (FunFind("WinFocus"))
	S.focusFn="WinFocus";
      else if (FunFind("SetSysFocusTask"))
	S.focusFn="SetSysFocusTask";
      else
	warnings.push("no WinFocus/SetSysFocusTask symbol: launch({focus:true}) will not refocus");
      adam=rd64(G.adam_task);
      if (G.adam_task && !isTask(adam))
	errors.push("adam_task does not point at a valid CTask");
      if (G.sys_focus_task && !isTask(rd64(G.sys_focus_task)))
	errors.push("sys_focus_task does not point at a valid CTask");
      if (G.adam_task && isTask(adam) && rdStr(adam+CT.task_name,32)!="Adam")
	warnings.push("adam_task name is not 'Adam'");
    } catch (e) {
      errors.push("probe exception: "+(e && e.message || e));
    }
    return finishProbe(errors,warnings);
  }

  function finishProbe(errors, warnings) {
    ready = errors.length === 0;
    probeResult = { ok: ready, errors, warnings, syms: { TaskExe: S.TaskExe, JobResScan: S.JobResScan, PopUp: S.PopUp }, focusFn: S.focusFn || "", vars: { ...G }, offsets: { CTask: { ...CT }, CJob: { ...CJ }, CJobCtrl: { ...CJC } },
      tasks: ready ? taskRing().map((a) => { const i = taskInfo(a); return { addr: hex(a), name: i.name, idle: i.idle, atPrompt: i.atPrompt, popup: i.popup && i.popup.name }; }) : [],
      scratch: { base: scrBase, size: scrSize, dataSize } };
    if (ready) pumpCalls();
    return probeResult;
  }

  // ---------------------------------------------------------------- injected calls (serialized)
  const callQ = []; let inflight = null;
  function call(fn, args, budget = CALL_BUDGET) { return new Promise((resolve, reject) => { callQ.push({ fn, args, budget, resolve, reject }); pumpCalls(); }); }
  function pumpCalls() {
    if (inflight || !callQ.length || !ready) return;
    const c = callQ.shift(); inflight = c;
    for (let i = 0; i < c.args.length; i++) wr64(scrBase + SCR.ARGS + i * 8, c.args[i]);
    finishCall(Number(ex.GuestCallPost(BigInt(c.fn), BigInt(c.args.length), BigInt(scrBase + SCR.ARGS), BigInt(c.budget))));
  }
  function finishCall(st) {
    if (st === 1 || st === 2) return;                // pending inside the guest: tick() re-checks
    const c = inflight; inflight = null;
    if (st < 0) c.reject(new Error(st === -1 ? "guest call slot busy" : "bad guest call arguments"));
    else {
      const res = BigInt.asUintN(64, ex.GuestCallRes()), err = Number(ex.GuestInfo(11n)), steps = Number(ex.GuestInfo(12n)); ex.GuestCallAck();
      stats.calls++; stats.steps += steps;
      if (st === 3) c.resolve(res); else c.reject(new Error(err === 1 ? "guest call exceeded its step budget (interrupted state restored)" : "guest call faulted (interrupted state restored)"));
    }
    pumpCalls();
  }

  // ---------------------------------------------------------------- jobs
  const jobs = [];                                   // in-flight TaskExe jobs polled every tick
  // A job runs NESTED inside whatever wait the target task was in (the prompt's GetStr, a game's ScanKey), so
  // the OS flags alone cannot tell "sitting at the prompt" from "running our launch from the prompt". The
  // module therefore remembers which of ITS jobs are still executing per task and refuses to stack a second
  // program on top of one that has not finished (that would run game B inside game A's input loop).
  const busy = new Map();                            // task addr -> request currently executing there (launch/include/exec)
  const mboxFree = []; for (let i = SCR.MBOX_N - 1; i >= 0; i--) mboxFree.push(i);
  const mboxAddr = (slot) => scrBase + SCR.MBOX + slot * SCR.MBOX_SZ;
  const mutex = () => { let tail = Promise.resolve(); return (fn) => { const run = tail.then(fn, fn); tail = run.catch(() => {}); return run; }; };
  const lockText = mutex(), lockData = mutex();     // TEXT: held while TaskExe copies the source; DATA: held until the FileWrite job finishes
  function resolveTarget(target) {
    if (typeof target === "number") return isTask(target) ? target : 0;
    if (target === "adam") return rd64(G.adam_task);
    if (target === "prompt") {                        // the focused terminal if it sits at its prompt, else any user terminal that does
      const f = rd64(G.sys_focus_task); if (isTask(f) && taskInfo(f).atPrompt) return f;
      for (const t of taskRing()) if (taskInfo(t).atPrompt) return t;
      return f;
    }
    return rd64(G.sys_focus_task);                    // "focus" (default): the terminal the user is looking at
  }
  function emit(r, state, extra) { if(r.silent)return; r.state = state; const ev = { id: r.id, op: r.op, state, name: r.name, t: Date.now() - r.t0, ...extra }; r.last = ev; try { onEvent(ev); } catch (e) { log("onEvent threw: " + e); } return ev; }
  function waitJob(r, job, task, mbox) {
    return new Promise((resolve, reject) => { jobs.push({ r, job, task, mbox, resolve, reject, dispatched: false, started: false, t0: Date.now(), warned: false }); });
  }
  function pollJobs() {
    for (let i = jobs.length - 1; i >= 0; i--) {
      const j = jobs[i];
      if (rd64(j.job + CJ.ctrl) !== j.task + CT.srv_ctrl || !isTask(j.task)) { jobs.splice(i, 1); j.reject(new Error("job vanished (target task died or its job queue was purged)")); continue; }
      const flags = rd64(j.job + CJ.flags), mb = rd64(j.mbox);
      if (!j.dispatched && (flags & JOBf.DISPATCHED)) { j.dispatched = true; emit(j.r, "dispatched", { msg: "the target task picked the job up" }); }
      if (!j.started && mb >= 1) { j.started = true; emit(j.r, "running", { msg: j.r.runningMsg || "guest code is executing" }); }
      if (flags & JOBf.DONE) { jobs.splice(i, 1); j.resolve({ finished: mb === 2, started: j.started || mb >= 1, res: rd64b(j.job + CJ.res), mbres: rd64b(j.mbox + 8), dispatched: true }); continue; }
      if (!j.dispatched && !j.warned && Date.now() - j.t0 > (j.r.p.stallMs || 15000)) { j.warned = true; const ti = taskInfo(j.task); emit(j.r, "stalled", { msg: `still queued after ${((Date.now() - j.t0) / 1000) | 0}s: target "${ti.name}" is not servicing jobs (busy in a program?)`, target: ti }); }
    }
  }
  async function runJob(r, src, target, wrap) {
    const t = resolveTarget(target);
    if (!t) throw new Error(`target task "${target}" is invalid`);
    const info = taskInfo(t);
    if (info.popup) throw new Error(`target task "${info.name}" has a popup task open (${info.popup.name}); TaskExe would refuse it`);
    const b = busy.get(t);
    if (b && b !== r && !r.p.force) throw new Error(`task "${info.name}" is still running request ${b.id} (${b.name}); wait for it to finish or pass force:true to queue behind it`);
    r.target = info; r.task = t;
    const slot = mboxFree.pop(); if (slot === undefined) throw new Error("too many requests in flight (64 mailboxes)");
    const mb = mboxAddr(slot); wr64(mb, 0); wr64(mb + 8, 0); wr64(mb + 16, 0);
    const text = wrap ? `*(${hex(mb)})(I64*)=1;\n${src}\n*(${hex(mb)})(I64*)=2;` : src;
    const bytes = text instanceof Uint8Array ? text : toLatin1(text);
    if (bytes.length + 1 > SCR.TEXT_SZ) { mboxFree.push(slot); throw new Error(`source too large (${bytes.length} b, max ${SCR.TEXT_SZ - 1})`); }
    const exceptBefore = info.exceptCh;
    let job = 0;
    try {
      job = Number(await lockText(async () => { wrBytes(scrBase + SCR.TEXT, bytes); wr64(scrBase + SCR.TEXT + bytes.length, 0); return call(S.TaskExe, [t, 0, scrBase + SCR.TEXT, 0]); }));
      if (!job) throw new Error(`TaskExe refused the job for "${info.name}" (task invalid or an input popup is up)`);
      stats.jobs++;
      if (!busy.has(t)) busy.set(t, r);
      emit(r, "posted", { msg: `job queued on "${info.name}"`, job: hex(job), target: { name: info.name, atPrompt: info.atPrompt, idle: info.idle, jobsWaiting: info.jobsWaiting + 1 } });
      const done = await waitJob(r, job, t, mb);
      const after = taskInfo(t);
      try { await call(S.JobResScan, [job, 0]); } catch (e) { log("JobResScan failed: " + e.message); }   // reap: the OS frees the CJob + its text
      done.exceptCh = (!done.finished && after.exceptCh !== exceptBefore) ? after.exceptCh : (!done.finished ? after.exceptCh : "");
      done.mbaux = rd64b(mb + 16);
      return done;
    } finally { mboxFree.push(slot); if (busy.get(t) === r) busy.delete(t); }
  }
  const failMsg = (d) => !d.started ? "the job ran but nothing executed (compile error before the first statement" + (d.exceptCh ? `, exception '${d.exceptCh}'` : "") + ")"
    : "execution stopped before the end of the source" + (d.exceptCh ? ` (exception '${d.exceptCh}')` : "") + ": compile error or runtime exception, see the TempleOS window";

  // ---------------------------------------------------------------- requests
  const reqs = new Map(); let nextId = 1;
  function submit(op, p, body) {
    const id = p.id !== undefined ? p.id : nextId++;
    const r = { id, op, p, name: p.name || p.path || op, state: "queued", t0: Date.now(), last: null };
    // Keep recent results for status callers without retaining every upload forever.
    if (reqs.size >= 256) for (const [oldId, old] of reqs) {
      if (["done", "failed", "error"].includes(old.state)) reqs.delete(oldId);
      if (reqs.size < 256) break;
    }
    reqs.set(id, r); emit(r, "queued", { msg: "accepted" });
    if (!ready) { emit(r, "error", { ok: false, msg: "guest execution API not ready (probe not run or failed)" }); return id; }
    Promise.resolve().then(() => body(r)).then((ev) => { if (ev) emit(r, ev.state, ev); }).catch((e) => emit(r, "error", { ok: false, msg: String(e && e.message || e) }));
    return id;
  }
  const exec = (p) => submit("exec", p, async (r) => {
    const d = await runJob(r, p.src, p.target || "focus", p.wrap !== false);
    return d.finished ? { state: "done", ok: true, msg: "source executed", res: d.res.toString(), mbres: d.mbres.toString() } : { state: "failed", ok: false, msg: failMsg(d), except: d.exceptCh, started: d.started };
  });
  const include = (p) => submit("include", p, async (r) => {
    r.runningMsg = `#include of ${p.path} is running`;
    const d = await runJob(r, `#include "${cstr(p.path)}";`, p.target || "focus", true);
    return d.finished ? { state: "done", ok: true, msg: `${p.path} ran to completion`, res: d.res.toString() } : { state: "failed", ok: false, msg: failMsg(d), except: d.exceptCh, started: d.started };
  });
  // Games run in a fresh Servant, spawned from an Adam job. PopUp itself must
  // run in normal task context: injecting it while Fs is the idle task loses the
  // required inherited state. The outer job is short; the game has its own mailbox.
  const launches=[];
  let activeLaunch=null;
  function pollLaunches() {
    for(let i=launches.length-1;i>=0;i--) {
      const j=launches[i], state=rd64(j.mb), task=rd64(j.mb+16);
      if(task)j.r.task=task;
      const finish=(result)=>{launches.splice(i,1);j.resolve(result);};
      if(state===3){const except=i64str(rd64b(j.mb+8));finish({state:'failed',ok:false,except,msg:`${j.r.name} stopped with guest exception '${except || 'Compiler'}'`});}
      else if(state===2)finish({state:'done',ok:true,msg:`${j.r.name} exited`});
      else if(j.spawned && task && !isTask(task))finish(state===1?{state:'done',ok:true,msg:`${j.r.name} task closed`}:{state:'failed',ok:false,msg:`${j.r.name} could not start (guest compile or task error)`});
      else if(state===1 && !j.started){j.started=true;busy.set(task,j.r);emit(j.r,'running',{ok:true,task:hex(task),msg:`${j.r.name} task started; TempleOS is compiling or running the program`});}
    }
  }
  const launch = (p) => submit('launch',p,async(r)=>{
    if(activeLaunch)throw new Error(`A game is busy: ${activeLaunch.name}. Close its TempleOS window before launching another game.`);
    if(p.src===undefined && !p.path)throw new Error('A source string or guest path is required');
    const slot=mboxFree.pop();if(slot===undefined)throw new Error('Too many guest requests');
    const mb=mboxAddr(slot);wr64(mb,0);wr64(mb+8,0);wr64(mb+16,0);
    activeLaunch=r;
    let monitor;
    try {
      const code=p.src!==undefined?`ExePutS2("${cstr(String(p.src))}");`:`ExeFile2("${cstr(guestPath(p.path))}");`;
      const script=`*(${hex(mb)})(I64*)=1;*(${hex(mb+16)})(I64*)=Fs;WinMax;${S.focusFn || 'WinFocus'};try{${code}*(${hex(mb)})(I64*)=2;}catch{*(${hex(mb+8)})(I64*)=Fs->except_ch;Fs->catch_except=TRUE;*(${hex(mb)})(I64*)=3;}`;
      const done=new Promise(resolve=>{monitor={r,mb,resolve,spawned:false,started:false};launches.push(monitor);});
      const d=await runJob({...r,silent:true},`PopUp("${cstr(script)}",NULL,${hex(mb+16)});`,'adam',true);
      monitor.spawned=true;
      if(!d.finished)throw new Error(failMsg(d));
      if(!rd64(mb+16))throw new Error('TempleOS did not create the game task');
      pollLaunches();return await done;
    } finally {
      const i=launches.indexOf(monitor);if(i>=0)launches.splice(i,1);
      mboxFree.push(slot);if(activeLaunch===r)activeLaunch=null;
      if(busy.get(r.task)===r)busy.delete(r.task);
    }
  });
  function guestPath(path) {                         // normalize to an absolute TempleOS path
    let s = String(path).replace(/\\/g, "/");
    if (/^[A-Za-z]:\//.test(s) || s.startsWith("::/") || s.startsWith("~/")) return s;
    if (s.startsWith("/")) return "C:" + s;
    return "C:/Home/" + s;
  }
  function mkdirStmts(path) {                        // DirMk for every parent directory (a no-op for existing ones: DirMk returns FALSE if FileFind sees it)
    const m = /^([A-Za-z]:|::|~)\/(.*)$/.exec(path); if (!m) return "";
    const parts = m[2].split("/").filter(Boolean); parts.pop();   // drop the file name
    let out = "", cur = m[1];
    for (const seg of parts) { cur += "/" + seg; out += `DirMk("${cstr(cur)}");`; }
    return out;
  }
  const mkdir = (p) => submit("mkdir", p, async (r) => {
    const path = guestPath(p.path); if (/[\x00-\x1f"]/.test(path)) throw new Error("path contains control characters or quotes");
    const d = await runJob(r, mkdirStmts(path + "/x"), p.target || "adam", true);
    return d.finished ? { state: "done", ok: true, msg: `directories for ${path} exist`, path } : { state: "failed", ok: false, msg: failMsg(d), except: d.exceptCh };
  });
  const writeFile = (p) => submit("writeFile", p, async (r) => {
    const path = guestPath(p.path); if (/[\x00-\x1f"]/.test(path)) throw new Error("path contains control characters or quotes");
    const bytes = p.bytes instanceof Uint8Array ? p.bytes : new Uint8Array(p.bytes);
    if (bytes.length > dataSize) throw new Error(`file too large for the staging window (${bytes.length} b > ${dataSize} b)`);
    return lockData(async () => {                    // the payload must stay staged until the OS has read it
      wrBytes(scrBase + SCR.DATA, bytes);
      // FileWrite recompresses .Z names. Uploads already contain the archive bytes,
      // so stream those sectors directly through TempleOS and retain the exact size.
      let write = `*(%MB%+8)(I64*)=FileWrite("${cstr(path)}",${hex(scrBase + SCR.DATA)},${bytes.length});`;
      if (/\.Z$/i.test(path) && bytes.length) {
        const blocks=Math.ceil(bytes.length/512),padding=blocks*512-bytes.length;
        if(padding)wrBytes(scrBase+SCR.DATA+bytes.length,new Uint8Array(padding));
        write=`CFile *gx_file_=FOpen("${cstr(path)}","w",${blocks});if(!gx_file_)throw('File');`+
          `if(!FBlkWrite(gx_file_,${hex(scrBase+SCR.DATA)},0,${blocks})){FClose(gx_file_);throw('Disk');}`+
          `gx_file_->de.size=${bytes.length};gx_file_->de.attr=FileAttr("${cstr(path)}",gx_file_->de.attr);`+
          `*(%MB%+8)(I64*)=gx_file_->de.clus;FClose(gx_file_);`;
      }
      const src = (p.mkdirs === false ? "" : mkdirStmts(path)) + write;
      r.runningMsg = `writing ${path} (${bytes.length} b) through the OS`;
      const d = await runJobMb(r, src, p.target || "adam");
      const cluster = Number(d.mbres);
      const ok = d.finished && (bytes.length === 0 || cluster !== 0);
      return ok ? { state: "done", ok: true, msg: `wrote ${path} (${bytes.length} b) through TempleOS, first cluster ${cluster}`, path, size: bytes.length, cluster }
        : { state: "failed", ok: false, msg: d.finished ? `FileWrite returned 0 for ${path} (bad path, read-only or full drive?)` : failMsg(d), except: d.exceptCh, path };
    });
  });
  // like runJob, but the source may reference its own mailbox as %MB% (FileWrite stores its result there)
  async function runJobMb(r, src, target) {
    const slotPeek = mboxFree[mboxFree.length - 1]; if (slotPeek === undefined) throw new Error("too many requests in flight (64 mailboxes)");
    return runJob(r, src.replace(/%MB%/g, hex(mboxAddr(slotPeek))), target, true);
  }
  // Run source in a NEW servant task (Spawn + TaskExe through the kernel's own PopUp(buf, NULL, &task)):
  // the task shows its own window (SrvStartUp) and exits when the code finishes. Experimental.
  const popup = (p) => launch(p);

  function tick() {                                  // once per emulated frame, between __main calls
    if (!ready) return;
    if (inflight) finishCall(Number(ex.GuestCallTry()));
    if (jobs.length) pollJobs();
    if (launches.length) pollLaunches();
  }
  function info() {
    const focus = ready ? taskInfo(rd64(G.sys_focus_task)) : null, adam = ready ? taskInfo(rd64(G.adam_task)) : null;
    return { ready, focus, adam, gameRunning: !!activeLaunch, halted: Number(ex.GuestInfo(7n)), ifOpen: !!(Number(ex.GuestInfo(6n)) & 0x200), calls: stats.calls, steps: stats.steps, jobs: stats.jobs, inflight: !!inflight, pendingJobs: jobs.length, probe: probeResult };
  }
  function inputState() {
    if (!ready || !INPUT.pos || !INPUT.down || !INPUT.show) return null;
    const task = rd64(G.sys_focus_task), valid = isTask(task);
    const inhibit = valid && CT.win_inhibit ? rd32(task + CT.win_inhibit) : 0;
    const drawing = valid && CT.draw_it ? rd64(task + CT.draw_it) : 0;
    return {down:INPUT.down, x:rd64(INPUT.pos), y:rd64(INPUT.pos+8),
      capture:!!(valid && ((!rd8(INPUT.show)) || (drawing && (inhibit & 0x28) === 0x28))),
      task, game:!!activeLaunch};
  }
  function snapshot() {
    if (!ready || inflight || callQ.length || jobs.length ||
        [...reqs.values()].some(r=>r!==activeLaunch && !["done","failed","error"].includes(r.state)) ||
        launches.some(j=>!j.spawned || !j.started))
      throw new Error("Wait for the current guest command to finish before saving.");
    const j=launches[0];
    return j?{name:j.r.name,task:j.r.task,slot:(j.mb-scrBase-SCR.MBOX)/SCR.MBOX_SZ}:null;
  }
  function restoreLaunch(saved) {
    if (!saved) return;
    const slot=saved.slot,index=mboxFree.indexOf(slot);
    if (!ready || index<0 || !isTask(saved.task)) throw new Error("Saved game task is invalid");
    mboxFree.splice(index,1);
    const r={id:"restored-game",op:"launch",name:saved.name,task:saved.task,t0:Date.now(),state:"running",p:{}};
    activeLaunch=r;busy.set(r.task,r);reqs.set(r.id,r);
    launches.push({r,mb:mboxAddr(slot),spawned:true,started:true,resolve:result=>{
      mboxFree.push(slot);activeLaunch=null;busy.delete(r.task);emit(r,result.state,result);
    }});
    emit(r,"running",{ok:true,task:hex(r.task),msg:r.name+" restored"});
  }
  function frameStats() {
    if (!ready || !DISPLAY.fps || !DISPLAY.updates) return null;
    views();
    const fps = dv.getFloat64(gBase + DISPLAY.fps, true), updates = dv.getBigUint64(gBase + DISPLAY.updates, true);
    return Number.isFinite(fps) && fps >= 0 && fps <= 10000 ? {fps, updates: Number(updates)} : null;
  }
  return { snapshot, restoreLaunch, probe: Probe, tick, info, inputState, frameStats, taskInfo, taskRing, exec, include, launch, writeFile, mkdir, popup, call, status: (id) => (reqs.get(id) || {}).last || null,
    funFind: FunFind, varFind: VarFind, memberFind: MemberFind,
    get ready() { return ready; }, syms: S, vars: G, offsets: { CT, CJ, CJC }, scratch: { base: scrBase, size: scrSize, data: scrBase + SCR.DATA, dataSize, text: scrBase + SCR.TEXT }, rd64, rd8, rdBytes, rdStr, wrBytes, wr64 };
}
