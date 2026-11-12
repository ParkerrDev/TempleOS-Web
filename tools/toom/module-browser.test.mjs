import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {ModulePackage} from './ModulePackage.mjs';

assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to the frozen runtime.');
const web=resolve(process.env.TEMPLEOS_WEB),out=resolve(process.env.OUT||'/tmp/toom-module-browser'),
  source=!!process.env.SOURCE,files=ModulePackage(process.env.MODULE,source),hash=b=>createHash('sha256').update(b).digest('hex'),
  fileHashes=Object.fromEntries([...files].map(([n,b])=>[n,hash(b)])),
  {ServeReq}=await import(pathToFileURL(resolve(web,'server.mjs'))),
  {BrowserMachine,MachinePost,MachineReady}=await import(pathToFileURL(resolve(web,'tools/hemu/BrowserMachine.mjs'))),
  {TextRow}=await import(pathToFileURL(resolve(web,'tools/hemu/WorkerHost.mjs'))),
  runtimeNames=['server.mjs','Keyboard.js','Os.js','WinMgr.js','engine/jit.js','engine/hemu-worker.js',
    'engine/hemu-smp-worker.js','engine/guestexec.js','engine/KeyQueue.js','build/hemu.wasm','build/hemu-smp.wasm',
    'hemu/live.bin.gz','hemu/live-smp.bin.gz','hemu/stock.json','hemu/stock.disk','hemu/stock-smp.disk',
    'engine/Stock.js','engine/Speaker.js','vendor/images/templeos-hd.qcow2.gz'],
  runtimeHashes=Object.fromEntries(runtimeNames.map(n=>[n,hash(readFileSync(resolve(web,n)))])),
  server=createServer(ServeReq).listen(0,'127.0.0.1');await once(server,'listening');
const url=`http://127.0.0.1:${server.address().port}`,
  browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']}),
  cores=process.env.CORES?[Number(process.env.CORES)]:[1,4],results=[];
assert(cores.every(n=>n===1||n===4));mkdirSync(out,{recursive:true});
try {
  for(const count of cores) {
    const context=await browser.newContext({viewport:{width:1280,height:900}}),errors=[];
    await BrowserMachine(context);
    await context.route('**/__toom/*',route=>{
      const bytes=files.get(basename(new URL(route.request().url()).pathname));assert(bytes);
      return route.fulfill({body:bytes,contentType:'application/octet-stream'});
    });
    await context.addInitScript(()=>{
      window.toomFrame=null;window.toomSound=[];window.toomKeys=[];window.speakerOutputs=[];
      const AudioBase=AudioContext;
      window.AudioContext=class extends AudioBase {
        createGain() {
          const node=super.createGain(),analyser=super.createAnalyser();analyser.fftSize=512;node.connect(analyser);
          window.speakerOutputs.push({node,analyser,context:this});return node;
        }
      };
      window.speakerRms=()=>{
        const out=window.speakerOutputs[0];if(!out)return null;
        const samples=new Float32Array(out.analyser.fftSize);out.analyser.getFloatTimeDomainData(samples);
        return Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length);
      };
      const Base=Worker;
      window.Worker=class extends Base {
        constructor(...args) {
          super(...args);this.addEventListener('message',({data:m})=>{
            if(m.cmd==='snd')window.toomSound.push(m);
            if(m.cmd==='frame')window.toomFrame={w:m.w,h:m.h,buf:new Uint8Array(m.buf).slice()};
          });
        }
        postMessage(m,...args) {
          if(m.cmd==='input'&&m.keys)window.toomKeys.push(...m.keys);
          return super.postMessage(m,...args);
        }
      };
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    const Event=async(id,cmd='fileResult',state=null)=>{
      await page.waitForFunction(({id,cmd,state})=>window.machine.events.some(m=>m.id===id&&m.cmd===cmd&&(!state||m.state===state)),
        {id,cmd,state},{timeout:60000});
      return page.evaluate(({id,cmd,state})=>window.machine.events.find(m=>m.id===id&&m.cmd===cmd&&(!state||m.state===state)),{id,cmd,state});
    };
    async function Done(id,src) {
      await MachinePost(page,{cmd:'osExec',id,src,target:'adam'});const result=await Event(id);assert(result.ok,result.msg);
    }
    async function Frame() {
      const frame=await page.evaluate(()=>window.toomFrame&&({...window.toomFrame,buf:Array.from(window.toomFrame.buf)}));
      if(frame)frame.buf=Uint8Array.from(frame.buf);return frame;
    }
    function Text(frame,x=0,y=0) {
      return Array.from({length:Math.floor((frame.h-y)/8)},(_,row)=>TextRow(frame.buf.subarray(y*frame.w+x),frame.w,row)).join('\n');
    }
    async function Screen(pattern) {
      const end=performance.now()+60000;let frame;
      while(performance.now()<end) {
        frame=await Frame();if(frame)for(const [x,y] of [[0,0],[0,4],[4,0],[4,4]])if(pattern.test(Text(frame,x,y)))return frame;
        const faults=await page.evaluate(()=>window.machine.events.filter(m=>m.cmd==='error'||m.cmd==='guestResult'&&m.state==='failed'));
        assert.deepEqual(faults,[]);await page.waitForTimeout(100);
      }
      assert.fail(`Page did not display ${pattern}:\n${frame&&Text(frame,0,4)}`);
    }
    const Region=frame=>hash(frame.buf.subarray(frame.w*64,frame.w*320));
    let captureReleases=0;
    async function Exit(id,key) {
      if(await page.evaluate(()=>!!document.pointerLockElement)) {
        await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.pointerLockElement);
        assert(!await page.evaluate(id=>window.machine.events.some(m=>m.id===id&&m.cmd==='guestResult'&&m.state==='done'),id));
        await page.locator('#canvas').click();captureReleases++;
      }
      await page.keyboard.press(key);await Event(id,'guestResult','done');
    }
    try {
      await page.goto(url+(count===1?'/?single':'/'),{waitUntil:'load'});await MachineReady(page,count);
      await page.waitForFunction(()=>document.getElementById('loadui').style.display==='none');
      await page.waitForFunction(()=>window.machine.events.some(m=>m.cmd==='guestPatch'&&m.state==='installed'),null,{timeout:60000});
      await page.evaluate(async names=>{
        const files=await Promise.all(names.map(async name=>({path:'C:/TOOM/'+name,bytes:new Uint8Array(await(await fetch('/__toom/'+name)).arrayBuffer())})));
        window.machine.workers.findLast(w=>w.machineCore===0&&!w.machineTerminated).postMessage({cmd:'osInstall',id:'install',files});
      },[...files.keys()]);assert((await Event('install')).ok);
      const start=performance.now(),src='Cd("C:/Home");ExeFile("C:/TOOM/Run.HC");';
      await MachinePost(page,{cmd:'osLaunch',id:'run',name:'Native module',src});assert((await Event('run')).ok);
      const running=await Event('run','guestResult','running'),initial=await Screen(/ARROWS\/WASD MOVE/),firstFrameMs=performance.now()-start;
      await page.locator('#canvas').click();await page.locator('#canvas').screenshot({path:resolve(out,`initial-${count}.png`)});
      await Done('owner',`CTask *tm_mod_parent=${running.task},*tm_mod_child=tm_mod_parent->popup_task;
if (!TaskValidate(tm_mod_parent) || !TaskValidate(tm_mod_child) || tm_mod_child==tm_mod_parent ||
    !tm_mod_child->draw_it || !TaskValidate(tm_mod_child->song_task)) throw('Owner');`);
      const soundStart=await page.evaluate(()=>window.toomSound.length),fireStart=performance.now();
      await page.keyboard.down('Control');let audibleRms;
      try {
        await Screen(/AMMO: *4[0-9]\/200/);
        await page.waitForFunction(()=>window.speakerRms()>.01,null,{timeout:10000});audibleRms=await page.evaluate(()=>window.speakerRms());
      } finally {await page.keyboard.up('Control');}
      const firstShotMs=performance.now()-fireStart,sound=await page.evaluate(n=>window.toomSound.slice(n),soundStart);
      assert(sound.some(m=>m.f>0));await page.keyboard.down('p');await Screen(/PAUSED/);
      await page.waitForFunction(()=>window.speakerRms()===0,null,{timeout:2000});
      await page.waitForTimeout(150);const paused=await Frame(),region=Region(paused);
      await page.keyboard.down('p');await page.waitForTimeout(200);await Screen(/PAUSED/);
      assert.equal(Region(await Frame()),region);await Done('silent-paused',"if (InU8(0x61)&3) throw('Sound');");
      await page.keyboard.up('p');await page.keyboard.press('p');await Screen(/ARROWS\/WASD MOVE/);
      const before=Region(await Frame()),end=performance.now()+10000;await page.keyboard.down('ArrowUp');
      try {while(Region(await Frame())===before&&performance.now()<end)await page.waitForTimeout(100);}
      finally {await page.keyboard.up('ArrowUp');}
      const moved=await Frame();assert.notEqual(Region(moved),before);await page.locator('#canvas').screenshot({path:resolve(out,`moved-${count}.png`)});
      await Exit('run','Escape');
      await Done('owner-gone',"if (TaskValidate(tm_mod_parent) || TaskValidate(tm_mod_child) || InU8(0x61)&3) throw('Cleanup');");
      await page.waitForFunction(()=>window.speakerRms()===0,null,{timeout:2000});
      await MachinePost(page,{cmd:'osLaunch',id:'again',name:'Native module again',src});assert((await Event('again')).ok);
      await Screen(/ARROWS\/WASD MOVE/);await page.locator('#canvas').click();await Exit('again','Shift+Escape');
      await Done('silent-exit',"if (InU8(0x61)&3) throw('Sound');");assert.deepEqual(errors,[]);
      const keys=await page.evaluate(()=>window.toomKeys);assert(keys.includes(0x1D)&&keys.includes(0x9D)&&keys.includes(0x48)&&keys.includes(0xC8));
      const result={cores:count,source,web,browser:browser.version(),runtimeHashes,fileHashes,firstFrameMs,firstShotMs,audibleRms,sound,keys,captureReleases,
        initialHash:hash(initial.buf),pausedHash:hash(paused.buf),movedHash:hash(moved.buf),
        scope:'Actual Chromium page, file package, DOM keys, native task ownership and observed PCM presence/silence. No audible140Hz-spacing or controlled-speed claim.'};
      results.push(result);writeFileSync(resolve(out,`browser-${count}.json`),JSON.stringify(result,null,2)+'\n');
    } catch(error) {
      await page.screenshot({path:resolve(out,`failed-${count}.png`)});console.error(await page.evaluate(()=>window.machine.events.filter(m=>['fileResult','error'].includes(m.cmd)).slice(-10)));throw error;
    } finally {await context.close();}
  }
} finally {await browser.close();await new Promise(done=>server.close(done));}
for(const name of runtimeNames)assert.equal(hash(readFileSync(resolve(web,name))),runtimeHashes[name]);
console.log(JSON.stringify({checks:results},null,2));
