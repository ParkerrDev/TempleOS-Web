import assert from "node:assert/strict";
import * as runtime from "../../holyc-wasm/src/runtime/host.js";
import {compileHemu} from "../../engine/compile.js";
import {gunzipSync} from "node:zlib";
import {makeDisk,fat32Read} from "../../engine/qcow2.js";
import {SnapshotInspect} from "../../engine/Snapshot.js";
import {HemuBoot,ReadyWait,Sleep} from "./WorkerHost.mjs";

async function Request(h,m,pred,ms=30000) {
  const waiting=h.Wait(pred,ms);h.Post(m);return waiting;
}
const Result=(h,m)=>Request(h,m,v=>v.cmd==="fileResult"&&v.id===m.id);
const busProtocol=process.env.HEMU_BUS_PROTOCOL?Number(process.env.HEMU_BUS_PROTOCOL):undefined;

for (const smp of [0,4]) {
  const compiled=compileHemu({smp:!!smp}),addr=n=>Number(compiled.globals.get(n).addr);
  const ranges=[[addr("g_cpu_st"),addr("g_ncore")-addr("g_cpu_st")],
    [addr("g_xmm_lo"),1024],[addr("tsc"),16],[addr("kbd_q"),512],[addr("vga_dac"),768]];
  let h=await HemuBoot({smp,busProtocol,rate:120,repeat:true,keep_buf:true}),saved;
  try {
    assert.equal((await ReadyWait(h,20000)).ok,true);
    if (!h.msgs.some(m=>m.cmd==="diskInfo"&&m.ok)) await h.Wait(m=>m.cmd==="diskInfo"&&m.ok,30000);
    if (smp && !h.msgs.some(m=>m.cmd==="smpReady")) await h.Wait(m=>m.cmd==="smpReady",10000);
    const patch=m=>m.cmd==="guestPatch" && ["installed","failed"].includes(m.state);
    const patched=h.msgs.find(patch)||await h.Wait(patch,30000);
    assert.equal(patched.state,"installed",patched.msg);
    const write=await Result(h,{cmd:"osWrite",id:"write",path:"C:/Home/SnapshotCheck.TXT",bytes:new TextEncoder().encode("complete machine disk\n")});
    assert.equal(write.ok,true,write.msg);
    const launch=await Result(h,{cmd:"osLaunch",id:"game",name:"Snapshot loop",src:'while (TRUE) {Refresh;Sleep(10);}'});
    assert.equal(launch.ok,true,launch.msg);await Sleep(400);
    await Request(h,{cmd:"pause",value:true},m=>m.cmd==="paused"&&m.value);
    const before=await Request(h,{cmd:"__peek",ranges},m=>m.cmd==="__peek");
    const frame=h.last.hash,palette=h.palette.slice();
    assert.ok(palette.every(v=>v!==null),"boot publishes every displayed palette entry");
    const diskSave=await Request(h,{cmd:"exportDisk"},m=>m.cmd==="exportResult",60000);
    assert.equal(diskSave.ok,true,diskSave.msg);
    const exported=makeDisk(gunzipSync(diskSave.buf));
    assert.equal(new TextDecoder().decode(fat32Read(exported,"Home","SnapshotCheck.TXT")),"complete machine disk\n");
    const diskAfter=await Request(h,{cmd:"__peek",ranges},m=>m.cmd==="__peek");
    assert.deepEqual(diskAfter.ranges,before.ranges,"disk export freezes every core and device too");
    saved=await Request(h,{cmd:"exportSnapshot"},m=>m.cmd==="exportResult",60000);
    assert.equal(saved.ok,true,saved.msg);
    const after=await Request(h,{cmd:"__peek",ranges},m=>m.cmd==="__peek");
    assert.deepEqual(after.ranges,before.ranges,"saving freezes every CPU and device");
    await h.Stop();h=null;
    const head=await SnapshotInspect(saved.buf,{busProtocol});
    assert.equal(head.meta.heapAbi,runtime.HOST_HEAP_ABI??0);
    assert.deepEqual(head.meta.guestPatches,["doc-sprite-clip-v1"]);
    assert.equal(head.meta.cores,smp||1);assert.equal(head.meta.rate,120);
    assert.equal(head.meta.requiredBusProtocol,smp?busProtocol:undefined);
    assert.equal(head.meta.version,smp&&busProtocol?2:1);
    assert.equal(head.meta.repeat,true);assert.equal(head.meta.launch.name,"Snapshot loop");
    h=await HemuBoot({snapshot:saved.buf,busProtocol,keep_buf:true});
    await h.Wait(m=>m.cmd==="restored",30000);
    assert.ok(h.msgs.some(m=>m.cmd==="guestReady"&&m.restored&&m.diskReady&&!m.diskPending));
    const resumed=await Request(h,{cmd:"__peek",ranges},m=>m.cmd==="__peek");
    assert.deepEqual(resumed.ranges,before.ranges,"CPU, x87, SSE, clock, keyboard and palette restore exactly");
    assert.deepEqual(h.palette,palette,"restored palette produces the same RGB pixels as the original frame");
    assert.equal(h.last.hash,frame,"paused restore presents the same completed frame");
    assert.deepEqual(resumed.cpu,before.cpu,"CPU counters, RIP, flags and injected-call status resume");
    const n=h.nframes;await Sleep(150);assert.equal(h.nframes,n,"restored pause freezes all cores");
    await Request(h,{cmd:"pause",value:false},m=>m.cmd==="paused"&&!m.value);
    const patchRead=await Result(h,{cmd:"osExec",id:"patch-read",target:"adam",src:"if (doc_clip_revision!=1) throw('DocPatch');"});
    assert.equal(patchRead.ok,true,patchRead.msg);
    const busy=await Result(h,{cmd:"osLaunch",id:"busy",name:"Second game",src:"1;"});
    assert.equal(busy.ok,false);assert.match(busy.msg,/busy/);
    const read=await Result(h,{cmd:"osExec",id:"read",target:"adam",src:'I64 n;U8 *p=FileRead("C:/Home/SnapshotCheck.TXT",&n);if (!p || n!=22 || StrCmp(p,"complete machine disk\\n")) throw(\'Snapshot\');Free(p);'});
    assert.equal(read.ok,true,read.msg);
    const settings=await Request(h,{cmd:"set",rate:30,repeat:false},m=>m.cmd==="settings");
    assert.equal(settings.ok,true);assert.equal(settings.rate,30);assert.equal(settings.repeat,false);
    assert.ok(!h.msgs.some(m=>m.cmd==="error"));
    console.log(`${smp||1}-core full snapshot: ${saved.buf.byteLength} compressed bytes; registers/devices/frame/game/disk/settings survive`);
  } finally {await h?.Stop();}
}
