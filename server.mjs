//The site as Netlify serves it. "node server.mjs" serves the repo on PORT
//(8080) with _headers and _redirects applied. "node server.mjs Site" copies
//the files Netlify publishes into Site/, as tools/NetlifyBuild.sh does.
import {createServer} from "node:http";
import {cpSync,existsSync,readdirSync,readFileSync,statSync} from "node:fs";
import {extname,join,normalize,resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";

const ROOT=fileURLToPath(new URL(".",import.meta.url));
//Published: the pages, modules and styles at the top, these folders, the
//HolyC the site compiles and the snapshots (which _redirects sends to the
//CDN when the build has written it). Docs, tools, Workers and build inputs
//are not.
const SERVED=new RegExp("^([^/]+\\.(html|js|css)|_headers|_redirects|"+
  "chat/rules\\.js|presence/RoomGlbls\\.js|holyc-fmt/Fmt\\.js|"+
  "(assets|build|clip|editor|engine|fonts|games|god|search|sprites|vendor|holyc-wasm/src)/.+|"+
  "(holyc-fmt|holycraft)/[^/]+\\.HC|hemu/(?:[^/]+\\.gz|stock(?:-smp)?\\.disk|stock\\.json))$");
const NOT_SERVED=/\.(md|mjs|py)$|(^|\/)package\.json$|templeos_orig/;
const MIME={".html":"text/html; charset=UTF-8",
  ".js":"application/javascript; charset=UTF-8",
  ".css":"text/css; charset=UTF-8",".txt":"text/plain; charset=UTF-8",
  ".json":"application/json",".wasm":"application/wasm",".png":"image/png",
  ".svg":"image/svg+xml",".jpg":"image/jpeg",".ttf":"font/ttf",
  ".woff2":"font/woff2",".gif":"image/gif",".mp3":"audio/mpeg"};
const CACHE_DFT="public,max-age=0,must-revalidate";//Netlify's own

function PatRegExp(pat)
{//A Netlify path pattern; * takes the rest of the path.
  return new RegExp("^"+pat.replace(/[.+?^${}()|[\]\\]/g,"\\$&").
    replace("*","(.*)")+"$");
}

function HeadersRead()
{//The _headers rules, [pattern,name,value].
  let res=[],line,pat,i;
  for (line of readFileSync(join(ROOT,"_headers"),"utf8").split("\n")) {
    if (line[0]=="/")
      pat=PatRegExp(line.trim());
    else if (/^\s+[\w-]+:/.test(line)) {
      i=line.indexOf(":");
      res.push([pat,line.slice(0,i).trim(),line.slice(i+1).trim()]);
    }
  }
  return res;
}

function RedirectsRead()
{//The _redirects rules, [pattern,to,status], if the build wrote them.
  let res=[],line,w;
  if (!existsSync(join(ROOT,"_redirects")))
    return res;
  for (line of readFileSync(join(ROOT,"_redirects"),"utf8").split("\n")) {
    w=line.trim().split(/\s+/);
    if (w.length>2 && w[0][0]=="/")
      res.push([PatRegExp(w[0]),w[1],parseInt(w[2])]);
  }
  return res;
}

const HEADERS=HeadersRead(),REDIRECTS=RedirectsRead();

function Served(rel)
{
  let r;
  if (rel.endsWith(".gif") && !rel.startsWith("assets/afterdavis/"))
    return false;
  for (r of REDIRECTS)
    if (r[0].test("/"+rel))
      return false;
  return SERVED.test(rel) && !NOT_SERVED.test(rel);
}

function IsDir(rel)
{
  let st=statSync(join(ROOT,rel),{throwIfNoEntry:false});
  return st && st.isDirectory();
}

function IsFile(rel)
{
  let st=statSync(join(ROOT,rel),{throwIfNoEntry:false});
  return st && st.isFile();
}

function FilesLst(dir,skip)
{//Every file under dir, as paths from ROOT.
  let res=[],name,rel;
  for (name of readdirSync(join(ROOT,dir))) {
    rel=dir+name;
    if (name[0]!="." && name!="node_modules" && rel!=skip) {
      if (IsDir(rel))
	res.push(...FilesLst(rel+"/",skip));
      else
	res.push(rel);
    }
  }
  return res;
}

function Publish(dir)
{//Copies what Netlify serves into dir.
  let rel,cnt=0;
  for (rel of FilesLst("",dir))
    if (Served(rel)) {
      cpSync(join(ROOT,rel),resolve(ROOT,dir,rel),{dereference:true});
      cnt++;
    }
  console.log("Published "+cnt+" files to "+dir+"/");
}

function Serve(req,res)
{//Answers a request as Netlify would.
  let url=req.url.split("?")[0],rel,r,m,h={"Cache-Control":CACHE_DFT};
  for (r of REDIRECTS)
    if (m=r[0].exec(url)) {
      res.writeHead(r[2],{"Location":r[1].replace(":splat",m[1]),
	"Cache-Control":CACHE_DFT}).end();
      return;
    }
  for (r of HEADERS)
    if (r[0].test(url))
      h[r[1]]=r[2];
  rel=normalize(decodeURIComponent(url)).slice(1);
  if (rel!="" && !rel.endsWith("/") && IsFile(rel+"/index.html") &&
	Served(rel+"/index.html")) {
    res.writeHead(301,{"Location":url+"/"}).end();
    return;
  }
  if (rel=="" || rel.endsWith("/"))
    rel+="index.html";
  else if (!IsFile(rel) && IsFile(rel+".html"))
    rel+=".html";
  if (!Served(rel) || !IsFile(rel)) {
    h["Content-Type"]="text/html; charset=utf-8";
    res.writeHead(404,h).end("<!DOCTYPE html><title>Not found</title>"+
      "<p>Page not found</p>\n");
    return;
  }
  h["Content-Type"]=MIME[extname(rel)] || "application/octet-stream";
  res.writeHead(200,h).end(readFileSync(join(ROOT,rel)));
}

export function ServeReq(req,res)
{
  try {
    Serve(req,res);
  } catch (e) {
    res.writeHead(400).end();
  }
}

function Listening()
{
  console.log("TempleOS-Web on http://localhost:"+PORT+"/");
}

const PORT=Number(process.env.PORT) || 8080;
if (process.argv[1] && import.meta.url==pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2])
    Publish(process.argv[2]);
  else
    createServer(ServeReq).listen(PORT,Listening);
}
