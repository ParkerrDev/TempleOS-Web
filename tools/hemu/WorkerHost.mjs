import {StockIdentify,StockModuleCheck} from "../../engine/Stock.js";
//Boots the engine worker under Node as the page does and keeps what it sends.
//Single core: one engine/hemu-worker.js. SMP: that worker as core 0 over a
//shared memory, and engine/hemu-smp-worker.js for each other core.
import {Worker} from "node:worker_threads";
import {readFileSync} from "node:fs";
import {SnapshotInspect} from "../../engine/Snapshot.js";
import {FONT} from "../../holyc-wasm/src/runtime/font.js";
import {BusStop,BUS_VERSION} from "../../engine/CoreBus.js";

export const SITE=new URL("../../",import.meta.url);
const SHIM=new URL("./WorkerShim.mjs",import.meta.url);

function WorkerNew(file,fetchHold=[],features={})
{
  let url=new URL(file,SITE).href;
  return new Worker(SHIM,{workerData:{url,fetchHold:fetchHold.map(path=>new URL(path,SITE).href),...features}});
}

function HashBuf(u8)
{//FNV-1a, to count distinct frames.
  let h=0x811C9DC5,i;
  for (i=0;i<u8.length;i++)
    h=Math.imul(h^u8[i],16777619)>>>0;
  return h;
}

function BitCnt(v)
{
  v=v-(v>>1&0x55);
  v=(v&0x33)+(v>>2&0x33);
  return v+(v>>4)&0x0F;
}

export function TextRow(u8,w,row)
{//Reads one 8 pixel text row of a frame against the TempleOS font.
  let s="",cx,x,y,c,bg,best,best_d,g,d,i,cnt,pat=new Uint8Array(8);
  for (cx=0;cx<w>>3;cx++) {
    cnt=new Map();
    for (y=0;y<8;y++)
      for (x=0;x<8;x++) {
	c=u8[(row*8+y)*w+cx*8+x];
	cnt.set(c,(cnt.get(c)||0)+1);
      }
    bg=-1;
    best_d=-1;
    for (const kv of cnt)
      if (kv[1]>best_d) {
	best_d=kv[1];
	bg=kv[0];
      }
    for (y=0;y<8;y++) {
      pat[y]=0;
      for (x=0;x<8;x++)
	if (u8[(row*8+y)*w+cx*8+x]!=bg)
	  pat[y]|=1<<x;
    }
    best=32;
    best_d=99;
    for (g=32;g<127;g++) {
      d=0;
      for (i=0;i<8;i++)
	d+=BitCnt(pat[i]^FONT[g*8+i]);
      d=Math.min(d,64-d);
      if (d<best_d) {
	best_d=d;
	best=g;
      }
    }
    if (best_d<=2)
      s+=String.fromCharCode(best);
    else
      s+="?";
  }
  return s;
}

export function FpsFromTop(top)
{//The digits WallPaper printed after FPS on the top line.
  let m=/FPS:? *([0-9]+)/.exec(top);
  if (!m)
    return null;
  return m[1];
}

export async function HemuBoot(opt)
{//opt: smp (cores, 0 for one), nojit, rate, repeat, fixed_b.
  let h={apMsgs:[],frames:[],nframes:0,last:null,msgs:[],waiters:[],workers:[],
	keep:opt.keep||20000,ack:true,palette:Array(16).fill(null)},
	live,gz,wasm,init,mem,ctrl,sc,k,ap,wasm_bytes;
  function FrameIn(m)
  {
    let u8=new Uint8Array(m.buf),f;
    f={t:performance.now(),w:m.w,h:m.h,hash:HashBuf(u8),top:TextRow(u8,m.w,0),
	  msg_fps:m.fps,msg_top:m.top,probe:m.probe};
    if (opt.keep_buf)
      f.buf=u8;
    h.last=f;
    h.nframes++;
    h.frames.push(f);
    if (h.frames.length>h.keep)
      h.frames.shift();
    if (h.ack) h.workers[0].postMessage({cmd:"ack"});
  }
  function MsgIn(m)
  {
    let i,w;
    if (m.cmd=="palette") h.palette[m.index]=m.rgb;
    if (m.cmd=="frame")
      FrameIn(m);
    else
      h.msgs.push(m);
    if (m.cmd=="error")
      console.log("worker error: "+m.msg);
    for (i=h.waiters.length-1;i>=0;i--) {
      w=h.waiters[i];
      if (w.Pred(m)) {
	h.waiters.splice(i,1);
	w.Done(m);
      }
    }
  }
  live="hemu/live.bin.gz";
  wasm="build/hemu.wasm";
  if (opt.smp) {
    live="hemu/live-smp.bin.gz";
    wasm="build/hemu-smp.wasm";
  }
  if(opt.engine)wasm=opt.engine;
  gz=opt.snapshot||readFileSync(new URL(live,SITE));
  const saved=opt.snapshot?await SnapshotInspect(gz,{busProtocol:opt.busProtocol||0}):null;
  if (saved) opt={...opt,smp:saved.meta.cores===4?4:0};
  else {
    const manifest=JSON.parse(readFileSync(new URL("hemu/stock.json",SITE),"utf8")),
      found=await StockIdentify(gz,opt.smp||1,manifest),module=new WebAssembly.Module(readFileSync(new URL(wasm,SITE)));
    StockModuleCheck(module,found.capture,manifest);
  }
  const features={waitAsync:opt.waitAsync,idleProbe:opt.idleProbe};
  h.workers.push(WorkerNew("engine/hemu-worker.js"+(opt.nojit?"?nojit":""),opt.fetchHold,features));
  h.workers[0].on("message",MsgIn);
  h.workers[0].on("error",function WorkerErr(e) {console.log("worker threw: "+e.stack);});
  h.workers[0].on("error",()=>{if(opt.busProtocol===BUS_VERSION&&h.ctrl)BusStop(h.ctrl);});
  h.workers[0].on("exit",()=>{if(opt.busProtocol===BUS_VERSION&&h.ctrl&&!h.stopping)BusStop(h.ctrl);});
  init={cmd:"init",gz:gz,wasmUrl:new URL(wasm,SITE).href,fixedB:opt.fixed_b||0,
	diskBytes:null,patches:opt.patches};
  if (opt.smp) {
    sc=opt.engineMeta||JSON.parse(readFileSync(new URL("build/hemu-smp.json",SITE),"latin1"));
    sc.ncore=opt.smp;
    mem=new WebAssembly.Memory({initial:512,maximum:8192,shared:true});
    ctrl=new SharedArrayBuffer(64);
    wasm_bytes=saved?saved.wasm:readFileSync(new URL(wasm,SITE));
    if (saved) sc.globals.g_ipi_pending=saved.meta.ipiAddr;
    for (k=1;k<opt.smp;k++) {
      ap=WorkerNew("engine/hemu-smp-worker.js",[],features);
      ap.on("error",()=>{if(opt.busProtocol===BUS_VERSION)BusStop(new Int32Array(ctrl));});
      ap.on("exit",()=>{if(opt.busProtocol===BUS_VERSION&&!h.stopping)BusStop(new Int32Array(ctrl));});
      ap.on("message",function ApMsg(m) {
        h.apMsgs.push(m);
        if(m.cmd==="error") {
          console.log("ap: "+m.msg);
          if(m.retained&&opt.pauseOnApError)h.workers[0].postMessage({cmd:"pause",value:true});
        }
      });
      ap.postMessage({cmd:"init",role:"ap",core:k,mem:mem,ctrl:ctrl,sc:sc,
	    wasmBytes:wasm_bytes,heapAbi:saved?.meta.heapAbi,busProtocol:opt.busProtocol,
        requiredBusProtocol:saved?.meta.requiredBusProtocol});
      h.workers.push(ap);
    }
    init.smp={mem:mem,ctrl:ctrl,ipiAddr:sc.globals&&sc.globals.g_ipi_pending,
	  ncore:opt.smp,busProtocol:opt.busProtocol};
    h.ctrl=new Int32Array(ctrl);
  }
  if (opt.rate!=null)
    h.workers[0].postMessage({cmd:"set",rate:opt.rate});
  if (opt.repeat!=null)
    h.workers[0].postMessage({cmd:"set",repeat:opt.repeat});
  h.workers[0].postMessage(init);
  h.Post=function Post(m) {h.workers[0].postMessage(m);};
  h.Wait=function Wait(Pred,ms) {
    return new Promise(function WaitRun(Done,Fail) {
      let tm=setTimeout(function WaitOut() {Fail(new Error("timeout"));},ms);
      h.waiters.push({Pred:Pred,Done:function WaitDone(m) {clearTimeout(tm);Done(m);}});
    });
  };
  h.Stop=async function Stop() {
    let i;
    h.stopping=true;
    if (h.ctrl)
      BusStop(h.ctrl);
    for (i=0;i<h.workers.length;i++)
      await h.workers[i].terminate();
  };
  return h;
}

export function Sleep(ms)
{
  return new Promise(function SleepRun(Done) {setTimeout(Done,ms);});
}

export async function FramesWait(h,n,ms)
{//Waits for n more frames.
  let target=h.nframes+n,t0=performance.now();
  while (h.nframes<target) {
    if (performance.now()-t0>ms)
      throw new Error("no frames");
    await Sleep(20);
  }
}

export async function ReadyWait(h,ms)
{//The worker says the guest call API is up.
  let i;
  for (i=0;i<h.msgs.length;i++)
    if (h.msgs[i].cmd=="guestReady")
      return h.msgs[i];
  return h.Wait(function IsReady(m) {return m.cmd=="guestReady";},ms);
}

export async function Measure(h,secs)
{//What the guest did over secs seconds of real time.
  let f0,f1,i,f,res,hist=new Map(),tops=new Map(),distinct=0,prev=-1,n=0,
	agree=0,t0;
  h.frames.length=0;
  await Sleep(50);
  t0=performance.now();
  await Sleep(secs*1000);
  for (i=0;i<h.frames.length;i++) {
    f=h.frames[i];
    if (f.hash!=prev)
      distinct++;
    prev=f.hash;
    if (f.probe && f.probe.fps!=null)
      hist.set(Math.round(f.probe.fps),(hist.get(Math.round(f.probe.fps))||0)+1);
    tops.set(FpsFromTop(f.top),(tops.get(FpsFromTop(f.top))||0)+1);
    if (f.msg_fps!=null) {
      n++;
      if (String(f.msg_fps)==FpsFromTop(f.top))
	agree++;
    }
  }
  f0=h.frames[0];
  f1=h.frames[h.frames.length-1];
  res={wall:(f1.t-f0.t)/1000,frames:h.frames.length,distinct:distinct,
	agree:agree,compared:n};
  res.frames_s=res.frames/res.wall;
  res.distinct_s=distinct/res.wall;
  if (f0.probe.jif!=null) {
    res.gsec=(f1.probe.jif-f0.probe.jif)/1000;
    res.clock=res.gsec/res.wall;
    res.refreshes=f1.probe.upd-f0.probe.upd;
    res.refr_gs=res.refreshes/res.gsec;
    res.refr_s=res.refreshes/res.wall;
  }
  if(f0.probe.clock_ns!=null && f1.probe.clock_ns!=null) {
    res.tsc_s=(f1.probe.clock_ns-f0.probe.clock_ns)/1e9;
    res.supplied_s=(f1.probe.clock_input_ns-f0.probe.clock_input_ns)/1e9;
    res.wall_lag_ms=res.wall*1000-res.tsc_s*1000;
    res.credit_gap_ms=[f0.probe.clock_credit_gap_ms,f1.probe.clock_credit_gap_ms];
    res.loop_ms=[f0.probe.loop_elapsed_ms,f1.probe.loop_elapsed_ms];
    res.tick_ns=[f0.probe.clock_tick_ns,f1.probe.clock_tick_ns];
  }
  res.ms_main=(f1.probe.work-f0.probe.work)/Math.max(1,f1.probe.mains-f0.probe.mains);
  res.mains_s=(f1.probe.mains-f0.probe.mains)/res.wall;
  res.fps_hist=[...hist.entries()].sort(function Cmp(a,b) {return b[1]-a[1];}).
	slice(0,12).map(function Kv(kv) {return kv[0]+":"+kv[1];}).join(" ");
  res.top_hist=[...tops.entries()].sort(function Cmp(a,b) {return b[1]-a[1];}).
	slice(0,12).map(function Kv(kv) {return kv[0]+":"+kv[1];}).join(" ");
  res.t0=t0;
  return res;
}
