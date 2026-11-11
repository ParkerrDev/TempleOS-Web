import {ClipProgram} from "./Program.js";

export async function Mp4Clip(source,start,end)
{
  const {fn,Put,Call,Copy,Input,Alloc}=await ClipProgram("Mp4.HC",[
    "ClipPlan","ClipReadPos","ClipReadSize","ClipReadPut","ClipResult",
    "ClipResultSize","ClipError","ClipScan","ClipMetaSize"],"ClipError");
  let pos=0,next,header,moov,at,size,ptr,data,cnt=0,header_pos=0;
  header=await source.Read(0,64);
  while (true) {
    if (++cnt>4096) throw new Error("Too many MP4 atoms.");
    if (pos<header_pos || pos+16>header_pos+header.length) {
      header=await source.Read(pos,16);header_pos=pos;
    }
    data=header.subarray(pos-header_pos);
    next=Number(Input("ClipScan",data,
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
  ptr=Alloc(16777216);
  if (!ptr) throw new Error("Not enough memory for media ranges.");
  while ((at=Number(fn.ClipReadPos()))>=0) {
    size=Number(fn.ClipReadSize());
    data=await source.Read(at,size);
    new Uint8Array(fn.memory.buffer).set(data,Number(ptr));
    Call("ClipReadPut",ptr,BigInt(data.length));
  }
  at=Number(fn.ClipResult());size=Number(fn.ClipResultSize());
  return Copy(BigInt(at),BigInt(size));
}
