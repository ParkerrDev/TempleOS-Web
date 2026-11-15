import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {readFile,mkdir} from "node:fs/promises";
await mkdir("tmp/gui",{recursive:true});
import {chromium} from "playwright-core";

const root=new URL("..",import.meta.url),
  server=spawn(process.execPath,["Misc/Server.mjs"],{cwd:root,
    env:{...process.env,PORT:"8195"},stdio:["ignore","pipe","inherit"]});
await once(server.stdout,"data");
const browser=await chromium.launch({executablePath:process.env.CHROMIUM ||
  "/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
let page;
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route("**/hemu/*.gz",async function (route) {
    const name=new URL(route.request().url()).pathname.split("/").pop();
    await route.fulfill({body:await readFile(new URL("hemu/"+name,root)),
      contentType:"application/gzip"});
  });
  await context.route("https://templeosweb-*.workers.dev/**",
    function (route) {route.abort();});
  await context.addInitScript(function () {
    localStorage.setItem("tos-settings",JSON.stringify({rate:30,repeat:false}));
    window.passEvents=[];window.passRequests=[];window.passWindows=[];
    window.passBuffers={};window.passFrames=0;window.passActions=[];
    const Base=window.SharedWorker;
    window.SharedWorker=class extends Base {
      constructor(...args) {
        super(...args);
        if (!String(args[0]).includes("MachineHub.js")) return;
        const Send=this.port.postMessage.bind(this.port);
        this.port.postMessage=function (envelope,...args) {
          const m=envelope.value;
          if (["post","request"].includes(envelope.op) &&
              (m.cmd=="windows" || m.cmd=="input" &&
                (m.keys.length || m.wheel || m.b)))
            window.passRequests.push(m);
          return Send(envelope,...args);
        };
        this.port.addEventListener("message",function (e) {
          const m=e.data;
          if (m.cmd=="windows") {
            window.passWindows=m.windows;
            window.passActions.push(...m.actions);
            for (const w of m.windows)
              if (w.buf)
                window.passBuffers[w.task]={buf:w.buf,w:w.w,h:w.h};
          } else if (m.cmd=="frame") {
            window.passPixels=m.buf;
            window.passFrames++;
          } else if (["guestReady","fileResult","settings","paused","error"].includes(m.cmd))
            window.passEvents.push(m);
        });
      }
    };
  });
  await context.route("**/Apps/Search/Videos.json",route=>route.fulfill({json:[
    {f:"videos/fixture.mp4",t:"Native Terry action",d:"2017-01-01"}]}));
  await context.route("https://archive.org/download/**",route=>route.abort());
  page=await context.newPage();
  const errors=[];
  page.on("pageerror",function (e) {errors.push(e.message);});
  let query="?single";
  if (process.env.WINPASS_SMP)
    query="";
  await page.goto("http://localhost:8195/"+query,{waitUntil:"load"});
  await page.waitForFunction(function () {
    return window.passEvents.some(function (e) {return e.cmd=="guestReady" && e.ok;});
  },null,{timeout:60000});
  await page.locator("#settingsBtn").click();
  await page.locator("#nativeDrawing").check();
  await page.locator("#windowScale").selectOption("2");
  await page.locator("#windowPassthrough").check();
  await page.locator("#settingsClose").click();
  await page.waitForFunction(function () {
    return window.passWindows.length || window.passEvents.some(function (m) {
      return m.cmd=="fileResult" && !m.ok;
    });
  },null,{timeout:60000});
  assert(await page.evaluate(function () {return window.passWindows.length;}),
    "native window bridge must compile and publish window metadata");
  const r=await page.locator("#canvas").boundingBox(),scale=r.width/640;
  async function Transfer(id)
  {
    await page.locator("#"+id).waitFor();
    await page.evaluate(async function (id) {
      const {WinFocus}=await import("/Adam/WinMgr.js");WinFocus(document.getElementById(id));
    },id);
    const title=await page.locator("#"+id+" .wtitle").boundingBox();
    await page.mouse.move(title.x+Math.min(60,title.width/2),title.y+4);
    await page.mouse.down();await page.mouse.move(r.x+220*scale,r.y+100*scale,{steps:15});await page.mouse.up();
    await page.waitForFunction(id=>document.getElementById(id).classList.contains("win-pass-owned"),id,{timeout:30000});
    await page.waitForFunction(id=>window.passWindows.some(w=>w.host==id),id,{timeout:30000});
  }
  async function Button(id,selector)
  {
    const point=await page.evaluate(async function ({id,selector}) {
      const {GuiScene}=await import("/Adam/GuiBridge.js"),scene=GuiScene(document.getElementById(id)),
        target=document.querySelector(selector),action=[...scene.actions].find(([,el])=>el==target)?.[0],
        w=window.passWindows.find(w=>w.host==id),v=new DataView(scene.gui.buffer);
      for (let at=24;at<scene.gui.length;at+=32+v.getInt32(at+28,true))
        if (v.getInt32(at,true)==4 && v.getInt32(at+24,true)==action)
          return {x:w.x+8+v.getInt32(at+4,true)+v.getInt32(at+12,true)/2,
            y:w.y+8+v.getInt32(at+8,true)+v.getInt32(at+16,true)/2,id:action};
    },{id,selector});
    assert(point,"native action rectangle exists for "+selector);
    await page.mouse.click(r.x+point.x*scale,r.y+point.y*scale,{delay:150});
    await page.waitForFunction(id=>window.passActions.some(a=>a.id==id),point.id);
  }
  await Transfer("terryWin");
  await page.waitForFunction(()=>window.passRequests.filter(m=>m.op=="update" && m.gui).length>=2);
  await page.waitForTimeout(500);
  const sprite=await page.evaluate(()=>{
    const w=window.passWindows.find(w=>w.host=="terryWin"),pixels=new Uint8Array(window.passPixels),colors=new Set;
    for (let y=w.y+16;y<w.y+w.h-40;y++) for (let x=w.x+8;x<w.x+w.w-8;x++) colors.add(pixels[y*640+x]);
    return [...colors];
  });
  assert(sprite.length>5,"Terry's indexed canvas is drawn by the real native task");
  await page.screenshot({path:"tmp/gui/native-terry.png"});
  await Button("terryWin","#terryRandom");
  await page.locator(".vidwin").waitFor();
  assert.match(await page.locator(".vidwin").innerText(),/Native Terry action/,
    "native Terry action opens the original browser video player");
  await page.locator(".vidwin .close").click();
  await page.locator("#settingsBtn").click();await page.locator("#returnWindows").click();
  await page.waitForFunction(()=>!document.querySelector(".win-pass-owned"));
  assert.equal(await page.locator("#windowPassthrough").isChecked(),true);
  await page.locator("#settingsClose").click();
  await page.locator("#cheatsheetBtn").click();await Transfer("cheatsheetWin");
  const before=await page.locator(".cheatsheet-body").evaluate(el=>el.scrollTop);
  await page.keyboard.press("PageDown");
  await page.waitForFunction(before=>document.querySelector(".cheatsheet-body").scrollTop>before,before);
  await page.keyboard.press("End");
  await page.waitForFunction(()=>{const el=document.querySelector(".cheatsheet-body");return el.scrollTop+el.clientHeight>=el.scrollHeight-1;});
  await page.waitForTimeout(300);
  await page.screenshot({path:"tmp/gui/native-cheatsheet.png"});
  await page.locator("#settingsBtn").click();await page.locator("#returnWindows").click();
  await page.waitForFunction(()=>!document.querySelector(".win-pass-owned"));
  await page.locator("#settingsClose").click();await page.locator("#cheatsheetClose").click();
  await page.locator("#godBtn").click();await Transfer("godWin");
  await Button("godWin","#godWord");
  await page.waitForFunction(()=>!!document.querySelector("#godOut .word"));
  await page.locator("#settingsBtn").click();await page.locator("#returnWindows").click();
  await page.waitForFunction(()=>!document.querySelector(".win-pass-owned"));
  assert.equal(await page.locator("#windowPassthrough").isChecked(),true);
  assert.equal(await page.locator("#winPassDock").count(),0);
  await page.locator("#windowPassthrough").uncheck();
  assert.deepEqual(errors,[]);
  console.log("PASS live GUI bridge: Terry native animation and Random video action, cheatsheet native scrolling, God Tools action, Return preserves passthrough");
} catch (error) {
  if (page) {
    console.error(await page.evaluate(()=>({events:window.passEvents.slice(-8),actions:window.passActions,
      status:document.getElementById("windowPassStatus")?.textContent,
      windows:window.passWindows.map(({buf,...w})=>w)})));
    await page.screenshot({path:"tmp/gui/native-error.png"});
  }
  throw error;
} finally {await browser.close();server.kill();}
