import {MachineObserve} from "./Test/MachineObserve.mjs";
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
  await MachineObserve(context,function () {
    localStorage.setItem("tos-settings",JSON.stringify({rate:30,repeat:false,pass:false}));
    window.nativeWindows=[];window.framesSeen=0;
    try {localStorage.setItem("tos-persistence",JSON.stringify({syncTabs:true,saveSession:true,saveWindows:true}));} catch {}
    const Base=window.SharedWorker;
    window.SharedWorker=class extends Base {
      constructor(...args) {
        super(...args);
        if (String(args[0]).includes("MachineHub.js")) ObserveMachineEvents(this.port,function (e) {
          if (e.data.cmd=="windows") window.nativeWindows=e.data.windows;
          if (e.data.cmd=="frame") window.framesSeen++;
        });
      }
    };
  });
  page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
  await page.goto(new URL(process.env.WINPASS_SMP?"":"?single",base).href,{waitUntil:"load"});
  await page.waitForFunction(async()=>(await import("/Adam/Os.js")).OsOnlyReady(),null,{timeout:60000});
  assert.equal(await page.locator("#desktopMenu #onlyBtn").count(),0,"Only Mode belongs in Settings");
  async function Button(host,selector)
  {
    await page.waitForFunction(host=>document.getElementById(host)?.classList.contains("win-pass-owned") && nativeWindows.some(w=>w.host==host),host);
    await page.evaluate(async host=>{
      const w=nativeWindows.find(w=>w.host==host),{engine}=await import("/Adam/Os.js");
      const res=await engine.Request({cmd:"windows",op:"focus",slot:w.slot,task:w.task,num:w.num});
      if (!res.ok) throw Error(res.msg);
    },host);
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
  async function MenuClose(protectedMenu=true)
  {
    const before=await page.evaluate(async()=>{
      const w=nativeWindows.find(w=>w.host=="desktopMenu"),{engine}=await import("/Adam/Os.js");
      (await import("/Adam/WinMgr.js")).WinFocus(document.getElementById("frame"));
      const res=await engine.Request({cmd:"windows",op:"focus",slot:w.slot,task:w.task,num:w.num});
      if (!res.ok) throw Error(res.msg);
      const r=document.getElementById("canvas").getBoundingClientRect();
      return {...w,x:r.x+(w.x+w.w-20)*r.width/640,y:r.y+(w.y+4)*r.height/480};
    });
    if (mobile) await page.touchscreen.tap(before.x,before.y);
    else await page.mouse.click(before.x,before.y);
    const frame=await page.evaluate(()=>framesSeen);
    await page.waitForFunction(frame=>framesSeen>=frame+15,frame);
    assert.equal(await page.evaluate(w=>nativeWindows.some(n=>n.host=="desktopMenu" && n.task==w.task && n.num==w.num),before),
      protectedMenu,"Menu's native close policy follows Only Mode");
  }
  if (mobile) {
    await page.locator("#mobileMenu").click();
    await page.locator("#settingsBtn").tap();
    await page.locator("#settingsWin #onlyBtn").tap();
    await page.waitForFunction(()=>nativeWindows.some(w=>w.host=="desktopMenu"),null,{timeout:60000});
    const frame=await page.locator("#frame").boundingBox();
    assert.deepEqual([frame.x,frame.y,frame.width,frame.height],[0,0,390,844]);
    await MenuClose();
    await Button("desktopMenu","#controlsBtn");
    await page.waitForFunction(()=>nativeWindows.some(w=>w.host=="controlsWin"));
    await Button("controlsWin","#pauseBtn");
    await page.waitForFunction(()=>!document.body.classList.contains("os-only"));
    assert(await page.locator("#pauseBtn").isVisible(),"mobile pause leaves Controls available to resume");
    await page.locator("#pauseBtn").tap();
    await page.locator("#mobileMenu").tap();
    await page.locator("#settingsBtn").tap();
    await page.locator("#onlyBtn").tap();
    await page.waitForFunction(()=>nativeWindows.some(w=>w.host=="desktopMenu"));
    await Button("desktopMenu","#settingsBtn");
    await page.waitForFunction(()=>nativeWindows.some(w=>w.host=="settingsWin"));
    assert.equal(await page.locator("#keysWin").evaluate(el=>el.classList.contains("input-docked")),true,"touch keyboard remains reachable on the OS input surface");
    await page.locator("#fsExit").tap();
    await page.waitForFunction(()=>!document.body.classList.contains("os-only") && !document.querySelector(".win-pass-owned"));
    assert.deepEqual(errors,[]);
    console.log("PASS touch TempleOS Only Mode: viewport, native Menu, Controls and Settings, pause/resume, docked input, tap exit.");
  } else {
  let nativeBefore;
  if (process.env.WINPASS_SMP) {
    await page.evaluate(async()=>{(await import("/Adam/Os.js")).OsCfg({pass:true});});
    await page.waitForFunction(()=>nativeWindows.some(w=>w.title.includes("Welcome")));
    await page.evaluate(async()=>{
      const w=nativeWindows.find(w=>w.title.includes("Welcome")),{engine}=await import("/Adam/Os.js");
      const res=await engine.Request({cmd:"windows",op:"detach",task:w.task,num:w.num});
      if (!res.ok) throw Error(res.msg);
    });
    await page.locator(".win-pass").waitFor();
    await page.locator(".win-pass").evaluate(w=>{w.style.left="925px";w.style.top="300px";});
    nativeBefore=await page.locator(".win-pass").boundingBox();
  }
  await page.locator("#filesBtn").click();await page.locator("#filesWin").waitFor();
  await page.locator("#filesOverlay").evaluate(el=>el.classList.add("free"));
  await page.locator("#chatBtn").click();await page.locator("#chatWin").waitFor();
  await page.locator("#chatOverlay").evaluate(el=>el.classList.add("free"));
  await page.locator("#chatWin").evaluate(w=>{
    w.dataset.floating="1";
    Object.assign(w.style,{position:"fixed",left:"410px",top:"128px",width:"400px",height:"360px",margin:"0"});
  });
  const popup=page.waitForEvent("popup");
  await page.evaluate(async()=>{const {WinPopup}=await import("/Adam/WinMgr.js");WinPopup(document.getElementById("filesWin"));});
  const filesPopup=await popup;
  await page.locator("#settingsBtn").click();
  await page.locator("#settingsOverlay").evaluate(el=>el.classList.add("free"));
  const openBefore=await page.evaluate(async()=>{
    const {WinDocuments}=await import("/Adam/WinMgr.js");
    return WinDocuments().flatMap(doc=>[...doc.querySelectorAll(".win:not(.win-pass)")]).filter(w=>
      w.id!="frame" && !w.closest(".overlay:not(.open)") && w.getClientRects().length).map(w=>w.id);
  });
  const layoutBefore=await page.evaluate(ids=>Object.fromEntries(ids.filter(id=>id!="filesWin").map(id=>{
    const w=document.getElementById(id),r=w.getBoundingClientRect();
    return [id,{x:r.x,y:r.y,width:r.width,height:r.height}];
  })),openBefore);
  await page.locator("#fsBtn").click();
  await page.waitForFunction(()=>document.fullscreenElement?.id=="frame");
  await page.evaluate(()=>document.getElementById("onlyBtn").click());
  await page.waitForFunction(()=>["desktopMenu","filesWin","chatWin"].every(id=>document.getElementById(id)?.classList.contains("win-pass-owned")),null,{timeout:60000});
  assert(!filesPopup.isClosed(),"the popup remains available for restoration without another popup request");
  assert.equal(await filesPopup.locator("#filesWin").count(),0,"the actual tool moves into TempleOS");
  await page.waitForFunction(ids=>ids.every(id=>document.getElementById(id)?.classList.contains("win-pass-owned")),openBefore);
  assert.equal(await page.locator(".win-pass").count(),0,"detached guest windows return inside too");
  assert.equal(await page.evaluate(async()=>(await import("/Adam/Os.js")).OsCfg().pass),!!process.env.WINPASS_SMP,"mode does not overwrite the passthrough preference");
  const frame=await page.locator("#frame").boundingBox();
  assert.deepEqual([frame.x,frame.y,frame.width,frame.height],[0,0,1440,1000],"TempleOS fills the browser viewport");
  assert(await page.locator("#fsExit").isVisible(),"the mode exit remains reachable");
  await MenuClose();
  await Button("settingsWin","#onlyBtn");
  await page.waitForFunction(()=>!document.body.classList.contains("os-only") && !document.querySelector(".win-pass-owned"));
  if (process.env.WINPASS_SMP) {
    await page.locator(".win-pass").waitFor();
    assert.deepEqual(await page.locator(".win-pass").boundingBox(),nativeBefore,
      "the previously detached native window returns to its original position and scale");
  }
  await filesPopup.locator("#filesWin").waitFor();
  assert.equal(await page.locator("#filesWin").count(),0,"Files returns to its original popup");
  assert.deepEqual(await page.evaluate(ids=>Object.fromEntries(ids.map(id=>{
    const r=document.getElementById(id).getBoundingClientRect();
    return [id,{x:r.x,y:r.y,width:r.width,height:r.height}];
  })),Object.keys(layoutBefore)),layoutBefore,"exiting restores the browser window layout");
  if (process.env.WINPASS_SMP) {
    const detachedPopup=page.waitForEvent("popup");
    await page.evaluate(async()=>{
      (await import("/Adam/WinMgr.js")).WinPopup(document.querySelector(".win-pass"));
    });
    const nativePopup=await detachedPopup;
    await page.evaluate(()=>{
      const r=document.getElementById("canvas").getBoundingClientRect();
      for (const id of ["chatWin","desktopMenu"])
        document.getElementById(id).dispatchEvent(new CustomEvent("winmoved",{bubbles:true,
          detail:{clientX:r.left+100,clientY:r.top+80}}));
    });
    await page.waitForFunction(()=>["chatWin","desktopMenu"].every(id=>nativeWindows.some(w=>w.host==id)));
    await page.locator("#onlyBtn").click();
    await page.waitForFunction(ids=>document.body.classList.contains("os-only") && ids.every(id=>
      document.getElementById(id)?.classList.contains("win-pass-owned") && nativeWindows.some(w=>w.host==id)),openBefore);
    await MenuClose();
    await page.locator("#fsExit").click();
    await page.waitForFunction(()=>!document.body.classList.contains("os-only"));
    await filesPopup.locator("#filesWin").waitFor();
    await nativePopup.locator(".win-pass").waitFor();
    assert(await page.locator("#chatWin").evaluate(w=>w.classList.contains("win-pass-owned")),
      "a tool already inside TempleOS stays there on exit");
    await MenuClose(false);
    await nativePopup.locator("#popupReturn").click().catch(error=>{if(!nativePopup.isClosed())throw error;});
    await page.evaluate(async()=>await (await import("/Adam/Os.js")).OsWinPassReturn());
    await page.waitForFunction(()=>!document.querySelector(".win-pass-owned"));
    await page.evaluate(()=>document.getElementById("mobileMenu").click());
  }
  await page.locator("#settingsBtn").click();
  await page.locator("#settingsWin #onlyBtn").click();
  await page.waitForFunction(ids=>document.body.classList.contains("os-only") && ids.every(id=>
    document.getElementById(id)?.classList.contains("win-pass-owned") && nativeWindows.some(w=>w.host==id)),openBefore);

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
  await page.locator("#settingsBtn").click();
  await page.locator("#settingsWin #onlyBtn").click();
  await page.waitForFunction(()=>nativeWindows.some(w=>w.host=="desktopMenu"));
  await Button("desktopMenu","#spritesBtn");
  await page.waitForFunction(()=>!document.body.classList.contains("os-only") && document.getElementById("spritesWin")?.getBoundingClientRect().width>0);
  await page.evaluate(()=>document.getElementById("spritesClose").click());
  await page.locator("#onlyBtn").click();
  await page.waitForFunction(()=>nativeWindows.some(w=>w.host=="desktopMenu"));
  await Button("desktopMenu","#controlsBtn");
  await Button("controlsWin","#pauseBtn");
  await page.waitForFunction(()=>!document.body.classList.contains("os-only") && document.getElementById("onlyBtn").disabled);
  assert(await page.locator("#pauseBtn").isVisible(),"paused OS leaves its resume control reachable");
  await page.locator("#pauseBtn").click();
  await page.waitForFunction(()=>!document.getElementById("onlyBtn").disabled);
  const frameOpening=page.waitForEvent("popup");
  await page.evaluate(async()=>{
    (await import("/Adam/WinMgr.js")).WinPopup(document.getElementById("frame"));
  });
  const framePopup=await frameOpening;
  await page.locator("#onlyBtn").click();
  await page.waitForFunction(()=>nativeWindows.some(w=>w.host=="desktopMenu"));
  await page.setViewportSize({width:900,height:844});
  await page.locator("#fsExit").click();
  await framePopup.locator("#frame").waitFor();
  await page.locator("#onlyBtn").click();
  await page.waitForFunction(()=>document.getElementById("frame")?.classList.contains("fsmode"));
  await page.reload();
  assert(framePopup.isClosed() && filesPopup.isClosed(),"refresh closes held popup shells");
  assert.deepEqual(errors,[]);
  console.log("PASS TempleOS Only Mode: viewport, browser layout, native placement, popup restoration, launches, confinement, restart, exit, incompatible tool and pause recovery.");
  }
} catch(error) {
  if(page){await mkdir("tmp/gui",{recursive:true});await page.screenshot({path:"tmp/gui/only-mode-error.png"});console.error(await page.evaluate(()=>({windows:nativeWindows,status:document.getElementById("windowPassStatus")?.textContent,body:document.body.className})));}
  throw error;
} finally {await browser.close();server?.kill();}
