import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright-core";
import {ServeReq} from "../../Misc/Server.mjs";

const site=createServer(ServeReq).listen(0,"127.0.0.1");
await once(site,"listening");
const url="http://127.0.0.1:"+site.address().port,
  browser=await chromium.launch({executablePath:"/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
async function Ready(page)
{
  await page.evaluate(async function () {window.diskOs=await import("/Adam/Os.js");});
  await page.waitForFunction(()=>diskOs.OsReady() && diskOs.engine.capture.ready,
    null,{timeout:120000});
}
async function Write(page,text)
{
  const result=await page.evaluate(text=>diskOs.OsFileWrite("C:/Home/Persist.HC",
    new TextEncoder().encode(text).buffer),text);
  assert.equal(result.ok,true,result.msg);
}
async function Check(page,text)
{
  const result=await page.evaluate(async function () {
    let result=await diskOs.OsFileRead("C:/Home/Persist.HC");
    return {ok:result.ok,msg:result.msg,text:result.ok?new TextDecoder().decode(result.bytes):null};
  });
  assert.equal(result.ok,true,result.msg);
  assert.equal(result.text,text);
}
try {
  for (const cores of [1,4]) {
    const context=await browser.newContext(),errors=[],path=cores===1?"/?single":"/?smp";
    await context.route(/\/(?:hemu\/)?(?:live(?:-smp)?\.bin|templeos-hd\.qcow2)\.gz(?:\?.*)?$/,async route=>route.fulfill({
      body:await readFile(new URL("../../hemu/"+new URL(route.request().url()).pathname.split("/").pop(),import.meta.url)),
      contentType:"application/gzip"}));
    await context.addInitScript(()=>{try {localStorage.setItem("tos-persistence",JSON.stringify({syncTabs:true,saveSession:true,saveWindows:true}));} catch {}});
    await context.routeWebSocket(/templeosweb-.*\.workers\.dev/,socket=>socket.close());
    context.on("page",function (page) {page.on("pageerror",function (error) {errors.push(error.message);});});
    let page=await context.newPage();
    await page.goto(url+path);await Ready(page);
    await Write(page,'"saved automatically";\n');
    await page.evaluate(async()=>{(await import("/Apps/Disk/DiskWin.js")).Open();});
    await page.waitForFunction(()=>document.querySelector("#diskSaveStatus")?.textContent==="C: saved in this browser.");
    await page.click("#diskClose");await page.click("#restartBtn");await Ready(page);
    await Check(page,'"saved automatically";\n');
    await page.close();page=await context.newPage();
    await page.goto(url+path);await Ready(page);await Check(page,'"saved automatically";\n');
    const second=await context.newPage();await second.goto(url+path);await Ready(second);
    await Check(second,'"saved automatically";\n');
    await Write(second,'"changed from the second view";\n');
    await Check(page,'"changed from the second view";\n');
    await second.evaluate(async()=>{(await import("/Apps/Disk/DiskWin.js")).Open();});
    await second.waitForFunction(()=>document.querySelector("#diskSaveStatus")?.textContent==="C: saved in this browser.");
    await second.close();await page.reload();await Ready(page);
    await Check(page,'"changed from the second view";\n');
    assert.deepEqual(errors,[]);
    console.log(cores+" cores: guest file survives restart/reopen; both views share writes and autosave without a writer conflict.");
    await context.close();
  }
} finally {await browser.close();site.closeAllConnections();site.close();}
