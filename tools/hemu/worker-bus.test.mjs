import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Worker} from "node:worker_threads";
import {HemuBoot,ReadyWait} from "./WorkerHost.mjs";
import {SnapshotInspect} from "../../engine/Snapshot.js";

const Request=(h,m,p,ms=30000)=>{const wait=h.Wait(p,ms);h.Post(m);return wait;};
let h;
try {
  h=await HemuBoot({smp:4,busProtocol:1,rate:60,patches:false});
  assert.equal((await ReadyWait(h,20000)).ok,true);
  const ready=h.msgs.find(m=>m.cmd==="busReady")||await h.Wait(m=>m.cmd==="busReady",10000);
  assert.deepEqual(ready,{cmd:"busReady",version:1,ready:true});
  if(!h.msgs.some(m=>m.cmd==="smpReady"))await h.Wait(m=>m.cmd==="smpReady",10000);
  if(!h.msgs.some(m=>m.cmd==="diskInfo"&&m.ok))await h.Wait(m=>m.cmd==="diskInfo"&&m.ok,30000);
  const result=await Request(h,{cmd:"osExec",id:"wide",target:"adam",
    src:readFileSync(new URL("./BusGuest.HC",import.meta.url),"latin1")},m=>m.cmd==="fileResult"&&m.id==="wide");
  assert.equal(result.ok,true,result.msg);
  assert.ok(!h.apMsgs.some(m=>m.cmd==="error"));
  await Request(h,{cmd:"pause",value:true},m=>m.cmd==="paused"&&m.value);
  const saved=await Request(h,{cmd:"exportSnapshot"},m=>m.cmd==="exportResult",60000);
  assert.equal(saved.ok,true,saved.msg);
  assert.equal((await SnapshotInspect(saved.buf,{busProtocol:1})).meta.requiredBusProtocol,1);
  await h.Stop();h=null;
  await assert.rejects(()=>HemuBoot({snapshot:saved.buf}),/requires shared RAM protocol 1/);
  for(const core of [0,1]) {
    const memory=new WebAssembly.Memory({initial:512,maximum:8192,shared:true}),
      ctrl=new SharedArrayBuffer(64),sentinel=new Uint8Array(memory.buffer),
      url=new URL(core?"../../engine/hemu-smp-worker.js":"../../engine/hemu-worker.js",import.meta.url),
      worker=new Worker(new URL("./WorkerShim.mjs",import.meta.url),{workerData:{url:url.href}});
    sentinel[0]=0xA5;sentinel[sentinel.length-1]=0x5A;
    try {
      const error=new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error("missing early refusal")),10000);
        worker.on("message",m=>{if(m.cmd==="error"){clearTimeout(timer);resolve(m);}});
      });
      worker.postMessage(core?{cmd:"init",core,mem:memory,ctrl,requiredBusProtocol:1,sc:{ncore:4}}:
        {cmd:"init",gz:saved.buf,smp:{mem:memory,ctrl,ncore:4}});
      assert.match((await error).msg,/requires shared RAM protocol 1/);
      assert.equal(memory.buffer.byteLength,sentinel.length);
      assert.equal(sentinel[0],0xA5);assert.equal(sentinel[sentinel.length-1],0x5A);
      assert.equal(sentinel.subarray(1,-1).some(v=>v!==0),false,"refusal precedes WASM initialization");
      assert.equal(new Int32Array(ctrl).some(v=>v!==0),false);
    } finally {await worker.terminate();}
  }
  console.log("Four real TempleOS tasks complete 1,024 split LOCK INC operations; the version-2 save refuses an uncoordinated controller, BSP and AP before memory/control mutation.");
} finally {await h?.Stop();}
