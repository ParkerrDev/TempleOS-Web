import assert from "node:assert/strict";
import {HemuBoot,ReadyWait,Measure,FramesWait} from "./WorkerHost.mjs";

const h=await HemuBoot({rate:30});
try {
  assert.equal((await ReadyWait(h,20000)).ok,true);
  for (const rate of [60,120,0,30]) {
    h.Post({cmd:"set",rate});
    const applied=await h.Wait(m=>m.cmd=="settings" && m.rate==rate,5000);
    assert.equal(applied.ok,true);
    await FramesWait(h,30,5000);
    const m=await Measure(h,3);
    assert.ok(m.compared>20);
    assert.equal(m.agree,m.compared,"displayed FPS stays coherent while rate changes");
    assert.ok(m.clock>0.9 && m.clock<1.1,"clock remains real time at rate "+rate);
    console.log(JSON.stringify({rate,clock:m.clock,refreshesPerSecond:m.refr_s,
      displayedFrames:m.frames_s,fpsMatched:m.agree}));
  }
} finally {
  await h.Stop();
}
