import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright-core";
import {ServeReq} from "../../Misc/Server.mjs";

const server=createServer(ServeReq).listen(0,"127.0.0.1");
await once(server,"listening");
const url="http://127.0.0.1:"+server.address().port,
  browser=await chromium.launch({executablePath:"/usr/bin/chromium",headless:true,
    args:["--no-sandbox"]});
try {
  const context=await browser.newContext({viewport:{width:1280,height:1000}}),
    page=await context.newPage(),errors=[];
  page.on("pageerror",function (error) {errors.push(error.message);});
  await context.routeWebSocket(/templeosweb-.*\.workers\.dev/,function (socket) {socket.close();});
  await context.addInitScript(function () {
    window.fileRequests=[];
    const Base=SharedWorker;
    window.SharedWorker=class extends Base {
      constructor(...args) {
        super(...args);
        if (!String(args[0]).includes("MachineHub.js")) return;
        const Send=this.port.postMessage.bind(this.port);
        this.port.postMessage=function (m,...args) {
          if (m.op=="request") window.fileRequests.push(m.value);
          return Send(m,...args);
        };
      }
    };
  });
  await page.goto(url+"/?single");
  await page.evaluate(async function () {window.fileOs=await import("/Adam/Os.js");});
  await page.waitForFunction(function () {
    return fileOs.OsReady() && fileOs.engine.capture.ready;
  },null,{timeout:120000});
  await page.locator("#diskBtn").click();
  await page.locator('#homeList button[data-name="Home"]').waitFor();
  assert.deepEqual(await page.evaluate(function () {
    return fileRequests.filter(function (m) {return m.cmd=="listDir";}).map(function (m) {return m.dir;});
  }),["C:/"],"opening Files reads the root directory only");
  await page.locator('#homeList button[data-name="Home"]').click();
  await page.waitForFunction(function () {
    return document.getElementById("diskPath").textContent=="C:/Home/";
  });
  const bytes=Buffer.from('"Imported from the browser";\n'),choose=page.waitForEvent("filechooser");
  await page.locator("#ulFile").click();
  await (await choose).setFiles({name:"BrowserFile.HC",mimeType:"application/octet-stream",buffer:bytes});
  await page.locator('#homeList button[data-name="BrowserFile.HC"]').waitFor({timeout:30000});
  const downloading=page.waitForEvent("download");
  await page.locator('#homeList button[data-name="BrowserFile.HC"]').click();
  const download=await downloading;
  assert.equal(download.suggestedFilename(),"BrowserFile.HC");
  assert.deepEqual(await readFile(await download.path()),bytes,
    "download returns the exact uploaded native bytes");
  await page.locator("#diskFiles").evaluate(function (el) {
    const transfer=new DataTransfer;
    transfer.items.add(new File(['"Dropped";\n'],"Dropped.HC"));
    el.dispatchEvent(new DragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:transfer}));
  });
  await page.locator('#homeList button[data-name="Dropped.HC"]').waitFor({timeout:30000});
  assert(await page.evaluate(function () {
    return fileRequests.some(function (m) {return m.cmd=="osWrite" && m.path=="C:/Home/Dropped.HC";});
  }),"drop uses the selected folder");
  await page.locator("#dirUp").click();
  await page.waitForFunction(function () {return document.getElementById("diskPath").textContent=="C:/";});
  assert(await page.locator("#dirUp").isDisabled(),"the root has no parent folder");
  await page.locator("#saveSession").click();
  await page.waitForFunction(function () {
    return document.getElementById("diskStatus").textContent=="Session saved in this browser.";
  },null,{timeout:120000});
  assert.equal(await page.getByRole("button",{name:"Save session",exact:true}).count(),1);
  await page.screenshot({path:"/home/aphunt/Dev/GitHub/TempleOS/untangle/evidence/2026-11-15-workspace/Window-files.png"});
  assert.deepEqual(errors,[]);
  console.log("Files: lazy C: navigation, native import/download bytes, drop into selected folder and durable Save session passed");
} finally {
  await browser.close();server.closeAllConnections();
  await new Promise(function (resolve) {server.close(resolve);});
}
