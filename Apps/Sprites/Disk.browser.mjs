import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createServer} from "node:http";
import {once} from "node:events";
import {chromium} from "playwright-core";
import {ServeReq} from "../../Misc/Server.mjs";
import {BrowserMachine} from "../../hemu/Kernel/Test/BrowserMachine.mjs";
import {GrNew} from "./Gr.js";

const codec=await GrNew(await readFile(new URL("../../build/Gr.wasm",import.meta.url))),
  pixels=Uint8Array.from({length:51},(_,i)=>i%17==16?255:i%16),
  gr=codec.encodeGR(pixels,17,3),
  expected=[...gr].map(byte=>"\\x"+byte.toString(16).padStart(2,"0")).join(""),
  check=`U0 SpriteDiskCheck()
{
  I64 size;
  U8 *bytes=FileRead("C:/Home/SavedSprite.GR",&size);
  if (!bytes) throw('Missing');
  if (size!=${gr.length}) {Free(bytes);throw('Size');}
  if (MemCmp(bytes,"${expected}",size)) {Free(bytes);throw('Bytes');}
  Free(bytes);
}
SpriteDiskCheck;`,
  server=createServer(ServeReq).listen(0,"127.0.0.1");
await once(server,"listening");
const origin=(process.env.SPRITE_SITE_URL || "http://127.0.0.1:"+server.address().port).replace(/\/$/,""),
  browser=await chromium.launch({executablePath:"/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
try {
  for (const cores of [1,4]) {
    const context=await browser.newContext({viewport:cores==1?
      {width:390,height:844}:{width:1280,height:900},isMobile:cores==1,hasTouch:cores==1});
    if (process.env.SPRITE_SITE_URL) {
      await context.addInitScript(()=>{
        const Base=Worker;
        window.machine={events:[]};
        window.Worker=class extends Base {
          constructor(...args) {
            super(...args);
            this.addEventListener('message',({data:m})=>{
              if (['diskInfo','diskSave','guestReady','error'].includes(m.cmd))
                window.machine.events.push(m);
            });
          }
        };
      });
    } else await BrowserMachine(context);
    const page=await context.newPage(),errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.goto(origin+(cores==1?"/?single":"/?smp"));
    await page.evaluate(async()=>{(await import('/Apps/Sprites/SpritesWin.js')).Open();});
    const frame=page.frameLocator("#spritesFrame");
    await frame.locator("#file:not([disabled])").waitFor();
    assert(await frame.locator("#diskSave").isDisabled());
    await frame.locator("#file").setInputFiles({name:"Sample.GR",mimeType:"application/octet-stream",buffer:Buffer.from(gr)});
    await frame.locator("#convert").click();
    await frame.locator("#diskSave:not([disabled])").waitFor({timeout:45000});
    await frame.locator("#diskName").fill("../Wrong.GR");
    await frame.locator("#diskSave").click();
    assert.match(await frame.locator("#status").innerText(),/Use a .GR filename/);
    await frame.locator("#diskName").fill("SavedSprite.GR");
    await page.waitForFunction(()=>window.machine.events.some(m=>m.cmd=="diskInfo"&&m.diskReady),null,{timeout:120000});
    await page.evaluate(()=>document.getElementById('pauseBtn').click());
    await frame.locator("#diskSave").click();
    assert.match(await frame.locator("#status").innerText(),/Resume TempleOS before saving files/);
    assert.equal(await frame.locator("#diskSave").isDisabled(),false);
    await page.evaluate(()=>document.getElementById('pauseBtn').click());
    const before_save=await page.evaluate(()=>window.machine.events.length);
    await frame.locator("#diskSave").click();
    await frame.locator("#status").filter({hasText:"Saved C:/Home/SavedSprite.GR"}).waitFor({timeout:120000});
    async function Check()
    {
      const result=await page.evaluate(async src=>{
        const {engine}=await import('/Adam/Os.js');
        return engine.Request({cmd:"osExec",target:"adam",src});
      },check);
      assert.equal(result.ok,true,result.msg);
    }
    await Check();
    await page.waitForFunction(before=>window.machine.events.slice(before).some(m=>m.cmd=="diskSave"&&m.state=="saved"),before_save,{timeout:30000});
    await page.screenshot({path:'/tmp/temple-sprite-save-'+cores+'.png'});
    await page.reload();
    await page.waitForFunction(()=>window.machine.events.some(m=>m.cmd=="diskInfo"&&m.diskReady),null,{timeout:120000});
    await Check();
    assert.deepEqual(errors,[]);
    await context.close();
    console.log(cores+" cores: Sprite Studio writes exact GR bytes through TempleOS; the saved file survives reload.");
  }
} finally {
  await browser.close();server.closeAllConnections();server.close();
}
