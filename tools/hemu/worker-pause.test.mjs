import assert from "node:assert/strict";
import {HemuBoot,ReadyWait,Sleep} from "./WorkerHost.mjs";

const h=await HemuBoot({smp:0,rate:30,keep_buf:true});
try {
  await ReadyWait(h,20000);
  h.ack=false;await Sleep(150);
  const n=h.nframes,hash=h.last.hash;
  await Sleep(1200);
  assert.equal(h.nframes,n,"presentation stops at the two-frame flow-control limit");
  const paused=h.Wait(m=>m.cmd==="paused"&&m.value,2000);
  h.Post({cmd:"pause",value:true});await paused;
  assert.equal(h.nframes,n+1,"pause sends the newest completed frame despite presentation backpressure");
  assert.notEqual(h.last.hash,hash,"the frozen page advances to the actual current OS screen");
  await Sleep(150);assert.equal(h.nframes,n+1,"no frames follow the paused acknowledgement");
  assert.ok(!h.msgs.some(m=>m.cmd==="error"));
  console.log("Pause: the displayed frame reaches the saved CPU's completed screen even when two older frames remain unacknowledged.");
} finally {await h.Stop();}
