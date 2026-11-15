import {createHost} from "../../hemu/holyc-wasm/src/runtime/host.js";

export async function QueryProgram(bytes)
{
  const host=createHost({}),
    {instance}=await WebAssembly.instantiate(bytes,{env:host.env}),
    fn=instance.exports,encoder=new TextEncoder(),decoder=new TextDecoder();
  host.attach(instance);fn.__main();
  let input=0n,input_size=0;
  function Texts(texts,call)
  {
    const bytes=texts.map(text=>encoder.encode(text)),ptrs=[],
      size=bytes.reduce((n,b)=>n+b.length+1,0);
    if (size>input_size) {
      fn.Free(input);input=0n;input_size=0;
      input=fn.MAlloc(BigInt(Math.max(size,1024)),0n);input_size=Math.max(size,1024);
    }
    const memory=new Uint8Array(fn.memory.buffer);
    let at=0;
    for (const value of bytes) {
      ptrs.push(input+BigInt(at));memory.set(value,Number(input)+at);
      at+=value.length;memory[Number(input)+at++]=0;
    }
    return call(...ptrs);
  }
  function Json(output)
  {
    try {
      return JSON.parse(decoder.decode(new Uint8Array(fn.memory.buffer,
        Number(output),Number(fn.StrLen(output)))));
    } finally {fn.Free(output);}
  }
  function Parse(text,keep=false)
  {
    if (encoder.encode(text).length>8192)
      throw new Error("Search text is limited to 8 KB.");
    if (text.includes("\0")) throw new Error("Search text contains a NUL character.");
    const result=Texts([text],input=>Json(keep?fn.SearchBegin(input):fn.SearchQuery(input)));
    result.phrases=result.phrases.map(s=>s.toLowerCase());
    result.notPhrases=result.notPhrases.map(s=>s.toLowerCase());
    return result;
  }
  Parse.load=function (videos) {
    const order=videos.map((_,i)=>i).sort((a,b)=>(videos[b].d+videos[b].t).
      localeCompare(videos[a].d+videos[a].t)),ranks=[];
    order.forEach((id,rank)=>ranks[id]=rank);
    let chunk=0;
    try {
      fn.SearchCorpusNew(BigInt(videos.length),BigInt(videos.reduce((n,v)=>n+v.s.length,0)));
      videos.forEach((v,id)=>{
        Texts([v.d,v.t.toLowerCase()],(date,title)=>
          fn.SearchVideoSet(BigInt(id),date,title,BigInt(ranks[id])));
        v.s.forEach(([sec,text],index)=>Texts([text.toLowerCase()],ptr=>
          fn.SearchChunkSet(BigInt(chunk++),BigInt(id),BigInt(index),ptr)));
      });
      return {chunks:chunk,words:Number(fn.SearchWordCnt())};
    } catch (error) {fn.SearchCorpusDel();throw error;}
  };
  Parse.run=function (text,sort) {
    const parsed=Parse(text,true);
    for (const [kind,phrases] of [[2,parsed.phrases],[4,parsed.notPhrases]])
      phrases.forEach((phrase,index)=>Texts([phrase],ptr=>
        fn.SearchPhraseSet(BigInt(kind),BigInt(index),ptr)));
    return {scope:parsed.scope,...Json(fn.SearchRun(BigInt(sort=="new"?1:sort=="old"?2:0)))};
  };
  Parse.browse=function (index,oldest) {
    return Number(fn.SearchBrowse(BigInt(index),BigInt(oldest)));
  };
  Parse.edit=function (text,change) {
    Parse(text);
    let mode=0,value=0;
    if (change.scope!==undefined) {
      value=["all","title","text"].indexOf(change.scope);
      if (value<0) throw new Error("Unknown search scope.");
    } else {
      mode=1;
      if (change.year!==null) {
        if (!/^(19|20)\d{2}$/.test(change.year)) throw new Error("Unknown search year.");
        value=Number(change.year);
      }
    }
    return Texts([text],ptr=>{
      const output=fn.SearchEdit(ptr,BigInt(mode),BigInt(value),BigInt(!!change.selected));
      try {return decoder.decode(new Uint8Array(fn.memory.buffer,Number(output),Number(fn.StrLen(output))));}
      finally {fn.Free(output);}
    });
  };
  return Parse;
}

let pending;
export function QueryLoad()
{
  if (!pending) pending=(async function () {
    const response=await fetch(new URL("../../build/Search.wasm",import.meta.url));
    if (!response.ok) throw new Error("Could not load search controls.");
    return QueryProgram(await response.arrayBuffer());
  })().catch(error=>{pending=null;throw error;});
  return pending;
}

export function QueryEdit(Parse,text,change)
{
  return Parse.edit(text,change);
}
