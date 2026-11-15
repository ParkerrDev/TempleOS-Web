import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {chromium} from "playwright-core";

const root=new URL("..",import.meta.url),
  server=spawn(process.execPath,["Misc/Server.mjs"],{cwd:root,
    env:{...process.env,PORT:"8196"},stdio:["ignore","pipe","inherit"]});
await once(server.stdout,"data");
const browser=await chromium.launch({executablePath:process.env.CHROMIUM ||
  "/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route("**/hemu/*.gz",function (route) {route.abort();});
  await context.route("https://templeosweb-*.workers.dev/**",
    function (route) {route.abort();});
  const page=await context.newPage(),errors=[],requests=[];
  page.on("pageerror",function (e) {errors.push(e.message);});
  page.on("request",function (r) {requests.push(r.url());});
  await page.goto("http://localhost:8196/?single",{waitUntil:"load"});
  await page.locator("#frame .wbar").waitFor();
  assert(!requests.some(function (url) {return url.endsWith("/WinPass.js");}),
    "passthrough has no startup import when disabled");
  await page.locator("#settingsBtn").click();
  assert.equal(await page.locator("#windowPassthrough").isChecked(),false);
  assert.equal(await page.locator("#nativeDrawing").isChecked(),false);
  await page.locator("#settingsClose").click();
  await page.evaluate(async function () {
    const {WinPass}=await import("/Adam/WinPass.js"),
      {GuiScene}=await import("/Adam/GuiBridge.js"),
      {pal32}=await import("/Adam/Os.js");
    window.passRequests=[];
    window.passInput=[];
    window.passWin={slot:-1,task:1234,num:5,title:"Native test",x:120,y:80,
      w:240,h:160,detached:false,host:null};
    window.passEmit=function () {
      const w=window.passWin;
      if (w.detached)
        w.buf=new Uint8Array(w.w*w.h).fill(14).buffer;
      window.pass.Receive({cmd:"windows",windows:[w]});
    };
    window.pass=WinPass({canvas:document.getElementById("canvas"),pal:pal32,
      async Request(m) {
        window.passRequests.push(m);
        if (m.op=="update" && window.passUpdateBlock) {
          window.passUpdateBlock=false;
          await new Promise(resolve=>window.passUpdateRelease=resolve);
        }
        if (window.passReject==m.op)
          return {ok:false,msg:"Native operation rejected for this test."};
        if (m.op=="close" && window.passCloseNotify)
          window.pass.Receive({windows:[]});
        if (m.op=="detach") {
          window.passWin.detached=true;
          window.passWin.slot=0;
          setTimeout(window.passEmit,30);
        }
        if (m.op=="attach") {
          window.passWin.detached=false;
          window.passWin.x=m.x;window.passWin.y=m.y;
          setTimeout(window.passEmit,30);
        }
        return {ok:true,slot:0,task:1234,num:5};
      },Input:function (m) {window.passInput.push(m);},Status:function (msg) {
        window.passStatus=msg;
      }});
    window.passDoc=GuiScene;
    document.getElementById("loadui").style.display="none";
    await window.pass.Enable(true);
    window.passEmit();
  });
  const r=await page.locator("#canvas").boundingBox(),scale=r.width/640,
    start={x:r.x+220*scale,y:r.y+84*scale},end={x:r.x+r.width+90,y:r.y+100};
  await page.mouse.move(start.x,start.y);
  await page.mouse.down();
  await page.mouse.move(end.x,end.y,{steps:12});
  await page.mouse.up();
  await page.locator(".win-pass canvas").waitFor();
  await page.waitForFunction(function () {
    return document.querySelector(".win-pass canvas").width==240;
  });
  assert.equal(await page.evaluate(function () {
    return window.passRequests.find(function (m) {return m.op=="detach";}).task;
  }),1234,"crossing the screen detaches the selected task");
  assert.deepEqual(await page.locator(".win-pass canvas").evaluate(function (c) {
    return [...c.getContext("2d").getImageData(20,20,1,1).data];
  }),[255,255,85,255],"detached view draws its indexed native pixels");
  let vr=await page.locator(".win-pass canvas").boundingBox();
  for (const [x,y,cursor] of [[vr.width-2,vr.height-2,"nwse-resize"],
      [2,vr.height-2,"nesw-resize"],[2,vr.height/2,"ew-resize"],
      [vr.width/2,vr.height-2,"ns-resize"],[100*scale,4*scale,"move"]]) {
    await page.mouse.move(vr.x+x,vr.y+y);
    assert.equal(await page.locator(".win-pass canvas").evaluate(c=>getComputedStyle(c).cursor),cursor,
      "native window edges retain visible cursor feedback");
    assert.equal(await page.locator("#xcursor").evaluate(c=>getComputedStyle(c).visibility),"hidden");
  }
  await page.mouse.click(vr.x+30*scale,vr.y+40*scale);
  assert.equal(await page.locator("#xcursor").evaluate(c=>getComputedStyle(c).visibility),"visible",
    "leaving a native border restores the custom pointer immediately");
  assert(await page.evaluate(function () {
    return window.passInput.some(function (m) {
      return m.slot==0 && m.x==150 && m.y==120 && m.buttons==1;
    });
  }),"detached clicks retain guest-global coordinates and target slot");
  const popupWait=page.waitForEvent("popup");
  await page.mouse.move(vr.x+100*scale,vr.y+4*scale);
  await page.mouse.down();
  await page.mouse.move(1455,180,{steps:10});
  await page.mouse.up();
  const popup=await popupWait,pc=popup.locator(".win-pass canvas");
  assert.deepEqual(await pc.evaluate(function (c) {
    return [...c.getContext("2d").getImageData(20,20,1,1).data];
  }),[255,255,85,255],"native popup retains the live task canvas");
  const pr=await pc.boundingBox();
  await popup.mouse.click(pr.x+30*scale,pr.y+40*scale);
  assert(await page.evaluate(function () {
    return window.passInput.some(function (m) {
      return m.slot==0 && m.task==1234 && m.num==5 && m.buttons==1;
    });
  }),"popup input retains the native task lifetime");
  await popup.locator("#popupReturn").click().catch(function (error) {
    if (!popup.isClosed()) throw error;
  });
  await page.locator(".win-pass canvas").waitFor();
  vr=await page.locator(".win-pass canvas").boundingBox();
  await page.mouse.move(vr.x+100*scale,vr.y+4*scale);
  await page.mouse.down();
  await page.mouse.move(r.x+250*scale,r.y+150*scale,{steps:10});
  await page.mouse.up();
  await page.waitForFunction(function () {
    return !document.querySelector(".win-pass");
  });
  assert(await page.evaluate(function () {
    return window.passRequests.some(function (m) {return m.op=="attach";});
  }),"dragging a detached title back attaches its native task");
  await page.evaluate(function () {
    Object.assign(window.passWin,{x:120,y:80,slot:-1,detached:false});
    window.passReject="detach";
    window.passEmit();
  });
  await page.mouse.move(start.x,start.y);
  await page.mouse.down();
  await page.mouse.move(end.x,end.y,{steps:10});
  await page.mouse.up();
  assert.equal(await page.locator(".win-pass").count(),0);
  assert.equal(await page.locator("#canvas").evaluate(function (c) {
    return c.hasPointerCapture(1);
  }),false,"rejected detach releases pointer capture");
  assert(await page.evaluate(function () {
    return window.passInput.some(function (m) {
      return m.buttons==0 && m.slot==-1;
    });
  }),"rejected detach releases the guest mouse button");
  await page.evaluate(function () {window.passReject=null;});
  await page.locator("#godBtn").click();
  await page.locator("#godWin").waitFor();
  const title=await page.locator("#godWin .wtitle").boundingBox();
  await page.mouse.move(title.x+70,title.y+6);
  await page.mouse.down();
  await page.mouse.move(r.x+200*scale,r.y+120*scale,{steps:10});
  await page.mouse.up();
  await page.waitForFunction(function () {
    return document.getElementById("godWin").classList.contains("win-pass-owned");
  });
  const host=await page.evaluate(function () {
    return window.passRequests.find(function (m) {return m.op=="host";});
  });
  assert.equal(host.host,"godWin");
  assert(host.gui.length>24,"generic resolved layout is sent as a binary native scene");
  assert.equal(await page.locator("#godOverlay").evaluate(el=>getComputedStyle(el).opacity),"0",
    "native host hides the browser modal backdrop");
  await page.evaluate(function () {
    window.passUpdateBlock=true;
    document.getElementById("godClear").textContent="ONE";
  });
  await page.waitForFunction(()=>!!window.passUpdateRelease);
  await page.evaluate(()=>document.getElementById("godClear").textContent="TWO");
  await page.waitForTimeout(150);
  const updates=await page.evaluate(()=>window.passRequests.filter(m=>m.op=="update").length);
  await page.evaluate(()=>window.passUpdateRelease());
  await page.waitForFunction(n=>window.passRequests.filter(m=>m.op=="update").length>n,updates);
  assert(await page.evaluate(()=>{
    const gui=window.passRequests.filter(m=>m.op=="update").at(-1).gui;
    return new TextDecoder().decode(gui).includes("TWO");
  }),"the final mutation during an in-flight update reaches the guest");
  await page.evaluate(async function () {window.passReject="close";await window.pass.Return();});
  assert.equal(await page.locator("#godWin").evaluate(el=>el.classList.contains("win-pass-owned")),true,
    "failed Return retains native ownership and action routing");
  assert.match(await page.evaluate(()=>window.passStatus),/rejected/);
  await page.evaluate(()=>window.passReject=null);
  await page.evaluate(function () {
    let button=document.getElementById("godClear");
    button.addEventListener("click",function () {window.passAction=true;});
    let doc=window.passDoc(document.getElementById("godWin")),id;
    for (let [n,el] of doc.actions)
      if (el==button)
        id=n;
    window.pass.Receive({actions:[{slot:0,id}]});
  });
  assert.equal(await page.evaluate(function () {return window.passAction;}),true,
    "native scene action calls the original browser button handler");
  assert(await page.evaluate(function () {
    return window.passRequests.filter(function (m) {return m.slot!==undefined;}).
      every(function (m) {return m.task==1234 && m.num==5;});
  }),"slot operations carry the originating task lifetime");
  await page.evaluate(function () {
    window.pass.Receive({windows:[{...window.passWin,slot:0,host:"godWin"}]});
    window.passAction=false;
    window.pass.Receive({windows:[{...window.passWin,slot:0,num:6,host:null}],
      actions:[{slot:0,id:6}]});
  });
  assert.equal(await page.locator("#godWin").isVisible(),true);
  assert.equal(await page.evaluate(function () {return window.passAction;}),false,
    "a reused native slot cannot activate the previous browser owner");
  await page.locator("#godWin").evaluate(function (win,point) {
    win.dispatchEvent(new CustomEvent("winmoved",{bubbles:true,detail:point}));
  },{clientX:r.x+200*scale,clientY:r.y+120*scale});
  await page.waitForFunction(()=>document.getElementById("godWin").classList.contains("win-pass-owned"));
  await page.evaluate(function () {
    window.passCloseNotify=true;
    Object.assign(window.passWin,{x:120,y:80,slot:0,num:5,detached:false,host:"godWin"});
    window.passEmit();
  });
  await page.mouse.move(start.x,start.y);
  await page.mouse.down();
  await page.mouse.move(end.x,end.y);
  await page.mouse.up();
  await page.waitForFunction(()=>!document.getElementById("godWin").classList.contains("win-pass-owned"));
  const returned=await page.locator("#godWin").boundingBox();
  assert(Math.abs(returned.x-(end.x-48))<1 && Math.abs(returned.y-end.y)<1,
    "drag-out follows the pointer when native close notification precedes its reply");
  await page.evaluate(function () {return window.pass.Return();});
  assert.match(await page.evaluate(()=>window.passStatus),/remains enabled/);
  assert(!await page.evaluate(()=>window.passRequests.some(m=>m.op=="disable")),
    "Return windows preserves the enabled preference");
  await page.evaluate(function () {return window.pass.Enable(false);});
  assert.equal(await page.locator("#godWin").isVisible(),true,
    "disable restores browser ownership and overlay state");
  assert.equal(await page.locator("#winPassDock").count(),0);
  assert.equal(await page.evaluate(function () {
    return window.passDoc(document.getElementById("settingsWin"));
  }),null,"unsupported browser settings stay accessible outside");
  await page.evaluate(async function () {
    await window.pass.Enable(true);
    window.passWin.detached=true;
    window.passEmit();
    window.pass.Receive({enabled:false,msg:"This fullscreen program needs the TempleOS desktop.",
      windows:[],actions:[]});
  });
  assert.equal(await page.locator(".win-pass").count(),0);
  assert.match(await page.evaluate(function () {return window.passStatus;}),/fullscreen/,
    "incompatible native programs restore browser surfaces with an explanation");
  assert.deepEqual(errors,[]);
  console.log("Window passthrough: native pixels, both drag directions, input, host actions, disable passed");
} finally {
  await browser.close();
  server.kill();
}
