import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {readFile,mkdir} from "node:fs/promises";
import {chromium} from "playwright-core";

const root=new URL("..",import.meta.url),port=process.env.ONLY_MOBILE?"8197":"8196",base=process.env.GUI_URL || "http://localhost:"+port+"/",
  server=process.env.GUI_URL?null:spawn(process.execPath,["Misc/Server.mjs"],{cwd:root,
    env:{...process.env,PORT:port},stdio:["ignore","pipe","inherit"]});
if (server) await once(server.stdout,"data");
const browser=await chromium.launch({executablePath:process.env.CHROMIUM || "/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
let page;
try {
  const mobile=!!process.env.ONLY_MOBILE,
    context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},hasTouch:mobile,isMobile:mobile}),errors=[];
  if (!process.env.GUI_URL) await context.route("**/hemu/*.gz",async route=>route.fulfill({body:await readFile(new URL("hemu/"+new URL(route.request().url()).pathname.split("/").pop(),root)),contentType:"application/gzip"}));
  await context.route("https://templeosweb-*.workers.dev/**",route=>new URL(route.request().url()).hostname.startsWith("templeosweb-files.")?route.continue():route.abort());
  await context.routeWebSocket(/templeosweb-presence\./,()=>{});
  await context.routeWebSocket(/templeosweb-chat\./,ws=>ws.send(JSON.stringify({t:"hello",tag:"test",people:1,log:[]})));
  await context.addInitScript(function () {
    localStorage.setItem("tos-settings",JSON.stringify({rate:30,repeat:false,pass:false}));
    window.nativeWindows=[];
    const Base=window.SharedWorker;
    window.SharedWorker=class extends Base {
      constructor(...args) {
        super(...args);
        if (String(args[0]).includes("MachineHub.js")) this.port.addEventListener("message",function (e) {
          if (e.data.cmd=="windows") window.nativeWindows=e.data.windows;
        });
      }
    };
  });
  page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
  await page.goto(new URL(process.env.WINPASS_SMP?"":"?single",base).href,{waitUntil:"load"});
  await page.waitForFunction(()=>!document.getElementById("onlyBtn").disabled,null,{timeout:60000});
  async function Button(host,selector)
  {
    await page.waitForFunction(host=>nativeWindows.some(w=>w.host==host),host);
    const point=await page.evaluate(async({host,selector})=>{
      const {GuiScene}=await import("/Adam/GuiBridge.js"),scene=GuiScene(document.getElementById(host)),
        target=document.querySelector(selector),id=[...scene.actions].find(([,el])=>el==target)?.[0],
        w=nativeWindows.find(w=>w.host==host),v=new DataView(scene.gui.buffer),r=document.getElementById("canvas").getBoundingClientRect();
      for(let at=24;at<scene.gui.length;at+=32+v.getInt32(at+28,true))
        if(v.getInt32(at,true)==4&&v.getInt32(at+24,true)==id)
          return {x:r.x+(w.x+8+v.getInt32(at+4,true)+v.getInt32(at+12,true)/2)*r.width/640,
            y:r.y+(w.y+8+v.getInt32(at+8,true)+v.getInt32(at+16,true)/2)*r.height/480};
    },{host,selector});
    assert(point,"native button exists: "+selector);
    if (mobile) await page.touchscreen.tap(point.x,point.y);
    else await page.mouse.click(point.x,point.y);
  }
  if (mobile) {
    await page.locator("#mobileMenu").click();
    await page.locator("#onlyBtn").tap();
    await page.waitForFunction(()=>nativeWindows.some(w=>w.host=="desktopMenu"),null,{timeout:60000});
    const frame=await page.locator("#frame").boundingBox();
    assert.deepEqual([frame.x,frame.y,frame.width,frame.height],[0,0,390,844]);
    await Button("desktopMenu","#settingsBtn");
    await page.waitForFunction(()=>nativeWindows.some(w=>w.host=="settingsWin"));
    assert.equal(await page.locator("#keysWin").evaluate(el=>el.classList.contains("input-docked")),true,"touch keyboard remains reachable on the OS input surface");
    await page.locator("#fsExit").tap();
    await page.waitForFunction(()=>!document.body.classList.contains("os-only") && !document.querySelector(".win-pass-owned"));
    assert.deepEqual(errors,[]);
    console.log("PASS touch TempleOS Only Mode: viewport, native Menu and Settings, docked input, tap exit.");
  } else {
  if (process.env.WINPASS_SMP) {
    await page.evaluate(async()=>{(await import("/Adam/Os.js")).OsCfg({pass:true});});
    await page.waitForFunction(()=>nativeWindows.some(w=>w.title.includes("Welcome")));
    await page.evaluate(async()=>{
      const w=nativeWindows.find(w=>w.title.includes("Welcome")),{engine}=await import("/Adam/Os.js");
      const res=await engine.Request({cmd:"windows",op:"detach",task:w.task,num:w.num});
      if (!res.ok) throw Error(res.msg);
    });
    await page.locator(".win-pass").waitFor();
  }
  await page.locator("#filesBtn").click();await page.locator("#filesWin").waitFor();
  await page.locator("#filesOverlay").evaluate(el=>el.classList.add("free"));
  await page.locator("#chatBtn").click();await page.locator("#chatWin").waitFor();
  await page.locator("#chatOverlay").evaluate(el=>el.classList.add("free"));
  const popup=page.waitForEvent("popup");
  await page.evaluate(async()=>{const {WinPopup}=await import("/Adam/WinMgr.js");WinPopup(document.getElementById("filesWin"));});
  const filesPopup=await popup;
  const openBefore=await page.evaluate(async()=>{
    const {WinDocuments}=await import("/Adam/WinMgr.js");
    return WinDocuments().flatMap(doc=>[...doc.querySelectorAll(".win:not(.win-pass)")]).filter(w=>
      w.id!="frame" && !w.closest(".overlay:not(.open)") && w.getClientRects().length).map(w=>w.id);
  });
  await page.locator("#fsBtn").click();
  await page.waitForFunction(()=>document.fullscreenElement?.id=="frame");
  await page.evaluate(()=>document.getElementById("onlyBtn").click());
  await page.waitForFunction(()=>["desktopMenu","filesWin","chatWin"].every(id=>document.getElementById(id)?.classList.contains("win-pass-owned")),null,{timeout:60000});
  assert(filesPopup.isClosed(),"pop-out tools return to the page before native transfer");
  await page.waitForFunction(ids=>ids.every(id=>document.getElementById(id)?.classList.contains("win-pass-owned")),openBefore);
  assert.equal(await page.locator(".win-pass").count(),0,"detached guest windows return inside too");
  assert.equal(await page.evaluate(async()=>(await import("/Adam/Os.js")).OsCfg().pass),!!process.env.WINPASS_SMP,"mode does not overwrite the passthrough preference");
  const frame=await page.locator("#frame").boundingBox();
  assert.deepEqual([frame.x,frame.y,frame.width,frame.height],[0,0,1440,1000],"TempleOS fills the browser viewport");
  assert(await page.locator("#fsExit").isVisible(),"a reachable exit remains when native Menu is closed");

  await Button("desktopMenu","#settingsBtn");
  await page.waitForFunction(()=>document.getElementById("settingsWin")?.classList.contains("win-pass-owned"));
  await page.waitForFunction(()=>nativeWindows.some(w=>w.host=="settingsWin"));
  assert(await page.locator("#returnWindows").isDisabled());
  assert(await page.locator("#windowPassthrough").isDisabled());
  await page.evaluate(async()=>{await (await import("/Adam/Os.js")).OsWinPassReturn();});
  assert(await page.locator("#filesWin").evaluate(el=>el.classList.contains("win-pass-owned")),"Return cannot leak windows out of Only Mode");
  const title=await page.evaluate(()=>{const w=nativeWindows.find(w=>w.host=="settingsWin"),r=document.getElementById("canvas").getBoundingClientRect();return{x:r.x+(w.x+80)*r.width/640,y:r.y+(w.y+4)*r.height/480};});
  await page.mouse.move(title.x,title.y);await page.mouse.down();await page.mouse.move(2,500,{steps:10});await page.mouse.up();
  await page.waitForTimeout(500);
  assert(await page.locator("#settingsWin").evaluate(el=>el.classList.contains("win-pass-owned")),"dragging toward the letterbox cannot detach a native window");
  assert.equal(await page.locator(".win-pass").count(),0);
  await page.evaluate(()=>document.getElementById("restartBtn").click());
  await page.waitForFunction(()=>nativeWindows.some(w=>w.host=="desktopMenu") && document.getElementById("filesWin").classList.contains("win-pass-owned") && !document.getElementById("onlyBtn").disabled,null,{timeout:60000});
  assert(await page.evaluate(()=>document.body.classList.contains("os-only")),"restart keeps the mode active");
  await page.locator("#fsExit").click();
  await page.waitForFunction(()=>!document.body.classList.contains("os-only") && !document.querySelector(".win-pass-owned"));
  assert.equal(await page.evaluate(()=>document.body.classList.contains("fakefs")),false);
  assert.equal(await page.evaluate(()=>!!document.fullscreenElement),false);
  await page.evaluate(()=>document.getElementById("settingsClose").click());
  await page.locator("#onlyBtn").click();
  await page.waitForFunction(()=>nativeWindows.some(w=>w.host=="desktopMenu"));
  await Button("desktopMenu","#spritesBtn");
  await page.waitForFunction(()=>!document.body.classList.contains("os-only") && document.getElementById("spritesWin")?.getBoundingClientRect().width>0);
  await page.evaluate(()=>document.getElementById("spritesClose").click());
  await page.locator("#onlyBtn").click();
  await page.waitForFunction(()=>nativeWindows.some(w=>w.host=="desktopMenu"));
  await Button("desktopMenu","#pauseBtn");
  await page.waitForFunction(()=>!document.body.classList.contains("os-only") && document.getElementById("onlyBtn").disabled);
  assert(await page.locator("#pauseBtn").isVisible(),"paused OS leaves its resume control reachable");
  await page.locator("#pauseBtn").click();
  assert.deepEqual(errors,[]);
  console.log("PASS TempleOS Only Mode: viewport, popup transfer, native launches, confinement, restart, exit, incompatible tool and pause recovery.");
  }
} catch(error) {
  if(page){await mkdir("tmp/gui",{recursive:true});await page.screenshot({path:"tmp/gui/only-mode-error.png"});console.error(await page.evaluate(()=>({windows:nativeWindows,status:document.getElementById("windowPassStatus")?.textContent,body:document.body.className})));}
  throw error;
} finally {await browser.close();server?.kill();}
