import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {SnapshotInspect} from "../../engine/Snapshot.js";
import {HemuBoot,ReadyWait} from "./WorkerHost.mjs";

const [mode,path]=process.argv.slice(2);
if(!["save","restore"].includes(mode)||!path)throw new Error("Usage: snapshot-legacy.test.mjs save|restore FILE");
async function Request(h,message,predicate,ms=30000) {
  const waiting=h.Wait(predicate,ms);h.Post(message);return waiting;
}
const mark="legacy allocator session\n";
let h;
try {
  if(mode==="save") {
    h=await HemuBoot({rate:120,repeat:true,keep_buf:true});
    assert.equal((await ReadyWait(h,20000)).ok,true);
    if(!h.msgs.some(m=>m.cmd==="diskInfo"&&m.ok))await h.Wait(m=>m.cmd==="diskInfo"&&m.ok,30000);
    const result=await Request(h,{cmd:"osWrite",id:"legacy",path:"C:/Home/LegacyCheck.TXT",bytes:new TextEncoder().encode(mark)},m=>m.cmd==="fileResult"&&m.id==="legacy");
    assert.equal(result.ok,true,result.msg);
    await Request(h,{cmd:"pause",value:true},m=>m.cmd==="paused"&&m.value);
    const resultSave=await Request(h,{cmd:"exportSnapshot"},m=>m.cmd==="exportResult",60000);
    assert.equal(resultSave.ok,true,resultSave.msg);
    const header=await SnapshotInspect(resultSave.buf);
    assert.equal(header.meta.heapAbi,0,"generate with a pre-A7 compiler/runtime");
    writeFileSync(path,Buffer.from(resultSave.buf));
    writeFileSync(path+".json",JSON.stringify({hash:h.last.hash,palette:h.palette}));
  } else {
    const bytes=readFileSync(path),expected=JSON.parse(readFileSync(path+".json","utf8"));
    assert.equal((await SnapshotInspect(bytes)).meta.heapAbi,0);
    h=await HemuBoot({snapshot:bytes,keep_buf:true});
    await h.Wait(m=>m.cmd==="restored",30000);
    assert.equal(h.last.hash,expected.hash);
    assert.deepEqual(h.palette,expected.palette);
    await Request(h,{cmd:"pause",value:false},m=>m.cmd==="paused"&&!m.value);
    const result=await Request(h,{cmd:"osExec",id:"read",target:"adam",src:`I64 n;U8 *p=FileRead("C:/Home/LegacyCheck.TXT",&n);if (!p || n!=${mark.length} || StrCmp(p,"legacy allocator session\\n")) throw('Legacy');Free(p);`},m=>m.cmd==="fileResult"&&m.id==="read");
    assert.equal(result.ok,true,result.msg);
    await Request(h,{cmd:"pause",value:true},m=>m.cmd==="paused"&&m.value);
    const resaved=await Request(h,{cmd:"exportSnapshot"},m=>m.cmd==="exportResult",60000);
    assert.equal(resaved.ok,true,resaved.msg);
    assert.equal((await SnapshotInspect(resaved.buf)).meta.heapAbi,0,"legacy sessions retain their allocator ABI when saved again");
    console.log("Legacy full save: exact paused frame/palette, native disk read, resume and resave preserve ABI0 under the current host.");
  }
} finally {await h?.Stop();}
