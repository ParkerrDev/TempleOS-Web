import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {readFile,mkdir} from "node:fs/promises";
import {chromium} from "playwright-core";

const root=new URL("..",import.meta.url),server=spawn(process.execPath,["Misc/Server.mjs"],{
  cwd:root,env:{...process.env,PORT:"8198"},stdio:["ignore","pipe","inherit"]});
await once(server.stdout,"data");
const browser=await chromium.launch({executablePath:process.env.CHROMIUM || "/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
let page;
try {
  for (const native of [false,true]) for (const scale of [1,2]) {
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[];
    await context.route("**/hemu/*.gz",async route=>route.fulfill({
      body:await readFile(new URL("hemu/"+new URL(route.request().url()).pathname.split("/").pop(),root)),contentType:"application/gzip"}));
    await context.route("https://templeosweb-*.workers.dev/**",route=>route.abort());
    await context.routeWebSocket(/templeosweb-/,()=>{});
    await context.addInitScript(({native,scale})=>{
      localStorage.setItem("tos-settings",JSON.stringify({rate:30,repeat:false,pass:false}));
      localStorage.setItem("templeos.windraw",JSON.stringify({native,scale}));
      window.nativeWindows=[];window.machineEvents=[];
      const Base=window.SharedWorker;
      window.SharedWorker=class extends Base {
        constructor(...args) {
          super(...args);
          if (String(args[0]).includes("MachineHub")) this.port.addEventListener("message",e=>{
            if (e.data.cmd=="windows") window.nativeWindows=e.data.windows;
            else if (["restored","guestReady","error","sessionSave"].includes(e.data.cmd)) window.machineEvents.push(e.data);
          });
        }
      };
    },{native,scale});
    page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
    async function Button(host,selector)
    {
      await page.waitForFunction(host=>document.getElementById(host)?.classList.contains("win-pass-owned") &&
        nativeWindows.some(w=>w.host==host),host,{timeout:60000});
      await page.evaluate(async host=>{
        const w=nativeWindows.find(w=>w.host==host),{engine}=await import("/Adam/Os.js"),
          res=await engine.Request({cmd:"windows",op:"focus",slot:w.slot,task:w.task,num:w.num});
        if (!res.ok) throw Error(res.msg);
      },host);
      const point=await page.evaluate(async({host,selector})=>{
        const {GuiScene}=await import("/Adam/GuiBridge.js"),scene=GuiScene(document.getElementById(host)),
          target=document.querySelector(selector),id=[...scene.actions].find(([,el])=>el==target)?.[0],
          v=new DataView(scene.gui.buffer),w=nativeWindows.find(w=>w.host==host),r=document.getElementById("canvas").getBoundingClientRect();
        if (selector==".close") return {x:r.x+(w.x+w.w-16)*r.width/640,y:r.y+(w.y+4)*r.height/480};
        for (let at=24;at<scene.gui.length;at+=32+v.getInt32(at+28,true))
          if (v.getInt32(at,true)==4 && v.getInt32(at+24,true)==id)
            return {x:r.x+(w.x+8+v.getInt32(at+4,true)+v.getInt32(at+12,true)/2)*r.width/640,
              y:r.y+(w.y+8+v.getInt32(at+8,true)+v.getInt32(at+16,true)/2)*r.height/480};
      },{host,selector});
      assert(point,"native control exists: "+selector);
      await page.mouse.click(point.x,point.y);
    }
    await page.goto("http://localhost:8198/"+(process.env.WINPASS_SMP?"":"?single"));
    await page.waitForFunction(async()=>(await import("/Adam/Os.js")).OsOnlyReady(),null,{timeout:60000});
    await page.locator("#settingsBtn").click();
    await page.locator("#onlyBtn").click();
    await Button("settingsWin",".close");
    await page.waitForFunction(()=>!nativeWindows.some(w=>w.host=="settingsWin"));
    for (let i=0;i<3;i++) {
      await Button("desktopMenu","#settingsBtn");
      await page.waitForFunction(()=>nativeWindows.some(w=>w.host=="settingsWin"));
      const before=await page.locator("#showHeader").isChecked();
      await Button("settingsWin","#showHeader");
      await page.waitForFunction(before=>document.getElementById("showHeader").checked!=before,before,{timeout:15000});
      await Button("settingsWin",".close");
      await page.waitForFunction(()=>!nativeWindows.some(w=>w.host=="settingsWin"));
    }
    if (process.env.SETTINGS_RESTORE) {
      await Button("desktopMenu","#settingsBtn");
      await page.waitForFunction(()=>nativeWindows.some(w=>w.host=="settingsWin"));
      const old=await page.evaluate(()=>nativeWindows.filter(w=>w.host).map(w=>({task:w.task,num:w.num})));
      await page.waitForFunction(async()=>(await import("/Adam/Os.js")).engine.capture.ready);
      const saved=await page.evaluate(async()=>(await import("/Adam/Os.js")).OsSessionSave());
      assert(saved.ok && saved.savedAt,"browser session saved with Menu and Settings native tasks");
      await page.reload();
      await page.waitForFunction(()=>machineEvents.some(m=>m.cmd=="restored"),null,{timeout:90000});
      await page.waitForFunction(async()=>(await import("/Adam/Os.js")).OsOnlyReady(),null,{timeout:60000});
      await page.evaluate(async()=>(await import("/Adam/Os.js")).OsCfg({pass:true}));
      await page.waitForFunction(()=>nativeWindows.length>0);
      assert.equal(await page.evaluate(old=>nativeWindows.some(w=>old.some(o=>o.task==w.task && o.num==w.num)),old),false,
        "saved browser-owned tasks are removed before passthrough resumes");
      assert(await page.locator("#settingsWin").isVisible(),"Settings restores as an available browser window");
      await page.locator("#onlyBtn").click();
      await Button("settingsWin",".close");
      await page.waitForFunction(()=>!nativeWindows.some(w=>w.host=="settingsWin"));
      for (let i=0;i<2;i++) {
        await Button("desktopMenu","#settingsBtn");
        const before=await page.locator("#showHeader").isChecked();
        await Button("settingsWin","#showHeader");
        await page.waitForFunction(before=>document.getElementById("showHeader").checked!=before,before,{timeout:15000});
        await Button("settingsWin",".close");
        await page.waitForFunction(()=>!nativeWindows.some(w=>w.host=="settingsWin"));
      }
      console.log(`PASS saved native Menu/Settings restore and native input: drawing=${native}, DPI=${scale*100}%.`);
    }
    assert.deepEqual(errors,[]);
    console.log(`PASS native Settings open, toggle and close: drawing=${native}, DPI=${scale*100}%.`);
    await context.close();
  }
} catch(error) {
  if (page) {console.error(await page.evaluate(()=>({windows:nativeWindows,events:machineEvents,status:document.getElementById("windowPassStatus")?.textContent})));await mkdir("tmp/gui",{recursive:true});await page.screenshot({path:"tmp/gui/settings-freeze.png"});}
  throw error;
} finally {await browser.close();server.kill();}
