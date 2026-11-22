import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {chromium} from "playwright-core";
import {ServeReq} from "../Misc/Server.mjs";

const server=createServer(ServeReq).listen(0,"127.0.0.1");
await once(server,"listening");
const origin="http://127.0.0.1:"+server.address().port,
  browser=await chromium.launch({executablePath:process.env.CHROMIUM || "/usr/bin/chromium",
    headless:true,args:["--no-sandbox"]});
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(()=>{try {localStorage.setItem("tos-persistence",JSON.stringify({syncTabs:true,saveSession:true,saveWindows:true}));} catch {}});
  await context.route("**/hemu/*.gz",route=>route.abort());
  await context.route("https://templeosweb-*.workers.dev/**",route=>route.abort());
  await context.routeWebSocket(/templeosweb-/,()=>{});
  const page=await context.newPage(),cdp=await context.newCDPSession(page);
  async function Ready(tab)
  {
    await tab.locator("#keysWin .wbar").waitFor();
    await tab.waitForFunction(()=>!!localStorage.getItem("templeos.workspace"));
  }
  async function Move(tab,left)
  {
    await tab.evaluate(async function (left) {
      const {WinWorkspaceSave}=await import("/Adam/WinMgr.js"),w=document.getElementById("keysWin");
      w.dataset.floating="1";w.style.position="fixed";w.style.left=left+"px";w.style.top="256px";
      WinWorkspaceSave();
    },left);
  }
  await page.goto(origin+"/?single");await Ready(page);
  await Move(page,312);
  await page.locator("#terryWin .close").click();
  await page.locator("#editorBtn").click();
  await page.waitForFunction(()=>window.__holycEditor?.FileLoad && !document.getElementById("editor").disabled);
  await page.evaluate(()=>__holycEditor.FileLoad(new TextEncoder().encode('"Cleared draft";'),"Deletion.HC"));
  await page.waitForFunction(()=>localStorage.getItem("templeos.editor")?.includes("Deletion.HC"));
  await cdp.send("Network.clearBrowserCache");
  await page.reload();await Ready(page);
  await page.waitForFunction(()=>document.getElementById("editor")?.value=='"Cleared draft";');
  assert.equal(await page.locator("#keysWin").evaluate(w=>w.style.left),"312px",
    "clearing downloaded files preserves the saved workspace and editor draft");
  const second=await context.newPage();await second.goto(origin+"/?single");await Ready(second);
  await Move(second,444);
  let FormatReady,FormatRelease;
  const format_ready=new Promise(resolve=>FormatReady=resolve),
    format_release=new Promise(resolve=>FormatRelease=resolve);
  await context.route("**/Apps/Editor/HolyFmt.js",async route=>{
    FormatReady();await format_release;await route.continue();
  });
  await second.waitForFunction(()=>window.__holycEditor?.FileLoad && !document.getElementById("editor").disabled);
  await second.evaluate(()=>__holycEditor.FileLoad(new TextEncoder().encode('U0 OldFormat() { "old"; }\nOldFormat;'),"OldFormat.HC"));
  await second.locator("#edFmt").click();await format_ready;
  await cdp.send("Storage.clearDataForOrigin",{origin,storageTypes:"all"});
  assert.equal(await page.evaluate(()=>localStorage.getItem("templeos.workspace")),null);
  FormatRelease();
  await second.waitForFunction(()=>document.getElementById("status").textContent==="Browser data was deleted. Refresh this page.");
  assert.equal(await second.locator("#editor").inputValue(),'U0 OldFormat() { "old"; }\nOldFormat;',
    "deleted plain-source formatting does not overwrite the editor");
  assert.equal(await second.evaluate(()=>localStorage.getItem("templeos.editor")),null,
    "a formatter started before deletion cannot recreate the deleted draft when it completes");
  await Move(second,456);
  assert.equal(await second.evaluate(()=>localStorage.getItem("templeos.workspace")),null,
    "a surviving tab cannot rewrite its stale layout after site data is deleted");
  await page.reload();await Ready(page);
  assert.equal(await page.locator("#keysWin").evaluate(w=>w.dataset.floating || ""),"");
  assert.equal(await page.locator("#terryWin").isVisible(),true,"deleted open/closed state returns to defaults");
  assert.equal(await page.locator("#editorWin").count(),0,"deleted workspace does not reopen its old editor");
  assert.deepEqual(await page.evaluate(()=>[localStorage.getItem("templeos.editor"),sessionStorage.getItem("templeos.editor")]),
    [null,null],"unloading the previous editor cannot recreate a deleted draft");
  await Move(second,480);
  assert.equal(await second.evaluate(()=>JSON.parse(localStorage.getItem("templeos.workspace")).keysWin.rect),null,
    "a stale tab remains invalid after a fresh page creates its default workspace");
  await second.close();
  await Move(page,333);
  await page.locator("#editorBtn").click();
  await page.waitForFunction(()=>window.__holycEditor?.FileLoad && !document.getElementById("editor").disabled);
  await page.evaluate(()=>__holycEditor.FileLoad(new TextEncoder().encode('"Old tab draft";'),"OldTab.HC"));
  await page.waitForFunction(()=>localStorage.getItem("templeos.editor")?.includes("OldTab.HC"));
  await page.evaluate(()=>localStorage.clear());
  assert(await page.evaluate(()=>!!sessionStorage.getItem("templeos.workspace")));
  await page.reload();await Ready(page);
  assert.equal(await page.locator("#keysWin").evaluate(w=>w.dataset.floating || ""),"",
    "a per-tab override cannot resurrect deleted durable storage");
  await page.locator("#editorBtn").click();
  await page.waitForFunction(()=>window.__holycEditor?.FileLoad && !document.getElementById("editor").disabled);
  assert.equal(await page.evaluate(()=>__holycEditor.FileName()),"MyProgram.HC",
    "a per-tab draft cannot resurrect a deleted durable draft");
  await page.locator("#editorClose").click();
  await page.locator("#gamesBtn").click();
  await page.locator(".gm-card").filter({has:page.getByRole("heading",{name:"Snake",exact:true})})
    .getByRole("button",{name:"Edit source",exact:true}).click();
  await page.locator("#editorOverlay.gameproject #edFmt").waitFor();
  await page.locator("#editor").fill('U0 OldGame() { "old"; }\nOldGame;');
  await page.waitForFunction(()=>Object.keys(localStorage).some(key=>key.startsWith("tos-game-source:")));
  let GameFormatReady,GameFormatRelease;
  const game_format_ready=new Promise(resolve=>GameFormatReady=resolve),
    game_format_release=new Promise(resolve=>GameFormatRelease=resolve);
  await context.route("**/Apps/Editor/HolyFmt.js",async route=>{
    GameFormatReady();await game_format_release;await route.continue();
  });
  await page.locator("#edFmt").click();await game_format_ready;
  await cdp.send("Storage.clearDataForOrigin",{origin,storageTypes:"all"});
  GameFormatRelease();
  await page.waitForFunction(()=>document.getElementById("status").textContent==="Browser data was deleted. Refresh this page.");
  assert.equal(await page.locator("#editor").inputValue(),'U0 OldGame() { "old"; }\nOldGame;',
    "deleted game-source formatting does not overwrite the editor");
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith("tos-game-source:"))),false,
    "a game formatter started before deletion cannot recreate the deleted game draft");
  console.log("PASS storage deletion: cache-only persistence, full-site reset, stale tabs, per-tab overrides, editor draft unload and delayed plain/game formatting");
} finally {await browser.close();server.close();}
