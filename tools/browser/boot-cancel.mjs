import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createServer} from "node:http";
import {once} from "node:events";
import {chromium} from "playwright-core";
import {ServeReq} from "../../server.mjs";
import {DesktopServer} from "../hemu/desktop.mjs";
import {BrowserMachine,MachineReady} from "../hemu/BrowserMachine.mjs";

const root=new URL("../../",import.meta.url),site=createServer(ServeReq).listen(0,"127.0.0.1");
await once(site,"listening");
const desktop=await DesktopServer({cores:4}),browser=await chromium.launch({
  executablePath:process.env.CHROMIUM||"/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
try {
  for(const app of ["page","desktop"])for(const late of ["success","error"]) {
    const context=await browser.newContext({viewport:{width:1280,height:800}});
    try {
      await BrowserMachine(context);
      let first=true,release,heldResolve;
      const held=new Promise(resolve=>heldResolve=resolve);
      await context.route("**/build/hemu-smp.wasm",async route=>{
        if(first) {
          first=false;heldResolve();await new Promise(resolve=>release=resolve);
          if(late==="error"){await route.abort();return;}
        }
        await route.fulfill({body:await readFile(new URL("build/hemu-smp.wasm",root)),contentType:"application/wasm"});
      });
      const page=await context.newPage(),errors=[];
      page.on("pageerror",error=>errors.push(error.message));page.on("dialog",dialog=>dialog.accept());
      await page.goto(app==="page"?`http://127.0.0.1:${site.address().port}/?smp`:desktop.url);
      await held;
      if(app==="page")await page.locator("#restartBtn").click();
      else await page.locator("#open").setInputFiles({name:"single.bin.gz",mimeType:"application/gzip",
        buffer:await readFile(new URL("hemu/live.bin.gz",root))});
      const cores=app==="page"?4:1;
      await MachineReady(page,cores);
      const before=await page.evaluate(()=>({workers:window.machine.workers.length,frames:window.machine.frames}));
      assert.equal(before.workers,cores,"the cancelled fetch created no workers");
      release();
      await page.waitForFunction(n=>window.machine.frames>n+10,before.frames);
      const after=await page.evaluate(()=>({workers:window.machine.workers.length,terminated:window.machine.terminations.length,
        errors:window.machine.events.filter(m=>m.cmd==="error")}));
      assert.deepEqual(after,{workers:cores,terminated:0,errors:[]},"a late boot result cannot replace or stop the new machine");
      if(app==="desktop")assert.doesNotMatch(await page.locator("#status").innerText(),/fetch|failed|error/i);
      else assert.equal(await page.locator("#loadui").isVisible(),false);
      assert.deepEqual(errors,[]);
      console.log(`${app}: cancelled asynchronous boot ignores a late ${late}; only the replacement's ${cores} workers run.`);
    } finally {await context.close();}
  }
  for(const late of ["body","read-error","http-error"]) {
    const context=await browser.newContext({viewport:{width:1280,height:800}});
    try {
      await BrowserMachine(context);
      await context.addInitScript(late=>{
        const Fetch=window.fetch;let first=true;
        window.fetch=async function(resource,...args) {
          const response=await Fetch(resource,...args);
          if(!String(resource).endsWith("/hemu/live-smp.bin.gz")||!first)return response;
          first=false;
          if(late==="http-error") {
            await new Promise(resolve=>{window.snapshotRelease=resolve;});
            return new Response("late error",{status:503});
          }
          const bytes=new Uint8Array(await response.arrayBuffer());
          return new Response(new ReadableStream({start(controller) {
            controller.enqueue(bytes.subarray(0,1));
            window.snapshotRelease=()=>{
              if(late==="read-error")controller.error(new Error("late snapshot stream failure"));
              else {controller.enqueue(bytes.subarray(1));controller.close();}
            };
          }}),{headers:response.headers});
        };
      },late);
      const page=await context.newPage(),errors=[];
      page.on("pageerror",error=>errors.push(error.message));page.on("dialog",dialog=>dialog.accept());
      await page.goto(`http://127.0.0.1:${site.address().port}/?smp`);
      await page.waitForFunction(()=>!!window.snapshotRelease);
      await page.locator("#restartBtn").click();await MachineReady(page,4);
      const before=await page.evaluate(()=>({text:document.getElementById("ldtext").textContent,
        bar:document.getElementById("ldbar").style.width,frames:window.machine.frames}));
      await page.evaluate(()=>window.snapshotRelease());
      await page.waitForFunction(n=>window.machine.frames>n+10,before.frames);
      assert.deepEqual(await page.evaluate(()=>({text:document.getElementById("ldtext").textContent,
        bar:document.getElementById("ldbar").style.width})),{text:before.text,bar:before.bar},
        "a canceled snapshot download cannot overwrite the replacement's loader text or progress");
      assert.equal(await page.locator("#loadui").isVisible(),false);
      assert.deepEqual(errors,[]);
      console.log(`page: canceled snapshot ${late} leaves the replacement's loader text and progress unchanged.`);
    } finally {await context.close();}
  }
} finally {
  await browser.close();await desktop.close();site.closeAllConnections();await new Promise(resolve=>site.close(resolve));
}
