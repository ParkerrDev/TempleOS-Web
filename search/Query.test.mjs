import assert from "node:assert/strict";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {QueryProgram,QueryEdit} from "./Query.js";

const source=await readFile(new URL("Query.HC",import.meta.url),"utf8"),
  Parse=await QueryProgram(source),
  cases=[
    ["",{scope:"all",groups:[],phrases:[],notWords:[],notPhrases:[],
      dateAny:[],dateFrom:"",dateTo:"",years:[],withoutScope:"",withoutYears:""}],
    ["Terry OR Dave linux",{groups:[["terry","dave"],["linux"]]}],
    ["Terry OR Dave OR God",{groups:[["terry","dave","god"]]}],
    ["Terry or Dave",{groups:[["terry"],["or"],["dave"]]}],
    ['"Linux OR Windows"',{groups:[],phrases:["linux or windows"]}],
    ['" IN:Titles  2012 " -CIA -"bad idea"',{scope:"all",years:[],
      phrases:["in:titles 2012"],notWords:["cia"],notPhrases:["bad idea"]}],
    ["IN:Titles SCOPE:TRANSCRIPT in:all in:title",{scope:"title",groups:[]}],
    ["2014-2012,2017 ON:2018",{years:["2012","2013","2014","2017","2018"],
      dateAny:["2012","2013","2014","2017","2018"],groups:[]}],
    ["date:2017-11,2016 since:2012-2014 until:2015-2017",{
      years:[],dateAny:["2016","2017-11"],dateFrom:"2012",dateTo:"2017"}],
    ["after:2017-11-19 before:2018-02 from:2016 to:2019",{
      dateFrom:"2016",dateTo:"2019",groups:[]}],
    ["date:2016-invalid 1899 2100",{groups:[["date2016invalid"],["1899"],["2100"]],dateAny:[]}],
    ['"Café 🚀" -"ÉCOLE"',{phrases:["café 🚀"],notPhrases:["école"]}],
    ["alpha\u00a0OR\u2003beta\u3000gamma",{groups:[["alpha","beta"],["gamma"]]}],
    ['"a\u2028b\u202fc"',{phrases:["a b c"]}],
    ["-CIA,compiler -agent-only",{notWords:["cia","agent"],groups:[["compiler"],["only"]]}],
    ['"a\tb\nc" "slash\\path"',{phrases:["a b c","slash\\path"]}],
    ['"unfinished phrase',{groups:[["unfinished"],["phrase"]],phrases:[]}]
  ];
for (const [text,expected] of cases) {
  const actual=Parse(text);
  for (const [key,value] of Object.entries(expected))
    assert.deepEqual(actual[key],value,text+": "+key);
}
const quoted='"in:titles  2012" IN:Titles ON:2016 since:2010-05';
const changed=QueryEdit(Parse,quoted,{scope:"text"});
assert(changed.startsWith('"in:titles  2012" '));
assert.equal(Parse(changed).scope,"text");
assert.deepEqual(Parse(changed).years,["2016"]);
const year=QueryEdit(Parse,changed,{year:"2017",selected:true});
assert.equal(Parse(year).scope,"text");
assert.deepEqual(Parse(year).years,["2016","2017"]);
assert.equal(Parse(year).dateFrom,"2010-05");
assert(QueryEdit(Parse,year,{year:null}).includes('"in:titles  2012"'));
assert.deepEqual(Parse(QueryEdit(Parse,year,{year:null})).years,[]);
assert.equal(QueryEdit(Parse,'"date:2012"',{scope:"all"}),'"date:2012"');
assert.throws(()=>Parse("a".repeat(8193)),/8 KB/);
assert.throws(()=>Parse("bad\0query"),/NUL/);
const selected_years=Array.from({length:200},(_,i)=>String(1900+i)),
  year_query=QueryEdit(Parse,selected_years.join(" "),{year:"1999",selected:true});
assert.deepEqual(Parse(year_query).years,selected_years,"Compacting a long year selection keeps every year.");
const controls='"'+"\x01".repeat(8190)+'"';
assert.equal(Parse(controls).phrases[0],"\x01".repeat(8190),
  "A bounded input still fits when JSON escapes expand all three copies.");
const long="ab ".repeat(2700),started=performance.now();
for (let i=0;i<20;i++) assert.equal(Parse(long).groups.length,2700);
console.log("Native search grammar, quoted operators, filters and edits pass; 20 maximal parses: "+
  Math.round(performance.now()-started)+" ms.");

if (process.argv.includes("--native")) {
  const {QemuRun}=await import("../holyc-wasm/tests/oracle/Qemu.mjs"),
    queries=[...cases.map(([text])=>text),year_query,controls,long],
    files=queries.map((text,index)=>({name:"Q"+String(index).padStart(4,"0")+".TXT",
      bytes:Buffer.from(text+"\0")})),
    code=source+String.raw`
I64 i;
U8 name[64],*input,*result;
for (i=0;i<`+queries.length+String.raw`;i++) {
  StrPrint(name,"C:/ORACLE/Q%04d.TXT",i);
  input=FileRead(name);
  result=SearchQuery(input);
  "%s\n",result;
  Free(result);Free(input);
}
`,result=await QemuRun([code],{files,timeout:60});
  assert.equal(result.results[0].except,"");
  const native=Buffer.from(result.results[0].out,"latin1").toString("utf8").trim().split("\n").map(s=>{
    const value=JSON.parse(s);
    value.phrases=value.phrases.map(s=>s.toLowerCase());
    value.notPhrases=value.notPhrases.map(s=>s.toLowerCase());
    return value;
  });
  assert.deepEqual(native,queries.map(Parse));
  const dir=new URL("../tmp/search/",import.meta.url);
  await mkdir(dir,{recursive:true});
  await writeFile(new URL("native.json",dir),JSON.stringify(result,null,2)+"\n");
  console.log("Native V5.03 QEMU search outputs match: "+result.evidence);
}
