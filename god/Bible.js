export function BibleReader(Fetch=fetch)
{//The 20-line passage never needs the whole Bible in memory.
  let index=null,chunks=new Map;
  async function Json(path)
  {
    let res=await Fetch(new URL("../assets/bible/"+path,import.meta.url),
      {signal:AbortSignal.timeout(30000)});
    if (!res.ok)
      throw new Error("Bible download failed ("+res.status+"). Try again.");
    return res.json();
  }
  async function Index()
  {
    if (!index)
      index=Json("index.json").catch(function (e) {index=null;throw e;});
    return index;
  }
  async function Passage(bits)
  {
    let idx=await Index(),start=bits%(idx.lines-idx.passageLines+1),
      n=Math.floor(start/idx.chunkLines),offset=start%idx.chunkLines,
      part=chunks.get(n),book=idx.books[0].name,verse,i,m;
    if (!part) {
      part=Json(n+".json");
      chunks.set(n,part);
      part.catch(function () {chunks.delete(n);});
      if (chunks.size>8)
        chunks.delete(chunks.keys().next().value);
    }
    part=await part;
    verse=part.verse;
    for (i=0;i<offset;i++)
      for (m of part.lines[i].matchAll(/\b(\d+:\d+)\b/g))
        verse=m[1];
    m=/^(\d+:\d+)\b/.exec(part.lines[offset]);
    if (m)
      verse=m[1];
    for (i of idx.books)
      if (i.line<=start)
        book=i.name;
    return {ref:book+" "+verse,
      text:part.lines.slice(offset,offset+idx.passageLines).join("\n").trim()};
  }
  return {Passage};
}
