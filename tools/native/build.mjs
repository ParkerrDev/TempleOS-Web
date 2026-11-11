import {build,version} from "esbuild";
import {mkdirSync,readFileSync,writeFileSync,readdirSync} from "node:fs";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {resolve,relative} from "node:path";
import {spawnSync} from "node:child_process";

const root=fileURLToPath(new URL("../../",import.meta.url)),out=resolve(root,"build/native");
if(version!=="0.28.2")throw Error("Native bundle requires locked esbuild 0.28.2; run npm ci");
const protocolInputs={};
mkdirSync(out,{recursive:true});
if(process.platform==="linux"&&!process.argv.includes("--bundle-only")) {
  const query=spawnSync("pkg-config",["--variable=pkgdatadir","wayland-protocols"],{encoding:"utf8"});
  if(query.status!==0)throw Error("Install wayland-protocols and wayland-scanner to build native pointer capture");
  const protocols=query.stdout.trim(),dir=resolve(out,"protocol");mkdirSync(dir,{recursive:true});
  for(const [name,path]of [["constraints","pointer-constraints/pointer-constraints-unstable-v1.xml"],["relative","relative-pointer/relative-pointer-unstable-v1.xml"]])
    for(const [mode,ext]of [["client-header","h"],["private-code","c"]]) {
      protocolInputs[path]=createHash("sha256").update(readFileSync(resolve(protocols,"unstable",path))).digest("hex");
      const run=spawnSync("wayland-scanner",[mode,resolve(protocols,"unstable",path),resolve(dir,name+"."+ext)],{stdio:"inherit"});
      if(run.error)throw run.error;if(run.signal)throw Error("wayland-scanner stopped by "+run.signal);if(run.status)process.exit(run.status);
    }
}
const result=await build({absWorkingDir:root,entryPoints:["engine/native/Runtime.js"],outfile:resolve(out,"Runtime.js"),
  bundle:true,platform:"neutral",format:"iife",globalName:"Hemu",target:"es2022",metafile:true,legalComments:"inline",
  logLevel:"warning"});
const hash=bytes=>createHash("sha256").update(bytes).digest("hex"),inputs={};
for(const path of Object.keys(result.metafile.inputs).sort())inputs[path]=hash(readFileSync(resolve(root,path)));
writeFileSync(resolve(out,"Runtime.json"),JSON.stringify({esbuild:version,sha256:hash(readFileSync(resolve(out,"Runtime.js"))),inputs},null,2)+"\n");
writeFileSync(resolve(out,"Runtime.qrc"),'<RCC><qresource prefix="/hemu"><file alias="Runtime.js">Runtime.js</file></qresource></RCC>\n');
if(!process.argv.includes("--bundle-only"))for(const [cmd,args] of [["qmake6",[resolve(root,"engine/native/hemu.pro"),"RESOURCES+="+resolve(out,"Runtime.qrc")]], ["make",["-j2"]]]) {
  const run=spawnSync(cmd,args,{cwd:out,stdio:"inherit"});if(run.error)throw run.error;if(run.signal)throw Error(cmd+" stopped by "+run.signal);if(run.status)process.exit(run.status);
}
if(!process.argv.includes("--bundle-only")) {
  const sources={};
  for(const name of readdirSync(resolve(root,"engine/native")).sort())
    sources[name]=hash(readFileSync(resolve(root,"engine/native",name)));
  const info=cmd=>{const r=spawnSync(cmd[0],cmd.slice(1),{encoding:"utf8"});return r.status===0?r.stdout.trim():null;};
  writeFileSync(resolve(out,"Build.json"),JSON.stringify({platform:process.platform,arch:process.arch,
    qt:info(["qmake6","-query","QT_VERSION"]),waylandClient:info(["pkg-config","--modversion","wayland-client"]),
    waylandProtocols:info(["pkg-config","--modversion","wayland-protocols"]),protocolInputs,javascriptCore:info(["pkg-config","--modversion","javascriptcoregtk-4.1"]),
    bundle:hash(readFileSync(resolve(out,"Runtime.js"))),binary:hash(readFileSync(resolve(out,"hemu-native"))),sources},null,2)+"\n");
}
console.log(relative(root,out));
