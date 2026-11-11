import assert from "node:assert/strict";
import {parseArgs} from "node:util";
import {writeFileSync,renameSync,mkdirSync,readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {createHash} from "node:crypto";
import {HemuBoot,ReadyWait} from "../hemu/WorkerHost.mjs";

const {values,positionals}=parseArgs({allowPositionals:true,options:{rate:{type:"string",default:"30"},running:{type:"boolean",default:false}}});
assert.ok(positionals.length<=1,"Use fixture.mjs [output.hemu] [--rate 0|30|60|120] [--running]");
assert.ok(["0","30","60","120"].includes(values.rate),"Unsupported fixture refresh limit");
const output=resolve(positionals[0]||"build/native/TempleOS.hemu"),rate=Number(values.rate),h=await HemuBoot({rate,keep_buf:true,keep:2});
async function Request(message,predicate,ms=30000){const waiting=h.Wait(predicate,ms);h.Post(message);return waiting;}
try {
  assert.equal((await ReadyWait(h,30000)).ok,true);
  const disk=m=>m.cmd==="diskInfo"&&m.ok;
  if(!h.msgs.some(disk))await h.Wait(disk,30000);
  const patch=m=>m.cmd==="guestPatch"&&["installed","failed"].includes(m.state),result=h.msgs.find(patch)||await h.Wait(patch,30000);
  assert.equal(result.state,"installed",result.msg);
  if(!values.running)await Request({cmd:"pause",value:true},m=>m.cmd==="paused"&&m.value);
  const saved=await Request({cmd:"exportSnapshot"},m=>m.cmd==="exportResult"&&m.kind==="snapshot",60000);
  assert.equal(saved.ok,true,saved.msg);
  mkdirSync(dirname(output),{recursive:true});writeFileSync(output+".tmp",new Uint8Array(saved.buf));renameSync(output+".tmp",output);
  const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
  writeFileSync(output+".json",JSON.stringify({rate,paused:!values.running,snapshot:hash(new Uint8Array(saved.buf)),engine:hash(readFileSync("build/hemu.wasm")),
    stock:JSON.parse(readFileSync("hemu/stock.json","utf8")),frame:values.running?null:hash(h.last.buf),palette:values.running?null:h.palette},null,2)+"\n");
  console.log(output);
}finally {await h.Stop();}
