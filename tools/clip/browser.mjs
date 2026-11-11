import assert from "node:assert/strict";
import {spawn,execFileSync} from "node:child_process";
import {once} from "node:events";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright-core";

const root=new URL("../../",import.meta.url),
  server=spawn(process.execPath,["server.mjs"],{cwd:root,
    env:{...process.env,PORT:"8184"},stdio:["ignore","pipe","inherit"]});
await once(server.stdout,"data");
const browser=await chromium.launch({executablePath:process.env.CHROMIUM ||
  "/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
let page,bytes=await readFile(new URL("tmp/clip/source.mp4",root)),content_type="video/mp4";
try {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const ranges=[],errors=[];
  let range_mode="normal";
  await context.route("https://archive.org/**",route=>route.fulfill({body:bytes,contentType:content_type}));
  await context.route("https://templeosweb-files.parkerrhunt.workers.dev/archive/**",async function (route) {
    const range=route.request().headers().range,m=/bytes=(\d+)-(\d+)/.exec(range);
    assert(m,"clip reads use closed byte ranges");
    const first=Number(m[1]),last=Math.min(Number(m[2]),bytes.length-1);
    ranges.push([first,last]);
    if (range_mode=="ignored") {
      await route.fulfill({body:bytes,status:200});return;
    }
    if (range_mode=="wait") {
      await new Promise(resolve=>setTimeout(resolve,1500));
    }
    await route.fulfill({status:206,headers:{"Access-Control-Allow-Origin":"*",
      "Access-Control-Expose-Headers":"Content-Range,ETag",
      "Cross-Origin-Resource-Policy":"cross-origin",
      "Content-Range":"bytes "+first+"-"+last+"/"+bytes.length,ETag:'"fixture"'},
      body:bytes.subarray(first,last+1)});
  });
  page=await context.newPage();
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("http://localhost:8184/player.html?f=videos/test.mp4&t=7.15&n=Clip%20check");
  await page.getByLabel("Clip end").fill("0:10.65");
  const downloading=page.waitForEvent("download");
  await page.getByRole("button",{name:"Export clip",exact:true}).click();
  const download=await downloading,file=new URL("tmp/clip/browser-cut.mp4",root).pathname;
  await download.saveAs(file);
  assert.deepEqual(await readFile(file),await readFile(new URL("tmp/clip/cut.mp4",root)),
    "the worker/browser download contains exactly the checked native algorithm output");
  assert(ranges.reduce((n,[a,b])=>n+b-a+1,0)<bytes.length/2);
  assert.equal(await page.locator(".clip-download").isVisible(),true);
  await page.getByLabel("Clip end").fill("0:01");
  await page.getByRole("button",{name:"Export clip",exact:true}).click();
  assert.match(await page.locator(".clip-status").innerText(),/Choose valid/);
  await page.getByLabel("Clip end").fill("0:10.65");
  range_mode="ignored";
  await page.getByRole("button",{name:"Export clip",exact:true}).click();
  await page.waitForFunction(()=>document.querySelector(".clip-status").textContent.includes("Export failed"));
  assert.equal(await page.getByLabel("Clip start").isEnabled(),true);
  range_mode="wait";
  await page.getByRole("button",{name:"Export clip",exact:true}).click();
  await page.getByRole("button",{name:"Cancel export",exact:true}).click();
  assert.equal(await page.getByLabel("Clip start").isEnabled(),true);
  assert.match(await page.locator(".clip-status").innerText(),/cancelled/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  range_mode="normal";
  for (const ext of ["mkv","webm"]) {
    bytes=await readFile(new URL("tmp/clip/source."+ext,root));
    content_type=ext=="webm"?"video/webm":"video/x-matroska";
    await page.goto("http://localhost:8184/player.html?f=videos/test."+ext+"&t=7.15&n=Clip%20check");
    await page.getByLabel("Clip end").fill("0:10.65");
    const pending=page.waitForEvent("download");
    await page.getByRole("button",{name:"Export clip",exact:true}).click();
    const downloaded=await pending,out=new URL("tmp/clip/browser-cut."+ext,root).pathname;
    await downloaded.saveAs(out);
    assert.deepEqual(await readFile(out),await readFile(new URL("tmp/clip/mkv-verified."+ext,root)));
    assert.match(await page.locator(".clip-status").innerText(),/Expanded to whole keyframe groups/);
    assert.match(downloaded.suggestedFilename(),/0_05\.(909|995) to 0_12/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await context.route("**/hemu/*.gz",route=>route.abort());
  await context.route("https://templeosweb-chat.parkerrhunt.workers.dev/**",route=>route.abort());
  await page.goto("http://localhost:8184/?single");
  await page.locator("#mobileMenu").click();
  await page.locator("#tsBtn").click();
  await page.locator("#tsQ").fill('"Songs by God" date:2007 in:titles');
  await page.locator("#tsOut .ts-clip").first().waitFor();
  await page.locator("#tsOut .ts-clip").first().click();
  assert.equal(await page.locator(".vidwin .clip-panel").isVisible(),true);
  assert.equal(await page.locator(".vidwin video").getAttribute("preload"),"none",
    "opening clip controls does not start downloading the original video");
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator(".vidwin .close").click();
  assert.equal(await page.locator(".vidwin").count(),0);
  assert.deepEqual(errors,[]);
  console.log("Browser clip: native bytes downloaded, bounded ranges, validation, range refusal, cancel and mobile width passed.");
} finally {
  await browser.close();server.kill();
}
