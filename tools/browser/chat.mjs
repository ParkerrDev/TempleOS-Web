import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {chromium} from "playwright-core";

const root=new URL("../../",import.meta.url),
  server=spawn(process.execPath,["server.mjs"],{cwd:root,
    env:{...process.env,PORT:"8185"},stdio:["ignore","pipe","inherit"]});
await once(server.stdout,"data");
const browser=await chromium.launch({executablePath:process.env.CHROMIUM ||
  "/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
try {
  const context=await browser.newContext(),errors=[];
  let socket,history=[];
  await context.route("**/hemu/*.gz",route=>route.abort());
  await context.routeWebSocket(/templeosweb-presence\./,()=>{});
  await context.routeWebSocket(/templeosweb-chat\./,ws=>{
    socket=ws;
    ws.send(JSON.stringify({t:"hello",tag:"beef",people:2,log:history}));
    ws.onMessage(m=>{if (m=="ping") ws.send("pong");});
  });
  await context.addInitScript(()=>{
    window.notices=[];
    //The browser owns permission and desktop delivery; record that boundary.
    window.Notification=class {
      static permission="granted";
      constructor(title,opts) {this.title=title;this.opts=opts;window.notices.push(this);}
      close() {this.closed=true;}
    };
  });
  const page=await context.newPage();
  const cdp=await context.newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled",{enabled:false});
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("http://localhost:8185/",{waitUntil:"load"});
  await page.locator("#chatStatus").waitFor({state:"attached"});
  await page.waitForFunction(()=>document.getElementById("chatStatus").textContent=="In chat: 2");
  const title=await page.title();
  function Send(n,tag="other",text="message "+n)
  {
    const msg={t:"msg",n,at:Date.now(),nick:"Guest",tag,text};
    history.push(msg);socket.send(JSON.stringify(msg));
  }
  Send(1);
  await page.waitForFunction(()=>document.getElementById("chatUnread").textContent==" (1)");
  assert.equal(await page.title(),"(1) "+title);
  assert.equal(await page.evaluate(()=>notices.length),0,"Visible tab has only the unread badge.");
  Send(2,"beef");
  Send(3,"other","<img src=x onerror=alert(1)>");
  await page.waitForFunction(()=>document.getElementById("chatUnread").textContent==" (2)");
  assert.equal(await page.locator("#chatLog img").count(),0);
  socket.send(JSON.stringify(history.at(-1)));
  socket.send(JSON.stringify({t:"del",n:1}));
  await page.waitForFunction(()=>document.getElementById("chatUnread").textContent==" (1)");
  assert.equal(await page.locator('#chatLog [data-n="3"]').count(),1);
  await page.locator("#chatBtn").click();
  assert.equal(await page.locator("#chatUnread").innerText(),"");
  assert.equal(await page.title(),title);
  await page.locator("#chatMute").click();
  assert.equal(await page.locator("#chatMute").getAttribute("aria-pressed"),"true");
  await page.locator("#chatClose").click();
  Send(4);
  await page.locator('#chatLog [data-n="4"]').waitFor({state:"attached"});
  assert.equal(await page.locator("#chatUnread").innerText(),"");
  await page.reload({waitUntil:"load"});
  await page.locator("#chatMute").waitFor({state:"attached"});
  assert.equal(await page.locator("#chatMute").getAttribute("aria-pressed"),"true");
  await page.locator("#chatBtn").click();
  await page.locator("#chatMute").click();
  await page.locator("#chatClose").click();
  const other=await context.newPage();
  const other_cdp=await context.newCDPSession(other);
  await other_cdp.send("Emulation.setFocusEmulationEnabled",{enabled:false});
  await other.goto("about:blank");
  await other.bringToFront();
  //Playwright reenables focus emulation after the page reloads.
  await cdp.send("Emulation.setFocusEmulationEnabled",{enabled:false});
  await page.waitForFunction(()=>!document.hasFocus());
  assert.equal(await page.evaluate(()=>document.hasFocus()),false,
    "The notification check requires a genuinely unfocused browser page.");
  Send(5);
  await page.waitForFunction(()=>notices.length==1);
  assert.equal(await page.title(),"(1) "+title);
  assert.equal(await page.evaluate(()=>notices[0].opts.body),"Guest: message 5");
  await page.evaluate(()=>notices[0].onclick({target:notices[0]}));
  await page.locator("#chatWin").waitFor({state:"visible"});
  assert(await page.evaluate(()=>notices[0].closed));
  assert.equal(await page.title(),title);
  await page.bringToFront();
  await page.locator("#chatClose").click();
  await page.evaluate(()=>navigator.serviceWorker.register("/ChatSw.js"));
  const sw=context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  await sw.evaluate(async()=>{
    const pages=await clients.matchAll({type:"window",includeUncontrolled:true});
    pages[0].postMessage({cmd:"chat-open"});
  });
  await page.locator("#chatWin").waitFor({state:"visible"});
  await page.goto("http://localhost:8185/?open=chat",{waitUntil:"load"});
  await page.locator("#chatWin").waitFor({state:"visible"});
  socket.send(JSON.stringify({t:"clear"}));
  await page.locator("#chatLog .cnone").waitFor();
  for (let n=10;n<70;n++)
    history.push({t:"msg",n,at:Date.now(),nick:"Guest",tag:"other",text:"older line "+n});
  await page.goto("http://localhost:8185/",{waitUntil:"load"});
  await page.locator('#chatLog [data-n="69"]').waitFor({state:"attached"});
  const gap=()=>page.locator("#chatLog").evaluate(l=>l.scrollHeight-l.scrollTop-l.clientHeight);
  const open=async()=>{
    await page.locator("#chatBtn").click();
    await page.locator("#chatWin").waitFor({state:"visible"});
    await page.evaluate(()=>new Promise(requestAnimationFrame));
  };
  await open();
  assert(await page.locator("#chatLog").evaluate(l=>l.scrollHeight>2*l.clientHeight),
    "the history is longer than the window");
  assert(await gap()<2,"the log opens at the newest message");
  await page.locator("#chatLog").evaluate(l=>{l.scrollTop=0;});
  await page.waitForTimeout(50);
  Send(70);
  await page.locator('#chatLog [data-n="70"]').waitFor({state:"attached"});
  assert(await gap()>100,"a new line does not pull a reader away from older ones");
  Send(71,"beef");
  await page.locator('#chatLog [data-n="71"]').waitFor({state:"attached"});
  assert(await gap()<2,"the visitor's own line goes to the bottom");
  await page.locator("#chatLog").evaluate(l=>{l.scrollTop=0;});
  await page.locator("#chatClose").click();
  Send(72);
  await page.locator('#chatLog [data-n="72"]').waitFor({state:"attached"});
  await open();
  assert(await gap()<2,"opening the window again goes to the newest message");
  await page.setViewportSize({width:900,height:500});
  await page.waitForTimeout(100);
  assert(await gap()<2,"a smaller window stays at the newest message");
  assert.deepEqual(errors,[]);
  console.log("Browser chat: unread counts/title, own messages, replay/delete, safe text, "+
    "mute persistence, background alert, notification reopen, cleared room and the log kept at "+
    "its newest line passed.");
} finally {
  await browser.close();server.kill();
}
