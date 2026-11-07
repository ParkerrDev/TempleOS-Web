//templeosweb-files serves the site's heavy files by two routes, neither of
//them an open proxy.
//
//  https://templeosweb-files.parkerrhunt.workers.dev/<repo>/<commit>/<path>
//tools/offload-redirects.mjs points Netlify's _redirects here, pinned to the
//commits the build used. The first request for a pinned file copies it from
//raw.githubusercontent.com into the bucket; later ones are served from R2,
//whose downloads cost nothing. A commit pins the bytes, so every response is
//immutable. Objects leave the bucket 30 days after they were written
//(Lifecycle.json), which drops old commits' copies; a live one is copied
//again. Only what Offload.js lists is served.
//
//  https://templeosweb-files.parkerrhunt.workers.dev/archive/<item>/<path>
//One byte range of a video that Terry Search's index lists (ArchiveLst.json),
//from archive.org, which sends no CORS headers, so a page can read a video's
//index and some of its frames without downloading it whole. <path> is
//encoded a segment at a time by encodeURIComponent, as the page's links are.
//GET needs one "Range: bytes=<first>-<last>" of at most RANGE_MAX bytes; HEAD
//gives the length.
//  deploy: cd cdn && npx wrangler deploy
import LST from "./ArchiveLst.json" with {type:"json"};
import {OFFLOAD} from "./Offload.js";

const TYPES={wasm:"application/wasm",json:"application/json"};
const CORS={"Access-Control-Allow-Origin":"*",
	"Cross-Origin-Resource-Policy":"cross-origin"};
const RANGE_MAX=16777216; //The largest moov box listed is 42 MB: 3 requests.
const ARCHIVE_HEADERS=["Content-Type","Content-Length","Content-Range","ETag",
	"Last-Modified"];

function Fail(status,text)
{
  return new Response(text,{status,headers:CORS});
}

function Served(repo,path)
{//A path OFFLOAD lists; one that ends in "/" is a folder.
  let p;
  if (!Object.hasOwn(OFFLOAD,repo) || path.includes(".."))
    return false;
  for (p of OFFLOAD[repo])
    if (p==path || p.endsWith("/") && path.startsWith(p))
      return true;
  return false;
}

async function Fill(env,key)
{//Copies the pinned file from GitHub into the bucket: null, or why not.
  let len,pipe,src=await fetch("https://raw.githubusercontent.com/ParkerrDev/"+
	key);
  if (!src.ok) {
    await src.body?.cancel();
    return "github "+src.status;
  }
  //GitHub sends a big binary as it is, with a length, so it streams. Text
  //comes gzipped, and fetch decodes it, so its length is unknown; it is small
  //and read whole.
  len=Number(src.headers.get("content-length"));
  if (src.headers.get("content-encoding") || !len)
    await env.FILES.put(key,await src.arrayBuffer());
  else {
    pipe=new FixedLengthStream(len);
    await Promise.all([src.body.pipeTo(pipe.writable),
	  env.FILES.put(key,pipe.readable)]);
  }
  return null;
}

function FileRead(req,env,key)
{//One R2 call. onlyIf answers If-None-Match with an object with no body.
  if (req.method=="HEAD")
    return env.FILES.head(key);
  return env.FILES.get(key,{onlyIf:req.headers});
}

function FileHeaders(key,obj)
{
  let h=new Headers(CORS);
  //A wasm streams-compiles only with its type.
  h.set("Content-Type",TYPES[key.split(".").pop()] ||
	"application/octet-stream");
  h.set("Cache-Control","public, max-age=31536000, immutable");
  h.set("ETag",obj.httpEtag);
  h.set("Content-Length",String(obj.size));
  return h;
}

async function FileFetch(req,env,repo,commit,path)
{
  let obj,err,headers,key=repo+"/"+commit+"/"+path;
  if (!Served(repo,path))
    return Fail(404,"not found");
  obj=await FileRead(req,env,key);
  if (!obj) {
    err=await Fill(env,key);
    if (err)
      return Fail(502,err);
    obj=await FileRead(req,env,key);
    if (!obj)
      return Fail(502,"missing after fill");
  }
  headers=FileHeaders(key,obj);
  if (req.method=="HEAD")
    return new Response(null,{headers});
  if (!("body" in obj))
    return new Response(null,{status:304,headers});
  return new Response(obj.body,{headers});
}

function ArchiveRange(req)
{//The one closed range a GET must send, or null.
  let first,last,m=/^bytes=(\d{1,15})-(\d{1,15})$/.exec(
	req.headers.get("Range"));
  if (!m)
    return null;
  first=Number(m[1]);
  last=Number(m[2]);
  if (last<first || last-first>=RANGE_MAX)
    return null;
  return m[0];
}

function ArchiveHeaders(src)
{
  let k,h=new Headers(CORS);
  for (k of ARCHIVE_HEADERS)
    if (src.headers.has(k))
      h.set(k,src.headers.get(k));
  h.set("Accept-Ranges","bytes");
  h.set("Access-Control-Expose-Headers",
	"Content-Range, Accept-Ranges, Content-Length, ETag");
  return h;
}

async function ArchiveFetch(req,item,path)
{//archive.org redirects /download/ to a data node, and fetch follows.
  let src,headers,range=ArchiveRange(req),init={method:req.method,headers:{}};
  if (!Object.hasOwn(LST,item) || !LST[item].includes(path))
    return Fail(404,"not found");
  if (req.method=="GET") {
    if (!range)
      return Fail(400,"send one Range: bytes=<first>-<last>, at most "+
	    RANGE_MAX+" bytes");
    init.headers.Range=range;
  }
  try {
    src=await fetch("https://archive.org/download/"+item+"/"+path,init);
  } catch {
    return Fail(502,"archive.org unreachable");
  }
  if (src.status==206 || src.status==416 ||
	src.status==200 && req.method=="HEAD") {
    headers=ArchiveHeaders(src);
    //The files date from 2018 and come with no Cache-Control. The Cache API,
    //which could keep them at the edge, does nothing on workers.dev.
    headers.set("Cache-Control","public, max-age=86400");
    return new Response(src.body,{status:src.status,headers});
  }
  await src.body?.cancel();
  if (src.status==200)
    return Fail(502,"archive.org ignored the range");
  return Fail(502,"archive.org "+src.status);
}

function FilesFetch(req,env)
{
  let m,path=new URL(req.url).pathname;
  if (req.method=="OPTIONS")
    return new Response(null,{status:204,headers:{...CORS,
	  "Access-Control-Allow-Methods":"GET, HEAD",
	  "Access-Control-Allow-Headers":"Range"}});
  if (req.method!="GET" && req.method!="HEAD")
    return Fail(405,"method not allowed");
  if (m=/^\/archive\/([^/]+)\/(.+)$/.exec(path))
    return ArchiveFetch(req,m[1],m[2]);
  if (m=/^\/([^/]+)\/([0-9a-f]{40})\/(.+)$/.exec(path))
    return FileFetch(req,env,m[1],m[2],m[3]);
  return Fail(404,"not found");
}

export default {fetch:FilesFetch};
