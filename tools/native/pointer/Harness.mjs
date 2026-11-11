import {spawn} from "node:child_process";
import {mkdtempSync,chmodSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve,join} from "node:path";
export const directory=mkdtempSync(join(tmpdir(),"hemu-wayland-"));chmodSync(directory,0o700);
const children=[];
export function Child(name,extra) {
  const process=spawn(resolve("build/native/pointer",name,"pointer-"+name),name==="server"?["hemu-test"]:[],
    {env:{...globalThis.process.env,XDG_RUNTIME_DIR:directory,WAYLAND_DISPLAY:"hemu-test",QT_QUICK_BACKEND:"software",QT_WAYLAND_DISABLE_WINDOWDECORATION:"1",...extra},stdio:["pipe","pipe","pipe"]});
  let output="",errors="";const events=[],waiters=[];
  process.stderr.on("data",bytes=>errors+=bytes);process.stdout.on("data",bytes=>{
    output+=bytes;while(output.includes("\n")){const at=output.indexOf("\n"),line=output.slice(0,at);output=output.slice(at+1);let event;
      try{event=JSON.parse(line);}catch{errors+=line+"\n";continue;}events.push(event);
      for(const waiter of [...waiters])if(waiter.predicate(event)){waiters.splice(waiters.indexOf(waiter),1);clearTimeout(waiter.timer);waiter.resolve(event);}
    }
  });
  let ended=null;
  const exited=new Promise(resolve=>process.once("exit",(code,signal)=>{
    ended={code,signal};for(const waiter of waiters.splice(0)){clearTimeout(waiter.timer);waiter.reject(Error(name+" exited "+JSON.stringify(ended)+"\n"+errors));}resolve(ended);
  }));
  const child={process,exited,events,send:value=>process.stdin.write(JSON.stringify(value)+"\n"),wait(predicate,from=events.length){
    const old=events.slice(from).find(predicate);if(old)return Promise.resolve(old);
    if(ended)return Promise.reject(Error(name+" already exited "+JSON.stringify(ended)));
    return new Promise((resolve,reject)=>{const waiter={predicate,resolve,reject,timer:setTimeout(()=>reject(Error(name+" timed out\n"+JSON.stringify(events.slice(-20))+"\n"+errors)),10000)};waiters.push(waiter);});
  },errors:()=>errors};children.push(child);return child;
}

export function Diagnose(){for(const child of children)console.error(JSON.stringify(child.events.filter(e=>e.event!=="frame"&&!e.status?.match(/session: \d+ MiB/))),child.errors());}
export async function Close(){
  for(const child of children.reverse()) {
    if(child.process.exitCode!==null||child.process.signalCode!==null)continue;
    child.send({cmd:"quit"});
    const timer=setTimeout(()=>child.process.kill("SIGKILL"),3000);
    await child.exited;clearTimeout(timer);
    if(child.process.exitCode!==0)console.error(child.errors());
  }
  rmSync(directory,{recursive:true,force:true});
}
