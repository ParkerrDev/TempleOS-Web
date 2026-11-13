import assert from "node:assert/strict";
import {HemuBoot,ReadyWait,FramesWait,TextRow} from "./WorkerHost.mjs";

for(const cores of [1,4]) {
  const h=await HemuBoot({smp:cores===4?4:0,keep_buf:true});
  try {
    assert.equal((await ReadyWait(h,20000)).ok,true);
    const patched=m=>m.cmd==="guestPatch"&&m.state==="installed";
    if(!h.msgs.some(patched))await h.Wait(patched,20000);
    await FramesWait(h,30,10000);
    const text=Array.from({length:60},(_,row)=>TextRow(h.last.buf,640,row)).join("\n");
    assert.doesNotMatch(text,/Welcome to TempleOS/);
    assert.equal(h.msgs.some(m=>m.name==="Welcome"),false);
    assert.equal(h.msgs.some(m=>m.cmd==="error"),false);
    console.log(`${cores} cores: installed desktop resumes without an automatic Welcome popup.`);
  } finally {await h.Stop();}
}
