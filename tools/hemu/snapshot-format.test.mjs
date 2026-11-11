import assert from "node:assert/strict";
import {gzipSync} from "node:zlib";
import {readFileSync} from "node:fs";
import {SnapshotInspect,SnapshotOpen} from "../../engine/Snapshot.js";

const wasm=readFileSync(new URL("../../build/hemu.wasm",import.meta.url));
const meta={version:1,cores:1,memoryBytes:436666368,wasmBytes:wasm.length,
  diskBytes:268435456,heapPtr:436645904,base:16777216,sp:16777216,ipiAddr:0,
  paused:true,rate:120,actualRate:120,repeat:false,budget:12000000,
  engineHash:Buffer.from(await crypto.subtle.digest("SHA-256",wasm)).toString("hex"),
  keyboard:{queue:[0xE0],held:[0x14D],prefix:256,pause:0},
  pointer:{x:320,y:240,b:0,wheel:0,dx:0,dy:0,relative:false,reset:false,frameX:320,frameY:240},launch:null};
function Pack(m=meta,engine=wasm) {
  const json=Buffer.from(JSON.stringify(m)),prefix=Buffer.alloc(12);
  prefix.write("HEMUSNP1");prefix.writeUInt32LE(json.length,8);
  return gzipSync(Buffer.concat([prefix,json,engine]));
}
assert.equal(await SnapshotInspect(gzipSync(Buffer.alloc(32))),null,"legacy RAM uses its original loader");
const head=await SnapshotInspect(Pack());
assert.equal((await SnapshotInspect(Pack({...meta,heapAbi:1}))).meta.heapAbi,1);
assert.deepEqual(head.meta,{...meta,heapAbi:0,guestPatches:[]});assert.deepEqual(Buffer.from(head.wasm),wasm);
for (const change of [{guestPatches:["unknown"]},{guestPatches:["doc-sprite-clip-v1","doc-sprite-clip-v1"]},{guestPatches:null},{version:2},{heapAbi:2},{heapAbi:null},{cores:2},{memoryBytes:2**40},{memoryBytes:436666369},
  {wasmBytes:3e6},{diskBytes:-1},{heapPtr:2**40},{base:436666368},{sp:-1},
  {engineHash:"f".repeat(64)},{launch:{name:"bad",slot:80,task:10}},
  {keyboard:{...meta.keyboard,queue:[256]}},{pointer:{...meta.pointer,x:null}},
  {rate:47},{actualRate:47},{paused:1},{budget:0}])
  await assert.rejects(()=>SnapshotInspect(Pack({...meta,...change})),/Invalid HEMU snapshot/);
await assert.rejects(()=>SnapshotInspect(Pack(meta,wasm.subarray(0,200))),/truncated/);
const open=await SnapshotOpen(Pack());
try {
  await assert.rejects(()=>open.Restore(new WebAssembly.Memory({initial:512,maximum:8192})),/truncated/);
} finally {await open.Close();}
const corrupt=Pack();corrupt[corrupt.length-5]^=1;
await assert.rejects(()=>SnapshotInspect(corrupt));
console.log("Snapshot format: legacy detection, engine hash/module, bounded metadata, unsupported versions, corruption and truncation rejected.");
