import assert from "node:assert/strict";
import {Worker} from "node:worker_threads";
import {once} from "node:events";
import {CaptureBarrier} from "../../engine/CoreBarrier.js";

const ctrl=new Int32Array(new SharedArrayBuffer(64)),
      b=CaptureBarrier(ctrl,2,()=>true);
Atomics.store(ctrl,5,1);
assert.equal(b.Lock(),true);
b.Unlock();
assert.equal(b.Lock(),false,"an old core acknowledgement cannot complete a new capture");
assert.equal(Atomics.load(ctrl,2),0,"timeout releases the requested barrier");

ctrl.fill(0);
const url=new URL("../../engine/CoreBarrier.js",import.meta.url).href,
      worker=new Worker(`const {parentPort,workerData}=require("node:worker_threads");
(async()=>{
  const {CaptureWait}=await import(workerData.url);
  const c=new Int32Array(workerData.ctrl);
  parentPort.postMessage("ready");
  while (!Atomics.load(c,1)) {
    if (!CaptureWait(c,1)) Atomics.add(c,8,1);
  }
})();`,{eval:true,workerData:{url,ctrl:ctrl.buffer}});
try {
  await once(worker,"message");
  for (let i=0;i<8;i++) {
    assert.equal(b.Lock(),true,"active core acknowledges capture");
    const before=Atomics.load(ctrl,8),until=performance.now()+2;
    while (performance.now()<until) {}
    assert.equal(Atomics.load(ctrl,8),before,"core writes remain stopped throughout the copy");
    b.Unlock();
  }
} finally {
  Atomics.store(ctrl,1,1);
  b.Unlock();
  await worker.terminate();
}
console.log("Capture barrier: unique acknowledgements, timeout release, stopped writes during each copy.");
