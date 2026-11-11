import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {gzipSync} from "node:zlib";
import {chromium} from "playwright-core";
import {ServeReq} from "../../server.mjs";

const server=createServer(ServeReq).listen(0,"127.0.0.1");
await once(server,"listening");
const origin="http://127.0.0.1:"+server.address().port,
  browser=await chromium.launch({executablePath:process.env.CHROMIUM ||
    "/usr/bin/chromium",headless:true,args:["--no-sandbox"]}),
  videos=[
    {t:"In:Titles 2012 and HolyC",d:"2016-03-01",f:"a.mp4",n:90,
      s:[[12,"in:titles 2012 is literal text. HolyC compiler."]]},
    {t:"Linux OR Windows",d:"2017-04-02",f:"b.mp4",n:90,
      s:[[20,"Linux OR Windows runs the compiler."]]},
    {t:"God tools",d:"2018-05-03",f:"c.mp4",n:90,
      s:[[30,"HolyC compiler and God tools."]]}
  ];
try {
  for (const mobile of [false,true]) {
    const context=await browser.newContext({viewport:mobile?
      {width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile}),
      page=await context.newPage(),errors=[];
    let shard_attempts=0;
    page.on("pageerror",error=>errors.push(error.message));
    await context.route("**/hemu/*.gz",route=>route.abort());
    await context.route("https://templeosweb-*.workers.dev/**",route=>route.abort());
    await context.route("**/assets/transcripts/**",async route=>{
      const path=new URL(route.request().url()).pathname;
      if (path.endsWith("manifest.json"))
        await route.fulfill({json:{shards:[{f:"first.json.gz"},{f:"second.json.gz"}]}});
      else if (path.endsWith("second.json.gz") && ++shard_attempts==1)
        await route.fulfill({status:503,body:"unavailable"});
      else await route.fulfill({contentType:"application/gzip",
        body:gzipSync(JSON.stringify(path.endsWith("first.json.gz")?videos.slice(0,1):videos.slice(1)))});
    });
    await page.goto(origin);
    if (mobile) await page.locator("#mobileMenu").click();
    await page.locator("#tsBtn").click();
    await page.locator("#tsStatus button").click();
    await page.waitForFunction(()=>document.querySelectorAll("#tsOut .ts-hit").length==3);
    assert.equal(shard_attempts,2,"Retry actually refetches the failed shard.");
    await page.locator("#tsQ").fill('"in:titles  2012" IN:Titles ON:2016');
    await page.waitForFunction(()=>document.querySelector('.ts-seg [data-sc="title"]').classList.contains("on") &&
      document.getElementById("tsYearBtn").textContent.includes("(1)"));
    await page.locator('.ts-seg [data-sc="text"]').click();
    await page.waitForFunction(()=>document.getElementById("tsQ").value.endsWith("in:transcript"));
    assert((await page.locator("#tsQ").inputValue()).startsWith('"in:titles  2012"'));
    await page.waitForFunction(()=>document.querySelectorAll("#tsOut .ts-hit").length==1);
    assert((await page.locator("#tsOut").innerText()).includes("HolyC compiler"));
    await page.locator("#tsYearBtn").click();
    //Two changes before either worker reply must accumulate rather than overwrite.
    await page.locator("#tsYearPanel").evaluate(panel=>{
      for (const year of ["2017","2018"]) {
        const box=panel.querySelector('input[value="'+year+'"]');
        box.checked=true;box.dispatchEvent(new Event("change",{bubbles:true}));
      }
    });
    await page.waitForFunction(()=>document.getElementById("tsYearBtn").textContent.includes("(3)"));
    assert((await page.locator("#tsQ").inputValue()).endsWith("date:2016-2018"));
    await page.locator("#tsYearPanel button").click();
    await page.waitForFunction(()=>document.getElementById("tsYearBtn").textContent=="year ▾");
    assert((await page.locator("#tsQ").inputValue()).includes('"in:titles  2012"'));
    await page.locator("#tsQ").fill('"Linux OR Windows" IN:Titles');
    await page.waitForFunction(()=>document.querySelectorAll("#tsOut .ts-hit").length==1 &&
      document.querySelector("#tsOut .ts-hit").textContent.includes("Linux OR Windows"));
    await page.locator("#tsQ").fill("compiler -linux since:2016 until:2018 IN:Transcript");
    await page.waitForFunction(()=>document.querySelectorAll("#tsOut .ts-hit").length==2);
    const bounds=await page.locator("#tsWin").boundingBox();
    assert(bounds.x>=0 && bounds.x+bounds.width<=await page.evaluate(()=>innerWidth));
    assert.deepEqual(errors,[]);
    await context.close();
  }
  const context=await browser.newContext(),page=await context.newPage();
  let release,started;
  const gate=new Promise(resolve=>release=resolve),requested=new Promise(resolve=>started=resolve);
  await context.route("**/hemu/*.gz",route=>route.abort());
  await context.route("**/search/Query.HC",async route=>{started();await gate;await route.continue();});
  await context.route("**/assets/transcripts/**",route=>route.fulfill({status:503,body:"offline"}));
  await page.goto(origin);
  await page.locator("#tsBtn").click();
  await requested;
  await page.locator("#tsQ").fill("first query");
  await page.locator('.ts-seg [data-sc="title"]').click();
  await page.locator("#tsQ").fill("second query IN:Transcript");
  release();
  await page.waitForFunction(()=>document.querySelector('.ts-seg [data-sc="text"]').classList.contains("on"));
  assert.equal(await page.locator("#tsQ").inputValue(),"second query IN:Transcript",
    "A delayed filter edit cannot replace newly typed text.");
  await context.close();
  console.log("Search browser: native grammar, real worker results, queued filters, delayed edits, retry and mobile width pass.");
} finally {
  await browser.close();await new Promise(resolve=>server.close(resolve));
}
