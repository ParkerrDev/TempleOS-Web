import {MachineObserve} from "./Test/MachineObserve.mjs";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright-core";
import {ServeReq} from "../Misc/Server.mjs";

const server=process.env.GUI_URL?null:createServer(ServeReq).listen(0,"127.0.0.1");
if (server) await once(server,"listening");
const base=process.env.GUI_URL || "http://127.0.0.1:"+server.address().port+"/",
  browser=await chromium.launch({executablePath:process.env.CHROMIUM || "/usr/bin/chromium",
    headless:true,args:["--no-sandbox"]});
try {
  for (const fullscreen of [false,true]) {
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[];
    if (!process.env.GUI_URL) await context.route("**/hemu/*.gz",async route=>route.fulfill({
      body:await readFile(new URL("../hemu/"+new URL(route.request().url()).pathname.split("/").pop(),import.meta.url)),
      contentType:"application/gzip"}));
    await context.route("https://templeosweb-*.workers.dev/**",route=>
      new URL(route.request().url()).hostname.startsWith("templeosweb-files.")?route.continue():route.abort());
    await context.routeWebSocket(/templeosweb-/,()=>{});
    await MachineObserve(context,function () {
      localStorage.setItem("tos-settings",JSON.stringify({rate:30,repeat:false,pass:false}));
      window.nativeWindows=[];window.framesSeen=0;window.motionInputs=[];
      let mouse=null;
      document.addEventListener("mousemove",e=>{mouse={trusted:e.isTrusted,target:e.target.id,dx:e.movementX,dy:e.movementY};},true);
      try {localStorage.setItem("tos-persistence",JSON.stringify({syncTabs:true,saveSession:true,saveWindows:true}));} catch {}
      const Base=window.SharedWorker;
      window.SharedWorker=class extends Base {
        constructor(...args) {
          super(...args);
          if (!String(args[0]).includes("MachineHub.js")) return;
          ObserveMachineEvents(this.port,({data:m})=>{
            if (m.cmd==="windows") window.nativeWindows=m.windows;
            if (m.cmd==="frame") window.framesSeen++;
          });
          const Send=this.port.postMessage.bind(this.port);
          this.port.postMessage=function (m,...args) {
            if (m.op==="post" && m.value.cmd==="input" && (m.value.dx || m.value.dy))
              window.motionInputs.push({mouse,input:m.value});
            return Send(m,...args);
          };
        }
      };
    });
    const page=await context.newPage();page.on("pageerror",error=>errors.push(error.message));
    await page.goto(new URL(process.env.WINPASS_SMP?"?smp":"?single",base).href);
    await page.evaluate(async()=>window.os=await import("/Adam/Os.js"));
    await page.waitForFunction(()=>os.OsOnlyReady() && os.engine.capture.ready,null,{timeout:60000});
    await page.locator("#settingsBtn").click();
    await page.locator("#onlyBtn").waitFor();
    if (fullscreen) {
      await page.evaluate(()=>document.getElementById("fsBtn").click());
      await page.waitForFunction(()=>document.fullscreenElement?.id==="frame");
    }
    await page.evaluate(()=>document.getElementById("onlyBtn").click());
    await page.waitForFunction(()=>nativeWindows.some(w=>w.host==="desktopMenu"));
    await page.evaluate(()=>document.getElementById("settingsClose").click());
    await page.waitForFunction(()=>!nativeWindows.some(w=>w.host==="settingsWin"));
    async function FocusMenu()
    {
      const res=await page.evaluate(()=>{
        const w=nativeWindows.find(w=>w.host==="desktopMenu");
        return os.engine.Request({cmd:"windows",op:"focus",slot:w.slot,task:w.task,num:w.num});
      });
      assert(res.ok,res.msg);
    }
    async function Point(selector)
    {
      return page.evaluate(async selector=>{
        const {GuiScene}=await import("/Adam/GuiBridge.js"),scene=GuiScene(document.getElementById("desktopMenu")),
          el=document.querySelector(selector),id=[...scene.actions].find(([,node])=>node===el)?.[0],
          w=nativeWindows.find(w=>w.host==="desktopMenu"),v=new DataView(scene.gui.buffer),
          r=document.getElementById("canvas").getBoundingClientRect();
        for (let at=24;at<scene.gui.length;at+=32+v.getInt32(at+28,true))
          if (v.getInt32(at,true)===4 && v.getInt32(at+24,true)===id) {
            const x=Math.round(w.x+8+v.getInt32(at+4,true)+v.getInt32(at+12,true)/2),
              y=Math.round(w.y+8+v.getInt32(at+8,true)+v.getInt32(at+16,true)/2);
            return {x,y,clientX:r.x+x*r.width/640,clientY:r.y+y*r.height/480};
          }
        throw Error("Native Menu control is not visible: "+selector);
      },selector);
    }
    async function Guest(src)
    {
      return page.evaluate(src=>os.engine.Request({cmd:"osExec",target:"adam",src}),src);
    }
    await FocusMenu();
    let physical=await Point("#captureBtn");
    await page.mouse.click(physical.clientX,physical.clientY);
    await page.waitForFunction(()=>document.pointerLockElement?.id==="canvas");
    const reset=await Guest("MsSet(320,240);");
    assert(reset.ok,reset.msg);
    let cursor={x:320,y:240};
    async function Move(selector)
    {
      const target=await Point(selector),frame=await page.evaluate(()=>framesSeen);
      physical.clientX+=target.x-cursor.x;physical.clientY+=target.y-cursor.y;
      await page.mouse.move(physical.clientX,physical.clientY);
      await page.waitForFunction(frame=>framesSeen>=frame+20,frame);
      const actual=await Guest("if (ms.pos.x!="+target.x+" || ms.pos.y!="+target.y+") throw('Cursor');");
      assert(actual.ok,"captured cursor stays over "+selector+": "+actual.msg+
        "; motion trace: "+JSON.stringify(await page.evaluate(()=>motionInputs.slice(-8))));
      cursor=target;
      assert(await page.locator(selector).evaluate(el=>el.classList.contains("gui-hover")),"native hover reaches "+selector);
    }
    await Move("#settingsBtn");
    await Move("#filesBtn");
    await Move("#settingsBtn");
    await page.mouse.down();await page.mouse.up();
    await page.waitForFunction(()=>nativeWindows.some(w=>w.host==="settingsWin"));
    assert.equal(await page.evaluate(()=>document.pointerLockElement?.id),"canvas","opening native Settings retains capture");
    await FocusMenu();
    if (fullscreen) await page.keyboard.press("Escape");
    else {
      await Move("#captureBtn");
      await page.mouse.down();await page.mouse.up();
    }
    await page.waitForFunction(()=>!document.pointerLockElement);
    const hybrid=await Point("#filesBtn");
    await page.mouse.move(hybrid.clientX,hybrid.clientY);
    await page.waitForFunction(()=>document.getElementById("filesBtn").classList.contains("gui-hover"));
    assert.deepEqual(errors,[]);
    console.log("PASS captured native Menu "+(fullscreen?"with browser fullscreen and Escape":"with Release mouse")+
      ": stable cursor, hover, clicks, Settings launch and hybrid recovery");
    await context.close();
  }
} finally {
  await browser.close();server?.closeAllConnections();server?.close();
}
