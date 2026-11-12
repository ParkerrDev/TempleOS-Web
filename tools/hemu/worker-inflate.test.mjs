import assert from "node:assert/strict";
import {HemuBoot,ReadyWait} from "./WorkerHost.mjs";
import {BUS_VERSION} from "../../engine/CoreBus.js";

//With threads and shared memory the engine worker inflates the stock RAM in
//parts at once and copies only what they wrote; without them (Safari) it
//inflates it whole. Both boot to the desktop.
const res=[];
for(const cores of [0,4])
  for(const webWorker of [true,false]) {
    const h=await HemuBoot({smp:cores,rate:60,webWorker,...(cores?{busProtocol:BUS_VERSION}:{})});
    try {
      const ram=await h.Wait(m=>m.cmd==="ramReady",30000);
      assert.equal((await ReadyWait(h,20000)).ok,true);
      await h.Wait(m=>m.cmd==="guestPatch" && m.state==="installed",60000);
      if(webWorker)assert.ok(ram.parts>1,"the RAM inflates in parts where threads run");
      else assert.equal(ram.parts,1);
      const top=h.last.top;
      assert.match(top,/FPS:? *[0-9]+ Mem:/,"the desktop draws its status line");
      assert.ok(!h.msgs.some(m=>m.cmd==="error"));
      res.push(`${cores||1} core${cores?"s":""} ${webWorker?"with":"without"} threads: ${ram.parts} part${ram.parts>1?"s":""} in ${ram.ms} ms`);
    } finally {await h.Stop();}
  }
console.log("Stock RAM: "+res.join("; ")+".");
