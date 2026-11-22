import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {chromium} from 'playwright-core';
import {ServeReq} from '../../Misc/Server.mjs';
import {BrowserMachine,MachinePost} from '../../hemu/holyc-wasm/Apps/HEMU/Kernel/Test/BrowserMachine.mjs';
const site=createServer(ServeReq).listen(0,'127.0.0.1');await once(site,'listening');
let releaseDisk=()=>{};
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 for(const cores of [1,4]) {
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.addInitScript(()=>{window.SharedWorker=undefined;});
  await BrowserMachine(context);
  const diskGate=new Promise(resolve=>releaseDisk=resolve),forbidden=[];
  await context.route("**/templeos-hd.qcow2.gz",async route=>{await diskGate;await route.fallback();});
  context.on("request",request=>{
    if (/\/compiler\.js|\/Patches\/|\/Welcome\.(HC|DAT)/.test(request.url())) forbidden.push(request.url());
  });
  await context.addInitScript(()=>{
   const Base=Worker;window.Worker=class extends Base {
    constructor(...args) {super(...args);this.addEventListener('message',({data:m})=>{if(m.cmd==='frame'&&m.buf)window.startupFrame=new Uint8Array(m.buf).slice();});}
   };
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+site.address().port+(cores===1?'/?single':'/?smp'));
  await page.waitForFunction(()=>window.machine.workers.some(w=>w.machineCore===0));
  await MachinePost(page,{cmd:'input',x:8,y:470,buttons:0,keys:[]});
  await page.evaluate(async()=>{
   const {FrameTop}=await import('/hemu/holyc-wasm/Apps/HEMU/Kernel/FrameText.js');
   window.startupText=()=>window.startupFrame?Array.from({length:60},(_,row)=>FrameTop(window.startupFrame.subarray(row*640*8),640)).join('\n'):'';
  });
  await page.waitForFunction(()=>window.startupText().includes('Take Tour(y or n)?'),null,{timeout:45000}).catch(async e=>{console.log(await page.evaluate(()=>({events:window.machine.events.slice(-20),notice:document.getElementById('osNoticeText').textContent,text:window.startupText()})));throw e;});
  const text=await page.evaluate(()=>window.startupText());
  assert.match(text,/Public Domain Operating System/);assert.match(text,/Take Tour\(y or n\)\?/);
  assert.doesNotMatch(text,/God on Tap!|Trivial Solutions/);assert.match(text,/TempleOS V5.03/);
  assert.equal(await page.evaluate(()=>window.machine.events.some(m=>m.cmd==='diskInfo'&&m.diskReady)),false,
    "The native desktop and tour draw before the disk arrives.");
  assert.deepEqual(forbidden,[],"Stock startup needs no HolyC compiler or correction sources.");
  releaseDisk();
  await page.waitForFunction(()=>window.machine.events.some(m=>m.cmd==='diskInfo'&&m.diskReady),null,{timeout:120000});
  await page.screenshot({path:'/tmp/temple-startup-'+cores+'.png'});
  await page.click('#restartBtn');
  await page.waitForFunction(()=>window.machine.events.filter(m=>m.cmd==='diskInfo'&&m.diskReady).length>=2,null,{timeout:120000});
  await MachinePost(page,{cmd:'input',x:8,y:470,buttons:0,keys:[]});
  await page.waitForFunction(()=>window.startupText().includes('Take Tour(y or n)?'),null,{timeout:45000}).catch(async e=>{console.log(await page.evaluate(()=>({events:window.machine.events.slice(-20),notice:document.getElementById('osNoticeText').textContent,text:window.startupText()})));throw e;});
  assert.doesNotMatch(await page.evaluate(()=>window.startupText()),/God on Tap!|Trivial Solutions/);
  assert.equal(await page.evaluate(()=>window.machine.events.some(m=>m.cmd==="guestReady" && m.probe.tasks.some(t=>t.name==="Welcome"))),false);
  assert.deepEqual(errors,[]);
  console.log(cores+' cores: native desktop and tour question without the added Welcome card, including Restart.');
  await context.close();
 }
} finally {releaseDisk();await browser.close();site.closeAllConnections();site.close();}
