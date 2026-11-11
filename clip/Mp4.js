import {compileHolyC} from "../holyc-wasm/src/compiler.js";
import {createHost} from "../holyc-wasm/src/runtime/host.js";

export async function Mp4Clip(source,start,end)
{
  let response=await fetch(new URL("Mp4.HC",import.meta.url)),r,host,fn,
    pos=0,next,header,moov,at,size,ptr,data,cnt=0,header_pos=0;
  if (!response.ok) throw new Error("Could not load the clip program.");
  r=compileHolyC(await response.text(),{filename:"Mp4.HC",lenient:false,
    exports:["ClipPlan","ClipReadPos","ClipReadSize","ClipReadPut",
      "ClipResult","ClipResultSize","ClipError","ClipScan","ClipMetaSize"]});
  host=createHost({});
  r=await WebAssembly.instantiate(r.bytes,{env:host.env});
  fn=r.instance.exports;host.attach(r.instance);fn.__main();
  function Put(bytes)
  {
    let ptr=host.env.__malloc(BigInt(bytes.length));
    if (!ptr) throw new Error("Not enough memory for this clip.");
    new Uint8Array(fn.memory.buffer).set(bytes,Number(ptr));
    return ptr;
  }
  function Call(name,...args)
  {
    let result,error,p,mem,text;
    try {result=fn[name](...args);} catch (e) {error=e;}
    p=Number(fn.ClipError());
    if (p) {
      mem=new Uint8Array(fn.memory.buffer);
      text=new TextDecoder().decode(mem.subarray(p,mem.indexOf(0,p)));
      throw new Error(text);
    }
    if (error) throw error;
    return result;
  }
  header=await source.Read(0,64);
  while (true) {
    if (++cnt>4096) throw new Error("Too many MP4 atoms.");
    if (pos<header_pos || pos+16>header_pos+header.length) {
      header=await source.Read(pos,16);header_pos=pos;
    }
    data=header.subarray(pos-header_pos);
    next=Number(Call("ClipScan",Put(data),BigInt(data.length),
      BigInt(source.total),BigInt(pos)));
    if (next==-1) break;
    if (next<=pos || next>=source.total)
      throw new Error("No movie index was found in this file.");
    pos=next;
  }
  moov=await source.Read(pos,Number(fn.ClipMetaSize()));
  if (!Call("ClipPlan",Put(moov),BigInt(moov.length),
      BigInt(source.total),start,end))
    throw new Error("Could not prepare this clip.");
  ptr=host.env.__malloc(16777216n);
  if (!ptr) throw new Error("Not enough memory for media ranges.");
  while ((at=Number(fn.ClipReadPos()))>=0) {
    size=Number(fn.ClipReadSize());
    data=await source.Read(at,size);
    new Uint8Array(fn.memory.buffer).set(data,Number(ptr));
    Call("ClipReadPut",ptr,BigInt(data.length));
  }
  at=Number(fn.ClipResult());size=Number(fn.ClipResultSize());
  return new Uint8Array(fn.memory.buffer).slice(at,at+size).buffer;
}
