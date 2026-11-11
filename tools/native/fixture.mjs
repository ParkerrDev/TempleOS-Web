import assert from "node:assert/strict";
import {writeFileSync,renameSync,mkdirSync,readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {createHash} from "node:crypto";
import {HemuBoot,ReadyWait} from "../hemu/WorkerHost.mjs";

const output=resolve(process.argv[2]||"build/native/TempleOS.hemu"),h=await HemuBoot({rate:30,keep_buf:true,keep:2});
async function Request(message,predicate,ms=30000){const waiting=h.Wait(predicate,ms);h.Post(message);return waiting;}
try {
  assert.equal((await ReadyWait(h,30000)).ok,true);
  const disk=m=>m.cmd==="diskInfo"&&m.ok;
  if(!h.msgs.some(disk))await h.Wait(disk,30000);
  const patch=m=>m.cmd==="guestPatch"&&["installed","failed"].includes(m.state),result=h.msgs.find(patch)||await h.Wait(patch,30000);
  assert.equal(result.state,"installed",result.msg);
  await Request({cmd:"pause",value:true},m=>m.cmd==="paused"&&m.value);
  const saved=await Request({cmd:"exportSnapshot"},m=>m.cmd==="exportResult"&&m.kind==="snapshot",60000);
  assert.equal(saved.ok,true,saved.msg);
  mkdirSync(dirname(output),{recursive:true});writeFileSync(output+".tmp",new Uint8Array(saved.buf));renameSync(output+".tmp",output);
  const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
  writeFileSync(output+".json",JSON.stringify({snapshot:hash(new Uint8Array(saved.buf)),engine:hash(readFileSync("build/hemu.wasm")),
    stock:JSON.parse(readFileSync("hemu/stock.json","utf8")),frame:hash(h.last.buf),palette:h.palette},null,2)+"\n");
  console.log(output);
}finally {await h.Stop();}
