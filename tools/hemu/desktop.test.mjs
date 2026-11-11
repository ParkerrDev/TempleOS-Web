import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {DesktopServer} from "./desktop.mjs";

const app=await DesktopServer({cores:Number(process.env.HEMU_DESKTOP_CORES||1)}),profile=mkdtempSync(join(tmpdir(),"hemu-desktop-test-"));
let chrome,ws;
try {
  const root=await fetch(app.url),headers=root.headers;
  assert.equal(root.status,200);assert.match(await root.text(),/TempleOS screen/);
  assert.equal(headers.get("cross-origin-embedder-policy"),"require-corp");
  assert.equal((await fetch(app.url+".git/config")).status,404);
  assert.equal((await fetch(app.url+"session.json")).status,200);
  chrome=spawn(process.env.HEMU_BROWSER||"chromium",["--headless=new","--remote-debugging-port=0",
    "--no-first-run","--no-default-browser-check","--disable-gpu","--window-size=1000,800",`--user-data-dir=${profile}`,"about:blank"],{stdio:["ignore","ignore","pipe"]});
  const endpoint=await new Promise((done,fail)=>{
    let output="";const timeout=setTimeout(()=>fail(new Error("Chrome startup timeout: "+output)),10000);
    chrome.once("error",fail);chrome.stderr.on("data",data=>{
      output+=data;const match=/DevTools listening on (ws:\/\/[^\s]+)/.exec(output);
      if(match){clearTimeout(timeout);done(match[1]);}
    });
  });
  const base=new URL(endpoint);base.protocol="http:";base.pathname="/json/new";base.search="?about:blank";
  const page=await (await fetch(base,{method:"PUT"})).json();
  ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((done,fail)=>{ws.onopen=done;ws.onerror=fail;});
  let seq=0;const pending=new Map(),errors=[];
  ws.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown")errors.push(m.params.exceptionDetails);
    if(m.method==="Log.entryAdded" && m.params.entry.level==="error") errors.push(m.params.entry);
    if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}
  };
  const Send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
  });
  const Eval=async expression=>(await Send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true})).result.value;
  await Send("Runtime.enable");await Send("Log.enable");await Send("Page.navigate",{url:app.url});
  async function Wait(expression,ms=30000) {
    const until=performance.now()+ms;
    while(performance.now()<until){if(await Eval(expression))return;await new Promise(r=>setTimeout(r,100));}
    throw new Error("Desktop timeout: "+expression+"; "+await Eval('document.getElementById("status").textContent')+"; "+JSON.stringify(errors));
  }
  await Wait('Number(document.getElementById("screen").dataset.frames)>10 && !document.getElementById("pause").disabled');
  assert.equal(await Eval("crossOriginIsolated"),true);
  await Wait('!document.getElementById("save").disabled');
  if(process.env.HEMU_DESKTOP_CORES==="4") await Wait('document.getElementById("screen").dataset.cores==="4"');
  await Eval('document.getElementById("pause").click()');
  await Wait('document.getElementById("pause").textContent==="Resume"');
  const count=await Eval('document.getElementById("screen").dataset.frames');
  await new Promise(r=>setTimeout(r,250));
  assert.equal(await Eval('document.getElementById("screen").dataset.frames'),count);
  assert.match(await Eval('document.getElementById("fps").textContent'),/^(\d+|—) FPS$/);
  const screenshot=await Send("Page.captureScreenshot",{format:"png"});
  const path=process.env.HEMU_DESKTOP_SHOT||join(tmpdir(),"hemu-desktop.png");writeFileSync(path,Buffer.from(screenshot.data,"base64"));
  await Eval('document.getElementById("pause").click()');
  await Wait('document.getElementById("pause").textContent==="Pause"');
  await Eval('document.getElementById("rate").value="30";document.getElementById("rate").dispatchEvent(new Event("change"))');
  await Wait('Number(document.getElementById("screen").dataset.frames)>'+count);
  assert.deepEqual(errors,[]);
  console.log("Desktop Chromium window: isolated offline boot, canvas frames, coherent FPS, pause/resume and rate setting passed; "+path);
} finally {
  ws?.close();chrome?.kill();
  if(chrome && chrome.exitCode===null) await new Promise(done=>{chrome.once("exit",done);setTimeout(done,2000);});
  await app.close();rmSync(profile,{recursive:true,force:true});
}
