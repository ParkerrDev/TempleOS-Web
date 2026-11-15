import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {chromium} from "playwright-core";

const root=new URL("../../",import.meta.url).pathname,
  server=spawn(process.execPath,["Misc/Server.mjs"],{cwd:root,
    env:{...process.env,PORT:"8196"},stdio:["ignore","pipe","inherit"]});
await once(server.stdout,"data");
const browser=await chromium.launch({executablePath:"/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
try {
  const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:"block"}),
    page=await context.newPage(),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await context.route("**/hemu/*.gz",route=>route.abort());
  await context.route("https://templeosweb-*.workers.dev/**",route=>route.abort());
  await page.goto("http://localhost:8196/",{waitUntil:"load"});
  await page.locator("#gamesBtn").click();await page.locator("#gmSearch").fill("HolyCraft");
  await page.locator(".gm-card").filter({has:page.getByRole("heading",{name:"HolyCraft",exact:true})}).
    getByRole("button",{name:"Edit source",exact:true}).click();
  await page.waitForFunction(()=>document.getElementById("editor") && !document.getElementById("editor").disabled &&
    document.getElementById("editorRuntimeInfo").textContent.startsWith("Edit, Run"));
  await page.locator("#editor").evaluate(editor=>{
    editor.value=editor.value.replace(/HolyCraft;\s*$/,`U0 InputReport(U8 *)
{
  while (TRUE) {
    "INPUT %.9f %.9f %.9f %.9f\\n",g_px,g_pz,g_yaw,g_pitch;
    Sleep(100);
  }
}
Spawn(&InputReport);
HolyCraft;
`);
    editor.dispatchEvent(new Event("input"));
  });
  await page.locator("#gameRun").click();
  const camera=()=>page.locator("#console").evaluate(output=>{
    const matches=[...output.textContent.matchAll(/INPUT ([^\n]+)/g)];
    return matches.at(-1)?.[1].split(" ").map(Number);
  });
  await page.waitForFunction(()=>document.getElementById("console").textContent.includes("INPUT "));
  await page.waitForTimeout(500);
  const screen=page.locator("#screen");await screen.focus();
  const before=await camera();await page.keyboard.down("d");await page.waitForTimeout(500);
  await page.keyboard.up("d");await page.waitForTimeout(400);const moved=await camera();
  assert(Math.hypot(moved[0]-before[0],moved[1]-before[1])>0.1,"Holding D moves the native game");
  await page.waitForTimeout(400);assert.deepEqual(await camera(),moved,"Releasing D stops movement");
  await page.locator("#gameCapture").click();
  await page.waitForFunction(()=>document.pointerLockElement?.id==="screen");
  const box=await screen.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);await page.waitForTimeout(300);const still=await camera();
  await page.mouse.move(x+30,y+15);await page.waitForTimeout(400);const turned=await camera();
  assert(turned[2]>still[2] && turned[3]<still[3],"Relative mouse motion turns both axes");
  await page.waitForTimeout(400);assert.deepEqual(await camera(),turned,"One mouse event does not keep steering after MsSet");
  await page.locator("#gameCapture").evaluate(button=>button.click());
  await page.waitForFunction(()=>!document.pointerLockElement);
  const pending=context.waitForEvent("page");
  await page.evaluate(async()=>{
    const {WinPopup,WinFind}=await import("/Adam/WinMgr.js");WinPopup(WinFind("editorWin"));
  });
  const popup=await pending;await popup.waitForLoadState();
  popup.on("pageerror",error=>errors.push(error.message));
  const popupScreen=await popup.locator("#screen").boundingBox();
  assert(popupScreen?.width>100 && popupScreen.height>75,"Popup flex layout keeps the game visible");
  assert(Math.abs(popupScreen.width/popupScreen.height-4/3)<0.02,"Popup preserves the game aspect ratio");
  await popup.locator("#screen").focus();
  const old=await popup.locator("#console").textContent();
  await popup.keyboard.down("d");await popup.waitForTimeout(400);await popup.keyboard.up("d");
  await popup.waitForTimeout(400);
  const rows=(await popup.locator("#console").textContent()).slice(old.length).match(/INPUT [^\n]+/g);
  assert(rows?.length>2,"The same game continues in a browser popup");
  const first=rows[0].split(" ").slice(1).map(Number),last=rows.at(-1).split(" ").slice(1).map(Number);
  assert(Math.hypot(last[0]-first[0],last[1]-first[1])>0.1,"Popup keyboard reaches the active game");
  await popup.locator("#gameStop").click();
  assert(!await page.evaluate(()=>__holycEditor.isRunning()),"Popup Stop terminates the shared worker");
  await popup.close();
  await page.evaluate(async()=>{
    const {runInBrowser}=await import("/Apps/Games/GamesRun.js"),
      {GAMES}=await import("/Apps/Games/GameCatalog.js"),
      {WinWorkspaceSave}=await import("/Adam/WinMgr.js");
    await runInBrowser(GAMES.find(game=>game.name==="HolyCraft"),{start:false});
    WinWorkspaceSave();
  });
  await page.reload();
  await page.waitForFunction(()=>document.getElementById("gameWinOverlay")?.classList.contains("open") &&
    document.getElementById("gameWinSlot")?.contains(document.getElementById("screen")) && window.__holycEditor);
  assert(!await page.evaluate(()=>__holycEditor.isRunning()),"Refresh restores a stopped game window");
  assert.match(await page.locator("#gameWinStatus").textContent(),/Run starts a new game/);
  const restoredScreen=await page.locator("#gameWinSlot #screen").boundingBox();
  assert(restoredScreen?.width>100 && restoredScreen.height>75,"Restored game window has a visible canvas");
  await page.locator("#gameWinRun").click();
  await page.waitForFunction(()=>document.getElementById("console").textContent.includes("INPUT "));
  assert(await page.evaluate(()=>__holycEditor.isRunning()),"Restored Run starts the saved catalog project");
  await page.locator("#gameWinClose").click();
  assert(!await page.evaluate(()=>__holycEditor.isRunning()));
  assert.deepEqual(errors,[]);
  console.log("HolyCraft: movement, relative look, visible popup canvas/input, Stop and stopped-window refresh/Run pass.");
} finally {await browser.close();server.kill();await once(server,"exit");}
