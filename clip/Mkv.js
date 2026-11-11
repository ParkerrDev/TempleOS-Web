import {ClipProgram} from "./Program.js";

export async function MkvClip(source,start,end)
{
  const {fn,Call,Copy,Input}=await ClipProgram("Mkv.HC",[
    "MkScan","MkScanSize","MkScanHead","MkMeta","MkSeekPos","MkPlan",
    "MkReadStart","MkReadEnd","MkClusterPut","MkFinish","MkResult",
    "MkResultSize","MkStart","MkEnd","MkError"],"MkError"),
    metadata=new Set([0x1549A966,0x1654AE6B,0x1C53BB6B]),found=new Set();
  let pos=0,cached=await source.Read(0,65536),cache_pos=0,head,size,kind,count=0;
  async function Read(at,n)
  {
    if (n>16777216) throw new Error("Matroska metadata or cluster exceeds 16 MiB.");
    if (at>=cache_pos && at+n<=cache_pos+cached.length)
      return cached.subarray(at-cache_pos,at-cache_pos+n);
    if (at>=cache_pos && at<cache_pos+cached.length) {
      const prefix=cached.subarray(at-cache_pos),out=new Uint8Array(n);
      out.set(prefix);
      out.set(await source.Read(at+prefix.length,n-prefix.length),prefix.length);
      return out;
    }
    return source.Read(at,n);
  }
  async function Header(at)
  {
    if (at<cache_pos || at+12>cache_pos+cached.length) {
      cached=await source.Read(at,65536);cache_pos=at;
    }
    kind=Number(Input("MkScan",cached.subarray(at-cache_pos),
      BigInt(at),BigInt(source.total)));
    size=Number(fn.MkScanSize());head=Number(fn.MkScanHead());
  }
  async function Meta(at)
  {
    const bytes=await Read(at,size);
    Input("MkMeta",bytes);found.add(kind);
  }
  await Header(pos);
  if (kind!=0x1A45DFA3) throw new Error("This is not a Matroska or WebM file.");
  await Meta(pos);pos+=size;
  await Header(pos);
  if (kind!=0x18538067) throw new Error("Matroska segment is missing.");
  pos+=head;
  while (pos<source.total && ![...metadata].every(id=>found.has(id))) {
    if (++count>4096) throw new Error("Too many Matroska metadata elements.");
    await Header(pos);
    if (kind==0x1F43B675) break;
    if (metadata.has(kind) || kind==0x114D9B74) await Meta(pos);
    pos+=size;
  }
  for (const id of metadata) {
    if (found.has(id)) continue;
    pos=Number(fn.MkSeekPos(BigInt(id)));
    if (!pos) throw new Error("This Matroska file has no usable seek index.");
    await Header(pos);
    if (kind!=id) throw new Error("Matroska seek index points to the wrong element.");
    await Meta(pos);
  }
  Call("MkPlan",start,end);
  pos=Number(fn.MkReadStart());
  const limit=Number(fn.MkReadEnd());
  while (pos<limit) {
    if (++count>20000) throw new Error("Too many Matroska clusters.");
    await Header(pos);
    if (pos+size>limit) throw new Error("Matroska cue splits a cluster.");
    if (kind==0x1F43B675) {
      const bytes=await Read(pos,size);
      Input("MkClusterPut",bytes);
    }
    pos+=size;
  }
  Call("MkFinish");
  return {buf:Copy(fn.MkResult(),fn.MkResultSize()),
    start:fn.MkStart(),end:fn.MkEnd()};
}
