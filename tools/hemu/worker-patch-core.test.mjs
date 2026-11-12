import assert from "node:assert/strict";
import {HemuBoot,ReadyWait} from "./WorkerHost.mjs";
import {GUEST_PATCHES} from "../../engine/GuestPatch.js";
import {BUS_VERSION} from "../../engine/CoreBus.js";

//With four cores CPU 1 compiles the corrections, so core 0 keeps drawing the
//desktop the whole time; with one, core 0 compiles them and stops drawing.
function Gap(frames,t0,t1)
{//The longest wait for a frame from t0 to t1.
  let res=0,prev=t0;
  for(const f of frames)
    if(t0<f.t && f.t<=t1) {
      res=Math.max(res,f.t-prev);
      prev=f.t;
    }
  return Math.max(res,t1-prev);
}
const gaps=[];
for(const cores of [4,0]) {
  const h=await HemuBoot({smp:cores,rate:60,busProtocol:BUS_VERSION});   //as the page boots
  try {
    assert.equal((await ReadyWait(h,20000)).ok,true);
    const building=await h.Wait(m=>m.cmd==="guestPatch" && m.state==="building",60000),t0=performance.now();
    for(const patch of GUEST_PATCHES) {
      const got=h.msgs.find(m=>m.cmd==="guestPatch" && m.patch===patch)||
        await h.Wait(m=>m.cmd==="guestPatch" && m.patch===patch,60000);
      assert.equal(got.state,"installed",patch+": "+got.msg);
    }
    const t1=performance.now(),gap=Gap(h.frames,t0,t1);
    assert.equal(building.core,cores?1:0,"the corrections compile on CPU 1 when it runs");
    if(cores)assert.ok(gap<250,`core 0 drew no frame for ${gap.toFixed(0)} ms while CPU 1 compiled`);
    assert.ok(!h.msgs.some(m=>m.cmd==="error"));
    assert.ok(!h.apMsgs.some(m=>m.cmd==="error"));
    gaps.push(`${cores||1} core${cores?"s":""}: built on CPU ${building.core} in ${(t1-t0).toFixed(0)} ms, longest frame gap ${gap.toFixed(0)} ms`);
  } finally {await h.Stop();}
}
console.log("Guest patches: "+gaps.join("; ")+".");
