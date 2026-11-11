//Runs one engine worker file in a Node worker thread the way a browser runs it.
//Each frame message leaves with a probe: the guest's jiffies, refresh count
//and fps, found by name through the engine's own lookup (HEMU's sym.HC).
import {parentPort,workerData} from "node:worker_threads";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

let inst=null,ex=null,g_base=0,work_ms=0,mains=0,syms=null,probe_tries=0,tsc_addr=0;

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
	jif:U64(dv,syms.jiffies),upd:U64(dv,syms.updates),
	fps:dv.getFloat64(g_base+syms.fps,true)};
}

function MsgOut(m,transfer)
{//The worker's postMessage.
  if (m && m.cmd=="frame")
    m.probe=ProbeRd();
  parentPort.postMessage(m,transfer);
}

function MsgIn(m)
{
  if(m && m.cmd==="__stall") {
    const before=ProbeRd();
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,m.ms);
    parentPort.postMessage({cmd:"__stall",before,after:ProbeRd()});
    return;
  }
  if (m && m.cmd=="__peek") {
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
  let env=imports.env,snap_load=env.__snap_load,seg=env.__jit_seg,res;
  function SnapLoad(base)
  {
    g_base=Number(base);
    return snap_load(base);
  }
  env.__snap_load=SnapLoad;
  if(seg)env.__jit_seg=(...args)=>{tsc_addr=Number(args[2]);return seg(...args);};
  res=await wasm_instantiate.call(WebAssembly,mod,imports);
  inst=res.instance||res;
  ex=Object.assign({},inst.exports);
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
