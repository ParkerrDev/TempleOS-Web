import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createServer} from "node:http";
import {once} from "node:events";
import {chromium} from "playwright-core";
import {ServeReq} from "../../server.mjs";
import {DesktopServer} from "../hemu/desktop.mjs";
import {BrowserMachine,MachinePost,MachineReady} from "../hemu/BrowserMachine.mjs";

const site=createServer(ServeReq).listen(0,"127.0.0.1");await once(site,"listening");
const desktop=await DesktopServer({cores:4}),browser=await chromium.launch({
  executablePath:process.env.CHROMIUM||"/usr/bin/chromium",headless:true,args:["--no-sandbox"]}),
  source=await readFile(new URL("../hemu/BusGuest.HC",import.meta.url),"latin1");
try {
  for(const app of ["page","desktop"]) {
    const context=await browser.newContext({viewport:{width:1280,height:800}});
    await BrowserMachine(context,{gate:true});
    const page=await context.newPage(),errors=[],downloads=[];
    page.on("console",message=>{if(message.type()==="error"||message.type()==="warning")console.log(app+": "+message.text());});
    page.on("pageerror",e=>errors.push(e.message));page.on("dialog",d=>d.accept());
    page.on("download",d=>downloads.push(d));
    await page.goto(app==="page"?`http://127.0.0.1:${site.address().port}/?smp`:desktop.url);
    await MachineReady(page,4);
    await page.waitForFunction(()=>window.machine.events.some(m=>m.cmd==="guestPatch"&&m.state==="installed"),null,{timeout:45000});
    const restart=app==="page"?"#restartBtn":"#restart",pause=app==="page"?"#pauseBtn":"#pause";
    for(const action of ["cancel","fault"]) {
      const before=await page.evaluate(()=>({events:window.machine.events.length,terms:window.machine.terminations.length}));
      await page.evaluate(()=>Atomics.store(new Int32Array(window.machine.gate),0,1));
      await MachinePost(page,{cmd:"osExec",id:"held-"+action,target:"adam",src:source});
      await page.waitForFunction(()=>Atomics.load(new Int32Array(window.machine.gate),0)===2,null,{timeout:20000});
      assert.equal(await page.evaluate(()=>{
        const w=window.machine.workers.findLast(w=>w.machineCore===1&&!w.machineTerminated);
        return Atomics.load(new Int32Array(w.machineControl),12);
      }),2,"the actual AP owns the bus, with its instruction unfinished");
      if(action==="cancel") {
        //The request may queue, but it must never capture this unfinished instruction.
        await MachinePost(page,{cmd:"exportSnapshot"});
        await page.locator(restart).click();
      } else {
        await page.evaluate(()=>{const g=new Int32Array(window.machine.gate);Atomics.store(g,0,3);Atomics.notify(g,0);});
        await page.waitForFunction(()=>window.machine.events.some(m=>m.cmd==="error"&&m.retained),null,{timeout:10000});
        assert.equal(await page.locator(pause).isDisabled(),true);
        if(app==="page") {
          await page.locator("#osNotice").waitFor({state:"visible"});
          await page.locator("#diskBtn").click();await page.locator("#dlSnap").click();
          await page.waitForFunction(()=>document.getElementById("diskStatus").textContent.includes("coordination failed"));
          await page.locator("#diskClose").click();
        } else assert.equal(await page.locator("#save").isDisabled(),true);
        await MachinePost(page,{cmd:"exportSnapshot"});
        await page.waitForFunction(n=>window.machine.events.slice(n).some(m=>m.cmd==="exportResult"&&!m.ok),before.events);
        await page.locator(restart).click();
      }
      await MachineReady(page,4,{after:before.events});
      const result=await page.evaluate(({events,terms})=>({
        exports:window.machine.events.slice(events).filter(m=>m.cmd==="exportResult"),
        stopped:window.machine.terminations.slice(terms),
        owner:window.machine.workers.findLast(w=>w.machineCore===1&&!w.machineTerminated).machineControl
          ?Atomics.load(new Int32Array(window.machine.workers.findLast(w=>w.machineCore===1&&!w.machineTerminated).machineControl),12):null
      }),before);
      assert.ok(result.stopped.length>=4);
      assert.ok(result.stopped.every(t=>t.stopped===1),"BusStop precedes every actual terminate call");
      assert.ok(result.stopped.some(t=>t.owner===2),"unfinished ownership is never cleared or stolen");
      assert.ok(result.exports.every(m=>!m.ok),"no partial resumable snapshot leaves the stopped machine");
      assert.equal(result.owner,0);assert.equal(downloads.length,0);
      assert.equal(await page.locator(pause).isEnabled(),true);
    }
    assert.deepEqual(errors,[]);
    await context.close();
    console.log(`${app}: forced AP ownership survives until cancellation/fault; all terminations stop coordination first, no partial snapshot is exported, restart uses fresh registered cores.`);
  }
} finally {
  await browser.close();await desktop.close();site.closeAllConnections();await new Promise(resolve=>site.close(resolve));
}
