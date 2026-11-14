import assert from "node:assert/strict";
import {HemuBoot,ReadyWait} from "./WorkerHost.mjs";

for(const smp of [0,4]) {
  const h=await HemuBoot({smp,busProtocol:smp?1:0,rate:60,patches:false});
  function Wait(predicate) {
    return h.msgs.find(predicate)||h.Wait(predicate,20000);
  }
  function Send(id,src,target="prompt",force=false) {
    h.Post({cmd:"osExec",id,src,target,force,name:id});
  }
  const Result=id=>Wait(m=>m.cmd==="fileResult"&&m.id===id);
  const Running=id=>Wait(m=>m.cmd==="guestResult"&&m.id===id&&m.state==="running");
  async function Done(id,src,target="adam") {
    Send(id,src,target);
    const result=await Result(id);
    assert.equal(result.ok,true,`${id}: ${result.msg}`);
  }
  try {
    assert.equal((await ReadyWait(h,20000)).ok,true);
    if(smp)await Wait(m=>m.cmd==="smpReady");
    await Done("setup","I64 exec_gate=0,exec_order=0;");
    h.Post({cmd:"__batch",messages:[
      {cmd:"osExec",id:"first",name:"first",target:"prompt",src:"while (!exec_gate) Sleep(10);exec_order=1;"},
      {cmd:"osExec",id:"pending-refused",target:"prompt",src:"throw('Entered');"}
    ]});
    const pending=await Wait(m=>m.id==="pending-refused"&&
      (m.cmd==="fileResult"||m.cmd==="guestResult"&&m.state==="posted"));
    assert.equal(pending.state,"error","submission reserves the target before TaskExe finishes");
    assert.match(pending.msg,/still running request.*first/);
    const denied=h.msgs.findIndex(m=>m.id==="pending-refused"&&m.state==="error"),
      posted=h.msgs.findIndex(m=>m.id==="first"&&m.state==="posted");
    assert.ok(posted<0||denied<posted,"refusal precedes the first TaskExe completion");
    await Running("first");
    Send("refused","throw('Entered');");
    const refused=await Result("refused");
    assert.equal(refused.ok,false);
    assert.match(refused.msg,/still running request.*force:true/);

    Send("second",`if (exec_order!=1) throw('Order');
exec_order=2;while (exec_gate<2) Sleep(10);exec_order=3;`,"prompt",true);
    const queued=await Wait(m=>m.id==="second"&&
      (m.cmd==="fileResult"||m.cmd==="guestResult"&&m.state==="posted"));
    assert.equal(queued.state,"posted",queued.msg);
    assert.equal(h.msgs.some(m=>m.id==="second"&&
      (m.cmd==="fileResult"||m.state==="running")),false,
    "force queues behind the deliberately held guest command");

    await Done("release-first","exec_gate=1;");
    assert.equal((await Result("first")).ok,true);
    await Running("second");
    Send("still-refused","throw('Entered');");
    const still=await Wait(m=>m.id==="still-refused"&&
      (m.cmd==="fileResult"||m.cmd==="guestResult"&&m.state==="posted"));
    assert.equal(still.state,"error","queued execution keeps the target busy after its predecessor exits");
    assert.match(still.msg,/still running request.*force:true/);
    Send("failed-successor","if (exec_order!=3) throw('Order');throw('ExecFail');","prompt",true);
    const failedQueued=await Wait(m=>m.id==="failed-successor"&&
      (m.cmd==="fileResult"||m.cmd==="guestResult"&&m.state==="posted"));
    assert.equal(failedQueued.state,"posted",failedQueued.msg);
    await Done("release-second","exec_gate=2;");
    assert.equal((await Result("second")).ok,true);
    const failed=await Result("failed-successor");
    assert.equal(failed.state,"failed",failed.msg);
    assert.equal(failed.except,"ExecFail");
    await Done("verify","if (exec_order!=3) throw('Order');");
    await Done("available","exec_order=4;","prompt");
    await Done("verify-final","if (exec_order!=4) throw('Order');");
    assert.ok(!h.msgs.some(m=>m.cmd==="error"));
    assert.ok(!h.apMsgs.some(m=>m.cmd==="error"));
    console.log(`${smp||1} core worker: pending/running refusal, forced queue order, successor ownership and completed/failed-target reuse pass.`);
  } catch(error) {
    console.error(h.msgs.filter(m=>["fileResult","guestResult"].includes(m.cmd)).slice(-24));
    throw error;
  } finally {await h.Stop();}
}
