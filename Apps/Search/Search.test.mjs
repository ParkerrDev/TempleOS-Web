import assert from "node:assert/strict";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {QueryProgram} from "./Query.js";

const Parse=await QueryProgram(await readFile(new URL("../../build/Search.wasm",import.meta.url))),
  videos=[
    {t:"Zulu",d:"2016-03-01",s:[[0,"An idiot admires complexity."],
      [1,"Round robin priorities."],[2,"Round robin tasks."],
      [3,"compiler"],[4,"compiler again"],[5,"compiler third"],[6,"compiler fourth"]]},
    {t:"Alpha",d:"2018-05-03",s:[[0,"Linux uses the compiler."],[1,"Café ÉCOLE 🚀"]]},
    {t:"Compiler",d:"2017-04-02",s:[[0,"compiler only"],[1,"compiler last"]]}
  ],
  queries=["idoit admires complexty in:transcript",'"round robin" -priorities',
    "linux OR complexity", "compiler", "compiler in:titles", "compiler in:transcript",
    "compiler date:2017-04-02", "2016-2017", "since:2017 until:2018-05",'"CAFÉ"',
    '"round robin" -"TASKS"',"nothing", "compiler -compiler"];
assert.deepEqual(Parse.load(videos),{chunks:11,words:18});
assert.deepEqual(Parse.run(queries[0]).hits,[[0,0,12]]);
assert.deepEqual(Parse.run(queries[1]).hits,[[0,2,8]]);
assert.deepEqual(Parse.run(queries[2]).hits,[[0,0,6],[1,0,6]]);
assert.deepEqual(Parse.run(queries[3]).hits,[[0,3,6],[0,4,6],[0,5,6],[1,0,6],[2,0,6],[2,1,6]]);
assert.equal(Parse.run(queries[3]).total,7,"Count every match before the three-per-video display limit.");
assert.deepEqual(Parse.run(queries[4]).vids,[2]);
assert.deepEqual(Parse.run(queries[4]).hits,[]);
assert.deepEqual(Parse.run(queries[6]).hits,[[2,0,6],[2,1,6]]);
assert.deepEqual(Parse.run(queries[7]).vids,[2,0]);
assert.deepEqual(Parse.run(queries[9]).hits,[[1,1,8]]);
assert.deepEqual(Parse.run(queries[10]).hits,[[0,1,8]]);
assert.deepEqual(Parse.run(queries[12]).hits,[]);
assert.deepEqual([0,1,2].map(i=>Parse.browse(i,false)),[1,2,0]);
assert.deepEqual([0,1,2].map(i=>Parse.browse(i,true)),[0,2,1]);
const expected=queries.flatMap(q=>["rel","new","old"].map(sort=>Parse.run(q,sort)));
for (let i=0;i<5;i++) {
  Parse.load(videos.slice(0,1));assert.equal(Parse.run("compiler").total,4);
  Parse.load(videos);assert.deepEqual(Parse.run(queries[0]),expected[0]);
}
const many=Array.from({length:80},(_,i)=>({t:"Compiler "+i,d:"2017",s:[[i,"compiler"]]}));
Parse.load(many);
assert.equal(Parse.run("compiler").hits.length,60);
assert.equal(Parse.run("compiler").total,80);
assert.equal(Parse.run("compiler in:titles").vids.length,60);
assert.equal(Parse.run("compiler in:titles").vtotal,80);
const mediaVideos=[
  {f:"same.mkv",t:"Same",d:"2018",s:[[0,"same"]]},
  {f:"same.mp4",t:"Same",d:"2017",s:[[0,"same"]]}
];
Parse.load(mediaVideos);
const mediaExpected=["same","2017-2018"].flatMap(q=>["rel","new","old"].map(sort=>Parse.run(q,sort)));
for (const result of mediaExpected) assert.deepEqual(result.vids,[1,0],"Playable copies precede unsupported originals for every sort");
assert.deepEqual([Parse.browse(0,false),Parse.browse(1,false)],[1,0]);
assert.deepEqual([Parse.browse(0,true),Parse.browse(1,true)],[1,0]);
Parse.load([]);assert.equal(Parse.run("compiler").total,0);
console.log("HolyC search: fuzzy/exact/OR/exclusion/date/ranking/Unicode queries, hit limits and corpus replacement pass.");

const {createHost}=await import("../../hemu/holyc-wasm/src/runtime/host.js"),
  host=createHost({}),allocate=host.env.__malloc;
let calls=0,fail_at=Infinity;
host.env.__malloc=(...args)=>++calls==fail_at?0n:allocate(...args);
const {instance}=await WebAssembly.instantiate(await readFile(new URL("../../build/Search.wasm",import.meta.url)),{env:host.env}),
  fn=instance.exports;
host.attach(instance);fn.__main();
const input=fn.MAlloc(512n,0n);
new Uint8Array(fn.memory.buffer).set(new TextEncoder().encode("2017\0compiler\0compiler admires complexity\0compiler\0"),Number(input));
const baseline=host.state.heapPtr;
function Ownership()
{
  let out=0n;
  try {
    fn.SearchCorpusNew(1n,1n);fn.SearchVideoSet(0n,input,input+5n,0n,0n);
    fn.SearchChunkSet(0n,0n,0n,input+14n);
    out=fn.SearchBegin(input+42n);fn.Free(out);out=0n;
    out=fn.SearchRun(0n);
  } finally {fn.Free(out);fn.SearchCorpusDel();}
}
let before=calls;
Ownership();
const allocations=calls-before;
assert.equal(host.state.heapPtr,baseline);
for (let i=1;i<=allocations;i++) {
  fail_at=calls+i;assert.throws(Ownership);
  assert.equal(host.state.heapPtr,baseline,"Search allocation failure "+i+" leaked.");
  fail_at=Infinity;Ownership();assert.equal(host.state.heapPtr,baseline);
}
fn.Free(input);
console.log("Search corpus/query ownership survives all "+allocations+" allocation failures and retries.");

if (process.argv.includes("--native")) {
  const {QemuRun}=await import("../../hemu/holyc-wasm/tests/oracle/Qemu.mjs"),
    querySource=await readFile(new URL("Query.HC",import.meta.url),"latin1"),
    engineSource=await readFile(new URL("Search.HC",import.meta.url),"latin1"),
    quote=s=>JSON.stringify(s).replaceAll("$","$$"),
    order=videos.map((_,i)=>i).sort((a,b)=>(videos[b].d+videos[b].t).localeCompare(videos[a].d+videos[a].t));
  let code=querySource+engineSource.replace('#include "Query"',""),chunk=0;
  code+='\nU8 *result;\nSearchCorpusNew(3,11);\n';
  videos.forEach((v,i)=>{
    code+='SearchVideoSet('+i+','+quote(v.d)+','+quote(v.t.toLowerCase())+','+order.indexOf(i)+');\n';
    v.s.forEach(([sec,text],index)=>code+='SearchChunkSet('+chunk+++','+i+','+index+','+quote(text.toLowerCase())+');\n');
  });
  for (const q of queries) {
    code+='result=SearchBegin('+quote(q)+');Free(result);\n';
    const parsed=Parse(q);
    for (const [kind,phrases] of [[2,parsed.phrases],[4,parsed.notPhrases]])
      phrases.forEach((phrase,i)=>code+='SearchPhraseSet('+kind+','+i+','+quote(phrase)+');\n');
    for (let sort=0;sort<3;sort++)
      code+='result=SearchRun('+sort+');"%s\\n",result;Free(result);\n';
  }
  code+='SearchCorpusNew(2,2);\n';
  mediaVideos.forEach((v,i)=>{
    code+='SearchVideoSet('+i+','+quote(v.d)+','+quote(v.t.toLowerCase())+','+(1-i)+','+i+');\n';
    code+='SearchChunkSet('+i+','+i+',0,"same");\n';
  });
  for (const q of ["same","2017-2018"]) {
    code+='result=SearchBegin('+quote(q)+');Free(result);\n';
    for (let sort=0;sort<3;sort++) code+='result=SearchRun('+sort+');"%s\\n",result;Free(result);\n';
  }
  code+='SearchCorpusDel;\n';
  const result=await QemuRun([code],{timeout:60});
  if (result.results[0].except) console.error(result);
  assert.equal(result.results[0].except,"");
  const native=Buffer.from(result.results[0].out,"latin1").toString("utf8").trim().split("\n").map(JSON.parse);
  assert.deepEqual(native,[...expected,...mediaExpected].map(({scope,...rest})=>rest));
  const dir=new URL("../../tmp/search/",import.meta.url);
  await mkdir(dir,{recursive:true});
  await writeFile(new URL("engine-native.json",dir),JSON.stringify(result,null,2)+"\n");
  console.log("Native V5.03 QEMU search ranking matches all 45 queries: "+result.evidence);
}
