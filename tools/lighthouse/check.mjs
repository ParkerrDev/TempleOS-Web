import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {createSecureServer} from "node:http2";
import {once} from "node:events";
import {fileURLToPath} from "node:url";
import {brotliCompressSync,constants} from "node:zlib";
import lighthouse from "lighthouse";
import {launch} from "chrome-launcher";
import Desktop from "lighthouse/core/config/desktop-config.js";
import {ServeReq} from "../../server.mjs";

const dir=new URL("../../tmp/lighthouse/",import.meta.url),
  url=process.argv[2] || "https://templeosweb.netlify.app/",
  mirror=!process.argv[2];
await mkdir(dir,{recursive:true});
const source={};
if (mirror) {
  const root=new URL("../../",import.meta.url);
  source.head=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();
  source.status=execFileSync("git",["status","--short"],{cwd:root,encoding:"utf8"});
  source.hashes={};
  for (const name of ["index.html","Os.js","WinMgr.js","Siblings.txt",
      "build/hemu.wasm","build/hemu-smp.wasm"])
    source.hashes[name]=createHash("sha256").update(await readFile(new URL(name,root))).digest("hex");
}
let server;
if (mirror) {
  const key=new URL("key.pem",dir),cert=new URL("cert.pem",dir);
  execFileSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes",
    "-keyout",fileURLToPath(key),"-out",fileURLToPath(cert),"-days","2",
    "-subj","/CN=templeosweb.netlify.app",
    "-addext","subjectAltName=DNS:templeosweb.netlify.app"],{stdio:"ignore"});
  server=createSecureServer({key:await readFile(key),cert:await readFile(cert),
    allowHTTP1:true},function (req,res) {
    let status=200,headers={};
    ServeReq(req,{
      writeHead(code,h={}) {status=code;headers=h;return this;},
      end(body) {
        if (body && /\bbr\b/.test(req.headers["accept-encoding"] || "") &&
            /javascript|json|text\/|svg|wasm/.test(headers["Content-Type"])) {
          body=brotliCompressSync(body,{params:{[constants.BROTLI_PARAM_QUALITY]:5}});
          headers["Content-Encoding"]="br";
          headers["Vary"]="Accept-Encoding";
        }
        res.writeHead(status,headers).end(body);
      }
    });
  });
  server.listen(8443,"127.0.0.1");
  await once(server,"listening");
}

try {
  for (const mode of ["mobile","desktop"]) {
    const chrome=await launch({chromePath:process.env.CHROMIUM || "/usr/bin/chromium",
      chromeFlags:["--headless=new","--no-sandbox",...(mirror?[
        "--host-resolver-rules=MAP templeosweb.netlify.app:443 127.0.0.1:8443",
        "--ignore-certificate-errors"]:[])]});
    try {
      const res=await lighthouse(url,{port:chrome.port,output:["json","html"],
        logLevel:"error"},mode=="desktop"?Desktop:undefined),
        tag=(mirror?"local-":"live-")+mode;
      for (const [i,ext] of ["json","html"].entries())
        await writeFile(new URL(tag+"."+ext,dir),res.report[i]);
      const lhr=res.lhr,summary={mode,mirror,url:lhr.finalDisplayedUrl,
        lighthouse:lhr.lighthouseVersion,time:lhr.fetchTime,
        warnings:lhr.runWarnings,source,scores:{},failed:[]};
      for (const [name,cat] of Object.entries(lhr.categories)) {
        summary.scores[name]=cat.score===null?null:Math.round(cat.score*100);
        for (const ref of cat.auditRefs) {
          const a=lhr.audits[ref.id];
          if (a.score!==null && a.score<1 && ref.weight>0)
            summary.failed.push({id:ref.id,title:a.title,score:a.score,
              display:a.displayValue,description:a.description,details:a.details});
        }
      }
      const agents=lhr.categories["agentic-browsing"].auditRefs.map(ref=>lhr.audits[ref.id]).
        filter(a=>a.score!==null);
      summary.agentic={passed:agents.filter(a=>a.score==1).length,total:agents.length};
      await writeFile(new URL(tag+"-summary.json",dir),JSON.stringify(summary,null,2)+"\n");
      console.log(tag,JSON.stringify(summary.scores),"warnings:",summary.warnings,
        "failed:",summary.failed.map(a=>a.id).join(", "));
      if (lhr.runtimeError)
        throw new Error(lhr.runtimeError.message);
      if (Object.values(summary.scores).some(n=>n!==100) || summary.warnings.length)
        process.exitCode=1;
    } finally {
      await chrome.kill();
    }
  }
} finally {
  if (server) {
    server.close();
    await once(server,"close");
  }
}
