import {spawnSync} from "node:child_process";
import {mkdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
const root=fileURLToPath(new URL("../../../",import.meta.url)),protocols=spawnSync("pkg-config",["--variable=pkgdatadir","wayland-protocols"],{encoding:"utf8"}).stdout.trim();
function Run(cmd,args,cwd=root){const r=spawnSync(cmd,args,{cwd,stdio:"inherit"});if(r.error)throw r.error;if(r.signal||r.status)throw Error(cmd+" failed");}
for(const [name,path]of [["constraints","pointer-constraints/pointer-constraints-unstable-v1.xml"],["relative","relative-pointer/relative-pointer-unstable-v1.xml"]])
  Run("wayland-scanner",["server-header",resolve(protocols,"unstable",path),resolve(root,"build/native/protocol",name+"-server.h")]);
for(const name of ["client","server","backend"]){const out=resolve(root,"build/native/pointer/"+name);mkdirSync(out,{recursive:true});Run("qmake6",[resolve(root,"tools/native/pointer/"+name+".pro"),...(name==="backend"?["RESOURCES+="+resolve(root,"build/native/Runtime.qrc")]:[])],out);Run("make",["-j2"],out);}
