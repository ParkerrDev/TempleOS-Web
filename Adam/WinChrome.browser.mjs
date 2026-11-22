import assert from "node:assert/strict";
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {chromium} from "playwright-core";
import {compileHolyC} from "../hemu/holyc-wasm/src/compiler.js";
import {createHost} from "../hemu/holyc-wasm/src/runtime/host.js";

// The oracle is HolyC TextBorder/DocBorder/DrawWinScroll, independently checked
// against the original guest by WinDrawRef.mjs. Never regenerate expected pixels from CSS.
const root=new URL("../",import.meta.url),host=createHost({}),
  compiled=compileHolyC(readFileSync(new URL("WinDraw.HC",import.meta.url),"latin1"),
    {filename:"WinDraw.HC",lenient:false,resilient:false,exports:["WinDraw","WinDrawTitle","WinDrawStride"]}),
  wasm=await WebAssembly.instantiate(compiled.bytes,{env:host.env}),fn=wasm.instance.exports,
  server=spawn(process.execPath,["Misc/Server.mjs"],{cwd:root,env:{...process.env,PORT:"18766"},stdio:["ignore","pipe","inherit"]});
host.attach(wasm.instance);fn.__main();
await once(server.stdout,"data");
const browser=await chromium.launch({executablePath:process.env.CHROMIUM||"/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
try {
  const page=await browser.newPage({viewport:{width:1200,height:900}}),loads=[];
  await page.route("**/hemu/*.gz",r=>r.abort());
  await page.route("https://templeosweb-*.workers.dev/**",r=>r.abort());
  await page.routeWebSocket(/templeosweb-/,()=>{});
  page.on("request",r=>{if(r.url().includes("WinDraw.wasm"))loads.push(r.url());});
  await page.goto("http://localhost:18766/?single");
  await page.evaluate(async()=>{
    const {WinDress}=await import("/Adam/WinMgr.js");
    const w=document.createElement("div");
    w.id="chromeProbe";w.className="win";w.dataset.title="Native Tools";
    w.innerHTML='<span class="close">[X]</span><div id="probeDoc" style="width:100%;height:100%;overflow:auto"><div style="width:calc(100% + 1000000px);height:calc(100% + 1000000px)"></div></div>';
    w.style.cssText="position:fixed;left:32px;top:32px;margin:0;padding:0;z-index:2147483647";
    document.body.append(w);WinDress(w);
  });
  const poses=[
    [320,160,1,false,0,0,0,0],[320,160,1,true,16,0,0,0],
    [320,160,1,true,200,500000,500000,3],[320,160,1,false,525,1000000,1000000,1],
    [323,163,1,true,780,250000,750000,2],[128,96,1,true,0,0,0,0],
    [320,160,2,true,200,500000,500000,3],
    ...[15,31,124,125,126,1874,1875,1876].map(time=>[320,160,1,true,time,0,0,0]),
    ...["", "W", "M Éxample", "An unusually long browser window title"].map(title=>[320,160,1,true,525,0,0,0,title]),
    [320,160,1,false,126,0,0,0,"Menu",false]
  ];
  let total=0;
  for(const [width,height,scale,solid,time,sx,sy,held,title="Native Tools",close=true] of poses){
    await page.evaluate(async({width,height,scale,solid,time,sx,sy,held,title,close})=>{
      const {WinTitle}=await import("/Adam/WinMgr.js");
      const w=document.getElementById("chromeProbe");
      WinTitle(w,title);
      if(!close) w.querySelector(".close").remove();
      w.style.setProperty("--win-scale",scale);
      w.style.width=width*scale+"px";w.style.height=height*scale+"px";
      w.classList.toggle("active",solid);
      w._sh.classList.toggle("on",!!(held&1));w._sv.classList.toggle("on",!!(held&2));
      const doc=document.getElementById("probeDoc");
      doc.scrollLeft=sx;doc.scrollTop=sy;doc.dispatchEvent(new Event("scroll"));
      await Promise.all(w.getAnimations({subtree:true}).map(async a=>{await a.ready;a.pause();a.currentTime=time;}));
    },{width,height,scale,solid,time,sx,sy,held,title,close});
    const shot=await page.locator("#chromeProbe").screenshot({animations:"allow"}),
      pixels=await page.evaluate(async b64=>{
        const img=new Image();img.src="data:image/png;base64,"+b64;await img.decode();
        const c=document.createElement("canvas");c.width=img.width;c.height=img.height;
        const ctx=c.getContext("2d");ctx.drawImage(img,0,0);
        return Array.from(ctx.getImageData(0,0,c.width,c.height).data);
      },shot.toString("base64"));
    new Uint8Array(fn.memory.buffer).set(Buffer.from(title+"\0","latin1"),Number(fn.WinDrawTitle()));
    const ptr=Number(fn.WinDraw(BigInt(width),BigInt(height),BigInt(solid),BigInt(time),BigInt(sx),BigInt(sy),BigInt(held),BigInt(close))),
      stride=Number(fn.WinDrawStride()),ref=new Uint8Array(fn.memory.buffer),bad=[];
    for(let y=0;y<height*scale;y++)for(let x=0;x<width*scale;x++){
      const px=Math.floor(x/scale),py=Math.floor(y/scale);
      if(px>=8&&px<width-8&&py>=8&&py<height-8)continue;
      const color=ref[ptr+py*stride+px],rgb=color==1?[0,0,170]:color==14?[255,255,85]:[255,255,255],at=(y*width*scale+x)*4;
      if(rgb.some((v,i)=>v!==pixels[at+i]))bad.push([x,y,color,pixels.slice(at,at+3)]);
      total++;
    }
    if(bad.length){mkdirSync(new URL("tmp/chrome/",root),{recursive:true});writeFileSync(new URL("tmp/chrome/mismatch.png",root),shot);}
    assert.deepEqual(bad.slice(0,12),[],JSON.stringify({width,height,scale,solid,time,mismatches:bad.length}));
  }
  await page.evaluate(()=>document.getElementById("chromeProbe").remove());
  await page.locator("#settingsBtn").click();
  mkdirSync(new URL("tmp/chrome/",root),{recursive:true});
  await page.screenshot({path:new URL("tmp/chrome/desktop.png",root).pathname});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:new URL("tmp/chrome/mobile.png",root).pathname});
  assert.equal(loads.length,0,"HTML/CSS decorations load no HolyC drawing runtime");
  console.log(`WinChrome: ${total} screenshot border pixels match HolyC across focus, animation, narrow/partial cells, DPI and pressed scroll controls.`);
} finally {await browser.close();server.kill();}
