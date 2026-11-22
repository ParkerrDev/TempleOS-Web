import {MachineObserve} from "./Test/MachineObserve.mjs";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {readFile,unlink} from "node:fs/promises";
import {chromium} from "playwright-core";
import {SnapshotInspect} from "../hemu/holyc-wasm/Apps/HEMU/Kernel/Snapshot.js";

const root=new URL("..",import.meta.url),
  server=spawn(process.execPath,["Misc/Server.mjs"],{cwd:root,
    env:{...process.env,PORT:"8198"},stdio:["ignore","pipe","inherit"]});
await once(server.stdout,"data");
const browser=await chromium.launch({executablePath:process.env.CHROMIUM ||
  "/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
let page;
try {
  for (const cores of [1,4]) {
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    await context.route("**/hemu/*.gz",async function (route) {
      const name=new URL(route.request().url()).pathname.split("/").pop();
      await route.fulfill({body:await readFile(new URL("hemu/"+name,root)),
        contentType:"application/gzip"});
    });
    await context.route("https://templeosweb-*.workers.dev/**",
      function (route) {route.abort();});
    await context.routeWebSocket(/templeosweb-.*\.workers\.dev/,
      function (socket) {socket.close();});
    await MachineObserve(context,function (cores) {
      if (!localStorage.getItem("tos-settings"))
        localStorage.setItem("tos-settings",JSON.stringify({rate:30,repeat:false}));
      window.passEvents=[];window.passWindows=[];window.passRequests=[];
      try {localStorage.setItem("tos-persistence",JSON.stringify({syncTabs:true,saveSession:true,saveWindows:true}));} catch {}
      const WorkerBase=window.Worker,SharedBase=window.SharedWorker;
      window.Worker=class extends WorkerBase {
        constructor(...args) {
          super(...args);
          this.addEventListener("message",function (e) {
            const m=e.data;
            if (cores==4 && m.cmd=="guestReady" && m.ok && !m.restored)
              this.postMessage({cmd:"pause",value:true});
          });
        }
        postMessage(m,...args) {
          if (m.cmd=="exportSnapshot" && window.failExport) {
            window.failExport=false;
            queueMicrotask(()=>this.onerror({message:"Worker lost during export"}));
            return;
          }
          return super.postMessage(m,...args);
        }
      };
      window.SharedWorker=class extends SharedBase {
        constructor(...args) {
          super(...args);
          if (!String(args[0]).includes("MachineHub.js")) return;
          const Send=this.port.postMessage.bind(this.port);
          this.port.postMessage=function (envelope,...args) {
            const m=envelope.value;
            if (["post","request"].includes(envelope.op) &&
                (m.cmd=="windows" || m.cmd=="exportSnapshot"))
              window.passRequests.push(m);
            return Send(envelope,...args);
          };
          ObserveMachineEvents(this.port,function ({data:m}) {
            if (m.cmd=="windows")
              window.passWindows=m.windows.map(function (w) {
                const {buf,...info}=w;return info;
              });
            else if (!["frame","progress","snd","log","exportResult"].includes(m.cmd))
              window.passEvents.push(m);
            else if (m.cmd=="exportResult") {
              const {buf,...info}=m;
              window.passEvents.push(info);
            }
          });
        }
      };
    },cores);
    page=await context.newPage();
    const errors=[];
    page.on("pageerror",function (e) {errors.push(e.message);});
    let query="?smp";
    if (cores==1)
      query="?single";
    await page.goto("http://localhost:8198/"+query,{waitUntil:"load"});
    await page.waitForFunction(function () {
      return window.passEvents.some(function (m) {return m.cmd=="guestReady" && m.ok;}) &&
        window.passEvents.some(function (m) {return m.cmd=="diskInfo" && m.ok;});
    },null,{timeout:60000});
    if (cores==4) {
      await page.waitForFunction(function () {
        return window.passEvents.some(function (m) {return m.cmd=="paused" && m.value;});
      });
      assert(!await page.evaluate(function () {
        return window.passEvents.some(function (m) {return m.cmd=="smpReady";});
      }),"pause reaches the real worker before AP release");
      await page.locator("#diskBtn").click();
      assert.equal(await page.locator("#dlSnap").isDisabled(),true);
      assert.equal(await page.locator("#dlDisk").isDisabled(),true);
      assert.match(await page.evaluate(async function () {
        const os=await import("/Adam/Os.js");
        return os.engine.capture.msg;
      }),/Resume TempleOS/,"the AP capture barrier explains why export is disabled");
      await page.locator("#diskClose").click();
      await page.locator("#pauseBtn").click();
      await page.waitForFunction(function () {
        return window.passEvents.some(function (m) {return m.cmd=="captureState" && m.ready;});
      },null,{timeout:30000});
    }
    await page.locator("#settingsBtn").click();
    await page.locator("#windowPassthrough").check();
    await page.locator("#settingsClose").click();
    await page.waitForFunction(function () {return window.passWindows.length;},null,
      {timeout:30000});
    const welcome=await page.evaluate(function () {
      return window.passWindows.find(function (w) {return w.title.includes("Welcome");});
    });
    assert(welcome,"native Welcome document exists");
    let r=await page.locator("#canvas").boundingBox(),scale=r.width/640;
    await page.mouse.move(r.x+(welcome.x+welcome.w/2)*scale,
      r.y+(welcome.y+4)*scale);
    await page.mouse.down();
    await page.mouse.move(r.x+r.width+100,r.y+140,{steps:20});
    await page.mouse.up();
    await page.locator(".win-pass canvas").waitFor({timeout:30000});
    await page.waitForFunction(function (task) {
      return window.passWindows.some(function (w) {return w.task==task && w.detached;});
    },welcome.task);
    await page.locator("#godBtn").click();
    const title=await page.locator("#godWin .wtitle").boundingBox();
    await page.mouse.move(title.x+70,title.y+4);
    await page.mouse.down();
    await page.mouse.move(r.x+250*scale,r.y+100*scale,{steps:15});
    await page.mouse.up();
    await page.waitForFunction(function () {
      return document.getElementById("godWin").classList.contains("win-pass-owned");
    },null,{timeout:30000});
    const host=await page.evaluate(function () {
      return window.passWindows.find(function (w) {return w.host=="godWin";});
    });
    assert(host,"God Tools is a real native proxy before export");
    assert.equal(await page.locator(".win-pass canvas").count(),1);
    await page.locator("#diskBtn").click();
    const downloading=page.waitForEvent("download",{timeout:90000});
    await page.locator("#dlSnap").click();
    const download=await downloading,path="/tmp/WinPassSnapshot-"+cores+".hemu.gz";
    await download.saveAs(path);
    const saved=await SnapshotInspect(await readFile(path),{busProtocol:1});
    assert.equal(saved.meta.cores,cores);
    assert.equal(saved.meta.paused,false,"export preserves a running machine");
    assert.equal(await page.locator(".win-pass canvas").count(),1,
      "export itself leaves the native window detached");
    assert.equal(await page.locator("#godWin").evaluate(function (w) {
      return w.classList.contains("win-pass-owned");
    }),true,"export itself leaves God Tools hosted");
    assert.equal(await page.evaluate(function () {
      return window.passRequests.filter(function (m) {return m.op=="disable";}).length;
    }),0,"snapshot captures the active bridge rather than disabling it first");
    const choosing=page.waitForEvent("filechooser");
    await page.locator("#ulSnap").click();
    const loading=page.waitForEvent("load",{timeout:90000});
    await (await choosing).setFiles(path);
    await loading;
    await page.waitForFunction(function () {
      return window.passEvents.some(function (m) {return m.cmd=="restored";});
    },null,{timeout:90000});
    await page.waitForFunction(function () {return window.passWindows.length;},null,
      {timeout:60000});
    const restored=await page.evaluate(function () {return window.passWindows;});
    const original=restored.find(function (w) {
      return w.task==welcome.task && w.num==welcome.num;
    });
    assert(original && !original.detached,
      "restore returns the original Welcome task to the native desktop");
    assert(!restored.some(function (w) {return w.task==host.task && w.num==host.num;}),
      "restore closes the old browser-owned guest proxy");
    assert(!restored.some(function (w) {return w.title=="God Tools" || w.host;}),
      "restore leaves no orphaned native God Tools task");
    assert.equal(await page.locator(".win-pass,.win-pass-owned").count(),0);
    assert.equal(await page.evaluate(async function () {
      return (await import("/Adam/BootFile.js")).BootFileRead();
    }),null,"successful restore consumes the saved boot file");
    await page.locator("#diskClose").click();
    assert.equal(await page.locator("#godWin").isVisible(),true,
      "the restored browser tool remains open after native ownership cleanup");
    await page.locator("#godClose").click();
    await page.locator("#settingsBtn").click();
    assert.equal(await page.locator("#windowPassthrough").isChecked(),true,
      "browser passthrough preference survives snapshot reload");
    await page.locator("#windowPassthrough").uncheck();
    await page.waitForFunction(function () {return !window.passWindows.length;});
    await page.locator("#windowPassthrough").check();
    await page.locator("#settingsClose").click();
    await page.waitForFunction(function () {return window.passWindows.length;});
    await page.locator("#godBtn").click();
    await page.locator("#godWord").click();
    await page.locator("#godOut .word").waitFor({timeout:20000});
    await page.locator("#godClose").click();
    const current=await page.evaluate(function (task) {
      return window.passWindows.find(function (w) {return w.task==task;});
    },welcome.task);
    r=await page.locator("#canvas").boundingBox();scale=r.width/640;
    await page.mouse.move(r.x+(current.x+current.w/2)*scale,
      r.y+(current.y+4)*scale);
    await page.mouse.down();
    await page.mouse.move(r.x+r.width+100,r.y+140,{steps:20});
    await page.mouse.up();
    await page.locator(".win-pass canvas").waitFor({timeout:30000});
    assert.deepEqual(errors,[]);
    if (cores==1) {
      await page.locator("#diskBtn").click();
      assert.equal(await page.locator("#dlSnap").isDisabled(),false);
      assert.equal(await page.evaluate(function () {
        document.getElementById("restartBtn").click();
        return document.getElementById("dlSnap").disabled;
      }),true,"restart disables export synchronously, before the old worker is replaced");
      await page.waitForFunction(async function () {
        const os=await import("/Adam/Os.js");
        return os.OsReady() && os.engine.capture.ready;
      },null,{timeout:60000});
      await page.evaluate(function () {window.failExport=true;});
      await page.locator("#dlSnap").click();
      await page.waitForFunction(function () {
        return document.getElementById("osNoticeText").textContent.includes("main worker was lost");
      });
      assert.equal(await page.locator("#ulSnap").isDisabled(),false,
        "worker loss releases pending export so a backup can be imported");
      assert.equal(await page.locator("#ulDisk").isDisabled(),false);
      assert.equal(await page.locator("#dlSnap").isDisabled(),true);
    }
    await context.close();
    await unlink(path);
    console.log(cores+"-core active-window snapshot: export, restore, proxy cleanup, "+
      "browser tools and re-enabling passed");
  }
} catch (e) {
  if (page && !page.isClosed()) {
    console.error(await page.evaluate(function () {
      return {events:window.passEvents.slice(-20),windows:window.passWindows,
        requests:window.passRequests,status:document.getElementById("windowPassStatus")?.textContent,
        disk:document.getElementById("diskStatus")?.textContent};
    }));
    await page.screenshot({path:"/tmp/WinPassSnapshot-error.png"});
  }
  throw e;
} finally {
  await browser.close();
  server.kill();
}
