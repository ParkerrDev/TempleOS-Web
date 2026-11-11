import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {compileHolyC} from "../../holyc-wasm/src/compiler.js";
import {createHost} from "../../holyc-wasm/src/runtime/host.js";

const source=await readFile(new URL("../../clip/Mkv.HC",import.meta.url),"utf8"),
  bytes=await readFile(new URL("../../tmp/clip/source.mkv",import.meta.url)),
  names=["MkScan","MkScanSize","MkScanHead","MkMeta","MkPlan","MkReadStart",
    "MkReadEnd","MkClusterPut","MkFinish","MkResult","MkResultSize","MkError",
    "MkReset","MAlloc","Free","StrLen"],
  compiled=compileHolyC(source,{filename:"Mkv.HC",lenient:false,exports:names}),
  host=createHost({}),allocate=host.env.__malloc;
let calls=0,failAt=Infinity;
host.env.__malloc=(...args)=>++calls==failAt?0n:allocate(...args);
const {instance}=await WebAssembly.instantiate(compiled.bytes,{env:host.env}),fn=instance.exports;
host.attach(instance);fn.__main();
const input=fn.MAlloc(BigInt(bytes.length),0n);
new Uint8Array(fn.memory.buffer).set(bytes,Number(input));
function Call(name,...args)
{
  const value=fn[name](...args),error=fn.MkError();
  if (error) throw new Error(Buffer.from(fn.memory.buffer,Number(error),Number(fn.StrLen(error))).toString());
  return value;
}
function Cut(repeat=false)
{
  fn.MkReset();
  try {
    for (let at=0;at<bytes.length;) {
      const kind=Call("MkScan",input+BigInt(at),BigInt(Math.min(16,bytes.length-at)),BigInt(at),BigInt(bytes.length)),
        size=fn.MkScanSize();
      if (kind==0x18538067n) at+=Number(fn.MkScanHead());
      else {
        if ([0x1A45DFA3n,0x114D9B74n,0x1549A966n,0x1654AE6Bn,0x1C53BB6Bn].includes(kind)) {
          Call("MkMeta",input+BigInt(at),size);
          if (repeat) Call("MkMeta",input+BigInt(at),size);
        }
        at+=Number(size);
      }
    }
    Call("MkPlan",7.15,10.65);
    for (let at=fn.MkReadStart();at<fn.MkReadEnd();) {
      const kind=Call("MkScan",input+at,16n,at,BigInt(bytes.length)),size=fn.MkScanSize();
      if (kind==0x1F43B675n) Call("MkClusterPut",input+at,size);
      at+=size;
    }
    Call("MkFinish");
    if (repeat) Call("MkFinish");
    return Buffer.from(new Uint8Array(fn.memory.buffer,Number(fn.MkResult()),Number(fn.MkResultSize())));
  } finally {fn.MkReset();}
}
try {
  const expected=Cut(),baseline=host.state.heapPtr,start=calls;
  assert.deepEqual(Cut(true),expected);
  const count=calls-start;
  for (let i=1;i<=count;i++) {
    failAt=calls+i;
    assert.throws(()=>Cut(true),/memory|alloc/i);
    assert.equal(host.state.heapPtr,baseline,"allocation "+i+" leaked or corrupted retained memory");
    failAt=Infinity;
    assert.deepEqual(Cut(true),expected,"a failed cut must not poison the next export");
    assert.equal(host.state.heapPtr,baseline);
  }
  console.log("Matroska ownership: "+count+" allocation failures, metadata replacement, repeated finish and clean retries pass.");
} finally {fn.MkReset();fn.Free(input);}

{
  const source=await readFile(new URL("../../clip/Mp4.HC",import.meta.url),"utf8"),
    bytes=await readFile(new URL("../../tmp/clip/source.mp4",import.meta.url)),
    expected=await readFile(new URL("../../tmp/clip/cut.mp4",import.meta.url)),
    names=["ClipPlan","ClipReadPos","ClipReadSize","ClipReadPut","ClipResult",
      "ClipResultSize","ClipError","ClipDel","MAlloc","Free","StrLen"],
    compiled=compileHolyC(source,{filename:"Mp4.HC",lenient:false,exports:names}),
    host=createHost({}),allocate=host.env.__malloc;
  let calls=0,failAt=Infinity;
  host.env.__malloc=(...args)=>++calls==failAt?0n:allocate(...args);
  const {instance}=await WebAssembly.instantiate(compiled.bytes,{env:host.env}),fn=instance.exports;
  host.attach(instance);fn.__main();
  const input=fn.MAlloc(BigInt(bytes.length),0n);
  new Uint8Array(fn.memory.buffer).set(bytes,Number(input));
  let index;
  for (let at=0;at<bytes.length;at+=bytes.readUInt32BE(at))
    if (bytes.toString("ascii",at+4,at+8)=="moov") index=at;
  assert.notEqual(index,undefined);
  function Cut()
  {
    try {
      const ok=fn.ClipPlan(input+BigInt(index),BigInt(bytes.readUInt32BE(index)),BigInt(bytes.length),7.15,10.65);
      if (!ok) {
        const error=fn.ClipError();
        throw new Error(Buffer.from(fn.memory.buffer,Number(error),Number(fn.StrLen(error))).toString());
      }
      for (let at=fn.ClipReadPos();at>=0;at=fn.ClipReadPos())
        fn.ClipReadPut(input+at,fn.ClipReadSize());
      return Buffer.from(new Uint8Array(fn.memory.buffer,Number(fn.ClipResult()),Number(fn.ClipResultSize())));
    } finally {fn.ClipDel();}
  }
  try {
    const start=calls;
    assert.deepEqual(Cut(),expected);
    const count=calls-start,baseline=host.state.heapPtr;
    for (let i=1;i<=count;i++) {
      failAt=calls+i;
      assert.throws(Cut,/memory/i);
      assert.equal(host.state.heapPtr,baseline,"allocation "+i+" leaked");
      failAt=Infinity;
      assert.deepEqual(Cut(),expected);assert.equal(host.state.heapPtr,baseline);
    }
    console.log("MP4 ownership: "+count+" allocation failures and clean retries preserve the verified output.");
  } finally {fn.ClipDel();fn.Free(input);}
}
