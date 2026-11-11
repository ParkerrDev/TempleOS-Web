import assert from "node:assert/strict";
import {SnapshotInspect} from "../../engine/Snapshot.js";
import {HemuBoot,Sleep,SITE} from "./WorkerHost.mjs";

async function Request(h,message,predicate,ms=30000) {
  const result=h.Wait(predicate,ms);h.Post(message);return result;
}
async function Frozen(h,cores) {
  const frames=h.nframes,generation=h.ctrl?.[2];
  await Sleep(200);
  assert.equal(h.nframes,frames,"paused guest emits no later frame");
  if(cores) {
    assert.ok(generation>0,"application cores remain behind the pause barrier");
    assert.equal(h.ctrl[2],generation,"patch installation must not release a held barrier");
    for(let i=1;i<cores;i++)assert.equal(h.ctrl[4+i],generation);
  }
}
for(const cores of [0,4]) {
  const path="engine/patches/DocClip.HC",url=new URL(path,SITE).href,
    h=await HemuBoot({smp:cores,rate:30,fetchHold:[path]});
  try {
    await h.Wait(m=>m.cmd==="__fetchHeld" && m.url===url,30000);
    await Request(h,{cmd:"pause",value:true},m=>m.cmd==="paused" && m.value);
    const released=await Request(h,{cmd:"__fetchRelease",url},m=>m.cmd==="__fetchReleased");
    assert.equal(released.count,1,"the source request was held until pause completed");
    await Frozen(h,cores);
    assert.ok(!h.msgs.some(m=>m.cmd==="guestPatch" && m.state==="building"),
      "source fetch completion cannot inject a guest call while paused");
    const fetched=await Request(h,{cmd:"exportSnapshot"},m=>m.cmd==="exportResult");
    assert.equal(fetched.ok,false);assert.match(fetched.msg,/Resume TempleOS.*then save again/);
    assert.ok(!h.msgs.some(m=>m.cmd==="guestPatch" && m.state==="building"),
      "snapshot export cannot start native compilation while paused");
    const building=h.Wait(m=>m.cmd==="guestPatch" && m.state==="building",30000);
    await Request(h,{cmd:"pause",value:false},m=>m.cmd==="paused" && !m.value);
    await building;
    await Request(h,{cmd:"pause",value:true},m=>m.cmd==="paused" && m.value);
    const early=await Request(h,{cmd:"exportSnapshot"},m=>m.cmd==="exportResult");
    assert.equal(early.ok,false,"unfinished native compilation cannot be serialized as a completed patch");
    assert.match(early.msg,/Resume TempleOS.*then save again/);
    await Frozen(h,cores);

    const done=h.Wait(m=>m.cmd==="guestResult" && m.name==="Document sprite clipping" && m.state==="done",30000);
    await Request(h,{cmd:"pause",value:false},m=>m.cmd==="paused" && !m.value);
    await done;
    //The job's Promise resolves after the frame's DocClip.Tick. Pause before
    //the next CPU frame: finishing its host controller must not run the guest.
    await Request(h,{cmd:"pause",value:true},m=>m.cmd==="paused" && m.value);
    assert.ok(h.msgs.some(m=>m.cmd==="guestPatch" && m.state==="installed"));
    await Frozen(h,cores);
    const saved=await Request(h,{cmd:"exportSnapshot"},m=>m.cmd==="exportResult",60000);
    assert.equal(saved.ok,true,saved.msg);
    assert.deepEqual((await SnapshotInspect(saved.buf)).meta.guestPatches,["doc-sprite-clip-v1"]);
    await Frozen(h,cores);
    assert.ok(!h.msgs.some(m=>m.cmd==="error"));
    console.log(`${cores||1} core patch pause: unfinished build gives a resume instruction; completed build installs and saves without releasing stopped CPUs.`);
  } finally {await h.Stop();}
}
