import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {chromium} from "playwright-core";

const root=new URL("../../",import.meta.url).pathname,
  server=spawn(process.execPath,["Misc/Server.mjs"],{cwd:root,
    env:{...process.env,PORT:"8185"},stdio:["ignore","pipe","inherit"]});
await once(server.stdout,"data");
const browser=await chromium.launch({executablePath:"/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
try {
  const context=await browser.newContext(),requests=[];
  context.on("request",r=>requests.push(new URL(r.url()).pathname));
  await context.route("**/hemu/*.gz",r=>r.abort());
  await context.route("https://templeosweb-*.workers.dev/**",r=>r.abort());
  let moduleRelease,recordsRelease;
  const moduleGate=new Promise(r=>moduleRelease=r),recordsGate=new Promise(r=>recordsRelease=r);
  await context.route("**/Apps/Games/GamesWin.js",async r=>{await moduleGate;await r.continue();});
  await context.route(/\/Demo\/Games\/(Compatibility|Startup)\.json$/,async r=>{await recordsGate;await r.continue();});
  const page=await context.newPage();
  await page.goto("http://localhost:8185/",{waitUntil:"load"});
  await page.locator("#frame .wbar").waitFor();
  assert(!requests.some(p=>/^\/Apps\/(Games|Editor|Search|Chat|Terry)\//.test(p)),"Optional apps stay off the startup path");
  const elapsed=await page.evaluate(()=>{
    const start=performance.now();document.getElementById("gamesBtn").click();
    if(!document.getElementById("winLoadingOverlay").classList.contains("open"))throw Error("No synchronous feedback");
    return performance.now()-start;
  });
  assert(await page.locator("#winLoadingOverlay").isVisible());
  await page.locator("#winLoadingClose").click();
  moduleRelease();
  await page.waitForFunction(()=>!!document.getElementById("gamesOverlay"));
  assert(!await page.locator("#gamesOverlay").isVisible(),"Cancel prevents delayed opening");
  await page.locator("#gamesBtn").click();
  await page.locator("#gmLoading").waitFor();
  assert.equal(await page.locator(".gm-card").count(),0);
  assert(!requests.some(p=>p.includes("/Editor/")||p.endsWith("/GamesRun.js")),"Catalog does not load the runner");
  recordsRelease();
  await page.locator("#gmLoading").waitFor({state:"hidden"});
  assert.equal(await page.locator(".gm-card").count(),66);
  await page.locator("#gmSearch").fill("HolyCraft");
  await page.locator(".gm-card:visible").getByRole("button",{name:"Edit source",exact:true}).click();
  await page.locator("#editorOverlay").waitFor();
  assert(requests.some(p=>p.endsWith("/GamesRun.js")));
  console.log(JSON.stringify({feedbackMs:elapsed,catalogEntries:66,cancel:true,lazyRunner:true,noOptionalStartupDownloads:true}));
} finally {await browser.close();server.kill();}
