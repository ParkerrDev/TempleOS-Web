import assert from "node:assert/strict";
import {readFile,mkdir} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {createServer} from "node:http";
import {once} from "node:events";
import {chromium} from "playwright-core";
import {ServeReq} from "../../server.mjs";
import {GrNew} from "../../sprites/Gr.js";
import {toRGBA} from "../../sprite-codec.js";

const root=new URL("../../",import.meta.url),tmp=new URL("tmp/sprites/",root),
  codec=await GrNew(await readFile(new URL("sprites/Gr.HC",root),"utf8")),
  pixels=Uint8Array.from({length:17*3},(_,i)=>i%17==16?255:i%16),
  gr=codec.encodeGR(pixels,17,3),rgba=toRGBA(pixels,17,3),
  animation=await readFile(new URL("assets/terry-sprites.gr.gz",root)),
  server=createServer(ServeReq).listen(0,"127.0.0.1");
await once(server,"listening");await mkdir(tmp,{recursive:true});
const origin="http://127.0.0.1:"+server.address().port,
  browser=await chromium.launch({executablePath:process.env.CHROMIUM ||
    "/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
try {
  for (const mobile of [false,true]) {
    const context=await browser.newContext({viewport:mobile?
      {width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile}),
      page=await context.newPage(),errors=[];
    await context.route("**/hemu/*.gz",route=>route.abort());
    await context.route("https://templeosweb-*.workers.dev/**",route=>route.abort());
    await context.route("**/assets/terry-sprites.gr.gz",route=>route.fulfill({body:animation}));
    page.on("pageerror",error=>{errors.push(error.message);console.error("Sprite browser:",error.message);});
    await page.goto(origin);
    if (mobile) await page.locator("#mobileMenu").click();
    await page.locator("#spritesBtn").click();
    const frame=page.frameLocator("#spritesFrame");
    await frame.locator("#file:not([disabled])").waitFor();
    await frame.locator("#file").setInputFiles({name:"Sample.GR",mimeType:"application/octet-stream",buffer:Buffer.from(gr)});
    await frame.locator("#convert").click();
    await frame.locator("#gr:not([disabled])").waitFor();
    assert.equal(await frame.locator("#frameLabel").innerText(),"1 / 1");
    assert.deepEqual(await frame.locator("#preview").evaluate(canvas=>
      [...canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data]),[...rgba]);
    let pending=page.waitForEvent("download");
    await frame.locator("#gr").click();
    let download=await pending,file=new URL(mobile?"mobile.GR":"desktop.GR",tmp).pathname;
    await download.saveAs(file);assert.deepEqual(new Uint8Array(await readFile(file)),gr);
    pending=page.waitForEvent("download");await frame.locator("#package").click();
    download=await pending;file=new URL(mobile?"mobile.zip":"desktop.zip",tmp).pathname;
    await download.saveAs(file);
    const packed=execFileSync("python3",["-c",
      'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert "Play.HC" in z.namelist(); sys.stdout.buffer.write(z.read("Frame000.GR"))',file]);
    assert.deepEqual(new Uint8Array(packed),gr,"The package includes the same native GR bytes.");
    await frame.locator("#file").setInputFiles({name:"Broken.GR",mimeType:"application/octet-stream",buffer:Buffer.from(gr.subarray(0,35))});
    await frame.locator("#convert").click();
    await frame.locator("#cancel[hidden]").waitFor({state:"attached"});
    assert.match(await frame.locator("#status").innerText(),/length/);
    assert.equal(await frame.locator("#gr").isDisabled(),true);
    const bounds=await page.locator("#spritesWin").boundingBox();
    assert(bounds.x>=0 && bounds.x+bounds.width<=await page.evaluate(()=>innerWidth));
    assert.deepEqual(errors,[]);
    await page.locator("#spritesClose").click();
    const independent=await page.evaluate(async()=>{
      const {playTerrySprite}=await import("./terry-sprite.js"),
        a=document.createElement("canvas"),b=document.createElement("canvas");
      document.body.append(a,b);
      const first=await playTerrySprite(a);first.stop();
      const second=await playTerrySprite(b);second.stop();
      function Hash(canvas) {
        let hash=0x811C9DC5;
        for (const byte of canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data)
          hash=Math.imul(hash^byte,16777619)>>>0;
        return hash;
      }
      const a_before=Hash(a),b_before=Hash(b);
      first.play(10);first.stop();
      const result={a_before,b_before,a_after:Hash(a),b_after:Hash(b)};
      a.remove();b.remove();return result;
    });
    assert.equal(independent.a_before,independent.b_before);
    assert.notEqual(independent.a_after,independent.a_before);
    assert.equal(independent.b_after,independent.b_before,"Each Terry player owns its canvas and sequence.");
    await context.close();
  }
  console.log("Sprite browser: native GR preview/download/package, malformed input, mobile width and independent Terry players pass.");
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
}
