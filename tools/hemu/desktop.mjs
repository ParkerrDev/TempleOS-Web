#!/usr/bin/env node
import {createServer} from "node:http";
import {createReadStream,existsSync,mkdtempSync,rmSync,statSync} from "node:fs";
import {resolve,extname,join,sep} from "node:path";
import {fileURLToPath} from "node:url";
import {tmpdir} from "node:os";
import {spawn} from "node:child_process";

const ROOT=fileURLToPath(new URL("../../",import.meta.url));
const MIME={".js":"text/javascript",".mjs":"text/javascript",".html":"text/html",".css":"text/css",
  ".json":"application/json",".wasm":"application/wasm",".gz":"application/gzip",".hemu":"application/gzip"};

export async function DesktopServer({root=ROOT,snapshot=null,cores=1,port=0}={}) {
  root=resolve(root);
  if (![1,4].includes(cores)) throw new Error("--cores must be 1 or 4");
  if (snapshot) snapshot=resolve(snapshot);
  if (snapshot && !statSync(snapshot).isFile()) throw new Error("Snapshot is not a file");
  if (!existsSync(join(root,"build/hemu.wasm"))) throw new Error("Build HEMU first: node engine/build.mjs build");
  let origin;
  const server=createServer((req,res)=>{
    const headers={"Cross-Origin-Opener-Policy":"same-origin","Cross-Origin-Embedder-Policy":"require-corp",
      "Cross-Origin-Resource-Policy":"same-origin","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
    try {
      if (req.headers.host!==new URL(origin).host || !["GET","HEAD"].includes(req.method)) {
        res.writeHead(403,headers);res.end();return;
      }
      const path=decodeURIComponent(new URL(req.url,origin).pathname);
      if (path==="/session.json") {
        res.writeHead(200,{...headers,"Content-Type":"application/json"});
        res.end(JSON.stringify({cores,boot:snapshot?"/session.hemu":`/hemu/live${cores===4?"-smp":""}.bin.gz`,stock:!snapshot}));return;
      }
      const local=path==="/"?"/engine/desktop/index.html":path;
      const allowed=local==="/Keyboard.js" || /^\/(engine|build|holyc-wasm\/src)\//.test(local) ||
        /^\/hemu\/live(-smp)?\.bin\.gz$/.test(local) || local==="/vendor/images/templeos-hd.qcow2.gz";
      const file=local==="/session.hemu"&&snapshot?snapshot:resolve(root,"."+local);
      if (!(local==="/session.hemu"&&snapshot) && (!allowed || !file.startsWith(root+sep) || !MIME[extname(file)])) {
        res.writeHead(404,headers);res.end();return;
      }
      const stat=statSync(file);if (!stat.isFile()) throw new Error("Not a file");
      res.writeHead(200,{...headers,"Content-Type":MIME[extname(file)]||"application/gzip","Content-Length":stat.size});
      if (req.method==="HEAD") res.end();else createReadStream(file).on("error",()=>res.destroy()).pipe(res);
    } catch {res.writeHead(404,headers);res.end();}
  });
  await new Promise((done,fail)=>{server.once("error",fail);server.listen(port,"127.0.0.1",done);});
  origin=`http://127.0.0.1:${server.address().port}`;
  return {url:origin+"/",close:()=>new Promise(done=>server.close(done))};
}

async function Main(args) {
  const opt={};let browser=process.env.HEMU_BROWSER,noOpen=false;
  for (let i=0;i<args.length;i++) {
    const arg=args[i];
    if (arg==="--no-open") noOpen=true;
    else if (["--snapshot","--cores","--port","--browser"].includes(arg) && args[i+1]) {
      const value=args[++i];
      if (arg==="--browser") browser=value;
      else opt[arg.slice(2)]=["--cores","--port"].includes(arg)?Number(value):value;
    } else if (arg==="--help") {
      console.log("node tools/hemu/desktop.mjs [--snapshot session.hemu] [--cores 1|4] [--browser chromium] [--no-open] [--port 0]");return;
    } else throw new Error("Unknown or incomplete option: "+arg);
  }
  const app=await DesktopServer(opt);console.log("HEMU desktop: "+app.url);
  let child,profile;
  const stop=async()=>{child?.kill();await app.close();if(profile)rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});};
  process.once("SIGINT",()=>stop().then(()=>process.exit(0)));
  process.once("SIGTERM",()=>stop().then(()=>process.exit(0)));
  if (!noOpen) {
    const candidates=process.platform==="darwin"?
      ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome","/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"]:
      process.platform==="win32"?[join(process.env.PROGRAMFILES||"C:/Program Files","Google/Chrome/Application/chrome.exe"),
        join(process.env.LOCALAPPDATA||"","Google/Chrome/Application/chrome.exe")]:["chromium","google-chrome","chromium-browser","microsoft-edge"];
    profile=mkdtempSync(join(tmpdir(),"hemu-window-"));
    for (const name of browser?[browser]:candidates) {
      child=spawn(name,[`--app=${app.url}`,`--user-data-dir=${profile}`,"--no-first-run","--no-default-browser-check",
        "--disable-background-mode","--window-size=1000,800"],{stdio:"ignore"});
      const started=await new Promise(done=>{child.once("spawn",()=>done(true));child.once("error",()=>done(false));});
      if (started) break;child=null;
    }
    if (!child) {await stop();throw new Error("No Chrome/Chromium/Edge found. Use --browser PATH or --no-open and open the printed local URL.");}
    child.once("exit",()=>stop());
  }
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))
  Main(process.argv.slice(2)).catch(err=>{console.error(err.message);process.exitCode=1;});
