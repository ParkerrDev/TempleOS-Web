//Runs one engine worker file in a Node worker thread the way a browser runs it.
//Each frame message leaves with a probe: the guest's jiffies, refresh count
//and fps, read by this file's own walk of the guest's hash table.
import {parentPort,workerData} from "node:worker_threads";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const TASK_SIG=0x536B7354;
const HTT_EXPORT_SYS_SYM=1;
const HTT_GLBL_VAR=8;
const HTT_CLASS=0x10;

let inst=null,ex=null,g_base=0,work_ms=0,mains=0,syms=null,probe_tries=0;

function MemDv()
{//A view of the guest's memory, made again when it grows.
  return new DataView(ex.memory.buffer);
}

function U64(dv,a)
{
  return Number(dv.getBigUint64(g_base+a,true));
}

function StrRd(dv,a)
{
  let s="",c,i;
  for (i=0;i<64;i++) {
    c=dv.getUint8(g_base+a+i);
    if (!c)
      break;
    s+=String.fromCharCode(c);
  }
  return s;
}

function AdamFind(dv)
{//Seeds from V5.03 KernelA.HH: CTask addr 0, task_signature 8, task_name 600.
  let a,ram=402653184-1024;
  for (a=0x1000;a<ram;a+=8)
    if (dv.getUint32(g_base+a+8,true)==TASK_SIG && U64(dv,a)==a &&
	  StrRd(dv,a+600).startsWith("Adam"))
      return a;
  return 0;
}

function SymsRd(dv)
{//Name to entries over Adam's table: CHashTable mask 8 body 24, CHash next 0 str 8 type 16.
  let adam=AdamFind(dv),tbl,mask,body,i,e,n,type,name,map=new Map();
  if (!adam)
    return null;
  tbl=U64(dv,adam+976);
  while (tbl) {
    mask=U64(dv,tbl+8);
    body=U64(dv,tbl+24);
    for (i=0;i<=mask;i++) {
      e=U64(dv,body+i*8);
      n=0;
      while (e && n<10000) {
	type=dv.getUint32(g_base+e+16,true);
	name=StrRd(dv,U64(dv,e+8));
	if (!map.has(name))
	  map.set(name,[]);
	map.get(name).push({addr:e,type:type});
	e=U64(dv,e);
	n++;
      }
    }
    tbl=U64(dv,tbl);
  }
  return map;
}

function VarAddr(dv,map,name)
{//CHashGlblVar data_addr 120, CHashExport val 64.
  let lst=map.get(name)||[],i;
  for (i=0;i<lst.length;i++) {
    if (lst[i].type&HTT_GLBL_VAR)
      return U64(dv,lst[i].addr+120);
    if (lst[i].type&HTT_EXPORT_SYS_SYM)
      return U64(dv,lst[i].addr+64);
  }
  return 0;
}

function MemberOff(dv,map,cls,member)
{//CHashClass member_lst 88, CMemberLst next 0 str 40 offset 80.
  let lst=map.get(cls)||[],i,m,n;
  for (i=0;i<lst.length;i++)
    if (lst[i].type&HTT_CLASS) {
      m=U64(dv,lst[i].addr+88);
      n=0;
      while (m && n<4096) {
	if (StrRd(dv,U64(dv,m+40))==member)
	  return U64(dv,m+80);
	m=U64(dv,m);
	n++;
      }
    }
  return -1;
}

function ProbeInit(dv)
{
  let map=SymsRd(dv),cnts,winmgr;
  if (!map)
    return null;
  cnts=VarAddr(dv,map,"cnts");
  winmgr=VarAddr(dv,map,"winmgr");
  if (!cnts || !winmgr)
    return null;
  return {jiffies:cnts+MemberOff(dv,map,"CCntsGlbls","jiffies"),
	updates:winmgr+MemberOff(dv,map,"CWinMgrGlbls","updates"),
	fps:winmgr+MemberOff(dv,map,"CWinMgrGlbls","fps")};
}

function ProbeRd()
{//What the guest itself counts, at the moment a frame leaves.
  let dv=MemDv();
  if (!syms && probe_tries<20 && g_base) {
    probe_tries++;
    syms=ProbeInit(dv);
  }
  if (!syms)
    return {t:performance.now(),work:work_ms,mains:mains};
  return {t:performance.now(),work:work_ms,mains:mains,
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
  if (m && m.cmd=="__peek") {
    parentPort.postMessage({cmd:"__peek",probe:ProbeRd()});
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
  let env=imports.env,snap_load=env.__snap_load,res;
  function SnapLoad(base)
  {
    g_base=Number(base);
    return snap_load(base);
  }
  env.__snap_load=SnapLoad;
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
