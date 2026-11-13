const RANGE_SIZE=16777216;

export function RangeSource(url,Status)
{//Checks every range so a server's full-file response cannot exhaust memory.
  let total=null,etag=null,downloaded=0;
  async function Read(pos,size)
  {
    let parts=[],count=0,response,match,tag,part,last,reader,at,item,expected;
    while (count<size) {
      last=pos+Math.min(size-count,RANGE_SIZE)-1;
      if (total!=null) last=Math.min(last,total-1);
      if (last<pos) throw new Error("Media range is outside the file.");
      response=await fetch(url,{headers:{Range:"bytes="+pos+"-"+last},
        signal:AbortSignal.timeout(30000)});
      match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(
        response.headers.get("Content-Range"));
      if (response.status!=206 || !match || Number(match[1])!=pos ||
          Number(match[2])>last || Number(match[2])<pos ||
          Number(match[3])<=Number(match[2])) {
        await response.body?.cancel();
        throw new Error("The video server did not provide the requested range ("+
          response.status+"). Try again later.");
      }
      tag=response.headers.get("ETag");
      if (total!=null && (total!=Number(match[3]) ||
          etag && tag && etag!=tag)) {
        await response.body.cancel();
        throw new Error("The source video changed during the download.");
      }
      total=Number(match[3]);etag=tag;
      if (!Number.isSafeInteger(total))
        throw new Error("Media file size exceeds the supported range.");
      expected=Number(match[2])-pos+1;
      if (Number(match[2])!=Math.min(last,total-1)) {
        await response.body.cancel();
        throw new Error("The server returned an incomplete media range.");
      }
      part=new Uint8Array(expected);at=0;
      reader=response.body.getReader();
      try {
        while (true) {
          item=await reader.read();
          if (item.done) break;
          if (item.value.length>expected-at)
            throw new Error("The server sent more bytes than requested.");
          part.set(item.value,at);at+=item.value.length;
        }
      } finally {
        await reader.cancel();
      }
      if (at!=expected) throw new Error("The media download was truncated.");
      parts.push(part);count+=part.length;pos+=part.length;
      downloaded+=part.length;
      Status("Reading clip… "+(downloaded/1048576).toFixed(1)+" MB");
      if (pos==total) break;
    }
    if (parts.length==1) return parts[0];
    part=new Uint8Array(count);count=0;
    for (let bytes of parts) {part.set(bytes,count);count+=bytes.length;}
    return part;
  }
  return {Read,get total() {return total;}};
}
