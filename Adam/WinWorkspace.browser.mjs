import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {chromium} from "playwright-core";

const root=new URL("..",import.meta.url),server=spawn(process.execPath,
  ["Misc/Server.mjs"],{cwd:root,env:{...process.env,PORT:"8199"},
    stdio:["ignore","pipe","inherit"]});
await once(server.stdout,"data");
const browser=await chromium.launch({executablePath:process.env.CHROMIUM ||
  "/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
async function Page(mobile=false)
{
  const context=await browser.newContext({viewport:mobile ?
    {width:390,height:844}:{width:1440,height:1000},hasTouch:mobile,isMobile:mobile});
  await context.route("**/hemu/*.gz",function (route) {route.abort();});
  await context.route("https://templeosweb-*.workers.dev/**",function (route) {route.abort();});
  await context.addInitScript(()=>{try {localStorage.setItem("tos-persistence",JSON.stringify({saveWindows:true}));} catch {}});
  const page=await context.newPage();
  page.on("pageerror",function (e) {errors.push(e.message);});
  await page.goto("http://localhost:8199/?single");
  await page.locator("#frame .wbar").waitFor();
  return {page,context};
}
async function Drag(page,selector,x,y)
{
  const r=await page.locator(selector).boundingBox();
  await page.mouse.move(r.x+r.width/2,r.y+r.height/2);
  await page.mouse.down();
  await page.mouse.move(x,y,{steps:8});
  await page.mouse.up();
}
const errors=[];
try {
  const {page}=await Page();
  await page.mouse.wheel(0,700);
  assert.equal(await page.evaluate(function () {return scrollY;}),0,
    "desktop wheel input never scrolls the page");
  await Drag(page,"#keysWin .wtitle",500,780);
  const keysMoved=await page.locator("#keysWin").boundingBox();
  await page.locator("#godBtn").click();
  await Drag(page,"#godWin .wtitle",800,160);
  const moved=await page.locator("#godWin").boundingBox();
  await page.locator("#godOverlay .ovfree").click();
  await page.locator("#guide .close").click();
  const frameBefore=await page.locator("#frame").boundingBox();
  await page.reload();
  await page.locator("#godWin").waitFor();
  const restored=await page.locator("#godWin").boundingBox(),
    keysRestored=await page.locator("#keysWin").boundingBox(),
    frameRestored=await page.locator("#frame").boundingBox();
  assert.equal(keysRestored.x,keysMoved.x);
  assert.equal(keysRestored.y,keysMoved.y);
  assert.equal(frameRestored.y,frameBefore.y,
    "a restored desktop window preserves the remaining layout");
  assert(Math.abs(restored.x-moved.x)<1 && Math.abs(restored.y-moved.y)<1,
    "refresh restores the tool position");
  assert.equal(await page.locator("#guide").isVisible(),false,
    "refresh keeps a closed desktop window closed");
  assert(await page.locator("#godOverlay").evaluate(function (e) {
    return e.classList.contains("free");
  }),"refresh restores the tool's released backdrop");
  await page.locator("#settingsBtn").click();
  await page.locator("#resetWindows").click();
  assert.equal(await page.locator("#godWin").evaluate(function (w) {
    return w.dataset.floating || "";
  }),"","reset removes the saved floating position");
  assert.equal(await page.locator("#guide").isVisible(),false,
    "reset preserves closed window state");
  await page.locator("#settingsClose").click();
  await page.locator("#godWord").click();
  await page.locator("#godOut .word").waitFor();
  const popupPromise=page.waitForEvent("popup");
  await Drag(page,"#godWin .wtitle",1455,120);
  const popup=await popupPromise;
  await popup.locator("#godClear").click();
  assert.equal(await popup.locator("#godOut").innerText(),"",
    "the popup retains live application controls");
  await popup.locator("#godWord").click();
  await popup.locator("#godOut .word").waitFor();
  await popup.screenshot({path:"/home/aphunt/Dev/GitHub/TempleOS/untangle/evidence/2026-11-15-workspace/Window-popup.png"});
  await popup.locator("#popupReturn").click().catch(function (error) {
    if (!popup.isClosed()) throw error;
  });
  await page.locator("#godWin").waitFor();
  assert(await popup.isClosed(),"Return to desktop closes the popup");
  assert(await page.locator("#godOut .word").count(),"return preserves live content");
  const secondPromise=page.waitForEvent("popup");
  await Drag(page,"#godWin .wtitle",1455,160);
  const second=await secondPromise;
  await second.close();
  await page.locator("#godWin").waitFor();
  await page.evaluate(function () {
    window.originalOpen=window.open;
    window.open=function () {return null;};
  });
  await Drag(page,"#godWin .wtitle",1455,160);
  await page.locator("#winPopupNotice").waitFor();
  assert.equal(await page.locator("#godWin").isVisible(),true,
    "blocked popup leaves the original usable");
  await page.evaluate(function () {window.open=window.originalOpen;});
  const retryPromise=page.waitForEvent("popup");
  await page.locator("#winPopupNotice button").first().click();
  const retry=await retryPromise;
  await retry.locator("#popupReturn").click().catch(function (error) {
    if (!retry.isClosed()) throw error;
  });
  const reloadWait=page.waitForEvent("popup");
  await Drag(page,"#godWin .wtitle",1455,160);
  const reloadPopup=await reloadWait;
  await page.reload();
  await page.locator("#godWin").waitFor();
  assert(reloadPopup.isClosed(),"main-page refresh closes owned popups");
  assert.equal(await page.locator("#godWin").isVisible(),true,
    "a popup restores inside the page after refresh");
  await page.screenshot({path:"/home/aphunt/Dev/GitHub/TempleOS/untangle/evidence/2026-11-15-workspace/Window-desktop.png"});
  await page.locator("#godClose").click();
  await page.reload();
  assert.equal(await page.locator("#godWin").count(),0,
    "a closed lazy app does not reopen after refresh");

  await page.locator('.toolbar [data-win="guide"]').click();
  const helpWait=page.waitForEvent("popup");
  await Drag(page,"#guide .wtitle",1455,180);
  const helpPopup=await helpWait;
  assert(await helpPopup.locator("#guide").isVisible(),
    "Help remains visible inside a narrow browser popup");
  const tip=await helpPopup.locator("#helpText").innerText();
  await helpPopup.locator("#helpNext").click();
  assert.notEqual(await helpPopup.locator("#helpText").innerText(),tip);
  await helpPopup.locator("#guide .close").click().catch(function (error) {
    if (!helpPopup.isClosed()) throw error;
  });
  await page.waitForFunction(function () {
    return document.getElementById("guide")?.style.display=="none";
  });
  assert.equal(await page.locator("#guide").isVisible(),false,
    "closing a popup's window does not reopen it when returned");

  const mobile=await Page(true),phone=mobile.page,cdp=await mobile.context.newCDPSession(phone);
  await phone.locator("#mobileMenu").click();
  await phone.locator("#godBtn").click();
  const before=await phone.locator("#godWin").boundingBox(),
    title=await phone.locator("#godWin .wtitle").boundingBox(),
    x=title.x+title.width/2,y=title.y+6;
  assert.equal(await phone.locator("#godWin .wbar").evaluate(function (e) {
    return getComputedStyle(e).touchAction;
  }),"pan-y");
  await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y}]});
  await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:x+30,y:y-80}]});
  await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  const after=await phone.locator("#godWin").boundingBox();
  assert.equal(after.x,before.x);
  assert.equal(after.y,before.y);
  assert.equal(await phone.locator("#godWin").evaluate(function (w) {
    return w.dataset.floating || "";
  }),"","mobile title swipe never floats a window");
  await phone.screenshot({path:"/home/aphunt/Dev/GitHub/TempleOS/untangle/evidence/2026-11-15-workspace/Window-mobile.png"});
  await phone.locator("#godClose").click();
  await phone.locator("footer").evaluate(function (el) {el.style.minHeight="1000px";});
  await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:10,y:700}]});
  for (let n=1;n<=8;n++)
    await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:10,y:700-n*40}]});
  await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  await phone.waitForFunction(function () {return scrollY>0;});
  assert.deepEqual(errors,[]);
  console.log("Workspace: reload, close state, reset, desktop/mobile scrolling, live popup, return, close and blocker retry passed");
} finally {
  await browser.close();
  server.kill();
}
