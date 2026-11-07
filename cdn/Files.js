//templeosweb-files serves the site's heavy files from R2:
//  https://templeosweb-files.parkerrhunt.workers.dev/<repo>/<commit>/<path>
//tools/offload-redirects.mjs points Netlify's _redirects here, pinned to the
//commits the build used. The first request for a pinned file copies it from
//raw.githubusercontent.com into the bucket; later ones are served from R2,
//whose downloads cost nothing. A commit pins the bytes, so every response is
//immutable. Objects leave the bucket 30 days after they were written
//(Lifecycle.json), which drops old commits' copies; a live one is copied
//again. Only what Offload.js lists is served: this is no open proxy.
//  deploy: cd cdn && npx wrangler deploy
import {OFFLOAD} from "./Offload.js";

const TYPES={wasm:"application/wasm",json:"application/json"};
const CORS={"Access-Control-Allow-Origin":"*",
	"Cross-Origin-Resource-Policy":"cross-origin"};

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

async function FilesFetch(req,env)
{
  let m,key,obj,err,headers;
  if (req.method=="OPTIONS")
    return new Response(null,{status:204,
	  headers:{...CORS,"Access-Control-Allow-Methods":"GET, HEAD"}});
  if (req.method!="GET" && req.method!="HEAD")
    return Fail(405,"method not allowed");
  m=/^\/([^/]+)\/([0-9a-f]{40})\/(.+)$/.exec(new URL(req.url).pathname);
  if (!m || !Served(m[1],m[3]))
    return Fail(404,"not found");
  key=m[1]+"/"+m[2]+"/"+m[3];
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

export default {fetch:FilesFetch};
