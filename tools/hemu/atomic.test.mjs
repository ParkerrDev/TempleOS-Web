import assert from "node:assert/strict";
import {Worker,isMainThread,workerData,parentPort} from "node:worker_threads";
import {compileHolyC} from "../../holyc-wasm/src/compiler.js";
import {createHemuHost} from "../../engine/host.js";

const address=0x2000000,count=1000000;
if(!isMainThread) {
  const {bytes,mem,id}=workerData,host=createHemuHost();
  host.env.mem=mem;
  const {instance}=await WebAssembly.instantiate(bytes,{env:host.env});
  instance.exports.__sp.value=BigInt(0x1000000-id*0x100000);
  host.attach(instance);
  parentPort.once("message",()=>{
    instance.exports.Add();parentPort.postMessage("done");
  });
  parentPort.postMessage("ready");
} else {
  const result=compileHolyC(`U0 Add() {I64 i;for (i=0;i<${count};i++) __a_add64(${address},1);}`,{
    filename:"Atomic.HC",lenient:false,sharedMemory:true,exports:["Add"]
  }),mem=new WebAssembly.Memory({initial:1024,maximum:8192,shared:true}),
    workers=[0,1,2,3].map(id=>new Worker(new URL(import.meta.url),{workerData:{bytes:result.bytes,mem,id}}));
  function Wait(worker,message) {
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{Cleanup();reject(new Error("Worker timed out: "+message));},30000),
        receive=value=>{if(value===message){Cleanup();resolve();}},
        error=err=>{Cleanup();reject(err);},
        exit=code=>error(new Error("Worker exited before "+message+": "+code));
      function Cleanup(){clearTimeout(timer);worker.off("message",receive);worker.off("error",error);worker.off("exit",exit);}
      worker.on("message",receive);worker.once("error",error);worker.once("exit",exit);
    });
  }
  try {
    assert.deepEqual(result.warnings,[]);
    await Promise.all(workers.map(w=>Wait(w,"ready")));
    const done=Promise.all(workers.map(w=>Wait(w,"done")));
    workers.forEach(w=>w.postMessage("go"));await done;
    assert.equal(new DataView(mem.buffer).getBigUint64(address,true),BigInt(workers.length*count));
    console.log("Four real workers retain every shared atomic increment.");
  } finally {await Promise.all(workers.map(w=>w.terminate()));}
}
