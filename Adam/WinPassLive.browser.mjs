import {MachineObserve} from "./Test/MachineObserve.mjs";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright-core";

const root=new URL("..",import.meta.url),
  server=spawn(process.execPath,["Misc/Server.mjs"],{cwd:root,
    env:{...process.env,PORT:"8197"},stdio:["ignore","pipe","inherit"]});
await once(server.stdout,"data");
const browser=await chromium.launch({executablePath:process.env.CHROMIUM ||
  "/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
let page;
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route("**/hemu/*.gz",async function (route) {
    const name=new URL(route.request().url()).pathname.split("/").pop();
    await route.fulfill({body:await readFile(new URL("hemu/"+name,root)),
      contentType:"application/gzip"});
  });
  await context.route("https://templeosweb-*.workers.dev/**",
    function (route) {route.abort();});
  await MachineObserve(context,function () {
    localStorage.setItem("tos-settings",JSON.stringify({rate:30,repeat:false}));
    window.passEvents=[];window.passRequests=[];window.passWindows=[];
    window.passBuffers={};window.passFrames=0;window.passActions=[];
    try {localStorage.setItem("tos-persistence",JSON.stringify({syncTabs:true,saveSession:true,saveWindows:true}));} catch {}
    const Base=window.SharedWorker;
    window.SharedWorker=class extends Base {
      constructor(...args) {
        super(...args);
        if (!String(args[0]).includes("MachineHub.js")) return;
        const Send=this.port.postMessage.bind(this.port);
        this.port.postMessage=function (envelope,...args) {
          const m=envelope.value;
          if (["post","request"].includes(envelope.op) &&
              (m.cmd=="windows" || m.cmd=="input" &&
                (m.keys.length || m.wheel || m.b)))
            window.passRequests.push(m);
          return Send(envelope,...args);
        };
        ObserveMachineEvents(this.port,function (e) {
          const m=e.data;
          if (m.cmd=="windows") {
            window.passWindows=m.windows;
            window.passActions.push(...m.actions);
            for (const w of m.windows)
              if (w.buf)
                window.passBuffers[w.task]={buf:w.buf,w:w.w,h:w.h};
          } else if (m.cmd=="frame") {
            window.passPixels=m.buf;
            window.passFrames++;
          } else if (["guestReady","fileResult","settings","paused","error"].includes(m.cmd))
            window.passEvents.push(m);
        });
      }
    };
  });
  page=await context.newPage();
  const errors=[];
  page.on("pageerror",function (e) {errors.push(e.message);});
  let query="?single";
  if (process.env.WINPASS_SMP)
    query="";
  await page.goto("http://localhost:8197/"+query,{waitUntil:"load"});
  await page.waitForFunction(function () {
    return window.passEvents.some(function (e) {return e.cmd=="guestReady" && e.ok;});
  },null,{timeout:60000});
  await page.locator("#settingsBtn").click();
  await page.locator("#windowPassthrough").check();
  await page.locator("#settingsClose").click();
  await page.waitForFunction(function () {
    return window.passWindows.length || window.passEvents.some(function (m) {
      return m.cmd=="fileResult" && !m.ok;
    });
  },null,{timeout:60000});
  assert(await page.evaluate(function () {return window.passWindows.length;}),
    "native window bridge must compile and publish window metadata");
  await page.evaluate(async function () {
    const {FONT}=await import("/hemu/holyc-wasm/src/runtime/font.js");
    window.passText=function (pixels=window.passPixels,width=640,height=480) {
      pixels=new Uint8Array(pixels);
      let text="",colors,pat,bg,bits,best,score,dist;
      for (let row=0;row<height/8;row++) {
        for (let col=0;col<width/8;col++) {
          colors=new Map;pat=[];
          for (let y=0;y<8;y++)
            for (let x=0;x<8;x++) {
              const c=pixels[(row*8+y)*width+col*8+x];
              colors.set(c,(colors.get(c)||0)+1);
            }
          bg=[...colors].sort(function (a,b) {return b[1]-a[1];})[0][0];
          for (let y=0;y<8;y++) {
            bits=0;
            for (let x=0;x<8;x++)
              if (pixels[(row*8+y)*width+col*8+x]!=bg)
                bits|=1<<x;
            pat.push(bits);
          }
          best=32;score=65;
          for (let ch=32;ch<127;ch++) {
            dist=0;
            for (let y=0;y<8;y++) {
              bits=pat[y]^FONT[ch*8+y];
              while (bits) {bits&=bits-1;dist++;}
            }
            dist=Math.min(dist,64-dist);
            if (dist<score) {score=dist;best=ch;}
          }
          text+=score<10?String.fromCharCode(best):"?";
        }
        text+="\n";
      }
      return text;
    };
    window.passFind=function (text,task) {
      const w=window.passWindows.find(function (w) {return w.task==task;}),
        lines=window.passText().split("\n");
      if (!w)
        return null;
      for (let row=w.y/8+1;row<(w.y+w.h)/8-1;row++) {
        const line=lines[row].slice(w.x/8+1,(w.x+w.w)/8-1),
          index=line.search(new RegExp("\\b"+text+"\\b"));
        if (index>=0)
          return {x:w.x+8+index*8+4,y:row*8+4};
      }
      return null;
    };
  });
  const r=await page.locator("#canvas").boundingBox(),scale=r.width/640,
    w=await page.evaluate(function () {
      return window.passWindows.slice().reverse().find(function (w) {
        return w.w>=160 && w.h>=80 && w.x>=0 && w.y>=0;
      });
    });
  assert(w,"a native bordered window is available");
  const x=r.x+(w.x+w.w/2)*scale,y=r.y+(w.y+4)*scale;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(r.x+r.width+100,r.y+140,{steps:20});
  await page.mouse.up();
  await page.locator(".win-pass canvas").waitFor({timeout:30000});
  await page.waitForFunction(function () {
    return document.querySelector(".win-pass canvas").width>100;
  },null,{timeout:30000});
  let surfaceWorks=false;
  try {
    await page.waitForFunction(function (task) {
      const surface=window.passBuffers[task];
      return surface && window.passText(surface.buf,surface.w,surface.h).
        includes("TempleOS V5.03");
    },w.task,{timeout:5000});
    surfaceWorks=true;
  } catch (e) {
    console.error("Detached native document text missing; checking remaining flow.");
  }
  await page.screenshot({path:"/tmp/WinPassLive-detached.png"});
  assert(await page.evaluate(function () {
    return window.passRequests.some(function (m) {return m.op=="detach";});
  }));
  const native=page.locator(".win-pass canvas");
  let vr=await native.boundingBox();
  await page.mouse.click(vr.x+50*scale,vr.y+50*scale);
  await page.keyboard.type("abc");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  assert(await page.evaluate(function () {
    return window.passRequests.some(function (m) {
      return m.cmd=="input" && m.winSlot>=0 && m.keys.length;
    });
  }),"detached keyboard uses the existing guest queue");
  await page.mouse.wheel(0,120);
  await page.waitForFunction(function () {
    return window.passRequests.some(function (m) {
      return m.cmd=="input" && m.winSlot>=0 && m.wheel;
    });
  });
  const popupWait=page.waitForEvent("popup");
  await page.mouse.move(vr.x+vr.width/2,vr.y+4*scale);
  await page.mouse.down();
  await page.mouse.move(1455,180,{steps:15});
  await page.mouse.up();
  const popup=await popupWait,pc=popup.locator(".win-pass canvas"),
    pr=await pc.boundingBox();
  await page.evaluate(function () {window.passRequests=[];});
  await popup.mouse.click(pr.x+50*scale,pr.y+50*scale);
  await popup.keyboard.type("abc");
  await popup.keyboard.press("Backspace");
  await popup.keyboard.press("Backspace");
  await popup.keyboard.press("Backspace");
  await page.waitForFunction(function (task) {
    return window.passRequests.some(function (m) {
      return m.cmd=="input" && m.winTask==task && m.winSlot>=0 && m.keys.length;
    });
  },w.task);
  await popup.screenshot({path:"/home/aphunt/Dev/GitHub/TempleOS/untangle/evidence/2026-11-15-workspace/Window-native-popup.png"});
  await popup.locator("#popupReturn").click().catch(function (error) {
    if (!popup.isClosed()) throw error;
  });
  await native.waitFor();
  vr=await native.boundingBox();
  console.log("Native popup retains task ownership, pixels and keyboard input");
  await page.mouse.move(vr.x+vr.width/2,vr.y+4*scale);
  await page.mouse.down();
  await page.mouse.move(r.x+300*scale,r.y+140*scale,{steps:15});
  await page.mouse.up();
  await page.waitForFunction(function () {return !document.querySelector(".win-pass");},
    null,{timeout:30000});
  console.log("Native guest drag out/in passed");
  await page.locator("#godBtn").click();
  const title=await page.locator("#godWin .wtitle").boundingBox();
  await page.mouse.move(title.x+70,title.y+4);
  await page.mouse.down();
  await page.mouse.move(r.x+250*scale,r.y+100*scale,{steps:15});
  await page.mouse.up();
  await page.waitForFunction(function () {
    return document.getElementById("godWin").classList.contains("win-pass-owned");
  },null,{timeout:30000});
  await page.waitForTimeout(2000);
  await page.screenshot({path:"/tmp/WinPassLive-host.png"});
  const host=await page.evaluate(function () {
    return window.passWindows.find(function (w) {return w.host=="godWin";});
  });
  const word=await page.evaluate(async function (host) {
    const {GuiScene}=await import("/Adam/GuiBridge.js"),scene=GuiScene(document.getElementById("godWin")),
      c=[...scene.controls.values()].find(c=>c.el.id=="godWord");
    return {x:host.x+8+c.x+c.w/2,y:host.y+8+c.y+c.h/2};
  },host);
  await page.mouse.click(r.x+word.x*scale,r.y+word.y*scale,{delay:120});
  let actionWorked=false;
  try {
    await page.waitForFunction(function () {
      return !!document.querySelector("#godOut .word");
    },null,{timeout:10000});
    assert(await page.evaluate(function () {
      return window.passActions.some(function (a) {return a.id==2;});
    }),"native BT hit dispatches original God Tools handler");
    const wordText=await page.locator("#godOut .word").first().textContent();
    await page.waitForFunction(word=>window.passRequests.some(m=>m.op=="update" && m.gui &&
      new TextDecoder().decode(m.gui).includes(word)),wordText);
    actionWorked=true;
    console.log("Native button -> browser God action -> native document update passed");
  } catch (e) {
    console.error("Native action failed; checking recovery next:",e.message);
  }
  await page.locator("#pauseBtn").click();
  await page.waitForFunction(function () {
    return !document.querySelector(".win-pass-owned");
  });
  assert.equal(await page.locator("#godWin").isVisible(),true);
  await page.locator("#settingsBtn").click();
  assert.equal(await page.locator("#windowPassthrough").isChecked(),true);
  assert.match(await page.locator("#windowPassStatus").textContent(),/paused/);
  await page.locator("#settingsClose").click();
  await page.locator("#godClose").click();
  await page.locator("#pauseBtn").click();
  await page.waitForFunction(function () {return window.passWindows.length;});
  console.log("Pause restores browser ownership; Settings and Play remain accessible");
  await page.locator("#settingsBtn").click();
  await page.locator("#windowPassthrough").uncheck();
  await page.waitForFunction(function () {return !window.passWindows.length;});
  assert.equal(await page.locator(".win-pass,.win-pass-owned").count(),0);
  await page.locator("#windowPassthrough").check();
  await page.locator("#settingsClose").click();
  await page.waitForFunction(function () {return window.passWindows.length;});
  const before=await page.evaluate(function () {return window.passEvents.length;});
  await page.locator("#restartBtn").click();
  await page.waitForFunction(function (n) {
    return window.passEvents.slice(n).some(function (m) {
      return m.cmd=="guestReady" && m.ok;
    });
  },before,{timeout:60000});
  await page.waitForFunction(function () {
    return window.passWindows.length && !document.querySelector(".win-pass-owned");
  },null,{timeout:30000});
  console.log("Disable and restart restore a usable native desktop");
  assert(surfaceWorks,"detached surface must include native document text");
  assert(actionWorked,"native Word click must call its original browser handler");
  assert.deepEqual(errors,[]);
  console.log("Live window passthrough: native documents, actions, input and recovery passed");
} catch (e) {
  if (page) {
    console.error(await page.evaluate(function () {
      return {events:window.passEvents.slice(-15),
        requests:window.passRequests.filter(function (m) {
          return m.cmd=="windows" || m.b;
        }).slice(-20),
        actions:window.passActions,
        status:document.getElementById("windowPassStatus")?.textContent,
        windows:window.passWindows.map(function (w) {
          const {buf,...info}=w;return info;
        })};
    }));
    await page.screenshot({path:"/tmp/WinPassLive-error.png"});
  }
  throw e;
} finally {
  await browser.close();
  server.kill();
}
