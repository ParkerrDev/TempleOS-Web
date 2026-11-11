import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright-core";

const root=new URL("../../",import.meta.url),
  server=spawn(process.execPath,["server.mjs"],{cwd:root,
    env:{...process.env,PORT:"8182"},stdio:["ignore","pipe","inherit"]});
await once(server.stdout,"data");
const browser=await chromium.launch({executablePath:process.env.CHROMIUM ||
  "/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
let page;
try {
  const context=await browser.newContext({viewport:{width:1280,height:800}});
  await context.route("**/hemu/*.gz",async function (route) {
    const name=new URL(route.request().url()).pathname.split("/").pop();
    await route.fulfill({body:await readFile(new URL("hemu/"+name,root)),
      contentType:"application/gzip"});
  });
  await context.route("https://templeosweb-*.workers.dev/**",
    function (route) {route.abort();});
  await context.addInitScript(function () {
    localStorage.setItem("tos-settings",JSON.stringify({rate:30,repeat:false}));
    window.guestEvents=[];
    window.guestKeys=[];
    const Base=window.Worker;
    window.Worker=class extends Base {
      constructor(...args) {
        super(...args);
        this.addEventListener("message",function (e) {
          const m=e.data;
          if (m.cmd=="frame")
            window.lastGuestFrame={fps:m.fps,top:m.top};
          else if (["guestResult","fileResult","settings","guestPatch"].includes(m.cmd))
            window.guestEvents.push(m);
        });
      }
      postMessage(m,...args) {
        if (m.cmd=="input")
          window.guestKeys.push(...m.keys);
        return super.postMessage(m,...args);
      }
    };
  });
  page=await context.newPage();
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("http://localhost:8182/?single",{waitUntil:"load"});
  await page.waitForFunction(()=>document.getElementById("loadui").style.display=="none",
    {timeout:30000});
  await page.waitForFunction(()=>window.guestEvents.some(m=>
    m.cmd=="guestPatch" && m.state=="installed"),null,{timeout:30000});
  assert.equal(await page.locator("#osNotice").isVisible(),false);
  await page.evaluate(async function () {
    const {FONT}=await import("/holyc-wasm/src/runtime/font.js");
    window.guestText=function (ox=0,oy=0) {
      const canvas=document.getElementById("canvas"),scale=canvas.width/640,
        pixels=new Uint32Array(canvas.getContext("2d").getImageData(
          0,0,canvas.width,canvas.height).data.buffer);
      let text="";
      for (let row=0;row<60;row++) {
        for (let col=0;col<80;col++) {
          const colors=new Map(),pat=[];
          for (let y=0;y<8;y++)
            for (let x=0;x<8;x++) {
              const c=pixels[(row*8+y+oy)*scale*canvas.width+(col*8+x+ox)*scale];
              colors.set(c,(colors.get(c)||0)+1);
            }
          const bg=[...colors].sort((a,b)=>b[1]-a[1])[0][0];
          for (let y=0;y<8;y++) {
            let bits=0;
            for (let x=0;x<8;x++)
              if (pixels[(row*8+y+oy)*scale*canvas.width+(col*8+x+ox)*scale]!=bg)
                bits|=1<<x;
            pat.push(bits);
          }
          let best=32,score=65;
          for (let ch=32;ch<127;ch++) {
            let dist=0;
            for (let y=0;y<8;y++) {
              let bits=pat[y]^FONT[ch*8+y];
              while (bits) {bits&=bits-1;dist++;}
            }
            if (dist<score) {score=dist;best=ch;}
          }
          text+=score<10?String.fromCharCode(best):"?";
        }
        text+="\n";
      }
      return text;
    };
  });
  await page.waitForFunction(()=>Number.isSafeInteger(window.lastGuestFrame?.fps));
  const fps=await page.evaluate(()=>[document.getElementById("tb-fps").textContent,
    "FPS: "+window.lastGuestFrame.fps]);
  assert.equal(fps[0],fps[1]);
  await page.locator("#settingsBtn").click();
  await page.locator("#biosRepeat").check();
  await page.waitForFunction(()=>window.guestEvents.some(m=>
    m.cmd=="settings" && m.ok && m.repeat));
  await page.locator("#settingsClose").click();
  await page.locator("#godBtn").click();
  await page.locator("#godDoodle").click();
  await page.waitForFunction(()=>!document.getElementById("godOverlay").classList.contains("open"),
    {timeout:30000});
  assert.equal(await page.locator("#helpContext").innerText(),"God Doodle");
  await page.waitForFunction(()=>window.guestText().includes("puppet"),null,{timeout:30000});
  await page.locator("#keysbar").getByRole("button",{name:"Shift",exact:true}).click();
  await page.locator("#keysbar").getByRole("button",{name:"Esc",exact:true}).click();
  await page.waitForFunction(()=>[window.guestText(),window.guestText(4,4),
    window.guestText(0,4),window.guestText(4,0)].some(t=>t.includes("repeatedly")),
    null,{timeout:10000});
  for (let i=0;i<12;i++) {
    await page.locator("#keysbar").getByRole("button",{name:"Space",exact:true}).click();
    await page.waitForTimeout(50);
  }
  const screen=process.env.SCREENSHOT || new URL("../../tmp/god-doodle.png",import.meta.url).pathname;
  await page.screenshot({path:screen});
  await page.locator("#keysbar").getByRole("button",{name:"Esc",exact:true}).click();
  await page.waitForFunction(()=>window.guestEvents.some(m=>
    m.name=="God Doodle" && ["done","failed","error"].includes(m.state)),{timeout:30000});
  assert(!await page.evaluate(()=>window.guestEvents.some(m=>
    m.name=="God Doodle" && ["failed","error"].includes(m.state))));
  assert.deepEqual(errors,[]);
  await context.route("**/engine/patches/DocClip.HC",function (route) {
    return route.fulfill({status:503,body:"unavailable"});
  });
  await page.setViewportSize({width:390,height:844});
  await page.reload();
  await page.locator("#osNotice").waitFor({state:"visible"});
  assert.match(await page.locator("#osNotice").innerText(),/icons may flicker/);
  assert.equal(await page.locator("#loadui").isVisible(),false,
    "Failure to apply the optional visual fix leaves the OS running.");
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator("#osNoticeClose").click();
  assert.equal(await page.locator("#osNotice").isVisible(),false);
  await context.unroute("**/engine/patches/DocClip.HC");
  await page.locator("#mobileMenu").click();
  await page.locator("#restartBtn").click();
  await page.waitForFunction(()=>window.guestEvents.some(m=>
    m.cmd=="guestPatch" && m.state=="installed"),null,{timeout:30000});
  assert.equal(await page.locator("#osNotice").isVisible(),false);
  assert.deepEqual(errors,[]);
  assert.equal(await page.evaluate(()=>window.guestEvents.some(m=>m.name==="Welcome")),false);
  console.log("Browser engine: no automatic Welcome, visible FPS, settings acknowledgement, "+
    "God Doodle launch/input/exit, document correction and visible failure/retry passed. Screen: "+screen);
} catch (e) {
  if (page) {
    await page.screenshot({path:new URL("../../tmp/engine-failure.png",import.meta.url).pathname});
    console.log(await page.evaluate(()=>({keys:window.guestKeys,
      events:window.guestEvents.slice(-8),text:window.guestText?.()})));
  }
  throw e;
} finally {
  await browser.close();
  server.kill();
}
