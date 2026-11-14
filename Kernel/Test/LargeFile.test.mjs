import assert from "node:assert/strict";
import {GuestHarness} from "./GuestHarness.mjs";

const h=await GuestHarness({disk:true}),gx=h.gx,
  bytes=new Uint8Array(Math.max(30*1024*1024,gx.scratch.dataSize)+33),
  adam=gx.rd64(gx.varFind("adam_task")),
  heap=gx.rd64(adam+gx.memberFind("CTask","data_heap")),
  used=heap+gx.memberFind("CHeapCtrl","used_u8s");
assert.ok(heap>0 && used>=heap,"the native heap accounting fields resolve");
let hash=0x811C9DC5,seed=0x4D1357;
for(let i=0;i<bytes.length;i++) {
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  bytes[i]=seed>>>24;hash=Math.imul(hash^bytes[i],16777619)>>>0;
}
async function Write(path,target="adam",mkdirs=true) {
  const id=gx.writeFile({path,bytes,target,mkdirs});
  for(let n=0;n<4000;n++) {
    const status=gx.status(id);
    if(status && ["done","error","failed"].includes(status.state))return status;
    await h.Run();
  }
  assert.fail("large native write timed out");
}
for(const path of ["C:/Home/LargeAsset.BIN","C:/Home/LargeAsset.BIN.Z"]) {
  const before=gx.rd64(used),result=await Write(path);
  assert.equal(result.state,"done",JSON.stringify(result));
  assert.equal(result.size,bytes.length);
  assert.ok(gx.rd64(used)<before+1048576,"native write releases the large transfer allocation");
  const blocks=Math.ceil(bytes.length/512);
  await h.Exec(`CFile *f=FOpen("${path}","r");
    if (!f || FSize(f)!=${bytes.length}) throw('Size');
    U8 *p=MAlloc(${blocks*512});
    if (!FBlkRead(f,p,0,${blocks})) throw('Read');
    I64 i;U64 hash=0x811C9DC5;
    for (i=0;i<${bytes.length};i++) hash=(hash^p[i])*16777619&0xFFFFFFFF;
    FClose(f);Free(p);
    if (hash!=0x${hash.toString(16)}) throw('Hash');`);
}
for(const [path,target,mkdirs,state] of [
  ["C:/Home/FailedAsset.BIN",-1,true,"error"],
  ["C:/Home/NoUploadDir/Bad.Z","adam",false,"failed"]
]) {
  const before=gx.rd64(used),failed=await Write(path,target,mkdirs);
  assert.equal(failed.state,state,JSON.stringify(failed));
  assert.ok(gx.rd64(used)<before+1048576,"failed transfer releases its native allocation");
}
assert.equal(gx.info().pendingJobs,0);
assert.equal(gx.info().inflight,false);
assert.doesNotThrow(()=>gx.snapshot(),"settled uploads leave the guest ready to save");
console.log(`${bytes.length}-byte native uploads exceed staging capacity: exact raw/archive readback, final byte sizes and success/error heap cleanup pass.`);
