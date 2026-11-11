import assert from "node:assert/strict";
import {HemuBoot,ReadyWait,FramesWait,TextRow} from "./WorkerHost.mjs";

const h=await HemuBoot({welcome:true,keep_buf:true});
try {
  assert.equal((await ReadyWait(h,20000)).ok,true);
  const done=m=>m.cmd=="guestResult" && m.name=="Welcome" && ["done","failed","error"].includes(m.state);
  const event=h.msgs.find(done)||await h.Wait(done,20000);
  assert.equal(event.state,"done",JSON.stringify(event));
  const start=performance.now();
  let text="";
  while (!text.includes("Welcome to TempleOS") && performance.now()-start<10000) {
    await FramesWait(h,8,5000);
    text=Array.from({length:60},(_,row)=>TextRow(h.last.buf,640,row)).join("\n");
  }
  assert.match(text,/Welcome to TempleOS/,"the native Welcome document is on screen");
  assert.equal(h.msgs.filter(m=>done(m) && m.state=="done").length,1,"stock welcome opens once");
  console.log("Welcome: stock boot opens the real Doc/Welcome.DD once through a native popup job.");
} finally {
  await h.Stop();
}
