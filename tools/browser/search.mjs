import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {gzipSync} from "node:zlib";
import {execFileSync} from "node:child_process";
import {mkdir,readFile} from "node:fs/promises";
import {chromium} from "playwright-core";
import {ServeReq} from "../../server.mjs";

const dir=new URL("../../tmp/search/",import.meta.url),media={};
await mkdir(dir,{recursive:true});
for (const ext of ["mp4","mkv"]) {
  const file=new URL("video."+ext,dir);
  execFileSync("ffmpeg",["-hide_banner","-loglevel","error","-y","-f","lavfi",
    "-i","color=c=blue:s=64x48:r=2:d=45","-an","-c:v","libx264",
    "-pix_fmt","yuv420p","-g","2",file.pathname]);
  media[ext]=await readFile(file);
}
const server=createServer(ServeReq).listen(0,"127.0.0.1");
await once(server,"listening");
const origin="http://127.0.0.1:"+server.address().port,
  browser=await chromium.launch({executablePath:process.env.CHROMIUM ||
    "/usr/bin/chromium",headless:true,args:["--no-sandbox"]}),
  videos=[
    {t:"In:Titles 2012 and HolyC",d:"2016-03-01",f:"videos/A + B.mp4",n:45,p:1,
      s:[[12,"in:titles 2012 is literal text. HolyC compiler. An idiot admires complexity."],
        [24,"Round robin priorities."],[36,"Round robin tasks."]]},
    {t:"Linux OR Windows",d:"2017-04-02",f:"videos/Linux + Windows.mkv",n:45,
      s:[[20,"Linux OR Windows runs the compiler."]]},
    {t:"God tools",d:"2018-05-03",f:"c.mp4",n:90,
      s:[[30,"HolyC compiler and God tools."]]}
  ];
try {
  for (const mobile of [false,true]) {
    const context=await browser.newContext({viewport:mobile?
      {width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile,
      permissions:["clipboard-read","clipboard-write"]}),
      page=await context.newPage(),errors=[];
    let shard_attempts=0;
    page.on("pageerror",error=>errors.push(error.message));
    await context.route("**/hemu/*.gz",route=>route.abort());
    await context.route("https://templeosweb-*.workers.dev/**",route=>route.abort());
    await context.route("https://archive.org/download/**",route=>{
      const ext=new URL(route.request().url()).pathname.split(".").pop(),body=media[ext],
        range=/bytes=(\d+)-(\d*)/.exec(route.request().headers().range || ""),
        first=range?Number(range[1]):0,last=range?.[2]?Number(range[2]):body.length-1;
      return route.fulfill({body:body.subarray(first,last+1),status:range?206:200,
        contentType:ext=="mkv"?"video/x-matroska":"video/mp4",
        headers:{"Cross-Origin-Resource-Policy":"cross-origin","Accept-Ranges":"bytes",
          ...(range?{"Content-Range":"bytes "+first+"-"+last+"/"+body.length}:{})}});
    });
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
    await SearchFeatures(page,context,mobile);
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
  console.log("Search browser: native grammar, fuzzy/exact results, clipboard/downloads, archive links, MP4/MKV playback, seeking, focus, filters and retry pass on desktop/mobile.");
} finally {
  await browser.close();await new Promise(resolve=>server.close(resolve));
}

async function SearchFeatures(page,context,mobile)
{
  const texts=()=>page.locator("#tsOut .ts-x").allTextContents(),
    browse=async()=>{
      await page.locator("#tsClear").click();
      await page.waitForFunction(()=>document.querySelectorAll("#tsOut .ts-vidcard").length==3);
      assert.equal(await page.locator("#tsQ").inputValue(),"");
    },
    query=async(text,expected)=>{
      //A settled browse view prevents the previous query's equal results satisfying this wait.
      await browse();
      await page.locator("#tsQ").fill(text);
      await page.waitForFunction(expected=>JSON.stringify([...document.querySelectorAll(
        "#tsOut .ts-x")].map(e=>e.textContent))==JSON.stringify(expected) &&
        !document.querySelector("#tsOut .ts-vidcard"),expected);
      assert.deepEqual(await texts(),expected);
    };
  await query('idoit admires complexty in:transcript',[videos[0].s[0][1]]);
  await query('"idoit admires complexty" in:transcript',[]);
  await page.locator("#tsOut .ts-none").waitFor();
  await query('"round robin" -priorities in:transcript',[videos[0].s[2][1]]);
  await query('compiler in:transcript date:2017-04-02',[videos[1].s[0][1]]);
  await query('linux OR complexity in:transcript',[videos[0].s[0][1],videos[1].s[0][1]]);
  await query('"an idiot admires complexity" in:transcript',[videos[0].s[0][1]]);
  const archive="https://archive.org/details/TerryADavis_TempleOS_Archive/videos/A+%252B+B.mp4",
    passage='“'+videos[0].s[0][1]+'”\n- Terry A. Davis, '+videos[0].t+
      ' (2016-03-01), at 0:12\n'+archive+'?start=10';
  assert.equal(await page.locator("#tsOut .ts-t").getAttribute("href"),archive+"?start=10");
  await page.locator("#tsOut .ts-cp").click();
  await page.waitForFunction(()=>document.querySelector("#tsOut .ts-cp").disabled);
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),passage);
  await page.locator("#tsCopyAll").click();
  await page.waitForFunction(()=>document.getElementById("tsCopyAll").disabled);
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),
    'Terry Search: "\"an idiot admires complexity\" in:transcript" - top 1 of 1 matching passages\n\n'+passage);
  await page.locator("#tsOut .ts-x").click();
  await page.locator("#tsCpTr").waitFor();
  assert.deepEqual(await page.locator("#tsOut .ts-line").allTextContents(),
    videos[0].s.map(([s,t])=>"Clip [0:"+s+"]"+t));
  const transcript=videos[0].t+" (2016-03-01) - Terry A. Davis\n"+archive+"\n\n"+
    videos[0].s.map(([s,t])=>"[0:"+s+"] "+t).join("\n");
  await page.locator("#tsCpTr").click();
  await page.waitForFunction(()=>document.getElementById("tsCpTr").disabled);
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),transcript);
  const downloading=page.waitForEvent("download");
  await page.locator("#tsDlTr").click();
  const downloaded=await downloading;
  assert.equal(await readFile(await downloaded.path(),"utf8"),transcript);
  assert.equal(downloaded.suggestedFilename(),"2016-03-01 - In_Titles 2012 and HolyC.txt");
  await page.locator("#tsPlHere").click();
  await page.waitForFunction(()=>document.querySelector(".vidwin video")?.readyState>=2);
  await page.locator("#tsWin .wtitle").click();
  const z=()=>page.evaluate(()=>({search:+getComputedStyle(document.getElementById("tsOverlay")).zIndex,
    video:+document.querySelector(".vidwin").style.zIndex}));
  let stack=await z();assert(stack.search>stack.video);
  await page.locator('.ts-ts[data-s="36"]').click();
  await page.waitForFunction(()=>{
    const v=document.querySelector(".vidwin video");return !v.seeking && v.currentTime>=34 && v.currentTime<36;
  });
  assert.equal(await page.locator(".vidwin").count(),1,"Timestamp seeks the existing window.");
  stack=await z();assert(stack.video>stack.search);
  const first=await page.locator(".vidwin video").elementHandle();
  await page.locator(".vidwin .close").click();
  assert.equal(await first.evaluate(v=>v.paused && !v.hasAttribute("src")),true,
    "Closing releases the media source, including the detached element.");
  await page.locator("#tsBack").click();
  assert.deepEqual(await texts(),[videos[0].s[0][1]]);
  await query('linux in:transcript',[videos[1].s[0][1]]);
  const mini=new URL(await page.locator("#tsOut .ts-t").getAttribute("href"));
  assert.equal(mini.pathname,"/player.html");
  assert.equal(mini.searchParams.get("f"),videos[1].f);
  assert.equal(mini.searchParams.get("t"),"18");
  await page.locator("#tsOut .ts-pl").click();
  await page.waitForFunction(()=>document.querySelector(".vidwin video")?.readyState>=2);
  await page.locator("#tsWin .wtitle").click();
  await query('"an idiot admires complexity" in:transcript',[videos[0].s[0][1]]);
  await page.locator("#tsOut .ts-pl").click();
  await page.waitForFunction(()=>document.querySelectorAll(".vidwin video").length==2 &&
    [...document.querySelectorAll(".vidwin video")].every(v=>v.readyState>=2 && !v.paused));
  await page.locator("#tsWin .wtitle").click();
  await page.locator("#tsClose").click();
  for (let i=1;i>=0;i--) await page.locator(".vidwin .close").nth(i).click();
  if (mobile) await page.locator("#mobileMenu").click();
  await page.locator("#tsBtn").click();
  await context.route("https://archive.org/download/**/c.mp4",route=>route.fulfill({status:404}));
  await query('"god tools" in:transcript',[videos[2].s[0][1]]);
  await page.locator("#tsOut .ts-pl").click();
  await page.locator(".vidwin .ts-verr .ts-conv").waitFor();
  assert.equal(await page.locator(".vidwin .ts-verr a").getAttribute("href"),
    "https://archive.org/download/TerryADavis_TempleOS_Archive/c.mp4");
  await page.locator(".vidwin .close").click();
  assert.equal(await page.locator(".vidwin").count(),0);
  const player=await context.newPage();
  await player.goto(mini.href);
  await player.waitForFunction(()=>document.getElementById("v").readyState>=2 &&
    document.getElementById("v").currentTime>=18);
  assert.equal(await player.locator("#title").innerText(),"Linux OR Windows - from 0:18");
  assert.equal(await player.locator("#dl").getAttribute("href"),
    "https://archive.org/download/TerryADavis_TempleOS_Archive/videos/Linux%20%2B%20Windows.mkv");
  await player.close();
  await browse();
  await page.locator("#tsQ").fill("since:2017 until:2018");
  await page.waitForFunction(()=>document.getElementById("tsStatus").textContent.includes("2 videos in range"));
  assert.deepEqual(await page.locator("#tsOut .ts-t").allTextContents(),[videos[2].t,videos[1].t]);
  await browse();
  const titles=()=>page.locator("#tsOut .ts-t").allTextContents();
  assert.deepEqual(await titles(),[videos[2].t,videos[1].t,videos[0].t]);
  await page.locator("#tsMode").selectOption("old");
  await page.waitForFunction(()=>document.getElementById("tsStatus").textContent.includes("oldest first"));
  assert.deepEqual(await titles(),videos.map(v=>v.t));
  await page.locator("#tsOverlay .ovfree").click();
  assert.equal(await page.locator("#tsOverlay").evaluate(e=>e.classList.contains("free") &&
    getComputedStyle(e).pointerEvents=="none"),true);
  await page.locator("#tsClose").click();
  if (mobile) await page.locator("#mobileMenu").click();
  await page.locator("#tsBtn").click();
  assert.equal(await page.locator("#tsOverlay").evaluate(e=>e.classList.contains("free")),false);
}
