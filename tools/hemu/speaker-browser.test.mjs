import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {chromium} from "playwright-core";
import {ServeReq} from "../../server.mjs";
import {DesktopServer} from "./desktop.mjs";
import {BrowserMachine,MachinePost,MachineReady} from "./BrowserMachine.mjs";

const server=createServer(ServeReq).listen(0,"127.0.0.1");
await once(server,"listening");
const origin="http://127.0.0.1:"+server.address().port,
  browser=await chromium.launch({executablePath:process.env.CHROMIUM||"/usr/bin/chromium",
    headless:true,args:["--no-sandbox"]}),temp=await mkdtemp(join(tmpdir(),"hemu-speaker-"));
async function Exec(page,id,src) {
  await MachinePost(page,{cmd:"osExec",id,target:"adam",src});
  await page.waitForFunction(id=>window.machine.events.some(m=>m.cmd==="fileResult"&&m.id===id),id,{timeout:15000});
  const result=await page.evaluate(id=>window.machine.events.find(m=>m.cmd==="fileResult"&&m.id===id),id);
  assert.equal(result.ok,true,result.msg);
}
try {
  for(const desktop of process.env.HOST?[process.env.HOST==="desktop"]:[false,true]) for(const cores of process.env.CORES?[Number(process.env.CORES)]:[1,4]) {
    const app=desktop?await DesktopServer({cores}):null,context=await browser.newContext(),
      pause=desktop?"#pause":"#pauseBtn",screen=desktop?"#screen":"#canvas";
    let page;
    try {
      await BrowserMachine(context);
      if(!desktop&&cores===1)
        await context.route("**/build/hemu-smp.wasm",route=>route.fulfill({contentType:"application/wasm",body:"invalid engine"}));
      await context.addInitScript(()=>{
        window.speakerOutputs=[];
        window.speakerMessages=[];
        const WorkerBase=Worker;
        window.Worker=class extends WorkerBase {
          constructor(...args) {
            super(...args);
            this.addEventListener("message",({data:m})=>{
              if(["snd","paused"].includes(m.cmd))window.speakerMessages.push(m);
            });
          }
        };
        const Base=AudioContext;
        window.AudioContext=class extends Base {
          createGain() {
            const node=super.createGain(),analyser=super.createAnalyser();
            analyser.fftSize=512;node.connect(analyser);
            window.speakerOutputs.push({node,analyser,context:this});
            return node;
          }
        };
        window.speakerRms=()=>{
          const out=window.speakerOutputs[0];
          if(!out)return null;
          const samples=new Float32Array(out.analyser.fftSize);
          out.analyser.getFloatTimeDomainData(samples);
          return Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length);
        };
      });
      page=await context.newPage();
      const errors=[];
      page.on("pageerror",e=>errors.push(e.message));
      page.on("dialog",dialog=>dialog.accept());
      await page.goto(app?.url||origin+"/?smp");
      await MachineReady(page,cores);
      if(!desktop&&cores===1)
        assert.equal(await page.evaluate(async()=>(await import("/Os.js")).engine.kind),"worker","failed stock SMP boot falls back to one core");
      await page.waitForFunction(()=>window.machine.events.some(m=>m.cmd==="guestPatch"&&m.state==="installed"));
      await page.waitForFunction(()=>window.machine.events.some(m=>m.name==="Welcome"&&m.state==="done"));
      await page.locator(screen).focus();
      await page.keyboard.press("Shift");
      await Exec(page,"speaker-on","Snd(60);");
      await page.waitForFunction(()=>window.speakerRms()>.01,null,{timeout:10000});
      await page.locator(pause).click();
      await page.waitForFunction(()=>window.machine.events.findLast(m=>m.cmd==="paused")?.value===true);
      await page.waitForFunction(()=>window.speakerRms()===0,null,{timeout:2000});
      await page.locator(pause).click();
      await page.waitForFunction(()=>window.machine.events.findLast(m=>m.cmd==="paused")?.value===false);
      await page.waitForFunction(()=>window.speakerRms()>.01,null,{timeout:2000});

      await page.evaluate(()=>window.speakerOutputs[0].context.suspend());
      await page.locator(screen).focus();
      await page.keyboard.press("Shift");
      await page.waitForFunction(()=>window.speakerOutputs[0].context.state==="running"&&window.speakerRms()>.01);
      await Exec(page,"speaker-off","Snd;");
      await page.waitForFunction(()=>window.speakerRms()===0,null,{timeout:10000});
      await Exec(page,"speaker-on-again","Snd(60);");
      await page.waitForFunction(()=>window.speakerRms()>.01,null,{timeout:10000});

      let release;
      const gate=new Promise(resolve=>{release=resolve;}),after=await page.evaluate(()=>window.machine.events.length);
      await context.route("**/engine/hemu-worker.js",async route=>{await gate;await route.continue();});
      try {
        await page.locator(desktop?"#restart":"#restartBtn").click();
        await page.waitForFunction(()=>window.speakerRms()===0,null,{timeout:2000});
      } finally {release();}
      await MachineReady(page,cores,{after});
      await context.unroute("**/engine/hemu-worker.js");
      await page.waitForFunction(after=>window.machine.events.slice(after).some(m=>m.cmd==="guestPatch"&&m.state==="installed"),after);
      await page.waitForFunction(after=>window.machine.events.slice(after).some(m=>m.name==="Welcome"&&m.state==="done"),after);
      assert.equal(await page.evaluate(()=>window.speakerRms()),0,"restart forgets the previous machine's tone");

      await Exec(page,"speaker-fault-tone","Snd(60);");
      await page.waitForFunction(()=>window.speakerRms()>.01,null,{timeout:10000});
      if(desktop) {
        await page.locator(pause).click();
        await page.waitForFunction(()=>window.machine.events.findLast(m=>m.cmd==="paused")?.value===true);
        const download=page.waitForEvent("download",{timeout:60000}),path=join(temp,"tone-"+cores+".hemu");
        await page.locator("#save").click();await (await download).saveAs(path);
        const savedAt=await page.evaluate(()=>window.machine.events.length);
        await page.locator("#open").setInputFiles(path);
        await page.waitForFunction(after=>window.machine.events.slice(after).some(m=>m.cmd==="restored"),savedAt,{timeout:45000});
        await page.waitForFunction(()=>window.speakerRms()===0,null,{timeout:2000});
        assert.equal(await page.locator(pause).innerText(),"Resume");
        await page.locator(pause).click();
        await page.waitForFunction(()=>window.speakerRms()>.01,null,{timeout:2000});
      }
      await Exec(page,"speaker-fault",`
U0 SpeakerFault()
{
  Sleep(100);
  asm {
    DU8 0x0F,0x0B;
  }
}
Spawn(&SpeakerFault,,,${cores===4?1:-1});
`);
      await page.waitForFunction(()=>window.machine.events.some(m=>m.cmd==="error"&&m.retained),null,{timeout:15000});
      await page.waitForFunction(()=>window.speakerRms()===0,null,{timeout:2000});
      assert.equal(await page.locator(pause).isDisabled(),true);
      assert.deepEqual(errors,[]);
      console.log(`${desktop?"Desktop":"Web"} ${cores}: actual audio passes keyboard unlock, pause/resume, suspended-context recovery, native silence, blocked restart${desktop?", paused full-save restore":""} and native CPU fault.`);
    } catch(error) {
      if(page)console.log(await page.evaluate(()=>({messages:window.speakerMessages.slice(-20),
        events:window.machine.events.slice(-12),rms:window.speakerRms(),
        outputs:window.speakerOutputs.map(o=>({state:o.context.state,gain:o.node.gain.value}))})));
      throw error;
    } finally {await context.close();if(app)await app.close();}
  }
} finally {
  await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  await rm(temp,{recursive:true,force:true});
}
