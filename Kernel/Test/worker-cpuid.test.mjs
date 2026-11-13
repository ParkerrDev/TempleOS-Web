import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {HemuBoot,ReadyWait} from "./WorkerHost.mjs";
const source=readFileSync(new URL("./CpuIdGuest.HC",import.meta.url),"latin1"),
  Request=(h,msg,pred,ms=30000)=>{const result=h.Wait(pred,ms);h.Post(msg);return result;};
async function Check(h,id,src) {
  const result=await Request(h,{cmd:"osExec",id,src,target:"adam"},m=>m.cmd==="fileResult"&&m.id===id);
  assert.equal(result.ok,true,result.msg);
}
for(const smp of [0,4]) {
  let h=await HemuBoot({smp,busProtocol:1,rate:60,patches:false});
  try {
    assert.equal((await ReadyWait(h,20000)).ok,true);
    if(smp&&!h.msgs.some(m=>m.cmd==="smpReady"))await h.Wait(m=>m.cmd==="smpReady",10000);
    await Check(h,"before",source);
    if(!h.msgs.some(m=>m.cmd==="diskInfo"&&m.ok))await h.Wait(m=>m.cmd==="diskInfo"&&m.ok,30000);
    await Request(h,{cmd:"pause",value:true},m=>m.cmd==="paused"&&m.value);
    const saved=await Request(h,{cmd:"exportSnapshot"},m=>m.cmd==="exportResult",60000);
    assert.equal(saved.ok,true,saved.msg);
    await h.Stop();h=await HemuBoot({snapshot:saved.buf,busProtocol:1,patches:false});
    await h.Wait(m=>m.cmd==="restored",30000);
    await Request(h,{cmd:"pause",value:false},m=>m.cmd==="paused"&&!m.value);
    await Check(h,"after","CpuIdGuest;");
    assert.ok(!h.msgs.some(m=>m.cmd==="error"));
    assert.ok(!h.apMsgs.some(m=>m.cmd==="error"));
    console.log(`${smp||1} core stock TempleOS CPUId consumers retain vendor, capabilities and per-core topology after full-machine restore.`);
  } finally {await h.Stop();}
}
