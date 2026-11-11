import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {readFile,mkdir,unlink} from "node:fs/promises";
import {chromium} from "playwright-core";
import {SnapshotInspect} from "../../engine/Snapshot.js";

const root=new URL("../../",import.meta.url),
  server=spawn(process.execPath,["server.mjs"],{cwd:root,
    env:{...process.env,PORT:"8183"},stdio:["ignore","pipe","inherit"]});
await once(server.stdout,"data");
const browser=await chromium.launch({executablePath:process.env.CHROMIUM ||
  "/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
let page;
const legacy=process.env.HEMU_LEGACY==="1";
try {
  for (const cores of legacy?[4]:[1,4]) {
    const context=await browser.newContext({viewport:{width:1280,height:800}});
    if(legacy) {
      await context.route("**/build/hemu-smp.wasm",async route=>route.fulfill({contentType:"application/wasm",
        body:await readFile(new URL("tools/hemu/fixtures/legacy-smp.wasm",root))}));
      await context.route("**/build/hemu-smp.json",async route=>route.fulfill({contentType:"application/json",
        body:await readFile(new URL("tools/hemu/fixtures/legacy-smp.json",root))}));
    }
    await context.route("**/hemu/*.gz",async function (route) {
      const name=new URL(route.request().url()).pathname.split("/").pop();
      await route.fulfill({body:await readFile(new URL("hemu/"+name,root)),
        contentType:"application/gzip"});
    });
    await context.route("**/vendor/images/templeos-hd.qcow2.gz",async route=>
      route.fulfill({body:await readFile(new URL(
        "vendor/images/templeos-hd.qcow2.gz",root)),contentType:"application/gzip"}));
    await context.route("https://templeosweb-*.workers.dev/**",route=>route.abort());
    await context.routeWebSocket(/templeosweb-.*\.workers\.dev/,socket=>socket.close());
    await context.addInitScript(function () {
      localStorage.setItem("tos-settings",JSON.stringify({rate:30,repeat:false}));
      window.guestEvents=[];
      const Base=window.Worker;
      window.Worker=class extends Base {
        constructor(...args) {
          super(...args);
          this.addEventListener("message",function (e) {
            if (!["frame","progress","snd","log"].includes(e.data.cmd))
              window.guestEvents.push(e.data);
          });
        }
      };
    });
    page=await context.newPage();
    const errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.goto("http://localhost:8183/?"+(cores==1?"single":"smp"));
    await page.waitForFunction(()=>document.getElementById("loadui").style.display=="none");
    await page.waitForFunction(()=>window.guestEvents.some(m=>m.cmd=="diskInfo" && m.ok));
    await page.waitForFunction(old=>window.guestEvents.some(m=>
      m.cmd=="guestPatch" && (m.state=="installed" || old && m.state==="failed")),legacy,{timeout:30000});
    if (cores==4)
      await page.waitForFunction(()=>window.guestEvents.some(m=>m.cmd=="smpReady"));
    await page.locator("#diskBtn").click();

    //A successful put may still be followed by a transaction abort.
    if (cores==1) {
      const storage=await page.evaluate(async function () {
        const {BootFileSave,BootFileRead,BootFileClear}=await import("/BootFile.js"),
          old_put=IDBObjectStore.prototype.put;
        let rejected=false;
        IDBObjectStore.prototype.put=function (...args) {
          const req=old_put.apply(this,args),tx=this.transaction;
          req.addEventListener("success",function () {tx.abort();});
          return req;
        };
        try {await BootFileSave("snapshot",new Uint8Array([1]).buffer);}
        catch {rejected=true;}
        finally {IDBObjectStore.prototype.put=old_put;}
        const after_abort=await BootFileRead();
        await BootFileSave("disk",new Uint8Array([2]).buffer);
        const older=await BootFileRead();
        await BootFileSave("disk",new Uint8Array([3]).buffer);
        await BootFileClear(older);
        const newer=await BootFileRead();
        await BootFileClear(newer);
        return {rejected,after_abort,byte:new Uint8Array(newer.bytes)[0],
          empty:await BootFileRead()};
      });
      assert.deepEqual(storage,{rejected:true,after_abort:null,byte:3,empty:null});
      const bad=page.waitForEvent("filechooser");
      await page.locator("#ulSnap").click();
      await (await bad).setFiles({name:"bad.hemu.gz",mimeType:"application/gzip",
        buffer:Buffer.from("not a gzip snapshot")});
      await page.waitForFunction(()=>document.getElementById("diskStatus").textContent.includes("Import failed"));
      assert.equal(await page.locator("#ulSnap").isEnabled(),true);
    }
    await page.locator("#diskClose").click();
    await page.locator("#settingsBtn").click();
    await page.locator("#frameRate").selectOption("120");
    await page.locator("#biosRepeat").check();
    await page.waitForFunction(()=>window.guestEvents.some(m=>m.cmd=="settings" &&
      m.rate==120 && m.repeat));
    await page.locator("#settingsClose").click();
    await page.locator("#pauseBtn").click();
    await page.waitForFunction(()=>window.guestEvents.some(m=>m.cmd=="paused" && m.value));
    const before_fps=await page.locator("#tb-fps").innerText();
    const before_pixels=await page.locator("#canvas").evaluate(async e=>
      Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",e.getContext("2d").
        getImageData(0,0,e.width,e.height).data)),v=>v.toString(16).padStart(2,"0")).join(""));
    await page.locator("#diskBtn").click();
    const downloading=page.waitForEvent("download",{timeout:60000});
    await page.locator("#dlSnap").click();
    assert.equal(await page.locator("#dlSnap").isDisabled(),true);
    assert.equal(await page.locator("#dlDisk").isDisabled(),true);
    const download=await downloading,path=new URL("tmp/ui-snapshot-"+cores+".hemu.gz",root).pathname;
    await mkdir(new URL("tmp",root),{recursive:true});
    await download.saveAs(path);
    const saved=await SnapshotInspect(await readFile(path),{busProtocol:1});
    assert.equal(saved.meta.version,cores===4&&!legacy?2:1);
    assert.equal(saved.meta.requiredBusProtocol,cores===4&&!legacy?1:undefined);
    if(legacy)assert.equal(saved.meta.engineHash,
      JSON.parse(await readFile(new URL("tools/hemu/fixtures/legacy-smp.json",root),"utf8")).sha256);
    assert.equal(await page.locator("#dlSnap").isEnabled(),true);
    const choosing=page.waitForEvent("filechooser");
    await page.locator("#ulSnap").click();
    await (await choosing).setFiles(path);
    await page.waitForEvent("load");
    await page.waitForFunction(()=>window.guestEvents.some(m=>m.cmd=="restored"),null,{timeout:60000});
    assert.equal(await page.evaluate(()=>window.guestEvents.find(m=>m.cmd=="restored").cores),cores);
    assert.match(await page.locator("#pauseBtn").innerText(),/Play/);
    assert.equal(await page.locator("#tb-fps").innerText(),before_fps);
    assert.equal(await page.locator("#canvas").evaluate(async e=>
      Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",e.getContext("2d").
        getImageData(0,0,e.width,e.height).data)),v=>v.toString(16).padStart(2,"0")).join("")),before_pixels,
      "a paused restore presents exactly the same complete image");
    await page.locator("#settingsBtn").click();
    assert.equal(await page.locator("#frameRate").inputValue(),"120");
    assert.equal(await page.locator("#biosRepeat").isChecked(),true);
    assert.equal(await page.evaluate(async()=>(await import("/BootFile.js")).BootFileRead()),null);
    await page.locator("#settingsClose").click();
    const restored_count=await page.evaluate(()=>window.guestEvents.filter(m=>m.cmd=="restored").length);
    await page.locator("#restartBtn").click();
    await page.waitForFunction(n=>window.guestEvents.filter(m=>m.cmd=="restored").length>n,
      restored_count,{timeout:60000});
    assert.match(await page.locator("#pauseBtn").innerText(),/Play/);
    assert.deepEqual(errors,[]);
    await context.close();
    await unlink(path);
    console.log((legacy?"Legacy ":"")+cores+"-core browser snapshot: export/import/reload/restart restores exact RGBA, pause and settings.");
  }
} catch (e) {
  if (page && !page.isClosed()) {
    await page.screenshot({path:new URL("tmp/snapshot-failure.png",root).pathname});
    console.log(await page.evaluate(()=>({events:window.guestEvents.slice(-15),
      load:document.getElementById("ldtext").textContent})));
  }
  throw e;
} finally {
  await browser.close();
  server.kill();
}
