import assert from "node:assert/strict";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {chromium} from "playwright-core";
import {DesktopServer} from "./desktop.mjs";

const app=await DesktopServer({cores:Number(process.env.HEMU_DESKTOP_CORES||1)});
let browser;
try {
  const root=await fetch(app.url),headers=root.headers;
  assert.equal(root.status,200);assert.match(await root.text(),/TempleOS screen/);
  assert.equal(headers.get("cross-origin-embedder-policy"),"require-corp");
  assert.equal((await fetch(app.url+".git/config")).status,404);
  assert.equal((await fetch(app.url+"session.json")).status,200);
  browser=await chromium.launch({executablePath:process.env.HEMU_BROWSER||process.env.CHROMIUM||"/usr/bin/chromium",
    headless:true,args:["--no-sandbox","--disable-gpu"]});
  const page=await browser.newPage({viewport:{width:1000,height:800}}),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("console",message=>{if(message.type()==="error")errors.push(message.text());});
  const Eval=expression=>page.evaluate(expression);
  await page.goto(app.url);
  async function Wait(expression,ms=30000) {
    try {await page.waitForFunction(expression,null,{timeout:ms});}
    catch(error) {throw new Error("Desktop timeout: "+expression+"; "+await Eval('document.getElementById("status").textContent')+"; "+JSON.stringify(errors),{cause:error});}
  }
  await Wait('Number(document.getElementById("screen").dataset.frames)>10 && !document.getElementById("pause").disabled');
  assert.equal(await Eval("crossOriginIsolated"),true);
  await Wait('!document.getElementById("save").disabled');
  if(process.env.HEMU_DESKTOP_CORES==="4") await Wait('document.getElementById("screen").dataset.cores==="4"');
  await Eval('document.getElementById("pause").click()');
  await Wait('document.getElementById("pause").textContent==="Resume"');
  const count=await Eval('document.getElementById("screen").dataset.frames');
  await new Promise(r=>setTimeout(r,250));
  assert.equal(await Eval('document.getElementById("screen").dataset.frames'),count);
  assert.match(await Eval('document.getElementById("fps").textContent'),/^(\d+|—) FPS$/);
  const path=process.env.HEMU_DESKTOP_SHOT||join(tmpdir(),"hemu-desktop.png");
  await page.screenshot({path});
  await Eval('document.getElementById("pause").click()');
  await Wait('document.getElementById("pause").textContent==="Pause"');
  await Eval('document.getElementById("rate").value="30";document.getElementById("rate").dispatchEvent(new Event("change"))');
  await Wait('Number(document.getElementById("screen").dataset.frames)>'+count);
  assert.deepEqual(errors,[]);
  console.log("Desktop Chromium window: isolated offline boot, canvas frames, coherent FPS, pause/resume and rate setting passed; "+path);
} finally {
  try {await browser?.close();} finally {await app.close();}
}
