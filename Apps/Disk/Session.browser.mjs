import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {chromium} from "playwright-core";
import {ServeReq} from "../../Misc/Server.mjs";

const server=createServer(ServeReq).listen(0,"127.0.0.1");
await once(server,"listening");
const url="http://127.0.0.1:"+server.address().port,
  profile=await mkdtemp(join(tmpdir(),"temple-session-")),errors=[];
let context;
function Bounded(promise,label,ms=45000)
{
  let timer;
  const timeout=new Promise((_,Reject)=>{
    timer=setTimeout(()=>Reject(Error(label+" timed out after "+ms+" ms")),ms);
  });
  return Promise.race([promise,timeout]).finally(()=>clearTimeout(timer));
}
function Stage(cores,message)
{
  console.log(new Date().toISOString()+" ["+cores+" cores] "+message);
}
async function Open()
{
  context=await chromium.launchPersistentContext(profile,{executablePath:"/usr/bin/chromium",
    headless:true,args:["--no-sandbox"]});
  context.setDefaultTimeout(30000);
  context.setDefaultNavigationTimeout(30000);
  await context.routeWebSocket(/templeosweb-.*\.workers\.dev/,socket=>socket.close());
  await context.addInitScript(function () {
    window.sessionEvents=[];
    const Base=SharedWorker;
    window.SharedWorker=class extends Base {
      constructor(...args) {
        super(...args);
        if (String(args[0]).includes("MachineHub.js"))
          this.port.addEventListener("message",function ({data:m}) {
            if (m.cmd!="frame") window.sessionEvents.push(m);
          });
      }
    };
  });
}
async function Page(cores)
{
  let page=await context.newPage();
  page.on("pageerror",e=>errors.push(e.message));
  page.on("console",m=>{if(m.text().includes("failed")) console.log("browser",m.text());});
  await page.goto(url+(cores===1?"/?single":"/?smp"));
  await page.evaluate(async()=>window.sessionOs=await import("/Adam/Os.js"));
  await page.waitForFunction(()=>sessionOs.OsReady() && sessionOs.engine.capture.ready,
    null,{timeout:120000});
  assert.equal(await page.evaluate(()=>sessionOs.engine.kind),cores===1?"worker":"smp");
  return page;
}
async function Request(page,m)
{
  let result=await Bounded(page.evaluate(async function (m) {
    return (await import("/Adam/Os.js")).engine.Request(m);
  },m),"Guest request "+m.cmd,m.cmd==="saveSession"?60000:45000);
  assert(result.ok,result.msg);
  return result;
}
async function Write(page,name,text)
{
  let result=await Bounded(page.evaluate(async function ({name,text}) {
    return (await import("/Adam/Os.js")).OsFileWrite("C:/Home/"+name,
      new TextEncoder().encode(text).buffer);
  },{name,text}),"Write "+name);
  assert(result.ok,result.msg);
}
async function Read(page,name)
{
  return Bounded(page.evaluate(async function (name) {
    let result=await (await import("/Adam/Os.js")).OsFileRead("C:/Home/"+name);
    if (!result.ok) throw Error(result.msg);
    return new TextDecoder().decode(result.bytes);
  },name),"Read "+name);
}
async function Close()
{
  if (context) await Bounded(context.close(),"Closing test browser",15000);
  context=null;
}
try {
  for (let cores of [1,4]) {
    Stage(cores,"Booting and checking two-tab shared RAM/files");
    await Open();
    let page=await Page(cores);
    await Request(page,{cmd:"osExec",target:"adam",src:"I64 WebSessionProbe=123456;"});
    let second=await Page(cores);
    await Request(second,{cmd:"osExec",target:"adam",src:'if (WebSessionProbe!=123456) throw(\'Session\');'});
    await Write(page,"Shared.HC",'"Shared file";\n');
    assert.equal(await Read(second,"Shared.HC"),'"Shared file";\n');
    await Write(second,"Shared.HC",'"Changed from second tab";\n');
    assert.equal(await Read(page,"Shared.HC"),'"Changed from second tab";\n');
    Stage(cores,"Saving and reloading the CPU owner");
    await Request(page,{cmd:"saveSession"});
    await page.reload();
    await page.evaluate(async()=>window.sessionOs=await import("/Adam/Os.js"));
    await page.waitForFunction(()=>sessionOs.OsReady());
    await Request(page,{cmd:"osExec",target:"adam",src:'if (WebSessionProbe!=123456) throw(\'Session\');'});
    await Request(page,{cmd:"saveSession"});
    Stage(cores,"Closing the replacement CPU owner");
    await page.evaluate(()=>window.sessionEvents=[]);
    await second.close();
    await page.waitForFunction(()=>sessionEvents.some(m=>m.cmd==="starting") &&
      sessionOs.OsReady() && sessionOs.engine.capture.ready,null,{timeout:90000});
    await page.evaluate(async()=>{
      const os=await import("/Adam/Os.js");
      os.engine.post({cmd:"pause",value:true});
    });
    await page.waitForFunction(()=>sessionEvents.some(m=>m.cmd==="paused" && m.value));
    const saved=await Request(page,{cmd:"saveSession"});
    assert(saved.savedAt>0);
    Stage(cores,"Restoring paused RAM and files after a cold browser start");
    await Close();await Open();page=await Page(cores);
    assert(await page.evaluate(()=>sessionEvents.some(m=>m.cmd==="restored")),"Cold boot restores the saved machine.");
    assert.equal(await page.locator("#pauseBtn").textContent()," Play");
    await page.locator("#pauseBtn").click();
    await Request(page,{cmd:"osExec",target:"adam",src:'if (WebSessionProbe!=123456) throw(\'Session\');'});
    assert.equal(await Read(page,"Shared.HC"),'"Changed from second tab";\n');
    Stage(cores,"Restarting TempleOS and checking saved files");
    await page.evaluate(()=>window.sessionEvents=[]);
    await page.locator("#restartBtn").click();
    await page.waitForFunction(()=>sessionEvents.some(m=>m.cmd==="guestReady"),null,{timeout:90000});
    await page.waitForFunction(()=>sessionOs.OsReady(),null,{timeout:90000});
    assert.equal(await Read(page,"Shared.HC"),'"Changed from second tab";\n');
    const restartPaused=await page.evaluate(()=>sessionEvents.filter(m=>m.cmd==="paused").at(-1)?.value);
    assert.equal(restartPaused,false,"Restart loads the current stock desktop, not the paused session's embedded engine.");
    assert(!await page.evaluate(()=>sessionEvents.some(m=>m.cmd==="restored")),"Restart uses the prepared desktop.");
    Stage(cores,"Restart completed with paused="+restartPaused);
    Stage(cores,"Checkpointing a fresh RAM value before a real host renderer crash");
    await Request(page,{cmd:"osExec",target:"adam",src:"I64 WebCrashProbe=654321;"});
    second=await Page(cores);
    await Request(second,{cmd:"osExec",target:"adam",src:'if (WebCrashProbe!=654321) throw(\'Session\');'});
    await Request(page,{cmd:"saveSession"});
    await second.evaluate(()=>window.sessionEvents=[]);
    const crash=page.waitForEvent("crash",{timeout:15000}),cdp=await context.newCDPSession(page);
    cdp.send("Page.crash").catch(function () {});
    await crash;
    Stage(cores,"Host crashed; waiting for surviving follower to restore");
    await second.waitForFunction(()=>sessionEvents.some(m=>m.cmd==="restarting") &&
      sessionEvents.some(m=>m.cmd==="restored") && sessionOs.OsReady() && sessionOs.engine.capture.ready,
      null,{timeout:90000});
    assert.equal(await second.evaluate(()=>sessionOs.engine.kind),cores===1?"worker":"smp");
    if (cores===4) assert(await second.evaluate(()=>sessionEvents.some(m=>m.cmd==="smpReady" && m.ncore===4)));
    assert.equal(await Read(second,"Shared.HC"),'"Changed from second tab";\n');
    await Request(second,{cmd:"osExec",target:"adam",src:'if (WebCrashProbe!=654321) throw(\'Session\');'});
    Stage(cores,"Crash recovery restored the checkpoint in the surviving view, including RAM and files");
    assert.deepEqual(errors,[]);
    console.log(cores+" cores: shared files, single boot, live refresh, atomic save, paused cold restore with RAM variable, restart preserves files.");
    await Close();
    await rm(profile,{recursive:true,force:true});
  }
} catch (error) {
  for (const page of context?.pages() || []) {
    try {
      console.log("Failure state",await Bounded(page.evaluate(()=>({url:location.href,
        ready:window.sessionOs?.OsReady(),kind:window.sessionOs?.engine.kind,
        pause:document.getElementById("pauseBtn")?.textContent,
        events:window.sessionEvents?.slice(-20).map(({cmd,state,msg,error,value})=>({cmd,state,msg,error,value}))})),
        "Reading failure state",2000));
    } catch (diagnostic) {console.log("Failure state unavailable:",diagnostic.message);}
  }
  throw error;
} finally {
  await Close();await rm(profile,{recursive:true,force:true});
  server.closeAllConnections();server.close();
}
