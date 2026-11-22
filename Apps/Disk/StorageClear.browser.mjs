import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright-core";
import {ServeReq} from "../../Misc/Server.mjs";

const root=new URL("../../",import.meta.url),
  server=createServer(ServeReq).listen(0,"127.0.0.1");
await once(server,"listening");
const origin="http://127.0.0.1:"+server.address().port,
  browser=await chromium.launch({executablePath:process.env.CHROMIUM || "/usr/bin/chromium",
    headless:true,args:["--no-sandbox"]});
function Stage(message) {console.log(new Date().toISOString()+" "+message);}
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(()=>{try {localStorage.setItem("tos-persistence",JSON.stringify({syncTabs:true,saveSession:true,saveWindows:true}));} catch {}});
  await context.route("https://templeosweb-*.workers.dev/**",route=>route.abort());
  await context.route("**/hemu/*.gz",async route=>{
    const name=new URL(route.request().url()).pathname.split("/").pop();
    await route.fulfill({body:await readFile(new URL("hemu/"+name,root)),contentType:"application/gzip"});
  });
  await context.routeWebSocket(/templeosweb-/,()=>{});
  await context.addInitScript(function (direct) {
    window.machineEvents=[];
    const type=direct?"Worker":"SharedWorker",Base=window[type];
    if (direct) window.SharedWorker=undefined;
    window[type]=class extends Base {
      constructor(...args) {
	super(...args);
	if (direct || String(args[0]).includes("MachineHub.js"))
	  (direct?this:this.port).addEventListener("message",({data:m})=>{
	    if (m.cmd!=="frame") machineEvents.push(m);
	  });
      }
    };
  },!!process.env.DIRECT);
  async function Ready(page)
  {
    await page.evaluate(async()=>window.os=await import("/Adam/Os.js"));
    try {
      await page.waitForFunction(()=>(os.OsReady() && os.engine.capture.ready) ||
	document.getElementById("ldtext").textContent.includes("emulator could not start"),null,{timeout:45000});
      assert(await page.evaluate(()=>os.OsReady() && os.engine.capture.ready),"The fresh machine must boot");
    }
    catch (error) {
      console.log("Failure state",JSON.stringify(await page.evaluate(()=>({ready:os.OsReady(),kind:os.engine.kind,
	capture:os.engine.capture,load:document.getElementById("ldtext").textContent,
	events:machineEvents.filter(m=>m.cmd!=="snd").slice(-60)})),null,2));
      throw error;
    }
  }
  async function Prepare(page)
  {
    const result=await page.evaluate(async()=>{
      const value=await os.engine.Request({cmd:"osExec",target:"adam",src:"I64 WebDeletedData=123456;"});
      if (!value.ok) throw Error(value.msg);
      const write=await os.OsFileWrite("C:/Home/DeletedData.HC",
	new TextEncoder().encode('"Delete this with site data";').buffer);
      if (!write.ok) throw Error(write.msg);
      return os.engine.Request({cmd:"saveSession"});
    });
    assert(result.ok,result.msg);assert(result.savedAt>0);
  }
  async function Cleared(page)
  {
    assert.equal(await page.evaluate(()=>machineEvents.some(m=>m.cmd==="restored")),false,
      "deleted machine RAM is not restored");
    const value=await page.evaluate(()=>os.engine.Request({cmd:"osExec",target:"adam",
      src:'if (HashFind("WebDeletedData",adam_task->hash_table,HTT_GLBL_VAR)) throw(\'Deleted\');'}));
    assert(value.ok,value.msg);
    const file=await page.evaluate(()=>os.OsFileRead("C:/Home/DeletedData.HC"));
    assert.equal(file.ok,false,"a fresh snapshot must not contain the deleted C: file");
  }
  const page=await context.newPage(),cdp=await context.newCDPSession(page);
  await page.goto(origin+"/?single");await Ready(page);
  Stage("Saving the real machine and C: file before deleting site data");
  await Prepare(page);
  await page.reload();await Ready(page);
  assert(await page.evaluate(()=>machineEvents.some(m=>m.cmd==="restored")),"ordinary reload restores saved RAM");
  assert.equal((await page.evaluate(()=>os.OsFileRead("C:/Home/DeletedData.HC"))).ok,true);
  const retained=await page.evaluate(()=>os.engine.Request({cmd:"osExec",target:"adam",
    src:"if (WebDeletedData!=123456) throw('Deleted');"}));
  assert(retained.ok,retained.msg);
  await cdp.send("Storage.clearDataForOrigin",{origin,storageTypes:"all"});
  Stage("Cleared; immediately reloading host");
  await page.reload();await Ready(page);await Cleared(page);
  Stage("Single-tab clear and immediate reload passed");
  await Prepare(page);
  const second=await context.newPage();await second.goto(origin+"/?single");await Ready(second);
  assert.equal((await second.evaluate(()=>os.OsFileRead("C:/Home/DeletedData.HC"))).ok,true);
  await cdp.send("Storage.clearDataForOrigin",{origin,storageTypes:"all"});
  await second.reload();await Ready(second);await Cleared(second);
  assert.equal(await page.evaluate(()=>os.OsReady()),false,"the old host stops when data is deleted");
  Stage("Surviving host plus follower refresh reset to the fresh machine");
  await page.reload();await Ready(page);await Cleared(page);
  Stage("PASS real machine storage deletion: saved RAM, C: file, immediate reload and surviving tabs");
} finally {await browser.close();server.closeAllConnections();server.close();}
