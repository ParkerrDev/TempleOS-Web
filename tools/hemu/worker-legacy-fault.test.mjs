import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {SnapshotInspect} from "../../engine/Snapshot.js";
import {HemuBoot,ReadyWait,FramesWait,Sleep} from "./WorkerHost.mjs";
import {LegacySnapshot} from "./LegacySnapshot.mjs";
const fixture=new URL("./fixtures/legacy-smp.wasm",import.meta.url),bytes=readFileSync(fixture),
  meta=JSON.parse(readFileSync(new URL("./fixtures/legacy-smp.json",import.meta.url))),
  Hash=data=>createHash("sha256").update(data).digest("hex"),
  Request=(h,m,p,ms=30000)=>{const waiting=h.Wait(p,ms);h.Post(m);return waiting;};
const busProtocol=process.env.HEMU_BUS_PROTOCOL?Number(process.env.HEMU_BUS_PROTOCOL):undefined;
assert.equal(Hash(bytes),meta.sha256);
assert.ok(!WebAssembly.Module.exports(new WebAssembly.Module(bytes)).some(x=>x.name==="CpuFault"));
let h;
try {
  h=await HemuBoot({snapshot:await LegacySnapshot(),busProtocol,patches:false});
  assert.equal((await ReadyWait(h,20000)).ok,true);
  if(!h.msgs.some(m=>m.cmd==="restored"))await h.Wait(m=>m.cmd==="restored",30000);
  await Request(h,{cmd:"pause",value:false},m=>m.cmd==="paused"&&!m.value);
  await FramesWait(h,40,15000);
  await Request(h,{cmd:"pause",value:true},m=>m.cmd==="paused"&&m.value);
  const saved=await Request(h,{cmd:"exportSnapshot"},m=>m.cmd==="exportResult",60000);
  assert.equal(saved.ok,true,saved.msg);
  const info=await SnapshotInspect(saved.buf);
  assert.equal(info.meta.cores,4);assert.equal(info.meta.heapAbi,meta.heapAbi);
  assert.equal(info.meta.version,1,"legacy engines retain their version 1 envelope");
  assert.equal(info.meta.requiredBusProtocol,undefined,"a nonpolling engine cannot acquire exclusive ownership");
  if(busProtocol)assert.deepEqual(h.msgs.find(m=>m.cmd==="busReady"),{cmd:"busReady",version:1,ready:false});
  assert.equal(Hash(info.wasm),meta.sha256,"the full save embeds the actual historical engine");
  await h.Stop();h=null;

  h=await HemuBoot({snapshot:saved.buf,busProtocol,pauseOnApError:true});
  await h.Wait(m=>m.cmd==="restored",30000);
  await Request(h,{cmd:"pause",value:false},m=>m.cmd==="paused"&&!m.value);
  const paused=h.Wait(m=>m.cmd==="paused"&&m.value,20000),
    submitted=Request(h,{cmd:"osExec",id:"fault",target:"adam",src:`
U0 LegacyFaultTask()
{
  Sleep(200);
  asm {
    DU8 0x0F,0x0B;
  }
}
Spawn(&LegacyFaultTask,,,1);
`},m=>m.cmd==="fileResult"&&m.id==="fault",15000);
  const [result]=await Promise.all([submitted,paused]);
  assert.equal(result.ok,true,result.msg);
  const ap=h.apMsgs.find(m=>m.cmd==="error");
  assert.ok(ap);assert.equal(ap.retained,true);assert.equal(ap.core,1);
  assert.match(ap.msg,/CPU 1 stopped after an unsupported instruction.*Restore a working snapshot/);
  await Sleep(100);
  const first=await Request(h,{cmd:"__peek"},m=>m.cmd==="__peek"),frames=h.nframes;
  assert.equal(first.fault,null,"the restored engine really predates CpuFault");
  await Sleep(250);
  const second=await Request(h,{cmd:"__peek"},m=>m.cmd==="__peek");
  assert.deepEqual(second.cpu,first.cpu);assert.equal(h.nframes,frames);
  const generation=Atomics.load(h.ctrl,2);assert.ok(generation>0);
  for(let core=1;core<4;core++)assert.equal(Atomics.load(h.ctrl,4+core),generation);
  assert.equal(h.apMsgs.filter(m=>m.cmd==="error").length,1,"an AP fault is reported only once");
  console.log(`Legacy four-core full save embeds ${meta.engineRef.slice(0,7)}: native UD2 produces a retained AP error, page-style pause holds all cores and preserves stopped frames/state.`);
} finally {await h?.Stop();}
