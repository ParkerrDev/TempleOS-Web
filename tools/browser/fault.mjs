import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createServer} from "node:http";
import {once} from "node:events";
import {chromium} from "playwright-core";
import {ServeReq} from "../../server.mjs";

const root=new URL("../../",import.meta.url),
  server=createServer(ServeReq).listen(0,"127.0.0.1");
await once(server,"listening");
const origin="http://127.0.0.1:"+server.address().port,
  browser=await chromium.launch({executablePath:process.env.CHROMIUM ||
    "/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
try {
  for (const cores of [1,4]) {
    const context=await browser.newContext({viewport:{width:1280,height:800}}),
      page=await context.newPage(),errors=[];
    await context.route("**/hemu/*.gz",async route=>route.fulfill({
      body:await readFile(new URL("hemu/"+new URL(route.request().url()).pathname.split("/").pop(),root)),
      contentType:"application/gzip"}));
    await context.route("**/vendor/images/templeos-hd.qcow2.gz",async route=>route.fulfill({
      body:await readFile(new URL("vendor/images/templeos-hd.qcow2.gz",root)),
      contentType:"application/gzip"}));
    await context.route("https://templeosweb-*.workers.dev/**",route=>route.abort());
    await context.addInitScript(()=>{
      localStorage.setItem("tos-settings",JSON.stringify({rate:30,repeat:false}));
      window.guestEvents=[];window.guestFrames=0;window.terminated=0;
      const Base=window.Worker;
      window.Worker=class extends Base {
        constructor(...args) {
          super(...args);
          this.guestWorker=/\/engine\/hemu-(smp-)?worker\.js$/.test(new URL(args[0],location.href).pathname);
          if(!this.guestWorker)return;
          this.addEventListener("message",({data:m})=>{
            if (m.cmd=="frame") window.guestFrames++;
            else if (!["snd","log","progress"].includes(m.cmd)) window.guestEvents.push(m);
          });
        }
        postMessage(m,...args) {
          if (m.smp) window.guestCtrl=m.smp.ctrl;
          return super.postMessage(m,...args);
        }
        terminate() {if(this.guestWorker)window.terminated++;return super.terminate();}
      };
    });
    page.on("pageerror",error=>errors.push(error.message));
    await page.goto(origin+(cores==1?"/?single":"/?smp"));
    await page.waitForFunction(()=>window.guestEvents.some(m=>m.cmd=="guestPatch" &&
      m.state=="installed"),null,{timeout:30000});
    if (cores==4)
      await page.waitForFunction(()=>window.guestEvents.some(m=>m.cmd=="smpReady"));
    await page.evaluate(async core=>{
      const {engine}=await import("/Os.js");
      engine.post({cmd:"osExec",id:"fault-test",target:"adam",src:`
U0 FaultTask()
{
  Sleep(200);
  asm {
    DU8 0xD9,0xD1;
  }
}
Spawn(&FaultTask,,,${core});
`});
    },cores==1?-1:1);
    await page.waitForFunction(()=>window.guestEvents.some(m=>m.cmd=="error" && m.retained) &&
      window.guestEvents.some(m=>m.cmd=="paused" && m.value),null,{timeout:30000});
    assert.equal(await page.evaluate(()=>window.guestEvents.find(m=>m.cmd=="fileResult" && m.id=="fault-test")?.ok),true);
    await page.locator("#osNotice").waitFor({state:"visible"});
    assert.match(await page.locator("#osNoticeText").innerText(),/CPU [01] stopped.*unsupported instruction/);
    assert.equal(await page.locator("#pauseBtn").isDisabled(),true);
    assert.equal(await page.locator("#loadui").isVisible(),false);
    assert.equal(await page.evaluate(()=>window.terminated),0,"Faults retain the machine for inspection/export.");
    const stability=await page.evaluate(async()=>{
      const frames=window.guestFrames;
      for (let i=0;i<12;i++) await new Promise(requestAnimationFrame);
      const ctrl=window.guestCtrl && new Int32Array(window.guestCtrl);
      return {frames,after:window.guestFrames,generation:ctrl && Atomics.load(ctrl,2),
        acks:ctrl && [1,2,3].map(k=>Atomics.load(ctrl,4+k))};
    });
    assert.equal(stability.after,stability.frames);
    if (cores==4) {
      assert.ok(stability.generation>0);
      assert.deepEqual(stability.acks,[1,2,3].map(()=>stability.generation));
    }
    const write=await page.evaluate(async()=>{
      const {OsHomeWrite}=await import("/Os.js");
      return OsHomeWrite("Stopped.HC","\"Unreachable\";",true);
    });
    assert.equal(write.ok,false);assert.match(write.msg,/CPU [01] stopped/);
    assert.match(write.msg,/Restart TempleOS/);
    await page.locator("#diskBtn").click();
    const download=page.waitForEvent("download",{timeout:30000});
    await page.locator("#dlDisk").click();
    await (await download).delete();
    assert.equal(await page.locator("#dlDisk").isEnabled(),true);
    await page.locator("#diskClose").click();
    const installed=await page.evaluate(()=>window.guestEvents.filter(m=>m.cmd=="guestPatch" && m.state=="installed").length);
    await page.locator("#restartBtn").click();
    await page.waitForFunction(count=>window.guestEvents.filter(m=>m.cmd=="guestPatch" &&
      m.state=="installed").length>count,installed,{timeout:30000});
    assert.equal(await page.locator("#osNotice").isVisible(),false);
    assert.equal(await page.locator("#pauseBtn").isEnabled(),true);
    assert.ok(await page.evaluate(()=>window.terminated)>=cores);
    assert.deepEqual(errors,[]);
    await context.close();
    console.log(`${cores}-core browser CPU fault: visible diagnostic, retained workers, whole-machine pause and restart pass.`);
  }
} finally {
  await browser.close();server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
}
