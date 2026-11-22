import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {chromium} from "playwright-core";
import {ServeReq} from "../Misc/Server.mjs";
import {BrowserMachine,MachinePost,MachineReady} from "../hemu/holyc-wasm/Apps/HEMU/Kernel/Test/BrowserMachine.mjs";
const server=createServer(ServeReq).listen(0,"127.0.0.1");await once(server,"listening");
const browser=await chromium.launch({executablePath:"/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
try {
  for(const cores of [1,4]) {
    const context=await browser.newContext({timezoneId:"America/Los_Angeles"});
    await BrowserMachine(context);
    await context.addInitScript(()=>{
      localStorage.setItem("tos-settings",JSON.stringify({rate:30}));
      window.clockSamples=[];
      const Base=Worker;
      window.Worker=class extends Base {
        constructor(...args) {
          super(...args);
          this.addEventListener("message",({data:m})=>{
            if(m.cmd!=="frame")return;
            const match=/^(.{9}) (\d\d:\d\d:\d\d)/.exec(m.top||"");
            if(!match)return;
            window.clockTop=match;
            window.firstClock??={top:match[0],now:Date.now()};
            requestAnimationFrame(()=>clockSamples.push({
              top:window.clockTop[0],shown:document.getElementById("tb-date").textContent+" "+document.getElementById("tb-time").textContent}));
          });
        }
      };
    });
    const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
    const url="http://127.0.0.1:"+server.address().port+(cores===1?"/?single":"/?smp");
    await page.goto(url);await MachineReady(page,cores);
    await page.waitForFunction(()=>clockSamples.length>=70);
    const first=await page.evaluate(()=>{
      const d=new Date(firstClock.now),p=n=>String(n).padStart(2,"0"),
        actual=firstClock.top.slice(10).split(":").map(Number);
      return {date:firstClock.top.slice(0,9),expected:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()]+" "+p(d.getMonth()+1)+"/"+p(d.getDate()),
        delta:Math.abs(actual[0]*3600+actual[1]*60+actual[2]-(d.getHours()*3600+d.getMinutes()*60+d.getSeconds()))};
    });
    assert.equal(first.date,first.expected);assert(first.delta<=1,JSON.stringify(first));
    await MachinePost(page,{cmd:"pause",value:true});
    await page.waitForFunction(()=>machine.events.some(e=>e.cmd==="paused"&&e.value));
    const paused=await page.locator("#tb-time").textContent();
    await page.waitForTimeout(1200);
    assert.equal(await page.locator("#tb-time").textContent(),paused);
    if(cores===1) {
      await page.evaluate(async()=>{
        const worker=machine.workers.findLast(w=>w.machineCore===0&&!w.machineTerminated);
        const saved=await new Promise((resolve,reject)=>{
          function Receive({data:m}) {if(m.cmd==="exportResult") {worker.removeEventListener("message",Receive);m.ok?resolve(m.buf):reject(Error(m.msg));}}
          worker.addEventListener("message",Receive);worker.postMessage({cmd:"exportSnapshot"});
        });
        const {BootFileSave}=await import("/Adam/BootFile.js");await BootFileSave("snapshot",saved);
      });
      await page.reload();
      await page.waitForFunction(()=>machine.events.some(e=>e.cmd==="restored"));
      assert.equal(await page.locator("#tb-time").textContent(),paused,"A paused saved frame and toolbar retain the same time");
    }
    await MachinePost(page,{cmd:"pause",value:false});
    await page.waitForFunction(old=>document.getElementById("tb-time").textContent!==old,paused);
    const mismatches=await page.evaluate(()=>clockSamples.filter(s=>s.shown!==s.top));
    assert.deepEqual(mismatches,[]);assert.deepEqual(errors,[]);
    console.log(cores+" cores: fresh local startup time, exact toolbar/frame agreement at30FPS, pause and resume"+(cores===1?", including saved-session restore":""));
    await context.close();
  }
} finally {await browser.close();server.closeAllConnections();server.close();}
