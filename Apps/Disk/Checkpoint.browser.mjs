import {MachineObserve} from "../../Adam/Test/MachineObserve.mjs";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright-core";
import {ServeReq} from "../../Misc/Server.mjs";

const site=createServer(ServeReq).listen(0,"127.0.0.1");
await once(site,"listening");
const browser=await chromium.launch({executablePath:"/usr/bin/chromium",headless:true,args:["--no-sandbox"]}),
  url="http://127.0.0.1:"+site.address().port;
async function Ready(page)
{
  await page.evaluate(async()=>window.os=await import("/Adam/Os.js"));
  await page.waitForFunction(()=>os.OsReady() && os.engine.capture.ready,null,{timeout:90000});
}
async function Request(page,message)
{
  const result=await page.evaluate(message=>os.engine.Request(message),message);
  assert(result.ok,result.msg);
  return result;
}
try {
  for (const cores of [1,4]) {
    const context=await browser.newContext(),errors=[];
    await context.route("**/hemu/*.gz",async route=>route.fulfill({
      body:await readFile(new URL("../../hemu/"+new URL(route.request().url()).pathname.split("/").pop(),import.meta.url)),
      contentType:"application/gzip"}));
    await context.addInitScript(()=>{try {localStorage.setItem("tos-persistence",JSON.stringify({syncTabs:true,saveSession:true,saveWindows:true}));} catch {}});
    await context.routeWebSocket(/templeosweb-.*\.workers\.dev/,socket=>socket.close());
    await MachineObserve(context,()=>{
      window.events=[];window.frames=[];
      const Base=SharedWorker;
      window.SharedWorker=class extends Base {
        constructor(...args) {
          super(...args);
          if (!String(args[0]).includes("MachineHub.js")) return;
          ObserveMachineEvents(this.port,({data:m})=>{
            if (m.cmd==="frame") frames.push(performance.now());
            else if (["sessionSave","paused","settings","restored"].includes(m.cmd))
              events.push({...m,t:performance.now()});
          });
        }
      };
    });
    const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
    await page.goto(url+"/?"+(cores===1?"single":"smp"));await Ready(page);
    await page.waitForFunction(()=>events.some(m=>m.cmd==="sessionSave" && m.state==="saved"),null,{timeout:60000});
    await page.waitForFunction(()=>frames.at(-1)>events.find(m=>m.state==="saved").t);
    const timing=await page.evaluate(()=>{
      const start=events.find(m=>m.state==="saving").t,end=events.find(m=>m.state==="saved").t,
        sample=frames.filter(t=>t>start-500);
      return {duration:end-start,frames:frames.filter(t=>t>=start && t<=end).length,
        gap:Math.max(...sample.slice(1).map((t,i)=>t-sample[i]))};
    });
    assert(timing.frames>10,"Autosave must keep delivering guest frames while encoding");
    assert(timing.gap<1000,"Autosave must not halt the OS for seconds: "+timing.gap);
    console.log(cores+" cores: autosave "+Math.round(timing.duration)+" ms, "+timing.frames+
      " frames during save, largest gap "+Math.round(timing.gap)+" ms.");

    await Request(page,{cmd:"osExec",target:"adam",src:"I64 WebCheckpointProbe=13579;"});
    await page.evaluate(()=>{
      events=[];window.checkpoint=null;
      os.OsSessionSave().then(result=>window.checkpoint=result);
    });
    await page.waitForFunction(()=>events.some(m=>m.state==="saving"));
    await page.evaluate(()=>os.engine.post({cmd:"pause",value:true}));
    await page.waitForFunction(()=>events.some(m=>m.cmd==="paused" && m.value));
    assert.equal(await page.evaluate(()=>checkpoint),null,"Pause is handled before encoding finishes");
    await page.evaluate(()=>os.engine.post({cmd:"pause",value:false}));
    await page.waitForFunction(()=>events.some(m=>m.cmd==="paused" && !m.value));
    const write=await page.evaluate(()=>os.OsFileWrite("C:/Home/Checkpoint.TXT",
      new TextEncoder().encode("written during compression\n").buffer));
    assert(write.ok,write.msg);
    await page.waitForFunction(()=>checkpoint,null,{timeout:60000});
    const skipped=await page.evaluate(()=>checkpoint);
    assert(skipped.ok,skipped.msg);assert.equal(skipped.savedAt,null,
      "Old RAM cannot be labelled with the revision of a newer file write");
    await page.waitForFunction(()=>events.some(m=>m.state==="saved"),null,{timeout:60000});
    await page.reload();await Ready(page);
    assert(await page.evaluate(()=>events.some(m=>m.cmd==="restored")),"Follow-up save completes without another user action");
    await Request(page,{cmd:"osExec",target:"adam",src:"if (WebCheckpointProbe!=13579) throw('Chkpt');"});
    assert.equal(await page.evaluate(async()=>new TextDecoder().decode((await os.OsFileRead("C:/Home/Checkpoint.TXT")).bytes)),
      "written during compression\n");

    await page.evaluate(()=>{
      events=[];frames=[];window.checkpoint=null;
      os.OsSessionSave().then(result=>window.checkpoint=result);
    });
    await page.waitForFunction(()=>events.some(m=>m.state==="saving"));
    await page.evaluate(()=>{os.engine.Visible(false);os.engine.Visible(true);});
    await page.waitForFunction(()=>events.filter(m=>m.state==="saving").length>=2,null,{timeout:60000});
    await page.waitForFunction(()=>events.filter(m=>m.state==="saved").length>=2,null,{timeout:60000});
    const queued=await page.evaluate(()=>{
      const saves=events.filter(m=>m.state==="saving"),end=events.filter(m=>m.state==="saved").at(-1).t;
      return frames.filter(t=>t>=saves[1].t && t<=end).length;
    });
    assert(queued>10,"A save queued while hidden cannot suspend a view that has become visible");
    assert.deepEqual(errors,[]);
    console.log(cores+" cores: pause/input during encoding; newer disk revision; automatic follow-up and RAM restore; queued hidden save stays responsive.");
    await context.close();
  }
} finally {await browser.close();site.closeAllConnections();site.close();}
