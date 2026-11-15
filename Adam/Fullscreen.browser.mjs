import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {chromium} from "playwright-core";

const root=new URL("..",import.meta.url),
  server=spawn(process.execPath,["Misc/Server.mjs"],{cwd:root,
    env:{...process.env,PORT:"8194"},stdio:["ignore","pipe","inherit"]});
await once(server.stdout,"data");
const browser=await chromium.launch({executablePath:process.env.CHROMIUM ||
  "/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
try {
  const context=await browser.newContext({viewport:{width:1440,height:900}}),
    page=await context.newPage(),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await context.route("**/hemu/*.gz",route=>route.abort());
  await context.route("https://templeosweb-*.workers.dev/**",route=>route.abort());
  await context.routeWebSocket(/templeosweb-presence\./,()=>{});
  await context.routeWebSocket(/templeosweb-chat\./,ws=>{
    ws.send(JSON.stringify({t:"hello",tag:"test",people:1,log:[]}));
  });
  await page.goto("http://localhost:8194/?single",{waitUntil:"load"});
  await page.evaluate(async function () {
    const os=await import("/Adam/Os.js"),Send=os.engine.post;
    window.osInputs=[];window.nativeLaunches=[];
    os.engine.post=function (message,...args) {
      if (message.cmd=="input") window.osInputs.push(message);
      return Send(message,...args);
    };
    document.addEventListener("winlaunch",function (e) {
      window.nativeLaunches.push({id:e.detail.win.id,origin:e.detail.origin});
    });
  });
  await page.locator("#fsBtn").click();
  await page.waitForFunction(()=>document.fullscreenElement?.id=="frame" &&
    document.activeElement?.id=="canvas");
  const canvas=await page.locator("#canvas").boundingBox(),
    margin={x:canvas.x/2,y:canvas.y+canvas.height/2};
  assert(margin.x>4,"the test has a fullscreen letterbox");
  assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y).id,margin),"frame");
  assert.equal(await page.locator("#frame").evaluate(el=>getComputedStyle(el).cursor),"auto");
  assert.equal(await page.locator("#canvas").evaluate(el=>getComputedStyle(el).cursor),"none");
  await page.mouse.move(canvas.x+canvas.width/2,canvas.y+canvas.height/2);
  await page.waitForFunction(()=>window.osInputs.length);
  await page.evaluate(()=>{window.osInputs=[];dispatchEvent(new Event("blur"));});
  await page.mouse.click(margin.x,margin.y);
  assert.equal(await page.evaluate(()=>document.activeElement.id),"canvas");
  assert.equal(await page.evaluate(()=>window.osInputs.some(message=>message.b)),false,
    "letterbox clicks focus the OS without clicking an emulated screen edge");
  await page.mouse.click(canvas.x+canvas.width/2,canvas.y+canvas.height/2);
  assert.equal(await page.evaluate(()=>window.osInputs.some(message=>message.b===1)),true,
    "a click on the actual canvas reaches the guest input device");
  await page.keyboard.press("a");
  assert.equal(await page.evaluate(()=>window.osInputs.some(message=>message.keys.length)),true,
    "fullscreen keyboard input is sent to TempleOS from the focused canvas");

  await page.evaluate(function () {
    document.getElementById("desktopMenu").classList.add("win-pass-owned");
    document.getElementById("chatBtn").click();
  });
  await page.waitForFunction(()=>window.nativeLaunches.some(event=>event.id=="chatWin"));
  assert.deepEqual(await page.evaluate(()=>window.nativeLaunches.map(event=>event.origin)),[
    {native:true,id:"desktopMenu"},{native:true,id:"desktopMenu"}],
  "loading and cold Chat launch retain native Menu origin without DOM focus");
  assert.equal(await page.evaluate(()=>document.activeElement.id),"canvas",
    "opening native Chat cannot depend on focusing a hidden browser input");
  assert.deepEqual(await page.evaluate(async function () {
    const {WinAction,WinOrigin}=await import("/Adam/WinMgr.js"),
      menu=document.getElementById("chatBtn"),chat=document.getElementById("chatWin"),
      result=[];
    chat.classList.add("win-pass-owned");
    WinAction(menu,function () {
      result.push(WinOrigin());
      WinAction(chat,function () {result.push(WinOrigin());});
      result.push(WinOrigin());
    });
    try {WinAction(menu,function () {throw Error("test");});} catch {}
    result.push(WinOrigin().native);
    return result;
  }),[{native:true,id:"desktopMenu"},{native:true,id:"chatWin"},
    {native:true,id:"desktopMenu"},false],
  "backend action origin is scoped, nested and restored after errors");

  await page.evaluate(async function () {
    const {OsFullscreenExit}=await import("/Adam/Os.js");
    await OsFullscreenExit();
  });
  await page.waitForFunction(()=>!document.fullscreenElement &&
    !document.getElementById("frame").classList.contains("fsmode"));
  await page.evaluate(function () {
    const frame=document.getElementById("frame");
    frame.requestFullscreen=null;frame.webkitRequestFullscreen=null;
    document.getElementById("chatWin").classList.remove("win-pass-owned");
    document.getElementById("desktopMenu").classList.remove("win-pass-owned");
    document.getElementById("chatClose").click();
  });
  await page.locator("#fsBtn").click();
  assert.equal(await page.evaluate(()=>document.body.classList.contains("fakefs")),true);
  await page.evaluate(async function () {
    const {OsFullscreenExit}=await import("/Adam/Os.js");
    await OsFullscreenExit();
  });
  assert.equal(await page.evaluate(()=>document.body.classList.contains("fakefs") ||
    document.getElementById("frame").classList.contains("fsmode")),false,
  "browser-only tools can also leave the mobile fullscreen fallback");
  const launches=await page.evaluate(()=>window.nativeLaunches.length);
  await page.locator("#chatBtn").click();
  await page.locator("#chatWin").waitFor({state:"visible"});
  assert.equal(await page.evaluate(()=>window.nativeLaunches.length),launches,
    "ordinary browser Menu actions remain browser windows");
  assert.deepEqual(errors,[]);
  console.log("Fullscreen: canvas input, letterbox boundary/cursor, explicit native launch origin, scoped backend actions and real/faux exit.");
} finally {
  await browser.close();
  server.kill();
}
