//Runs one engine worker file in a Node worker thread the way a browser runs it.
//Each frame message leaves with a probe: the guest's jiffies, refresh count
//and fps, found by name through the engine's own lookup (HEMU's sym.HC).
import {parentPort,workerData} from "node:worker_threads";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

if(workerData.waitAsync===false)Atomics.waitAsync=undefined;
let idle_runs=0;
let inst=null,ex=null,g_base=0,work_ms=0,mains=0,syms=null,probe_tries=0,tsc_addr=0;
let bus_ctrl=null,bus_cores=0;
//Credit gap has the initial boot-credit offset; differences measure new lag.
let clock_input_ns=0,clock_tick_ns=0,clock_start=null,clock_read=0;
const fetch_holds=new Map((workerData.fetchHold||[]).map(url=>[url,[]]));

function MemDv()
{//A view of the guest's memory, made again when it grows.
  return new DataView(ex.memory.buffer);
}

function U64(dv,a)
{
  return Number(dv.getBigUint64(g_base+a,true));
}

function NameStage(off,st)
{//st as a C string in the guest's scratch window, for HEMU's lookups.
  let u8=new Uint8Array(ex.memory.buffer),
	a=g_base+Number(ex.GuestInfo(1n))+off,i;
  for (i=0;i<st.length;i++)
    u8[a+i]=st.charCodeAt(i);
  u8[a+i]=0;
  return BigInt(a);
}

function VarMemberAddr(v,cls,member)
{//Address of a member of the guest's global v, 0 if either is missing.
  let base=Number(ex.GuestVar(NameStage(0xA00,v))),
	o=Number(ex.GuestMember(NameStage(0xA00,cls),NameStage(0xA80,member)));
  if (!base || o<0)
    return 0;
  return base+o;
}

function ProbeInit()
{//Where the guest keeps its jiffies, refresh count and fps, by name.
  let res={jiffies:VarMemberAddr("cnts","CCntsGlbls","jiffies"),
	updates:VarMemberAddr("winmgr","CWinMgrGlbls","updates"),
	fps:VarMemberAddr("winmgr","CWinMgrGlbls","fps")};
  if (!res.jiffies || !res.updates || !res.fps)
    return null;
  return res;
}

function ProbeRd()
{//What the guest itself counts, at the moment a frame leaves.
  //Frame callbacks run inside the BSP lease. Other host events must not add an unregistered RAM reader.
  if(bus_ctrl&&!(Atomics.load(bus_ctrl,13)&1))
    return {t:performance.now(),work:work_ms,mains:mains};
  if (!g_base) g_base=Number(ex.RamBase());
  let dv=MemDv();
  if (!syms && probe_tries<20 && g_base) {
    probe_tries++;
    syms=ProbeInit();
  }
  if (!syms)
    return {t:performance.now(),work:work_ms,mains:mains};
  return {t:performance.now(),work:work_ms,mains:mains,
	clock_ns:tsc_addr?Number(dv.getBigUint64(tsc_addr,true)):null,
	clock_input_ns,clock_tick_ns,loop_elapsed_ms:performance.now()-clock_read,
	clock_credit_gap_ms:clock_start===null?null:performance.now()-clock_start-clock_input_ns/1e6,
	jif:U64(dv,syms.jiffies),upd:U64(dv,syms.updates),
	fps:dv.getFloat64(g_base+syms.fps,true)};
}

function MsgOut(m,transfer)
{//The worker's postMessage.
  if (m && ["frame","diskInfo","guestPatch"].includes(m.cmd) && ex)
    m.probe=ProbeRd();
  parentPort.postMessage(m,transfer);
}

function MsgIn(m)
{
  if(m?.cmd==="__ping") {
    parentPort.postMessage({cmd:"__ping",id:m.id,idleRuns:idle_runs,
      waitAsync:typeof Atomics.waitAsync==="function"});
    return;
  }
  if(m?.cmd==="init"&&m.smp?.busProtocol===1) {
    bus_ctrl=new Int32Array(m.smp.ctrl);bus_cores=m.smp.ncore;
  }
  if(m?.cmd==="__batch") {
    //Keep both submissions ahead of their asynchronous guest-call continuations.
    for(const msg of m.messages)globalThis.onmessage({data:msg});
    return;
  }
  if(m && m.cmd==="__fetchRelease") {
    const pending=fetch_holds.get(m.url);
    fetch_holds.delete(m.url);
    for(const resolve of pending||[])resolve();
    parentPort.postMessage({cmd:"__fetchReleased",url:m.url,count:pending?.length||0});
    return;
  }
  if(m && m.cmd==="__stall") {
    const before=ProbeRd();
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,m.ms);
    parentPort.postMessage({cmd:"__stall",before,after:ProbeRd()});
    return;
  }
  if (m && m.cmd=="__peek") {
    if(bus_ctrl) {
      const seq=Atomics.load(bus_ctrl,2);
      if(!seq||Atomics.load(bus_ctrl,12)||Atomics.load(bus_ctrl,13)||
          Array.from({length:bus_cores-1},(_,i)=>i+1).some(core=>Atomics.load(bus_ctrl,4+core)!==seq))
        throw new Error("Diagnostic RAM copy requires a held complete-machine capture");
    }
    parentPort.postMessage({cmd:"__peek",probe:ProbeRd(),
      fault:ex.CpuFault?String(ex.CpuFault(0n)):null,faultPc:ex.CpuFault?String(ex.CpuFault(1n)):null,
      cpu:Array.from({length:17},(_,i)=>String(ex.GuestInfo(BigInt(i)))),
      ranges:(m.ranges||[]).map(([addr,len])=>new Uint8Array(ex.memory.buffer,addr,len).slice())});
    return;
  }
  if (globalThis.onmessage)
    globalThis.onmessage({data:m});
}

async function FileFetch(url)
{//The browser's fetch, for files under the site.
  let u=new URL(String(url),globalThis.location.href);
  if(fetch_holds.has(u.href)) {
    parentPort.postMessage({cmd:"__fetchHeld",url:u.href});
    await new Promise(resolve=>fetch_holds.get(u.href).push(resolve));
  }
  try {
    return new Response(readFileSync(fileURLToPath(u)),{status:200});
  } catch (err) {
    return new Response("",{status:404});
  }
}

function MainTimed()
{//The worker's __main, timed.
  let t0=performance.now(),res=inst.exports.__main();
  work_ms+=performance.now()-t0;
  mains++;
  return res;
}

async function Instantiate(mod,imports)
{//Keeps the instance and the guest's base so the probe can read the guest.
  let env=imports.env,snap_load=env.__snap_load,seg=env.__jit_seg,ns=env.__host_ns,res;
  function SnapLoad(base)
  {
    g_base=Number(base);
    return snap_load(base);
  }
  env.__snap_load=SnapLoad;
  if(seg)env.__jit_seg=(...args)=>{tsc_addr=Number(args[2]);return seg(...args);};
  if(ns)env.__host_ns=()=>{
    const value=ns();clock_read=performance.now();
    if(clock_start===null)clock_start=clock_read;
    clock_tick_ns=Number(value);clock_input_ns+=clock_tick_ns;return value;
  };
  res=await wasm_instantiate.call(WebAssembly,mod,imports);
  inst=res.instance||res;
  ex=Object.assign({},inst.exports);
  if(workerData.idleProbe&&ex.RunCore)ex.RunCore=(...args)=>{
    const result=inst.exports.RunCore(...args);
    if(result===0n)idle_runs++;
    return result;
  };
  ex.__main=MainTimed;
  if (res.instance)
    return {module:res.module,instance:{exports:ex}};
  return {exports:ex};
}

const wasm_instantiate=WebAssembly.instantiate;
globalThis.self=globalThis;
globalThis.location=new URL(workerData.url);
globalThis.onmessage=null;
globalThis.postMessage=MsgOut;
globalThis.fetch=FileFetch;
WebAssembly.instantiate=Instantiate;
parentPort.on("message",MsgIn);
await import(workerData.url);
