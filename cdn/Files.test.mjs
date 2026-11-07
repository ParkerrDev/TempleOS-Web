//The cdn Worker under node, with a bucket in memory and a fetch that answers
//for GitHub and archive.org: the files route, the archive route, and that
//ArchiveLst.json lists what Terry Search's index lists.
//  node cdn/Files.test.mjs
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {gzipSync} from "node:zlib";
import LST from "./ArchiveLst.json" with {type:"json"};
import {ArchiveLstMk} from "./ArchiveLstMk.mjs";

const SHA="0123456789abcdef0123456789abcdef01234567";
const FILES="https://files.test/";
const GITHUB="https://raw.githubusercontent.com/ParkerrDev/";
const ITEM="TerryADavis_TempleOS_Archive";
const ARCHIVE="https://archive.org/download/"+ITEM+"/";
const [VIDEO,IGNORES,FAILS,GONE]=LST[ITEM];
const MANIFEST='{"archive":"'+ITEM+'"}';
const WASM=BytesMk(200000);
const SIZE=1000;
let asked=[],cancelled=false;

function BytesMk(n)
{
  let i,res=new Uint8Array(n);
  for (i=0;i<n;i++)
    res[i]=i*7%251;
  return res;
}

class FixedLengthStream extends TransformStream
{//Passes len bytes, and fails if the stream ends at any other length.
  constructor(len)
  {
    let n=0;
    function Pass(chunk,ctrl)
    {
      n+=chunk.byteLength;
      ctrl.enqueue(chunk);
    }
    function End(ctrl)
    {
      if (n!=len)
	ctrl.error(new Error("not "+len+" bytes"));
    }
    super({transform:Pass,flush:End});
  }
}

class Bucket
{//R2 as Files.js uses it.
  constructor()
  {
    this.objs=new Map();
  }

  async head(key)
  {
    let bytes=this.objs.get(key);
    if (!bytes)
      return null;
    return {size:bytes.length,
	  httpEtag:'"'+createHash("md5").update(bytes).digest("hex")+'"'};
  }

  async get(key,opt)
  {//onlyIf answers a matching If-None-Match with no body.
    let obj=await this.head(key);
    if (!obj || opt.onlyIf.get("If-None-Match")==obj.httpEtag)
      return obj;
    obj.body=new Response(this.objs.get(key)).body;
    return obj;
  }

  async put(key,value)
  {
    this.objs.set(key,await new Response(value).bytes());
  }
}

function Chunks(bytes)
{//A body in three parts, as a network sends one.
  let i=0,third=Math.ceil(bytes.length/3);
  function Pull(ctrl)
  {
    if (i>=bytes.length)
      ctrl.close();
    else
      ctrl.enqueue(bytes.slice(i,i+=third));
  }
  function Cancel()
  {
    cancelled=true;
  }
  return new ReadableStream({pull:Pull,cancel:Cancel});
}

function GithubFetch(path)
{//GitHub gzips text, which fetch decodes, leaving the gzipped length; a
  //binary comes as it is with its length.
  if (path=="TempleOS-Web/"+SHA+"/assets/transcripts/manifest.json")
    return new Response(MANIFEST,{headers:{"Content-Encoding":"gzip",
	  "Content-Length":String(gzipSync(MANIFEST).length)}});
  if (path=="TempleOS-Web/"+SHA+"/vendor/ffmpeg/core/ffmpeg-core.wasm" ||
	path=="HEMU/"+SHA+"/live.bin.gz")
    return new Response(Chunks(WASM),
	  {headers:{"Content-Length":String(WASM.length)}});
  return new Response("404: Not Found",{status:404});
}

function ArchiveFetch(path,method,range)
{//archive.org's data node, past its redirect, for a video of SIZE bytes.
  let m=/^bytes=(\d+)-(\d+)$/.exec(range),first,last,headers={
	"Content-Type":"video/mp4","ETag":'"5b8f-3e8"',
	"Last-Modified":"Mon, 03 Sep 2018 23:03:55 GMT"};
  if (path==GONE)
    throw new TypeError("fetch failed");
  if (path==FAILS)
    return new Response("busy",{status:500});
  if (method=="HEAD")
    return new Response(null,{headers:{...headers,
	  "Content-Length":String(SIZE)}});
  if (path==IGNORES || !m)
    return new Response(Chunks(BytesMk(SIZE)),{headers});
  first=Number(m[1]);
  last=Math.min(Number(m[2]),SIZE-1);
  if (first>=SIZE)
    return new Response("<html>416</html>",{status:416,
	  headers:{...headers,"Content-Range":"bytes */"+SIZE}});
  return new Response(BytesMk(SIZE).slice(first,last+1),{status:206,
	headers:{...headers,"Content-Length":String(last-first+1),
	"Content-Range":"bytes "+first+"-"+last+"/"+SIZE}});
}

async function FetchFake(url,init)
{
  let headers=Object.fromEntries(new Headers(init?.headers));
  asked.push([url,init?.method ?? "GET",headers]);
  if (url.startsWith(GITHUB))
    return GithubFetch(url.slice(GITHUB.length));
  if (url.startsWith(ARCHIVE))
    return ArchiveFetch(url.slice(ARCHIVE.length),init.method,headers.range);
  throw new TypeError("no such host");
}

async function Ask(env,url,init)
{//The Worker's answer, and what it fetched to give it.
  let res;
  asked=[];
  res=await WORKER.fetch(new Request(url,init),env);
  return [res,asked];
}

globalThis.FixedLengthStream=FixedLengthStream;
globalThis.fetch=FetchFake;
const WORKER=(await import("./Files.js")).default;

{
  let res,up,etag,path,env={FILES:new Bucket},
	url=FILES+"TempleOS-Web/"+SHA+"/assets/transcripts/manifest.json";
  [res,up]=await Ask(env,url);
  assert.equal(res.status,200,"A listed file at a commit is served,");
  assert.equal(up[0][0],url.replace(FILES,GITHUB),
	"copied from GitHub at that commit,");
  assert.equal(await res.text(),MANIFEST);
  assert.equal(res.headers.get("Content-Type"),"application/json");
  assert.match(res.headers.get("Cache-Control"),/immutable/,"for good,");
  assert.equal(res.headers.get("Access-Control-Allow-Origin"),"*",
	"to any page");
  assert.equal(res.headers.get("Cross-Origin-Resource-Policy"),"cross-origin");
  [res,up]=await Ask(env,url);
  assert.deepEqual(up,[],"The next time it comes from the bucket");
  etag=res.headers.get("ETag");
  [res,up]=await Ask(env,url,{headers:{"If-None-Match":etag}});
  assert.equal(res.status,304,"A page that has it is told so");
  [res,up]=await Ask(env,url,{method:"HEAD"});
  assert.equal(res.headers.get("Content-Length"),String(MANIFEST.length));
  assert.equal(await res.text(),"");
  [res,up]=await Ask(env,FILES+"TempleOS-Web/"+SHA+
	"/vendor/ffmpeg/core/ffmpeg-core.wasm");
  assert.equal(res.headers.get("Content-Type"),"application/wasm",
	"A wasm has its type, so it can compile as it streams");
  assert.deepEqual(await res.bytes(),WASM,"A big file streams in whole");
  [res,up]=await Ask(env,FILES+"HEMU/"+SHA+"/live.bin.gz");
  assert.equal(res.status,200,"HEMU's snapshots are served too");
  for (path of ["TempleOS-Web/"+SHA+"/index.html",
	"TempleOS-Web/"+SHA+"/assets/transcripts/../../index.html",
	"TempleOS-Web/"+SHA+"/assets/transcripts/..%2F..%2Findex.html",
	"TempleOS-Web/"+SHA+"/assets/transcripts","HEMU/"+SHA+"/index.html",
	"TempleOS-Web/"+SHA+"/assets/terry-sprites.gr.gz.old",
	"Other/"+SHA+"/assets/transcripts/manifest.json",
	"TempleOS-Web/master/assets/transcripts/manifest.json"]) {
    [res,up]=await Ask(env,FILES+path);
    assert.deepEqual([res.status,up],[404,[]],"Nothing else is served: "+path);
  }
  [res,up]=await Ask(env,FILES+"TempleOS-Web/"+"f".repeat(40)+
	"/assets/terry-sprites.gr.gz");
  assert.deepEqual([res.status,await res.text()],[502,"github 404"],
	"A file GitHub lacks is a 502");
  [res,up]=await Ask(env,url,{method:"POST"});
  assert.deepEqual([res.status,up],[405,[]],"Only GET and HEAD are answered");
  [res,up]=await Ask(env,url,{method:"OPTIONS"});
  assert.equal(res.status,204);
  assert.equal(res.headers.get("Access-Control-Allow-Methods"),"GET, HEAD");
  assert.equal(res.headers.get("Access-Control-Allow-Headers"),"Range");
}

{
  let res,up,range,path,env={},url=FILES+"archive/"+ITEM+"/"+VIDEO;
  [res,up]=await Ask(env,url,{headers:{Range:"bytes=10-19",Cookie:"c=1",
	Authorization:"Bearer x",Origin:"https://a.test"}});
  assert.equal(res.status,206,"One range of a listed video is passed on");
  assert.deepEqual(up,[[ARCHIVE+VIDEO,"GET",{range:"bytes=10-19"}]],
	"from archive.org, sent nothing but the range");
  assert.deepEqual(await res.bytes(),BytesMk(SIZE).slice(10,20));
  assert.equal(res.headers.get("Content-Range"),"bytes 10-19/"+SIZE);
  assert.equal(res.headers.get("Content-Length"),"10");
  assert.equal(res.headers.get("ETag"),'"5b8f-3e8"');
  assert.equal(res.headers.get("Accept-Ranges"),"bytes");
  assert.equal(res.headers.get("Access-Control-Allow-Origin"),"*");
  assert.match(res.headers.get("Access-Control-Expose-Headers"),
	/Content-Range.*Accept-Ranges.*Content-Length.*ETag/,
	"and the page may read its headers");
  assert.equal(res.headers.get("Cache-Control"),"public, max-age=86400");
  [res,up]=await Ask(env,url,{method:"HEAD"});
  assert.deepEqual([res.status,res.headers.get("Content-Length")],
	[200,String(SIZE)],"HEAD gives the size");
  assert.deepEqual(up,[[ARCHIVE+VIDEO,"HEAD",{}]]);
  [res,up]=await Ask(env,url,{headers:{Range:"bytes=0-16777215"}});
  assert.equal(res.status,206,"A range may be 16 MiB");
  [res,up]=await Ask(env,url,{headers:{Range:"bytes="+SIZE+"-"+(SIZE+9)}});
  assert.deepEqual([res.status,res.headers.get("Content-Range")],
	[416,"bytes */"+SIZE],"A range past the end gets archive.org's 416");
  for (range of [null,"bytes=0-","bytes=-10","bytes=0-1,4-5","bytes=5-4",
	"bytes=0-16777216","bytes=0-1234567890123456","items=0-9"]) {
    [res,up]=await Ask(env,url,{headers:range ? {Range:range} : {}});
    assert.deepEqual([res.status,up],[400,[]],
	  "A GET needs one closed range of at most 16 MiB: "+range);
  }
  for (path of [ITEM+"/videos/x.mp4","Other/"+VIDEO,"__proto__/"+VIDEO,
	ITEM+"/"+decodeURIComponent(VIDEO).replaceAll(" ","%20"),ITEM]) {
    [res,up]=await Ask(env,FILES+"archive/"+path,
	  {headers:{Range:"bytes=0-9"}});
    assert.deepEqual([res.status,up],[404,[]],
	  "Only what the index lists, as the page encodes it: "+path);
  }
  [res,up]=await Ask(env,url,{method:"POST",headers:{Range:"bytes=0-9"}});
  assert.deepEqual([res.status,up],[405,[]]);
  [res,up]=await Ask(env,FILES+"archive/"+ITEM+"/"+IGNORES,
	{headers:{Range:"bytes=0-9"}});
  assert.deepEqual([res.status,await res.text()],
	[502,"archive.org ignored the range"],"A whole file is not passed on");
  assert.ok(cancelled,"or read");
  [res,up]=await Ask(env,FILES+"archive/"+ITEM+"/"+FAILS,
	{headers:{Range:"bytes=0-9"}});
  assert.deepEqual([res.status,await res.text()],[502,"archive.org 500"]);
  [res,up]=await Ask(env,FILES+"archive/"+ITEM+"/"+GONE,
	{headers:{Range:"bytes=0-9"}});
  assert.deepEqual([res.status,await res.text()],
	[502,"archive.org unreachable"]);
}

assert.equal(readFileSync(new URL("ArchiveLst.json",import.meta.url),"utf8"),
	ArchiveLstMk(),"ArchiveLst.json is the index's list: run"+
	" node cdn/ArchiveLstMk.mjs");

console.log("cdn: ok");
