import assert from "node:assert/strict";
import {HemuBoot,ReadyWait,Measure,FramesWait} from "./WorkerHost.mjs";

const h=await HemuBoot({rate:30});
try {
  assert.equal((await ReadyWait(h,20000)).ok,true);
  if(!h.msgs.some(m=>m.cmd==="guestPatch"&&m.state==="installed"))
    await h.Wait(m=>m.cmd==="guestPatch"&&m.state==="installed",20000);
  for (const rate of [60,120,0,30]) {
    h.Post({cmd:"set",rate,repeat:rate!=30});
    const applied=await h.Wait(m=>m.cmd=="settings" && m.rate==rate,5000);
    assert.equal(applied.ok,true);
    assert.equal(applied.repeat,rate!=30,"one acknowledgement reflects both applied settings");
    await FramesWait(h,30,5000);
    const m=await Measure(h,3);
    console.log(JSON.stringify({rate,clock:m.clock,wall:m.wall,guest:m.gsec,
      tsc:m.tsc_s,supplied:m.supplied_s,wallLagMs:m.wall_lag_ms,
      creditGapMs:m.credit_gap_ms,loopMs:m.loop_ms,tickNs:m.tick_ns,
      refreshesPerSecond:m.refr_s,displayedFrames:m.frames_s,fpsMatched:m.agree}));
    assert.ok(m.compared>20);
    assert.equal(m.agree,m.compared,"displayed FPS stays coherent while rate changes");
    assert.ok(m.clock>0.9 && m.clock<1.1,"clock remains real time at rate "+rate);
  }
} finally {
  await h.Stop();
}
