import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {chromium} from "playwright-core";

const root=new URL("../",import.meta.url).pathname,
  server=spawn(process.execPath,["Misc/Server.mjs"],{cwd:root,
    env:{...process.env,PORT:"8199"},stdio:["ignore","pipe","inherit"]});
await once(server.stdout,"data");
const browser=await chromium.launch({executablePath:process.env.CHROMIUM ||
  "/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
try {
  const page=await browser.newPage({viewport:{width:1280,height:900}}),
    errors=[],loads=[];
  await page.route("**/hemu/*.gz",function (route) {route.abort();});
  page.on("pageerror",function (e) {errors.push(e.message);});
  page.on("request",function (r) {
    if (r.url().includes("WinDraw.wasm")) loads.push(r.url());
  });
  await page.goto("http://localhost:8199/",{waitUntil:"load"});
  await page.locator("#frame .wbar").waitFor();
  assert.equal(loads.length,0,"default CSS mode must not load drawing WASM");
  await page.evaluate(async function () {
    const {WinDrawCfg}=await import("/Adam/WinDraw.js");
    WinDrawCfg({native:true});
  });
  await page.waitForFunction(function () {
    return document.body.classList.contains("native-chrome") &&
      document.querySelector("#frame .wdraw")?.width>0;
  });
  assert.equal(loads.length,1);
  assert.equal(await page.locator("#frame").evaluate(function (w) {
    return getComputedStyle(w).borderLeftWidth;
  }),"8px");
  assert.equal(await page.locator("#frame .wmenu").getAttribute("role"),"button");
  assert.equal(await page.locator("#frame .wdraw").getAttribute("aria-hidden"),"true");
  assert.equal(await page.locator("#frame .wdraw").evaluate(function (c) {
    return c.getContext("2d").getImageData(c.width/2,c.height/2,1,1).data[3];
  }),0,"chrome does not obscure guest or browser content");
  await page.locator("#settingsBtn").click();
  await page.locator("#settingsWin .wdraw").waitFor();
  await page.locator("#settingsClose").focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("#settingsWin").isVisible(),false);
  await page.locator("#godBtn").click();
  await page.locator("#godWin .wdraw").waitFor();
  await page.evaluate(function () {
    window.moves=[];
    document.addEventListener("winmoved",function (e) {window.moves.push(e.detail);});
    document.addEventListener("pointerdown",function (e) {window.pointer=e.pointerId;});
  });
  const before=await page.locator("#godWin").boundingBox(),
    bar=await page.locator("#godWin .wtitle").boundingBox();
  await page.mouse.move(bar.x+60,bar.y+4);
  await page.mouse.down();
  await page.mouse.move(bar.x+84,bar.y+20);
  await page.mouse.up();
  const after=await page.locator("#godWin").boundingBox();
  assert.equal(after.x-before.x,24);
  assert.equal(after.y-before.y,16);
  assert.deepEqual(await page.evaluate(function () {return window.moves;}),
    [{clientX:bar.x+84,clientY:bar.y+20}]);
  await page.locator("#godWin .wtitle").click({position:{x:60,y:4}});
  assert.equal(await page.evaluate(function () {return window.moves.length;}),1,
    "a title click is not a window drop");
  const moved_bar=await page.locator("#godWin .wtitle").boundingBox();
  await page.mouse.move(moved_bar.x+60,moved_bar.y+4);
  await page.mouse.down();
  await page.mouse.move(moved_bar.x+76,moved_bar.y+12);
  await page.evaluate(function () {
    document.getElementById("godWin").dispatchEvent(new PointerEvent(
      "pointercancel",{pointerId:window.pointer,bubbles:true}));
  });
  await page.mouse.up();
  assert.equal(await page.evaluate(function () {return window.moves.length;}),1,
    "a canceled drag is not a window drop");
  const popupWait=page.waitForEvent("popup"),
    popupBar=await page.locator("#godWin .wtitle").boundingBox();
  await page.mouse.move(popupBar.x+60,popupBar.y+4);
  await page.mouse.down();
  await page.mouse.move(1295,160,{steps:8});
  await page.mouse.up();
  const popup=await popupWait;
  await popup.waitForFunction(function () {
    const w=document.getElementById("godWin");
    return document.body.classList.contains("native-chrome") &&
      w.querySelector(".wdraw").width==Math.round(w.getBoundingClientRect().width);
  });
  assert.equal(await popup.locator("#godWin .wdraw").isVisible(),true,
    "optional HolyC drawing follows the live window into its popup");
  await popup.screenshot({path:"/home/aphunt/Dev/GitHub/TempleOS/untangle/evidence/2026-11-15-workspace/Window-native-chrome-popup.png"});
  await popup.locator("#popupReturn").click().catch(function (error) {
    if (!popup.isClosed()) throw error;
  });
  await page.screenshot({path:"/tmp/WinDraw-native.png"});
  const image=await page.locator("#godWin .wdraw").evaluate(function (c) {
    return c.toDataURL();
  });
  await page.evaluate(function () {
    dispatchEvent(new CustomEvent("osstate",{detail:{ready:false,paused:true,
      error:"Guest fault"}}));
  });
  await page.waitForFunction(function (image) {
    return document.querySelector("#godWin .wdraw").toDataURL()!=image;
  },image);
  await page.reload({waitUntil:"load"});
  await page.waitForFunction(function () {
    return document.body.classList.contains("native-chrome");
  });
  assert.equal(loads.length,2,"preference survives reload without the guest");
  await page.evaluate(async function () {
    const {WinDrawCfg}=await import("/Adam/WinDraw.js");
    WinDrawCfg({native:false});
  });
  assert.equal(await page.locator("#frame").evaluate(function (w) {
    return getComputedStyle(w).borderLeftWidth;
  }),"12px");
  assert.equal(await page.locator("#frame .wdraw").isVisible(),false);
  assert.deepEqual(errors,[]);
  const mobile=await browser.newPage({viewport:{width:390,height:844},
    reducedMotion:"reduce",hasTouch:true,isMobile:true});
  await mobile.route("**/hemu/*.gz",function (route) {route.abort();});
  await mobile.addInitScript(function () {
    localStorage.setItem("templeos.windraw",'{"native":true}');
  });
  await mobile.goto("http://localhost:8199/",{waitUntil:"load"});
  await mobile.locator("#frame .wdraw").waitFor();
  const still=await mobile.locator("#frame .wdraw").evaluate(function (c) {
    return c.toDataURL();
  });
  await mobile.waitForTimeout(250);
  assert.equal(await mobile.locator("#frame .wdraw").evaluate(function (c) {
    return c.toDataURL();
  }),still,"reduced motion freezes native blinking and title scrolling");
  const failed=await browser.newPage();
  let failures=0;
  await failed.route("**/hemu/*.gz",function (route) {route.abort();});
  await failed.route("**/build/WinDraw.wasm",function (route) {
    if (!failures++) route.fulfill({status:503,body:"Unavailable"});
    else route.continue();
  });
  await failed.addInitScript(function () {
    localStorage.setItem("templeos.windraw",'{"native":true}');
    addEventListener("windrawerror",function (e) {window.draw_error=e.detail;});
  });
  await failed.goto("http://localhost:8199/",{waitUntil:"load"});
  await failed.waitForFunction(function () {return !!window.draw_error;});
  assert.equal(await failed.locator("#frame").evaluate(function (w) {
    return getComputedStyle(w).borderLeftWidth;
  }),"12px","a failed drawing download leaves working CSS controls");
  assert.match(await failed.evaluate(function () {return window.draw_error;}),/503/);
  await failed.evaluate(async function () {
    const {WinDrawCfg}=await import("/Adam/WinDraw.js");
    WinDrawCfg({native:true});
  });
  await failed.locator("#frame .wdraw").waitFor();
  assert.equal(failures,2,"a failed optional download can be retried");
  await failed.evaluate(function () {
    window.draw_error="";
    document.getElementById("frame").style.width="4100px";
  });
  await failed.waitForFunction(function () {return /4096/.test(window.draw_error);});
  assert.equal(await failed.locator("#frame").evaluate(function (w) {
    return getComputedStyle(w).borderLeftWidth;
  }),"12px","unsupported bitmap dimensions recover working CSS controls");
  console.log("WinDraw browser: lazy WASM, independent unloaded guest, native cells/transparency, accessible close, drag, persistence, CSS restoration, reduced motion and failed-download retry.");
} finally {
  await browser.close();
  server.kill();
}
