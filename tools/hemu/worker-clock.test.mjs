import assert from "node:assert/strict";
import {HemuBoot,ReadyWait,FramesWait,Sleep} from "./WorkerHost.mjs";

const h=await HemuBoot({rate:60});
async function Request(msg,predicate=m=>m.cmd===msg.cmd) {
  const result=h.Wait(predicate,5000);h.Post(msg);return result;
}
const Peek=async()=>(await Request({cmd:"__peek"})).probe;
try {
  assert.equal((await ReadyWait(h,20000)).ok,true);
  if(!h.msgs.some(m=>m.cmd==="guestPatch"&&m.state==="installed"))
    await h.Wait(m=>m.cmd==="guestPatch"&&m.state==="installed",20000);
  await FramesWait(h,40,5000);
  const stalled=await Request({cmd:"__stall",ms:450});
  assert.equal(stalled.after.clock_ns,stalled.before.clock_ns,"a stalled worker executes no guest time");
  assert.ok(stalled.after.t-stalled.before.t>=440);
  await Sleep(450);
  const recovered=await Peek(),wall=recovered.t-stalled.before.t,
        clock=(recovered.clock_ns-stalled.before.clock_ns)/1e6,
        guest=recovered.jif-stalled.before.jif;
  console.log(JSON.stringify({wall,clock,guest,lag:wall-clock}));
  assert.ok(Math.abs(wall-clock)<80,"all active wall time survives the 100 ms per-step limit");
  assert.ok(Math.abs(wall-guest)<90,"the guest PIT clock recovers after the stall");

  await Request({cmd:"pause",value:true},m=>m.cmd==="paused"&&m.value);
  const paused=await Peek();
  await Request({cmd:"__stall",ms:350});await Sleep(150);
  const frozen=await Peek();
  assert.equal(frozen.clock_ns,paused.clock_ns,"paused wall time is excluded");
  assert.equal(frozen.jif,paused.jif);
  await Request({cmd:"pause",value:false},m=>m.cmd==="paused"&&!m.value);
  const resumed=await Peek();await Sleep(300);const running=await Peek();
  const active=running.t-resumed.t,elapsed=(running.clock_ns-resumed.clock_ns)/1e6;
  assert.ok(elapsed>0&&Math.abs(active-elapsed)<100,"resume does not catch up paused wall time");
  assert.ok(!h.msgs.some(m=>m.cmd==="error"));
  console.log("Worker clock: a 450 ms active stall is conserved; paused stalls remain frozen and do not catch up on resume.");
} finally {await h.Stop();}
