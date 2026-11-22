import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright-core";
import {ServeReq} from "../Misc/Server.mjs";

const site=createServer(ServeReq).listen(0,"127.0.0.1");
await once(site,"listening");
const url="http://127.0.0.1:"+site.address().port+(process.env.CORES==="4"?"/?smp":"/?single"),
  browser=await chromium.launch({executablePath:"/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
async function Ready(page) {
  await page.evaluate(async()=>window.os=await import("/Adam/Os.js"));
  await page.waitForFunction(()=>os.OsReady() && os.engine.capture.ready,null,{timeout:90000});
}
async function Write(page,text) {
  const r=await page.evaluate(text=>os.OsFileWrite("C:/Home/Preference.TXT",new TextEncoder().encode(text).buffer),text);
  assert(r.ok,r.msg);
  await page.waitForFunction(()=>os.os_disk.save?.state==="saved");
}
async function Read(page) {
  return page.evaluate(async()=>new TextDecoder().decode((await os.OsFileRead("C:/Home/Preference.TXT")).bytes));
}
async function Prefs(page,value) {
  await page.evaluate(async value=>(await import("/Adam/Persistence.js")).PersistenceCfg(value),value);
}
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[];
  await context.route("**/hemu/*.gz",async route=>route.fulfill({
    body:await readFile(new URL("../hemu/"+new URL(route.request().url()).pathname.split("/").pop(),import.meta.url)),contentType:"application/gzip"}));
  await context.route("https://templeosweb-*.workers.dev/**",route=>route.abort());
  await context.routeWebSocket(/templeosweb-/,socket=>socket.close());
  await context.addInitScript(()=>{
    window.sharedNames=[];window.machineEvents=[];window.sharedTraffic={frames:0,inputs:0};window.localFrames=0;
    const W=Worker,S=SharedWorker;
    window.Worker=class extends W {
      constructor(...args) {super(...args);this.addEventListener("message",({data:m})=>{if(m.cmd!=="frame")machineEvents.push(m);else localFrames++;});}
    };
    window.SharedWorker=class extends S {
      constructor(...args) {
        super(...args);sharedNames.push(args[1]?.name);
        this.port.addEventListener("message",({data:m})=>{if(m.cmd!=="frame")machineEvents.push(m);});
        const post=this.port.postMessage.bind(this.port);
        this.port.postMessage=(m,...rest)=>{
          if(m.op==="hostMessage" && m.value.cmd==="frame")sharedTraffic.frames++;
          if(m.op==="post" && m.value.cmd==="input")sharedTraffic.inputs++;
          return post(m,...rest);
        };
      }
    };
  });
  context.on("page",page=>page.on("pageerror",e=>errors.push(e.message)));
  const page=await context.newPage();
  await page.goto(url);await Ready(page);
  assert.deepEqual(await page.evaluate(()=>sharedTraffic),{frames:0,inputs:0},"Single-tab frames and input bypass synchronization");
  await page.click("#settingsBtn");
  assert.equal(await page.locator("#syncTabs").isChecked(),true);
  for(const id of ["rememberSession","saveWindows"])
    assert.equal(await page.locator("#"+id).isChecked(),false);
  await page.click("#settingsClose");
  await Write(page,"files only");
  await page.evaluate(async()=>{const r=await os.engine.Request({cmd:"osExec",target:"adam",src:"I64 PersistenceRamProbe=2468;"});if(!r.ok)throw Error(r.msg);});
  assert.equal(await page.evaluate(()=>machineEvents.some(m=>m.cmd==="sessionSave")),false);
  assert.equal(await page.evaluate(()=>localStorage.getItem("templeos.workspace")),null);
  await page.reload();await Ready(page);
  assert.equal(await Read(page),"files only");
  assert.equal(await page.evaluate(()=>machineEvents.some(m=>m.cmd==="restored")),false);
  const ram=await page.evaluate(()=>os.engine.Request({cmd:"osExec",target:"adam",src:'if (HashFind("PersistenceRamProbe",adam_task->hash_table,HTT_GLBL_VAR)) throw(\'RAM\');'}));
  assert(ram.ok,ram.msg);
  const starts=await page.evaluate(()=>machineEvents.filter(m=>m.cmd==="starting").length);
  const second=await context.newPage();await second.goto(url);await Ready(second);
  await page.waitForFunction(()=>sharedTraffic.frames>0);
  await Write(second,"shared files");assert.equal(await Read(page),"shared files");
  assert.equal(await page.evaluate(()=>machineEvents.some(m=>m.cmd==="sessionSave")),false);
  await second.close();
  await page.waitForFunction(()=>machineEvents.filter(m=>m.cmd==="sharing").at(-1)?.value===false);
  const idle=await page.evaluate(()=>({frames:localFrames,traffic:sharedTraffic.frames}));
  await page.waitForFunction(n=>localFrames>n+3,idle.frames);
  assert.equal(await page.evaluate(()=>sharedTraffic.frames),idle.traffic,"Sharing stops when the second tab closes");
  assert.equal(await page.evaluate(()=>machineEvents.filter(m=>m.cmd==="starting").length),starts,"Sharing never restarts the host");
  console.log("Automatic sync: single-tab frames/input stay local; second tab shares C:; closing it stops sharing without rebooting.");

  await page.click("#settingsBtn");await page.check("#saveWindows");await page.click("#settingsClose");
  await page.evaluate(()=>{const w=document.getElementById("keysWin");w.dataset.floating="1";Object.assign(w.style,{position:"fixed",left:"220px",top:"180px"});});
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem("templeos.workspace"))?.keysWin?.rect?.left==="220px");
  await page.reload();await Ready(page);
  assert.equal(await page.locator("#keysWin").evaluate(w=>w.style.left),"220px");
  await page.click("#settingsBtn");await page.uncheck("#saveWindows");await page.click("#settingsClose");
  await page.evaluate(()=>{document.getElementById("keysWin").style.left="330px";});
  await page.reload();await Ready(page);
  assert.equal(await page.evaluate(()=>localStorage.getItem("templeos.workspace")),null);
  assert.notEqual(await page.locator("#keysWin").evaluate(w=>w.style.left),"330px");
  console.log("Window saving: opt-in restores positions; opt-out discards saved layout and stops rewriting it.");

  await Prefs(page,{syncTabs:false,saveSession:false});await page.reload();await Ready(page);
  assert.deepEqual(await page.evaluate(()=>sharedNames),[]);
  const follower=await context.newPage();await follower.goto(url);await Ready(follower);
  assert.deepEqual(await follower.evaluate(()=>sharedNames),[]);
  assert.match(await follower.evaluate(()=>os.os_disk.save?.msg || ""),/Another TempleOS tab owns C:/);
  await follower.close();
  console.log("Sync opt-out: independent tabs create no coordinator and the single-writer guard protects C:.");

  await Prefs(page,{syncTabs:false,saveSession:true});await page.reload();await Ready(page);
  assert.match((await page.evaluate(()=>sharedNames))[0],/^templeos-session-/);
  await page.waitForFunction(()=>machineEvents.some(m=>m.cmd==="sessionSave" && m.state==="saved"),null,{timeout:90000});
  await page.evaluate(async()=>{const r=await os.engine.Request({cmd:"osExec",target:"adam",src:"I64 PersistenceRamProbe=2468;"});if(!r.ok)throw Error(r.msg);});
  const saved=await page.evaluate(()=>os.OsSessionSave());assert(saved.ok && saved.savedAt,saved.msg);
  await page.reload();await Ready(page);
  assert(await page.evaluate(()=>machineEvents.some(m=>m.cmd==="restored")));
  const resumed=await page.evaluate(()=>os.engine.Request({cmd:"osExec",target:"adam",src:"if (PersistenceRamProbe!=2468) throw('RAM');"}));
  assert(resumed.ok,resumed.msg);
  await Prefs(page,{saveSession:false});await page.reload();await Ready(page);
  assert.deepEqual(await page.evaluate(()=>sharedNames),[]);
  assert.equal(await page.evaluate(()=>machineEvents.some(m=>m.cmd==="restored")),false);
  assert.equal(await Read(page),"shared files");
  console.log("Session opt-in: private checkpoint restores RAM; opt-out ignores it and keeps C:.");
  assert.deepEqual(errors,[]);
  await context.close();
} finally {await browser.close();site.closeAllConnections();site.close();}
