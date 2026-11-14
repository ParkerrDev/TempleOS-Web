import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createServer} from "node:http";
import {once} from "node:events";
import {chromium} from "playwright-core";
import {ServeReq} from "../../Misc/Server.mjs";

const server=createServer(ServeReq).listen(0,"127.0.0.1");
await once(server,"listening");
const origin="http://127.0.0.1:"+server.address().port,
  browser=await chromium.launch({executablePath:process.env.CHROMIUM||"/usr/bin/chromium",
    headless:true,args:["--no-sandbox"]});
try {
  const context=await browser.newContext(),page=await context.newPage(),requests=[];
  await context.route("**/hemu/*.gz",route=>route.abort());
  await context.route("https://templeosweb-*.workers.dev/**",route=>route.abort());
  page.on("request",request=>{
    if(request.url().includes("/Apps/Editor/Demos/"))requests.push(request.url());
  });
  await page.goto(origin);
  await page.locator("#editorBtn").click();
  await page.waitForFunction(()=>{
    const canvas=window.__holycEditor?.inputCanvas();
    if (!canvas) return false;
    const pixels=new Uint32Array(canvas.getContext("2d").getImageData(0,0,640,480).data.buffer);
    return pixels.some(value=>value!==pixels[0]);
  });
  assert.ok(!await page.locator("#console").innerText().then(text=>text.includes("[error]")));
  assert.deepEqual(requests.map(url=>url.slice(origin.length)),
    ["/Apps/Editor/Demos/Graphics/Lines.HC"],"Opening Editor fetches only its selected example.");
  await page.evaluate(()=>__holycEditor.stop());
  for (const path of ["Demos/Snd/ASCIIOrgan.HC","Demos/Snd/WaterFowl.HC"]) {
    const bytes=await readFile(new URL(path,import.meta.url)),
      expected=bytes.subarray(0,bytes.indexOf(0)).toString("latin1").replace(/\r\n?/g,"\n");
    await page.locator("#demoSelect").selectOption(path);
    await page.waitForFunction(path=>document.getElementById("status").textContent==="loaded "+path,path);
    assert.equal(await page.locator("#editor").inputValue(),expected,"Sprite data stays outside the text editor.");
    const saving=page.waitForEvent("download");
    await page.locator("#edSave").click();
    assert.deepEqual(await readFile(await (await saving).path()),bytes,"Saving a native example preserves all its bytes.");
  }
  let release,started;
  const gate=new Promise(resolve=>release=resolve),requested=new Promise(resolve=>started=resolve);
  await context.route("**/Demos/Graphics/Grid.HC",async route=>{
    started();await gate;await route.continue();
  });
  await page.locator("#demoSelect").selectOption("Demos/Graphics/Grid.HC");
  await requested;
  await page.locator("#demoSelect").selectOption("Demos/Carry.HC");
  await page.waitForFunction(()=>document.getElementById("status").textContent==="loaded Demos/Carry.HC");
  const carry=await page.locator("#editor").inputValue(),finished=page.waitForResponse("**/Demos/Graphics/Grid.HC");
  release();await (await finished).finished();
  await page.waitForFunction(()=>document.getElementById("demoSelect").value==="Demos/Carry.HC");
  assert.equal(await page.locator("#editor").inputValue(),carry,"A late previous example cannot replace the latest selection.");
  await context.unroute("**/Demos/Graphics/Grid.HC");
  let releaseEdit,editStarted;
  const editGate=new Promise(resolve=>releaseEdit=resolve),editRequest=new Promise(resolve=>editStarted=resolve);
  await context.route("**/Demos/Graphics/Grid.HC",async route=>{
    editStarted();await editGate;await route.continue();
  });
  await page.locator("#demoSelect").selectOption("Demos/Graphics/Grid.HC");
  await editRequest;
  const pendingEdit=carry+"\n// Keep this edit.\n";
  await page.locator("#editor").fill(pendingEdit);
  const editFinished=page.waitForResponse("**/Demos/Graphics/Grid.HC");
  releaseEdit();await (await editFinished).finished();
  assert.equal(await page.locator("#editor").inputValue(),pendingEdit,"Editing cancels pending source replacement.");
  await context.route("**/Demos/Print.HC",route=>route.fulfill({status:503,body:"Unavailable"}));
  await page.locator("#demoSelect").selectOption("Demos/Print.HC");
  await page.waitForFunction(()=>document.getElementById("status").textContent.includes("HTTP 503"));
  assert.equal(await page.locator("#editor").inputValue(),pendingEdit,"A failed example fetch preserves the editor contents.");
  const uploaded=Buffer.concat([Buffer.from('// Native '+String.fromCharCode(0xE9)+'\r\n"Hello";\n','latin1'),
    Buffer.from([0,13,10,0,255,128,254,1])]),choosing=page.waitForEvent("filechooser");
  await page.locator("#edOpen").click();
  await(await choosing).setFiles({name:"Native.HC",mimeType:"application/octet-stream",buffer:uploaded});
  await page.waitForFunction(()=>document.getElementById("status").textContent==="opened Native.HC");
  async function Saved() {
    const saving=page.waitForEvent("download");
    await page.locator("#edSave").click();
    const download=await saving;
    assert.equal(download.suggestedFilename(),"Native.HC");
    return readFile(await download.path());
  }
  assert.deepEqual(await Saved(),uploaded,"Open/Save preserves non-ASCII text, CRLF and every binary byte.");
  const text=await page.locator("#editor").inputValue();
  await page.locator("#editor").fill("// Changed\n"+text);
  const edited=await Saved(),tail=uploaded.subarray(uploaded.indexOf(0));
  assert.deepEqual(edited.subarray(edited.indexOf(0)),tail,"Editing the source leaves the binary tail unchanged.");
  assert.equal(edited.subarray(0,edited.indexOf(0)).toString("latin1"),"// Changed\n"+text);
  console.log("Editor examples: selected-file loading, native Open/Save/edit byte preservation, default run, selection races and failed downloads pass.");
} finally {
  await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
