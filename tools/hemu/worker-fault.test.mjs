import assert from "node:assert/strict";
import {HemuBoot,ReadyWait,Sleep} from "./WorkerHost.mjs";
const Request=(h,m,p,ms=10000)=>{const waiting=h.Wait(p,ms);h.Post(m);return waiting;};
for(const smp of [0,4]) {
  const h=await HemuBoot({smp,rate:30}),core=smp?1:0;
  try {
    assert.equal((await ReadyWait(h,20000)).ok,true);
    if(smp&&!h.msgs.some(m=>m.cmd==="smpReady"))await h.Wait(m=>m.cmd==="smpReady",10000);
    const patch=m=>m.cmd==="guestPatch"&&["installed","failed"].includes(m.state);
    const patchResult=h.msgs.find(patch)||await h.Wait(patch,30000);
    assert.equal(patchResult.state,"installed",patchResult.msg);
    const failed=h.Wait(m=>m.cmd==="error"&&m.msg.includes(`CPU ${core} stopped`),20000),
      paused=h.Wait(m=>m.cmd==="paused"&&m.value,20000);
    const launched=h.Wait(m=>m.cmd==="fileResult"&&m.id==="fault",15000);
    h.Post({cmd:"osExec",id:"fault",target:"adam",src:`
U0 FaultTask()
{
  Sleep(200);
  asm {
    DU8 0xD9,0xD1;
  }
}
Spawn(&FaultTask,,,${smp?1:-1});
`});
    const [submitted,error]=await Promise.all([launched,failed,paused]);
    assert.equal(submitted.ok,true,JSON.stringify(submitted));
    assert.equal(error.retained,true);assert.equal(error.paused,true);
    assert.match(error.msg,/unsupported instruction.*Restore a working snapshot or restart TempleOS/);
    await Sleep(100);
    const first=await Request(h,{cmd:"__peek"},m=>m.cmd==="__peek"),frames=h.nframes;
    await Sleep(250);
    const second=await Request(h,{cmd:"__peek"},m=>m.cmd==="__peek");
    assert.equal(first.fault,String(core*256+2));
    assert.equal(second.fault,first.fault);assert.equal(second.faultPc,first.faultPc);
    assert.deepEqual(second.cpu,first.cpu,"a fault freezes core zero too");
    assert.equal(h.nframes,frames,"a stopped machine produces no replacement frames");
    if(smp) {
      const generation=Atomics.load(h.ctrl,2);assert.ok(generation>0);
      for(let k=1;k<4;k++)assert.equal(Atomics.load(h.ctrl,4+k),generation,"every AP remains in the held barrier");
    }
    console.log(`${smp||1}-core worker: native unsupported instruction on core ${core} stops all cores with an actionable error.`);
  } catch(err) {console.log(JSON.stringify(h.msgs.slice(-8)));throw err;}
  finally {await h.Stop();}
}
