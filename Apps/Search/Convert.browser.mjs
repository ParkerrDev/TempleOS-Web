import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {execFileSync} from "node:child_process";
import {readFile,mkdir} from "node:fs/promises";
import {chromium} from "playwright-core";
import {ServeReq} from "../../Misc/Server.mjs";

const dir=new URL("../../tmp/search/",import.meta.url);
await mkdir(dir,{recursive:true});
for (const [name,input] of [["short","color=c=blue:s=64x48:r=2:d=1"],
    ["long","testsrc2=s=1280x720:r=30:d=60"]])
  execFileSync("ffmpeg",["-v","error","-y","-f","lavfi","-i",input,
    "-an","-c:v","libx264","-preset","ultrafast","-crf","35",
    "-pix_fmt","yuv420p",new URL(name+".mp4",dir).pathname]);
const short=await readFile(new URL("short.mp4",dir)),long=await readFile(new URL("long.mp4",dir)),
  wasm=await readFile(new URL("FFmpeg/core/ffmpeg-core.wasm",import.meta.url)),requests=[];
const server=createServer(function (req,res) {
    if (req.url=="/test") {res.end('<title>Converter lifecycle</title>');return;}
    if (req.url.startsWith("/input/")) {
      requests.push(req.url);
      res.writeHead(200,{"Content-Type":"video/mp4","Access-Control-Allow-Origin":"*"});
      if (req.url=="/input/download.wmv") {
        res.write(short.subarray(0,256));req.on("close",()=>server.emit("conversionclosed"));
      } else res.end(req.url=="/input/encode.wmv"?long:short);
      return;
    }
    ServeReq(req,res);
  }).listen(0,"127.0.0.1");
await once(server,"listening");
const origin="http://127.0.0.1:"+server.address().port,
  browser=await chromium.launch({executablePath:process.env.CHROMIUM || "/usr/bin/chromium",
    headless:true,args:["--no-sandbox"]});
try {
  const context=await browser.newContext(),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(30000);page.on("pageerror",error=>errors.push(error.message));
  await context.addInitScript(function () {
    let Base=Worker,next=0;
    window.ffEvents=[];window.players={};
    window.Worker=class extends Base {
      constructor(url,...args) {
        super(url,...args);
        if (String(url).includes("/FFmpeg/")) {
          this.ffId=next++;
          this.addEventListener("message",({data})=>ffEvents.push({id:this.ffId,type:data.type}));
        }
      }
      postMessage(data,...args) {
        if (this.ffId!=null) ffEvents.push({id:this.ffId,type:"send:"+data.type});
        return super.postMessage(data,...args);
      }
      terminate() {
        if (this.ffId!=null) ffEvents.push({id:this.ffId,type:"terminate"});
        return super.terminate();
      }
    };
  });
  await context.route("**/Apps/Search/Videos.json",route=>route.fulfill({json:[
    {f:"encode.wmv",t:"Encode"},{f:"finish.mkv",t:"Finish"}]}));
  await context.route("**/Apps/Search/FFmpeg/core/ffmpeg-core.wasm",route=>route.fulfill({body:wasm,contentType:"application/wasm"}));
  await context.route("https://archive.org/download/**",route=>route.fulfill({status:404}));
  await context.route("https://archive.org/cors/**",route=>route.fulfill({status:307,
    headers:{"Access-Control-Allow-Origin":"*",Location:origin+"/input/"+new URL(route.request().url()).pathname.split("/").pop()}}));
  await page.goto(origin+"/test");
  async function Player(name,file)
  {
    await page.evaluate(async function ({name,file}) {
      let {VideoPlayer}=await import("/Apps/Search/Video.js"),player=VideoPlayer({f:file,t:file});
      players[name]=player;player.element.id=name;document.body.append(player.element);
    },{name,file});
    await page.locator("#"+name+" .video-error button").waitFor();
    await page.locator("#"+name+" .video-error button").click();
  }
  await Player("downloading","download.wmv");
  await page.waitForFunction(()=>document.querySelector("#downloading .video-status").textContent.includes("Downloading"));
  await Player("queued","queued.wmv");
  await page.waitForFunction(()=>document.querySelector("#queued .video-status").textContent.includes("Waiting"));
  await page.evaluate(()=>players.queued.Close());
  assert.equal(await page.evaluate(()=>ffEvents.some(e=>e.type=="terminate")),false,
    "Cancelling a queued player does not terminate the active converter");
  const disconnected=once(server,"conversionclosed",{signal:AbortSignal.timeout(10000)});
  await page.evaluate(()=>players.downloading.Close());await disconnected;
  assert(!requests.includes("/input/queued.wmv"),"A cancelled queued job never downloads");
  await page.waitForFunction(()=>ffEvents.some(e=>e.id==0 && e.type=="terminate"));
  await Player("finished","finish.mkv");
  await page.waitForFunction(()=>document.querySelector("#finished video").src.startsWith("blob:") &&
    document.querySelector("#finished video").readyState>=2);
  assert(await page.evaluate(()=>ffEvents.some(e=>e.id==1 && e.type=="terminate")),
    "A successful conversion releases its worker after returning playable output");
  await Player("encoding","encode.wmv");
  await page.waitForFunction(()=>ffEvents.some(e=>e.id==2 && e.type=="PROGRESS"));
  await page.locator('#encoding [aria-label="Next video"]').click();
  assert(await page.evaluate(()=>ffEvents.some(e=>e.id==2 && e.type=="terminate")),
    "Navigation terminates a running FFmpeg command");
  assert.equal(await page.evaluate(()=>players.encoding.State().video.f),"finish.mkv");
  assert.equal(await page.evaluate(()=>ffEvents.some(e=>e.id==2 && e.type=="send:READ_FILE")),false,
    "The cancelled conversion never reads an output file");
  await Player("after","short.wmv");
  await page.waitForFunction(()=>document.querySelector("#after video").src.startsWith("blob:") &&
    document.querySelector("#after video").readyState>=2);
  assert(await page.evaluate(()=>ffEvents.some(e=>e.id==3 && e.type=="terminate")));
  assert.deepEqual(errors,[]);
  console.log("Conversion browser: queued cancellation preserves the active job; close aborts a real HTTP body; navigation terminates running FFmpeg; following jobs produce playable output and release workers.");
} finally {await browser.close();server.closeAllConnections();server.close();}
