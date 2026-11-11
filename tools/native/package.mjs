import assert from "node:assert/strict";
import {parseArgs} from "node:util";
import {spawnSync} from "node:child_process";
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,readdirSync,copyFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {SnapshotInspect} from "../../engine/Snapshot.js";

const root=fileURLToPath(new URL("../../",import.meta.url)),{values}=parseArgs({options:{
  session:{type:"string",default:"build/native/TempleOS-default.hemu"},version:{type:"string",default:"0.1.0"},
  build:{type:"boolean",default:false}}});
assert.equal(process.platform,"linux");assert.equal(process.arch,"x64","Only Linux x86-64 is qualified");
assert.match(values.version,/^[0-9][A-Za-z0-9.+_]*$/);
const hash=bytes=>createHash("sha256").update(bytes).digest("hex"),
  run=(cmd,args,options={})=>{const result=spawnSync(cmd,args,{cwd:root,encoding:"utf8",...options});
    if(result.error)throw result.error;assert.equal(result.status,0,result.stderr||cmd+" failed");return result.stdout;},
  native=JSON.parse(readFileSync(resolve(root,"build/native/Build.json"))),
  runtime=JSON.parse(readFileSync(resolve(root,"build/native/Runtime.json"))),
  session=readFileSync(resolve(root,values.session)),info=await SnapshotInspect(session,{busProtocol:0});
assert.ok(info,"Package a complete .hemu session");assert.equal(info.meta.cores,1,"The package default must contain one CPU");
assert.equal(info.meta.paused,false,"Create the default with fixture.mjs --running");
assert.equal(info.meta.rate,0,"Create the default with fixture.mjs --rate 0");
assert.equal(info.meta.actualRate,0,"The default's uncapped rate must have been applied");assert.equal(info.meta.repeat,false,"BIOS key repeat defaults to off");
for(const [path,expected] of Object.entries(native.sources))
  assert.equal(hash(readFileSync(resolve(root,"engine/native",path))),expected,"Rebuild native source: "+path);
for(const [path,expected] of Object.entries(runtime.inputs))
  assert.equal(hash(readFileSync(resolve(root,path))),expected,"Rebuild native bundle: "+path);
assert.equal(hash(readFileSync(resolve(root,"build/native/Runtime.js"))),native.bundle);
assert.equal(hash(readFileSync(resolve(root,"build/native/hemu-native"))),native.binary);
const packages=["qt6-base","qt6-declarative","qt6-multimedia","qt6-wayland","webkit2gtk-4.1"],dependencies={};
for(const name of packages) {
  const line=run("pacman",["-Q",name]).trim().split(/\s+/);assert.equal(line[0],name);assert.match(line[1],/^[A-Za-z0-9:._+~-]+$/);dependencies[name]=line[1];
}
const out=resolve(root,"build/native/package"),name="hemu-native-"+values.version,epoch=run("git",["show","-s","--format=%ct","HEAD"]).trim();
assert.match(epoch,/^\d+$/);
mkdirSync(out,{recursive:true});const stage=mkdtempSync(resolve(out,"source-")),source=resolve(stage,name);
function Copy(from,to){const destination=resolve(source,to);mkdirSync(dirname(destination),{recursive:true});copyFileSync(resolve(root,from),destination);}
for(const path of readdirSync(resolve(root,"engine/native")))Copy("engine/native/"+path,"engine/native/"+path);
for(const path of ["Runtime.js","Runtime.json","Runtime.qrc"])Copy("build/native/"+path,"build/native/"+path);
for(const path of ["constraints.h","constraints.c","relative.h","relative.c"])Copy("build/native/protocol/"+path,"build/native/protocol/"+path);
for(const path of ["hemu-native.desktop","hemu-native.xml","hemu-native.svg"])Copy("tools/native/package/"+path,"package/"+path);
writeFileSync(resolve(source,"TempleOS.hemu"),session);
const checked=JSON.parse(run(resolve(root,"build/native/hemu-native"),["check",resolve(source,"TempleOS.hemu")],{env:{...process.env,GIO_USE_VFS:"local"}}));
assert.equal(checked.cores,1);assert.equal(checked.paused,false);assert.equal(checked.actualRate,0);assert.equal(checked.fault,"");

Copy("tools/native/DeferredGc.md","DeferredGc.md");
writeFileSync(resolve(source,"README.md"),readFileSync(resolve(root,"engine/native/README.md"),"utf8").replace("../../tools/native/DeferredGc.md","DeferredGc.md"));
const provenance={qualifiedBuild:native,runtime,dependencies,sourceEpoch:Number(epoch),snapshot:hash(session),engine:info.meta.engineHash,stockCapture:info.meta.stockCapture||null,
  defaults:{cores:1,rate:0,repeat:false,paused:false},rgbaSha256:checked.rgbaSha256,sourceRevision:run("git",["rev-parse","HEAD"]).trim(),sourceDirty:!!run("git",["status","--porcelain"]).trim()};
writeFileSync(resolve(source,"Provenance.json"),JSON.stringify(provenance,null,2)+"\n");
const archive=resolve(out,name+".tar.gz");
run("tar",["--sort=name","--mtime=@"+epoch,"--owner=0","--group=0","--numeric-owner","-czf",archive,"-C",stage,name]);
const template=readFileSync(resolve(root,"tools/native/package/PKGBUILD.in"),"utf8"),depends=[...Object.entries(dependencies).map(([name,version])=>name+"="+version),"zlib","wayland","xdg-desktop-portal","shared-mime-info"];
writeFileSync(resolve(out,"PKGBUILD"),template.replaceAll("@VERSION@",values.version).replace("@DEPENDS@",depends.map(name=>"'"+name+"'").join(" ")).replace("@SHA256@",hash(readFileSync(archive))));
if(values.build)run("makepkg",["--cleanbuild","--force","--noconfirm"],{cwd:out,stdio:"inherit",env:{...process.env,SOURCE_DATE_EPOCH:epoch}});
console.log(out);
