import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root=new URL("../../",import.meta.url);
export async function BrowserMachine(context,{gate=false}={}) {
  await context.route("**/hemu/*.gz",async route=>route.fulfill({
    body:await readFile(new URL("hemu/"+new URL(route.request().url()).pathname.split("/").pop(),root)),
    contentType:"application/gzip"}));
  await context.route("**/vendor/images/templeos-hd.qcow2.gz",async route=>route.fulfill({
    body:await readFile(new URL("vendor/images/templeos-hd.qcow2.gz",root)),contentType:"application/gzip"}));
  await context.route("https://templeosweb-*.workers.dev/**",route=>route.abort());
  await context.routeWebSocket(/templeosweb-.*\.workers\.dev/,socket=>socket.close());
  if(gate) {
    //Only this test response inserts a preemption point after ownership is acquired.
    const source=await readFile(new URL("engine/CoreBus.js",root),"utf8"),needle="    exclusive=1;\n    return true;";
    assert.equal(source.split(needle).length,2);
    const headers={"Cross-Origin-Embedder-Policy":"require-corp","Cross-Origin-Resource-Policy":"same-origin"};
    await context.route("**/engine/CoreBus.js",route=>route.fulfill({contentType:"text/javascript",headers,
      body:source.replace(needle,`    exclusive=1;
    const gate=globalThis.__testBusGate&&new Int32Array(globalThis.__testBusGate);
    if(core===1&&gate&&Atomics.compareExchange(gate,0,1,2)===1) {
      Atomics.notify(gate,0);
      while(Atomics.load(gate,0)===2&&!Stopped())Atomics.wait(gate,0,2,10);
      if(Stopped())throw new BusFault("Cancelled while owning exclusive RAM");
      throw new Error("Forced exclusive owner failure");
    }
    return true;`)}));
    await context.route("**/engine/hemu-smp-worker.js",async route=>route.fulfill({contentType:"text/javascript",headers,
      body:'addEventListener("message",e=>{if(e.data.cmd==="init")globalThis.__testBusGate=e.data.testBusGate;});\n'+
        await readFile(new URL("engine/hemu-smp-worker.js",root),"utf8")}));
  }
  await context.addInitScript(()=>{
    localStorage.setItem("tos-settings",JSON.stringify({rate:30,repeat:false}));
    const machine=window.machine={workers:[],events:[],terminations:[],frames:0,gate:new SharedArrayBuffer(16)},Base=Worker;
    window.Worker=class extends Base {
      constructor(url,...args) {
        super(url,...args);
        this.machineURL=String(url);this.machineId=machine.workers.length;
        if(!/\/engine\/hemu-(smp-)?worker\.js/.test(new URL(url,location.href).pathname))return;
        machine.workers.push(this);
        this.addEventListener("message",({data:m})=>{
          if(m.cmd==="frame")machine.frames++;
          else if(!["progress","snd","log"].includes(m.cmd))machine.events.push({worker:this.machineId,...m});
        });
      }
      postMessage(m,...args) {
        if(m.cmd==="init") {
          this.machineCore=m.core||0;this.machineControl=m.smp?.ctrl||m.ctrl;
          m={...m,testBusGate:machine.gate};
        }
        return super.postMessage(m,...args);
      }
      terminate() {
        if(this.machineCore!==undefined) {
          const ctrl=this.machineControl&&new Int32Array(this.machineControl);
          machine.terminations.push({worker:this.machineId,core:this.machineCore,
            stopped:ctrl?Atomics.load(ctrl,1):null,owner:ctrl?Atomics.load(ctrl,12):null});
          this.machineTerminated=true;
        }
        return super.terminate();
      }
    };
  });
}

export async function MachinePost(page,message) {
  await page.evaluate(m=>window.machine.workers.findLast(w=>w.machineCore===0&&!w.machineTerminated).postMessage(m),message);
}

export async function MachineReady(page,cores,{after=0,legacy=false}={}) {
  try {await page.waitForFunction(({cores,after,legacy})=>{
    const events=window.machine?.events.slice(after)||[];
    return events.some(m=>m.cmd==="guestReady"&&m.ok)&&
      (cores===1||events.some(m=>m.cmd==="smpReady")&&events.some(m=>m.cmd==="busReady"&&m.ready===!legacy));
  },{cores,after,legacy},{timeout:45000});}
  catch(error) {
    console.log(await page.evaluate(()=>({errors:window.machine?.events.filter(m=>m.cmd==="error"),events:window.machine?.events.slice(-20),
      status:document.querySelector("#status,#ldtext")?.textContent,
      workers:window.machine?.workers.map(w=>({url:w.machineURL,core:w.machineCore}))})));
    throw error;
  }
  await page.waitForFunction(()=>window.machine.events.some(m=>m.cmd==="diskInfo"&&m.ok)||
    window.machine.events.some(m=>m.cmd==="restored"),null,{timeout:45000});
}

export async function MachineFrames(page) {
  return page.evaluate(()=>window.machine.frames);
}
