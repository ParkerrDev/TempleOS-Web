import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {chromium} from 'playwright-core';
import {ServeReq} from '../../Misc/Server.mjs';
import {BrowserMachine,MachinePost} from '../../hemu/Kernel/Test/BrowserMachine.mjs';
const site=createServer(ServeReq).listen(0,'127.0.0.1');await once(site,'listening');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 for(const cores of [1,4]) {
  const context=await browser.newContext({viewport:{width:1280,height:900}});await BrowserMachine(context);
  let releaseDisk;
  const diskGate=new Promise(resolve=>releaseDisk=resolve),forbidden=[];
  await context.route("**/templeos-hd.qcow2.gz",async route=>{await diskGate;await route.fallback();});
  context.on("request",request=>{
    if (/\/compiler\.js|\/Patches\/|\/Welcome\.(HC|DAT)/.test(request.url())) forbidden.push(request.url());
  });
  await context.addInitScript(()=>{
   const Base=Worker;window.Worker=class extends Base {
    constructor(...args) {super(...args);this.addEventListener('message',({data:m})=>{if(m.cmd==='frame'&&m.buf)window.cardFrame=new Uint8Array(m.buf).slice();});}
   };
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+site.address().port+(cores===1?'/?single':'/?smp'));
  await page.waitForFunction(()=>window.machine.workers.some(w=>w.machineCore===0));
  await MachinePost(page,{cmd:'input',x:8,y:470,buttons:0,keys:[]});
  await page.evaluate(async()=>{
   const {FrameTop}=await import('/hemu/Kernel/FrameText.js');
   window.cardText=()=>window.cardFrame?Array.from({length:60},(_,row)=>FrameTop(window.cardFrame.subarray(row*640*8),640)).join('\n'):'';
  });
  await page.waitForFunction(()=>window.cardText().includes('God on Tap!'),null,{timeout:45000}).catch(async e=>{console.log(await page.evaluate(()=>({events:window.machine.events.slice(-20),notice:document.getElementById('osNoticeText').textContent,text:window.cardText()})));throw e;});
  const text=await page.evaluate(()=>window.cardText());
  assert.match(text,/Public Domain Operating System/);assert.match(text,/Take Tour\(y or n\)\?/);
  assert.match(text,/Tip of day/);assert.match(text,/TempleOS V5.03/);
  assert.equal(await page.evaluate(()=>window.machine.events.some(m=>m.cmd==='diskInfo'&&m.diskReady)),false,
    "The prepared card and tour draw before the disk arrives.");
  assert.deepEqual(forbidden,[],"Stock startup needs no HolyC compiler or correction/card sources.");
  releaseDisk();
  await page.waitForFunction(()=>window.machine.events.some(m=>m.cmd==='diskInfo'&&m.diskReady),null,{timeout:120000});
  await page.screenshot({path:'/tmp/temple-welcome-'+cores+'.png'});
  await MachinePost(page,{cmd:'input',keys:[0x2A,0x01,0x81,0xAA]});
  await page.waitForFunction(()=>!window.cardText().includes('God on Tap!'));
  assert.match(await page.evaluate(()=>window.cardText()),/Take Tour\(y or n\)\?/);
  await page.click('#restartBtn');
  await page.waitForFunction(()=>window.machine.events.filter(m=>m.cmd==='diskInfo'&&m.diskReady).length>=2,null,{timeout:120000});
  await MachinePost(page,{cmd:'input',x:8,y:470,buttons:0,keys:[]});
  await page.waitForFunction(()=>window.cardText().includes('God on Tap!'),null,{timeout:45000}).catch(async e=>{console.log(await page.evaluate(()=>({events:window.machine.events.slice(-20),notice:document.getElementById('osNoticeText').textContent,text:window.cardText()})));throw e;});
  assert.deepEqual(errors,[]);
  console.log(cores+' cores: original splash graphic and V5.03 title, tour question, Shift-Esc close and one card after Restart pass.');
  await context.close();
 }
} finally {await browser.close();site.closeAllConnections();site.close();}
