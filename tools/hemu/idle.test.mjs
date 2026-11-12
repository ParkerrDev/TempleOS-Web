import assert from "node:assert/strict";
import {Worker} from "node:worker_threads";
import {once} from "node:events";
import {readFileSync} from "node:fs";
import {CaptureBarrier} from "../../engine/CoreBarrier.js";
import {HemuBoot,ReadyWait,FramesWait} from "./WorkerHost.mjs";

const ctrl=new Int32Array(new SharedArrayBuffer(64)),barrier=CaptureBarrier(ctrl,2,()=>true),
  worker=new Worker(`const {parentPort,workerData}=require("node:worker_threads");
parentPort.on("message",()=>{});
(async()=>{
  const {CaptureWait}=await import(workerData.url),ctrl=new Int32Array(workerData.ctrl);
  while(!Atomics.load(ctrl,1)) {
    Atomics.add(ctrl,8,1);
    const ticket=Atomics.waitAsync(ctrl,2,0,10000);
    if(!ticket.async)throw Error("Capture must be released before parking");
    parentPort.postMessage({parked:true,writes:Atomics.load(ctrl,8)});
    if(await ticket.value!=="ok")throw Error("Idle core was not notified");
    if(!Atomics.load(ctrl,1)&&!CaptureWait(ctrl,1))throw Error("Wake lost its capture generation");
  }
})().catch(error=>{throw error;});`,{eval:true,workerData:{
    url:new URL("../../engine/CoreBarrier.js",import.meta.url).href,ctrl:ctrl.buffer}});
try {
  let [ready]=await once(worker,"message");
  for(let i=0;i<8;i++) {
    assert.equal(ready.parked,true);
    assert.equal(barrier.Lock(),true,"A parked idle core acknowledges capture before its timeout");
    assert.equal(Atomics.load(ctrl,5),i+1);
    assert.equal(Atomics.load(ctrl,8),ready.writes,"Capture retains the final published writes");
    const next=once(worker,"message");
    barrier.Unlock();[ready]=await next;
    assert.equal(ready.writes,i+2);
  }
} finally {
  Atomics.store(ctrl,1,1);Atomics.notify(ctrl,2);
  barrier.Unlock();await worker.terminate();
}

let id=0;
function Ping(worker)
{
  const request=++id;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{
      worker.off("message",receive);
      reject(new Error("Idle application core did not yield to its event loop"));
    },3000);
    function receive(message) {
      if(message.cmd!=="__ping"||message.id!==request)return;
      clearTimeout(timer);worker.off("message",receive);resolve(message);
    }
    worker.on("message",receive);worker.postMessage({cmd:"__ping",id:request});
  });
}
const Request=(h,message,predicate)=>{
  const done=h.Wait(predicate,30000);h.Post(message);return done;
};
for(const waitAsync of [true,false]) {
  const h=await HemuBoot({smp:4,busProtocol:1,rate:60,patches:false,keep:2,
    waitAsync,idleProbe:true});
  try {
    assert.equal((await ReadyWait(h,20000)).ok,true);
    if(!h.msgs.some(m=>m.cmd==="smpReady"))await h.Wait(m=>m.cmd==="smpReady",10000);
    await FramesWait(h,2,10000);
    async function Responsive() {
      for(const result of await Promise.all(h.workers.slice(1).map(Ping))) {
        assert.equal(result.waitAsync,waitAsync);
        assert.ok(result.idleRuns>0,"Each real application core reached an idle RunCore boundary");
      }
    }
    await Responsive();
    const result=await Request(h,{cmd:"osExec",id:"idle-tasks",target:"adam",
      src:readFileSync(new URL("./BusGuest.HC",import.meta.url),"latin1")},
      m=>m.cmd==="fileResult"&&m.id==="idle-tasks");
    assert.equal(result.ok,true,result.msg);
    await Request(h,{cmd:"pause",value:true},m=>m.cmd==="paused"&&m.value);
    await Request(h,{cmd:"pause",value:false},m=>m.cmd==="paused"&&!m.value);
    await Responsive();
    assert.ok(!h.apMsgs.some(m=>m.cmd==="error"));
    assert.ok(!h.msgs.some(m=>m.cmd==="error"));
  } finally {await h.Stop();}
}
console.log("Eight parked capture generations retain published writes; real four-core execution, event-loop responsiveness and pause/resume pass with asynchronous waits and the timer fallback.");
