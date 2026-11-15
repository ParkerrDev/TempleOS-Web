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
    const {WinPass,WinPassDoc}=await import("/Adam/WinPass.js"),
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
        if (window.passReject==m.op)
          return {ok:false,msg:"Native operation rejected for this test."};
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
    window.passDoc=WinPassDoc;
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
  await page.mouse.click(vr.x+30*scale,vr.y+40*scale);
  assert(await page.evaluate(function () {
    return window.passInput.some(function (m) {
      return m.slot==0 && m.x==150 && m.y==120 && m.buttons==1;
    });
  }),"detached clicks retain guest-global coordinates and target slot");
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
  assert.match(host.doc,/\$BT-X,"Word",LE=\d+\$/);
  assert.equal(await page.locator("#godOverlay").isVisible(),false,
    "native host hides the browser modal backdrop");
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
    "native LE action calls the original browser button handler");
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
  await page.evaluate(function () {return window.pass.Enable(false);});
  assert.equal(await page.locator("#godWin").isVisible(),true,
    "disable restores browser ownership and overlay state");
  assert.equal(await page.locator("#winPassDock").isVisible(),false);
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
