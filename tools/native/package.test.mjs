import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {mkdtempSync,mkdirSync,readFileSync,rmSync,readdirSync} from "node:fs";
import {resolve,join} from "node:path";
import {tmpdir,loadavg} from "node:os";
import {Child,Close,directory} from "./pointer/Harness.mjs";

const folder=resolve(process.argv[2]||"build/native/package"),packages=readdirSync(folder).filter(path=>path.endsWith(".pkg.tar.zst")&&!path.includes("-debug-"));
assert.equal(packages.length,1,"Choose a folder with one native package");
const stage=mkdtempSync(join(tmpdir(),"hemu-package-")),run=(cmd,args,env)=>{
  const result=spawnSync(cmd,args,{encoding:"utf8",env:{...process.env,...env}});
  if(result.error)throw result.error;assert.equal(result.status,0,result.stderr);return result.stdout;};
let app=null,exited=null;
try {
  run("bsdtar",["-xf",resolve(folder,packages[0]),"-C",stage]);
  const binary=resolve(stage,"usr/bin/hemu-native"),snapshot=resolve(stage,"usr/share/hemu-native/TempleOS.hemu"),
    provenance=JSON.parse(readFileSync(resolve(stage,"usr/share/hemu-native/Provenance.json")));
  assert.match(run(binary,["--help"]),/packaged one-core/);
  const checked=JSON.parse(run(binary,["check",snapshot],{GIO_USE_VFS:"local"}));
  assert.equal(checked.cores,1);assert.equal(checked.paused,false);assert.equal(checked.rate,0);assert.equal(checked.actualRate,0);assert.equal(checked.repeat,false);
  assert.equal(checked.rgbaSha256,provenance.rgbaSha256);
  const invalid=spawnSync(binary,["check",snapshot,"not-a-number"],{encoding:"utf8"});assert.equal(invalid.status,1);assert.match(invalid.stderr,/Tick count/);
  run("desktop-file-validate",[resolve(stage,"usr/share/applications/hemu-native.desktop")]);
  run("update-mime-database",[resolve(stage,"usr/share/mime")]);
  const home=resolve(stage,"private-data");mkdirSync(home);
  const server=Child("server",{QT_QPA_PLATFORM:"offscreen"});await server.wait(e=>e.event==="ready",0);
  const screenshot="/tmp/hemu-native-package.png";server.send({cmd:"watch-frame",path:screenshot});await server.wait(e=>e.event==="command"&&e.cmd==="watch-frame",0);
  let errors="";const started=performance.now(),loadStart=loadavg();
  app=spawn(binary,[],{env:{...process.env,GIO_USE_VFS:"local",XDG_RUNTIME_DIR:directory,WAYLAND_DISPLAY:"hemu-test",QT_QPA_PLATFORM:"wayland",
    QT_QUICK_BACKEND:"software",QT_WAYLAND_DISABLE_WINDOWDECORATION:"1",XDG_DATA_HOME:home,XDG_DATA_DIRS:resolve(stage,"usr/share")},stdio:["ignore","pipe","pipe"]});
  app.stderr.on("data",bytes=>errors+=bytes);exited=new Promise(resolve=>app.once("exit",(code,signal)=>resolve({code,signal})));
  const observed=await Promise.race([server.wait(e=>e.event==="guest-frame",0),exited.then(result=>{throw Error("Packaged GUI exited "+JSON.stringify(result)+"\n"+errors);})]);
  assert.equal(observed.saved,true);console.log(JSON.stringify({package:packages[0],startupMs:performance.now()-started,loadStart,loadEnd:loadavg(),observed,screenshot,
    note:"Single observed startup under current host load, not a stable performance guarantee"}));
} finally {
  if(app&&app.exitCode===null&&app.signalCode===null){app.kill("SIGTERM");await exited;}
  await Close();rmSync(stage,{recursive:true,force:true});
}
