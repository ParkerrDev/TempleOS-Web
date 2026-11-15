import {gzipSync} from "node:zlib";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {execFileSync} from "node:child_process";
import {readFile,mkdir} from "node:fs/promises";
import {chromium} from "playwright-core";
import {ServeReq} from "../../Misc/Server.mjs";

const fixture=new URL("../../tmp/search/navigation.mp4",import.meta.url);
await mkdir(new URL(".",fixture),{recursive:true});
execFileSync("ffmpeg",["-v","error","-y","-f","lavfi","-i",
  "color=c=blue:s=64x48:r=2:d=45","-an","-c:v","libx264",
  "-pix_fmt","yuv420p","-g","2",fixture.pathname]);
const server=createServer(ServeReq).listen(0,"127.0.0.1");
await once(server,"listening");
const origin="http://127.0.0.1:"+server.address().port,
  browser=await chromium.launch({executablePath:process.env.CHROMIUM ||
    "/usr/bin/chromium",headless:true,args:["--no-sandbox"]}),
  bytes=await readFile(fixture),
  videos=[{f:"videos/2017/2017-03-01T12:00:00+00:00 - Z first.mkv",t:"Z first",d:"2017-03-01"},
    {f:"videos/2017/2017-03-01T13:00:00+00:00 - A second.mp4",t:"A second",d:"2017-03-01"},
    {f:"videos/2017/2017-03-02T12:00:00+00:00 - Last.mp4",t:"Last",d:"2017-03-02"}];
videos[0].a=videos[1].f;
try {
  for (const mobile of [false,true]) {
    const context=await browser.newContext({viewport:mobile?
      {width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile}),
      page=await context.newPage(),errors=[],shards=[];
    page.on("pageerror",function (error) {errors.push(error.message);});
    page.on("request",function (request) {
      if (request.url().includes("/Transcripts/")) shards.push(request.url());
    });
    await context.route("**/Apps/Search/Videos.json",route=>route.fulfill({json:videos}));
    await context.route("**/Apps/Search/Transcripts/**",route=>route.fulfill(
      route.request().url().endsWith("manifest.json")?{json:{shards:[{f:"test.json.gz"}]}}:
      {body:gzipSync(JSON.stringify(videos.map(v=>({...v,s:[[0,"Transcript for "+v.f]]}))))}));
    await context.route("**/hemu/*.gz",route=>route.abort());
    await context.route("https://templeosweb-chat.parkerrhunt.workers.dev/**",route=>route.abort());
    await context.route("https://archive.org/download/**",route=>route.fulfill(route.request().url().endsWith(".mkv")?{status:415}:{body:bytes,
      contentType:"video/mp4",headers:{"Cross-Origin-Resource-Policy":"cross-origin"}}));
    const params=new URLSearchParams({f:videos[0].f,n:videos[0].t,t:"12"});
    await page.goto(origin+"/Apps/Search/Player.html?"+params);
    await page.getByRole("button",{name:"Next video",exact:true}).waitFor();
    await page.waitForFunction(()=>!document.querySelector('[aria-label="Next video"]').disabled);
    assert.equal(await page.getByRole("button",{name:"Previous video",exact:true}).isDisabled(),true);
    assert.equal(await page.locator(".clip-panel").count(),0);
    await page.getByRole("button",{name:"Play MP4 copy",exact:true}).click();
    await page.waitForFunction(()=>document.querySelector("video").readyState>=2 && document.querySelector("video").currentTime>=12);
    assert.equal(new URL(page.url()).searchParams.get("f"),videos[1].f,"matching copy preserves the requested timestamp");
    await page.goto(origin+"/Apps/Search/Player.html?"+params);
    await page.waitForFunction(()=>!document.querySelector('[aria-label="Next video"]').disabled);
    await page.getByRole("button",{name:"Next video",exact:true}).click();
    assert.equal(await page.locator("#title").innerText(),"A second");
    await page.getByRole("button",{name:"Next video",exact:true}).click();
    assert.equal(await page.locator("#title").innerText(),"Last");
    assert.equal(await page.getByRole("button",{name:"Next video",exact:true}).isDisabled(),true);
    await page.getByRole("button",{name:"Previous video",exact:true}).click();
    assert.equal(await page.locator("#title").innerText(),"A second");
    await page.getByRole("button",{name:"Random video",exact:true}).click();
    assert.notEqual(await page.locator("#title").innerText(),"A second");
    await page.getByRole("button",{name:"Clip controls",exact:true}).click();
    assert.equal(await page.getByLabel("Clip start",{exact:true}).isVisible(),true);
    await page.getByRole("button",{name:"Clip controls",exact:true}).click();
    assert.equal(await page.getByLabel("Clip start",{exact:true}).isVisible(),false);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(shards,[],"Watching/navigation never loads transcript text");
    await mkdir(new URL("../../tmp/search/",import.meta.url),{recursive:true});
    await page.screenshot({path:new URL("../../tmp/search/player-"+(mobile?"mobile":"desktop")+".png",import.meta.url).pathname});
    const playing=new URL(page.url()).searchParams.get("f");
    await page.getByRole("button",{name:"Transcript",exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll("#tsOut .ts-line").length==1);
    assert((await page.locator("#tsOut").innerText()).includes("Transcript for "+playing));
    await page.locator("#tsClose").click();
    if (!mobile) {
      await page.goto(origin+"/?single");
      await page.getByRole("button",{name:"Random video",exact:true}).click();
      await page.locator(".vidwin video").waitFor();
      assert.equal(await page.locator(".vidwin .clip-panel").count(),0);
      const title=await page.locator(".vidwin").getAttribute("data-win-title");
      await page.locator('.vidwin [aria-label="Clip controls"]').click();
      const id=await page.locator(".vidwin").getAttribute("id");
      await page.reload();
      await page.locator('[id="'+id+'"] video').waitFor();
      assert.equal(await page.locator(".vidwin").getAttribute("data-win-title"),title);
      assert.equal(await page.locator(".vidwin .clip-panel").isVisible(),true);
      assert.equal(await page.locator(".vidwin video").getAttribute("preload"),"none");
      await page.locator('.vidwin [aria-label="Clip controls"]').click();
      await mkdir(new URL("../../tmp/search/",import.meta.url),{recursive:true});
      await page.screenshot({path:new URL("../../tmp/search/video-controls.png",import.meta.url).pathname});
      const current=await page.locator(".vidwin video").getAttribute("src");
      const file=decodeURIComponent(new URL(current).pathname.split("/TerryADavis_TempleOS_Archive/")[1].split("#")[0]);
      await page.locator(".vidwin .video-transcript").click();
      await page.waitForFunction(()=>document.querySelectorAll("#tsOut .ts-line").length==1);
      assert((await page.locator("#tsOut").innerText()).includes("Transcript for "+file));
      await page.locator("#tsClose").click();
      await page.locator(".vidwin .close").click();
      await page.reload();
      assert.equal(await page.locator(".vidwin").count(),0,"Closed videos stay closed after reload");
    }
    assert.deepEqual(errors,[]);await context.close();
  }
  console.log("Video browser: playable copies with timestamp preservation, lazy current-video transcripts, clips, chronology, random and restore passed on desktop/mobile.");
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
