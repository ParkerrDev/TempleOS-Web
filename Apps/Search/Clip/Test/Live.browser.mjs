import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {chromium} from "playwright-core";
import {ServeReq} from "../../../../Misc/Server.mjs";

const root=new URL("../../../../",import.meta.url),
  files=JSON.parse(await readFile(new URL("Misc/Cdn/ArchiveLst.json",root))).TerryADavis_TempleOS_Archive,
  server=createServer(ServeReq).listen(0,"127.0.0.1");
await once(server,"listening");
const browser=await chromium.launch({executablePath:process.env.CHROMIUM ||
  "/usr/bin/chromium",headless:true,args:["--no-sandbox"]}),
  origin=process.env.SITE_URL || "http://127.0.0.1:"+server.address().port,evidence=[];
await mkdir(new URL("tmp/clip/",root),{recursive:true});
try {
  const page=await browser.newPage({viewport:{width:1280,height:900}}),requests=[];
  page.on("response",function (response) {
    if (new URL(response.url()).pathname.startsWith("/archive/")) requests.push({url:response.url(),
      range:new URL(response.url()).searchParams.get("range"),status:response.status(),headers:response.headers()});
  });
  for (const format of ["mp4","mkv","webm"]) {
    requests.length=0;
    const file=decodeURIComponent(files.find(function (file) {return file.endsWith("."+format);})),
      params=new URLSearchParams({f:file,n:file.split("/").pop(),t:"60"});
    await page.goto(origin+"/Apps/Search/Player.html?"+params);
    await page.locator("video").evaluate(function (video) {video.pause();});
    await page.getByRole("button",{name:"Clip controls",exact:true}).click();
    await page.getByLabel("Clip start",{exact:true}).fill("1:00");
    await page.getByLabel("Clip end",{exact:true}).fill("1:10");
    const pending=page.waitForEvent("download",{timeout:120000});
    await page.getByRole("button",{name:"Export clip",exact:true}).click();
    await page.waitForFunction(()=>/Clip ready|Export failed/.test(
      document.querySelector(".clip-status").textContent),{},{timeout:120000});
    const status=await page.locator(".clip-status").innerText();
    assert.match(status,/Clip ready/);
    const download=await pending,out=new URL("tmp/clip/live-browser."+format,root);
    await download.saveAs(out.pathname);
    const probe=JSON.parse(execFileSync("ffprobe",["-v","error","-show_format","-show_streams",
      "-of","json",out.pathname],{encoding:"utf8"}));
    execFileSync("ffmpeg",["-v","error","-i",out.pathname,"-f","null","-"]);
    assert(requests.length>0);
    assert(requests.every(function (request) {return request.status==206;}));
    const bytes=requests.reduce(function (total,request) {
      const range=/bytes (\d+)-(\d+)\/(\d+)/.exec(request.headers["content-range"]);
      assert(range);assert(Number(range[2])-Number(range[1])<16777216);
      return total+Number(range[2])-Number(range[1])+1;
    },0);
    evidence.push({at:new Date().toISOString(),file,status,bytes,outputBytes:(await readFile(out)).length,
      suggestedName:download.suggestedFilename(),requests:[...requests],probe});
    await page.screenshot({path:new URL("tmp/clip/live-browser-"+format+".png",root).pathname});
    console.log({format,status,requests:requests.length,bytes,outputBytes:evidence.at(-1).outputBytes});
  }
  await writeFile(new URL("tmp/clip/live-browser.json",root),JSON.stringify(evidence,null,2));
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
