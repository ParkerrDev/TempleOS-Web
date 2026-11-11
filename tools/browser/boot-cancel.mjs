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
} finally {
  await browser.close();await desktop.close();site.closeAllConnections();await new Promise(resolve=>site.close(resolve));
}
