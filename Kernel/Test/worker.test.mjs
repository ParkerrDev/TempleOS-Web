import assert from "node:assert/strict";
import {HemuBoot,ReadyWait,Measure,Sleep} from "./WorkerHost.mjs";

for (const smp of [0,4]) {
  const h=await HemuBoot({smp,rate:30});
  try {
    assert.equal((await ReadyWait(h,20000)).ok,true);
    if (smp && !h.msgs.some(m=>m.cmd=="smpReady"))
      await h.Wait(m=>m.cmd=="smpReady",10000);
    const m=await Measure(h,5);
    assert.ok(m.frames>40,"the real worker produces completed frames");
    assert.equal(m.agree,m.compared,"every reported FPS matches the independent font reader");
    assert.ok(m.compared>40,"the desktop FPS stays readable");
    assert.ok(m.clock>0.9 && m.clock<1.1,"guest clock follows elapsed host time: "+m.clock);
    assert.ok(m.refr_gs>24 && m.refr_gs<36,"stock guest refresh remains near 30 Hz: "+m.refr_gs);
    h.Post({cmd:"pause",value:true});
    await h.Wait(v=>v.cmd=="paused" && v.value,2000);
    await Sleep(100);
    const n=h.nframes;
    await Sleep(150);
    assert.equal(h.nframes,n,"pause sends no replacement frames or invented FPS");
    assert.ok(!h.msgs.some(v=>v.cmd=="error"));
    console.log(JSON.stringify({cores:smp||1,frames:m.frames,fpsMatched:m.agree,
      clock:m.clock,refreshesPerGuestSecond:m.refr_gs}));
  } finally {
    await h.Stop();
  }
}
