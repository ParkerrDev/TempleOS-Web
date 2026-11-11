import assert from "node:assert/strict";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {createServer} from "node:http";
import {once} from "node:events";
import {chromium} from "playwright-core";
import {ServeReq} from "../../server.mjs";
import {encodeGIF} from "../../sprite-codec.js";

const root=new URL("../../",import.meta.url),dir=new URL("tmp/sprites/",root);
await mkdir(dir,{recursive:true});
const raw=new Uint8Array(64*32*3*10);
for (let frame=0;frame<10;frame++)
  for (let pixel=0;pixel<64*32;pixel++)
    raw.set([20+frame*20+(pixel%64>=32?10:0),55,170],(frame*64*32+pixel)*3);
const input=new URL("frames.rgb",dir).pathname;
await writeFile(input,raw);
for (const ext of ["mp4","webm"]) {
  execFileSync("ffmpeg",["-hide_banner","-loglevel","error","-y","-f","rawvideo",
    "-pixel_format","rgb24","-video_size","64x32","-framerate","10","-i",input,
    "-c:v",ext=="mp4"?"libx264":"libvpx-vp9","-pix_fmt","yuv420p","-g","4",
    ...(ext=="mp4"?["-bf","2"]:["-lossless","1"]),new URL("frames."+ext,dir).pathname]);
}
const server=createServer(ServeReq).listen(0,"127.0.0.1");
await once(server,"listening");
const origin="http://127.0.0.1:"+server.address().port,
  browser=await chromium.launch({executablePath:process.env.CHROMIUM ||
    "/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
try {
  for (const mobile of [false,true]) {
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},
      isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),downloads=[],errors=[];
    await context.route("**/hemu/*.gz",route=>route.abort());
    await context.route("https://templeosweb-*.workers.dev/**",route=>route.abort());
    page.on("request",req=>{if(req.url().includes("/vendor/ffmpeg/")) downloads.push(req.url());});
    page.on("pageerror",e=>errors.push(e.message));
    if (!mobile) await (await context.newCDPSession(page)).send("Emulation.setCPUThrottlingRate",{rate:4});
    await page.goto(origin);
    const files={};
    for (const ext of ["mp4","webm"])
      files[ext]=[...await readFile(new URL("frames."+ext,dir))];
    const checks=await page.evaluate(async files=>{
      const {VideoFrames}=await import("/sprites/Frames.js"),
        create=URL.createObjectURL,revoke=URL.revokeObjectURL,active=new Set(),results=[];
      URL.createObjectURL=function (...args) {const url=create.apply(this,args);active.add(url);return url;};
      URL.revokeObjectURL=function (url) {active.delete(url);return revoke.call(this,url);};
      try {
        for (const ext of ["mp4","webm"]) {
          const file=new File([Uint8Array.from(files[ext])],"frames."+ext,{type:"video/"+ext});
          for (const [start,duration,fps] of [[0,1,10],[0.21,0.51,10],[0.61,1,20],[1.1,1,10]]) {
            const progress=[],result=await VideoFrames(file,{width:16,fps,start,duration,
              onFrame:(...args)=>progress.push(args)});
            results.push({ext,start,duration,fps,size:result.size,progress,
              colors:result.frames.map(frame=>[...frame.slice(0,4),...frame.slice(15*4,16*4)])});
          }
          const controller=new AbortController();let decoded=0,aborted=false;
          try {
            await VideoFrames(file,{width:16,fps:10,start:0,duration:1,signal:controller.signal,
              onFrame:()=>{if (++decoded==2) controller.abort();}});
          } catch (e) {aborted=e.name=="AbortError";}
          results.push({ext,aborted,decoded});
        }
        let bad="";
        try {await VideoFrames(new Blob(["invalid video"]),{width:16,fps:10,start:0,duration:1});}
        catch (e) {bad=e.message;}
        const controller=new AbortController();controller.abort();let early=false;
        try {await VideoFrames(new Blob(["unused"]),{width:16,fps:10,start:0,duration:1,signal:controller.signal});}
        catch (e) {early=e.name=="AbortError";}
        return {results,bad,early,active:active.size};
      } finally {URL.createObjectURL=create;URL.revokeObjectURL=revoke;}
    },files);
    for (const result of checks.results) {
      if ("aborted" in result) {assert.equal(result.aborted,true);assert.equal(result.decoded,2);continue;}
      assert.deepEqual(result.size,{width:16,height:8});
      const count=result.start>1?0:Math.ceil((Math.min(1,result.start+result.duration)-result.start)*result.fps);
      assert.equal(result.colors.length,count);
      for (let i=0;i<count;i++) {
        const frame=Math.floor((result.start+i/result.fps)*10+1e-8),
          expected=[20+frame*20,55,170,255,30+frame*20,55,170,255];
        result.colors[i].forEach((v,k)=>assert.ok(Math.abs(v-expected[k])<=5,
          `${result.ext} ${result.start}+${i}/${result.fps}, channel ${k}: ${v} vs ${expected[k]}`));
      }
      assert.equal(result.progress.length,count);
    }
    assert.match(checks.bad,/cannot decode/);assert.equal(checks.early,true);assert.equal(checks.active,0);
    if (mobile) await page.locator("#mobileMenu").click();
    await page.locator("#spritesBtn").click();
    const studio=page.frameLocator("#spritesFrame");
    await studio.locator("#file:not([disabled])").waitFor();
    await studio.locator("#file").setInputFiles({name:"frames.mp4",mimeType:"video/mp4",buffer:Buffer.from(files.mp4)});
    await studio.locator("#width").fill("16");await studio.locator("#fps").selectOption("10");
    await studio.locator("#start").fill("0.2");await studio.locator("#duration").fill("0.6");
    await studio.locator("#convert").click();
    await studio.locator("#gr:not([disabled])").waitFor();
    assert.equal(await studio.locator("#frameLabel").innerText(),"1 / 6");
    assert.match(await studio.locator("#status").innerText(),/16 x 8 pixels, 6 frames/);
    assert.deepEqual(downloads,[],"Video conversion does not download FFmpeg.");
    if (!mobile) {
      const closed=await studio.locator("body").evaluate(async(_,bytes)=>{
        const {VideoFrames}=await import("/sprites/Frames.js");
        try {
          const result=await VideoFrames(new File([Uint8Array.from(bytes)],"frames.mp4",{type:"video/mp4"}),
            {width:16,fps:10,start:0,duration:1,onFrame:frame=>{
              if (frame==2) {
                parent.document.getElementById("spritesClose").click();
              } else if (frame==4) parent.document.getElementById("spritesBtn").click();
            }});
          return {frames:result.frames.length};
        } catch (e) {return {error:e.message};}
        finally {parent.document.getElementById("spritesBtn").click();}
      },files.mp4);
      assert.deepEqual(closed,{frames:10},"Closing and reopening the studio preserves an in-progress decode.");
      await context.route("**/vendor/ffmpeg/**",async route=>route.fulfill({
        body:await readFile(new URL(new URL(route.request().url()).pathname.slice(1),root)),
        contentType:route.request().url().endsWith(".wasm")?"application/wasm":"application/javascript",
        headers:{"Cross-Origin-Embedder-Policy":"credentialless"}}));
      await context.route("**/vendor/ffmpeg/core/ffmpeg-core.js",route=>route.fulfill({status:503,body:"Unavailable"}),{times:1});
      await studio.locator("body").evaluate(()=>{HTMLVideoElement.prototype.requestVideoFrameCallback=undefined;});
      await studio.locator("#file").setInputFiles({name:"fallback.mp4",mimeType:"video/mp4",buffer:Buffer.from(files.mp4)});
      await studio.locator("#convert").click();
      try {await studio.locator("#cancel").waitFor({state:"hidden"});}
      catch (error) {console.log({status:await studio.locator("#status").innerText(),errors,downloads});throw error;}
      assert.match(await studio.locator("#status").innerText(),/import|fetch|decoder|error/i);
      assert.equal(await studio.locator("#gr").isDisabled(),true);
      await studio.locator("#convert").click();
      await studio.locator("#gr:not([disabled])").waitFor({timeout:30000});
      assert.equal(await studio.locator("#frameLabel").innerText(),"1 / 6");
      const gif=encodeGIF([4,2,1].map(color=>new Uint8Array(16*8).fill(color)),16,8,100);
      await studio.locator("#file").setInputFiles({name:"frames.gif",mimeType:"image/gif",buffer:Buffer.from(gif)});
      await studio.locator("#start").fill("0");await studio.locator("#duration").fill("1");
      await studio.locator("#convert").click();
      await studio.locator("#gr:not([disabled])").waitFor();
      assert.equal(await studio.locator("#frameLabel").innerText(),"1 / 3");
    }
    assert.deepEqual(errors,[]);
    await context.close();
  }
  console.log("Video frames: MP4/WebM colors, timestamps, scaling, EOF, cancellation, decoder failure and URL cleanup pass. Desktop/mobile use no FFmpeg; old-browser/GIF fallback and failed-load retry pass.");
} finally {
  await browser.close();server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
}
