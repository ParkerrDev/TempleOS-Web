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
    try {localStorage.setItem("tos-persistence",JSON.stringify({syncTabs:true,saveSession:true,saveWindows:true}));} catch {}
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
  await page.locator("#filesBtn").click();
  await page.locator('#filesList button[data-name="Home"]').waitFor();
  assert.deepEqual(await page.evaluate(function () {
    return fileRequests.filter(function (m) {return m.cmd=="listDir";}).map(function (m) {return m.dir;});
  }),["C:/"],"opening Files reads the root directory only");
  await page.locator('#filesList button[data-name="Home"]').focus();
  await page.locator('#filesList button[data-name="Home"]').press('Enter');
  await page.waitForFunction(function () {
    return document.getElementById("filesPath").value=="C:/Home/";
  });
  const trailer=Buffer.from([0,1,2,255,0,74]),bytes=Buffer.concat([Buffer.from('"Imported from the browser";\n'),trailer]),choose=page.waitForEvent("filechooser");
  await page.locator("#filesImport").click();
  await (await choose).setFiles({name:"BrowserFile.HC",mimeType:"application/octet-stream",buffer:bytes});
  await page.locator('#filesList button[data-name="BrowserFile.HC"]').waitFor({timeout:30000});
  const downloading=page.waitForEvent("download");
  await page.locator('#filesList button[data-name="BrowserFile.HC"]').click();
  await page.locator('#filesDownload').click();
  const download=await downloading;
  assert.equal(download.suggestedFilename(),"BrowserFile.HC");
  assert.deepEqual(await readFile(await download.path()),bytes,
    "download returns the exact uploaded native bytes");
  await page.locator("#filesDrop").evaluate(function (el) {
    const transfer=new DataTransfer;
    transfer.items.add(new File(['"Dropped";\n'],"Dropped.HC"));
    el.dispatchEvent(new DragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:transfer}));
  });
  await page.locator('#filesList button[data-name="Dropped.HC"]').waitFor({timeout:30000});
  assert(await page.evaluate(function () {
    return fileRequests.some(function (m) {return m.cmd=="osWrite" && m.path=="C:/Home/Dropped.HC";});
  }),"drop uses the selected folder");
  await page.locator('#filesList button[data-name="BrowserFile.HC"]').dblclick();
  await page.waitForFunction(()=>window.__holycEditor?.file.path=="C:/Home/BrowserFile.HC");
  await page.locator('#editor').fill('"Edited in HolyC Editor";\n');
  await page.locator('#edToDisk').click();
  await page.waitForFunction(()=>document.getElementById('status').textContent=='Saved C:/Home/BrowserFile.HC');
  assert.deepEqual(Buffer.from(await page.evaluate(async()=>Array.from(new Uint8Array((await fileOs.OsFileRead('C:/Home/BrowserFile.HC')).bytes)))),
    Buffer.concat([Buffer.from('"Edited in HolyC Editor";\n'),trailer]),'editor preserves embedded bytes and writes back to the opened path');
  await page.locator('#edFiles').click();
  assert.equal(await page.locator('#filesPath').inputValue(),'C:/Home/');
  await page.locator('#filesNew').click();
  await page.waitForFunction(()=>window.__holycEditor.file.path==null);
  await page.locator('#edToDisk').click();
  const prompt=page.locator('[id^="dialog-"] input');
  assert.equal(await prompt.inputValue(),'C:/Home/MyProgram.HC');
  await prompt.fill('C:/Home/Created.HC');await prompt.press('Enter');
  await page.waitForFunction(()=>document.getElementById('status').textContent=='Saved C:/Home/Created.HC');
  assert.equal(await page.evaluate(()=>__holycEditor.FileName()),'Created.HC');
  await page.locator('#edFiles').click();
  await page.locator('#filesList button[data-name="Created.HC"]').waitFor();
  await page.locator('#filesFilter').fill('BrowserFile');
  assert.equal(await page.locator('#filesList button').count(),1);
  await page.locator('#filesFilter').fill('');
  await page.locator('#filesBack').click();
  await page.waitForFunction(()=>document.getElementById('filesPath').value=='C:/');
  await page.locator('#filesForward').click();
  await page.waitForFunction(()=>document.getElementById('filesPath').value=='C:/Home/');
  await page.screenshot({path:'/tmp/templeos-files.png'});
  await page.locator("#filesUp").click();
  await page.waitForFunction(function () {return document.getElementById("filesPath").value=="C:/";});
  assert(await page.locator("#filesUp").isDisabled(),"the root has no parent folder");
  await page.locator("#filesClose").click();
  await page.locator("#editorClose").click();
  await page.locator("#diskBtn").click();
  await page.locator("#saveSession").click();
  await page.waitForFunction(function () {
    return document.getElementById("diskStatus").textContent=="Session saved in this browser.";
  },null,{timeout:120000});
  assert.equal(await page.getByRole("button",{name:"Save session",exact:true}).count(),1);

  await page.locator('#diskClose').click();
  await page.setViewportSize({width:390,height:844});
  await page.locator('#mobileMenu').click();
  await page.locator('#filesBtn').click();
  await page.locator('#filesWin').waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.getElementById('filesRefresh').disabled);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const bounds=await page.locator('#filesWin').boundingBox();
  assert(bounds.x>=0 && bounds.x+bounds.width<=390);
  await page.screenshot({path:'/tmp/templeos-files-mobile.png'});
  assert.deepEqual(errors,[]);
  console.log("Files: lazy navigation, import/download, embedded-byte edit/save, new programs in the selected folder, mobile layout and session save passed");
} finally {
  await browser.close();server.closeAllConnections();
  await new Promise(function (resolve) {server.close(resolve);});
}
