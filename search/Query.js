import {compileHolyC} from "../holyc-wasm/src/compiler.js";
import {createHost} from "../holyc-wasm/src/runtime/host.js";

export async function QueryProgram(source)
{
  const compiled=compileHolyC(source,{filename:"Query.HC",lenient:false,
    resilient:false,exports:["SearchQuery","MAlloc","Free","StrLen"]}),
    host=createHost({}),
    {instance}=await WebAssembly.instantiate(compiled.bytes,{env:host.env}),
    fn=instance.exports,encoder=new TextEncoder(),decoder=new TextDecoder();
  if (compiled.warnings.length) throw new Error(compiled.warnings.join("\n"));
  host.attach(instance);fn.__main();
  return function Parse(text)
  {
    const bytes=encoder.encode(text);
    if (bytes.length>8192) throw new Error("Search text is limited to 8 KB.");
    if (text.includes("\0")) throw new Error("Search text contains a NUL character.");
    let input=0n,output=0n;
    try {
      input=fn.MAlloc(BigInt(bytes.length+1),0n);
      new Uint8Array(fn.memory.buffer).set(bytes,Number(input));
      new Uint8Array(fn.memory.buffer)[Number(input)+bytes.length]=0;
      output=fn.SearchQuery(input);
      const result=JSON.parse(decoder.decode(new Uint8Array(fn.memory.buffer,
        Number(output),Number(fn.StrLen(output)))));
      result.phrases=result.phrases.map(s=>s.toLowerCase());
      result.notPhrases=result.notPhrases.map(s=>s.toLowerCase());
      return result;
    } finally {
      fn.Free(output);fn.Free(input);
    }
  };
}

let pending;
export function QueryLoad()
{
  if (!pending) pending=(async function () {
    const response=await fetch(new URL("Query.HC",import.meta.url));
    if (!response.ok) throw new Error("Could not load search controls.");
    return QueryProgram(await response.text());
  })().catch(error=>{pending=null;throw error;});
  return pending;
}

export function QueryEdit(Parse,text,change)
{
  const query=Parse(text);
  if (change.scope!==undefined) {
    if (!["all","title","text"].includes(change.scope))
      throw new Error("Unknown search scope.");
    return query.withoutScope.trim()+
      (change.scope=="title"?" in:titles":change.scope=="text"?" in:transcript":"");
  }
  const years=new Set(query.years);
  if (change.year===null) years.clear();
  else {
    if (!/^(19|20)\d{2}$/.test(change.year)) throw new Error("Unknown search year.");
    if (change.selected) years.add(change.year);
    else years.delete(change.year);
  }
  const sorted=[...years].map(Number).sort((a,b)=>a-b),parts=[];
  for (let i=0;i<sorted.length;) {
    let j=i;
    while (j+1<sorted.length && sorted[j+1]==sorted[j]+1) j++;
    parts.push(j-i>=2?sorted[i]+"-"+sorted[j]:sorted.slice(i,j+1).join(","));
    i=j+1;
  }
  return query.withoutYears.trim()+(parts.length?" date:"+parts.join(","):"");
}
