import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {FreedoomRead,root} from './Assets.mjs';

assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to the frozen site checkout.');
const web=resolve(process.env.TEMPLEOS_WEB),out=resolve(process.env.OUT||'/tmp/toom-browser');
const {ServeReq}=await import(pathToFileURL(resolve(web,'server.mjs')));
const {BrowserMachine,MachinePost,MachineReady}=await import(pathToFileURL(resolve(web,'tools/hemu/BrowserMachine.mjs')));
const {TextRow}=await import(pathToFileURL(resolve(web,'tools/hemu/WorkerHost.mjs')));
const hash=b=>createHash('sha256').update(b).digest('hex');
const game=resolve(process.env.GAME_DIR||resolve(root,'games/Toom')),load=readFileSync(resolve(game,'Load.HC'),'latin1');
const finale=!!process.env.FINALE,progression=!!process.env.PROGRESSION;
assert(!(finale&&progression));
const names=['Run.HC','Load.HC',...load.matchAll(/#include "([^"]+)"/g)]
  .map(n=>typeof n==='string'?n:n[1].includes('.')?n[1]:n[1]+'.HC')
  .concat(['TmOverlay.HC','TmScreen.HC','TmPlay.HC']);
const files=new Map(names.map(n=>[n,readFileSync(resolve(game,n))]));
files.set('FREEDOOM.WAD',finale?readFileSync(resolve(root,'tools/toom/.assets/freedoom-0.13.0-phase2.wad')):FreedoomRead());
files.set('TMDATA.BIN',readFileSync(resolve(game,'TMDATA.BIN')));
const fileHashes=Object.fromEntries([...files].map(([n,bytes])=>[n,hash(bytes)]));
const runtimeNames=['server.mjs','Keyboard.js','Os.js','WinMgr.js','engine/jit.js',
  'engine/hemu-worker.js','engine/hemu-smp-worker.js','engine/guestexec.js',
  'engine/KeyQueue.js','build/hemu.wasm','build/hemu-smp.wasm',
  'hemu/live.bin.gz','hemu/live-smp.bin.gz','hemu/stock.json','hemu/stock.disk','hemu/stock-smp.disk',
  'engine/Stock.js','engine/Speaker.js','vendor/images/templeos-hd.qcow2.gz'];
const runtimeHashes=Object.fromEntries(runtimeNames.map(n=>[n,hash(readFileSync(resolve(web,n)))]));
const probe=readFileSync(new URL('Worker.HC',import.meta.url),'latin1')+'\n'+readFileSync(new URL('AudioWorker.HC',import.meta.url),'latin1')+
  (progression||finale?'\n'+readFileSync(new URL('ProgressWorker.HC',import.meta.url),'latin1'):'')+
  (finale?'\n'+readFileSync(new URL('FinaleWorker.HC',import.meta.url),'latin1'):'');
const server=createServer(ServeReq).listen(0,'127.0.0.1');await once(server,'listening');
const url=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const results=[],cores=process.env.CORES?[Number(process.env.CORES)]:[1,4];
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
      window.toomKeys=[];window.toomFrame=null;window.toomSound=[];window.speakerOutputs=[];
      const AudioBase=AudioContext;
      window.AudioContext=class extends AudioBase {
        createGain() {
          const node=super.createGain(),analyser=super.createAnalyser();
          analyser.fftSize=512;node.connect(analyser);
          window.speakerOutputs.push({node,analyser,context:this});return node;
        }
      };
      window.speakerRms=()=>{
        const out=window.speakerOutputs[0];if(!out)return null;
        const samples=new Float32Array(out.analyser.fftSize);
        out.analyser.getFloatTimeDomainData(samples);
        return Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length);
      };
      const Base=Worker;
      window.Worker=class extends Base {
        constructor(...args) {
          super(...args);
          this.addEventListener('message',({data:m})=>{
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
    let captureReleases=0;
    const Event=async(id,cmd='fileResult',state=null)=>{
      await page.waitForFunction(({id,cmd,state})=>window.machine.events.some(m=>m.id===id&&m.cmd===cmd&&(!state||m.state===state)),
        {id,cmd,state},{timeout:60000});
      return page.evaluate(({id,cmd,state})=>window.machine.events.find(m=>m.id===id&&m.cmd===cmd&&(!state||m.state===state)),{id,cmd,state});
    };
    async function Done(id,src) {
      await MachinePost(page,{cmd:'osExec',id,src,target:'adam'});
      const result=await Event(id);assert(result.ok,result.msg);console.error(`${count} cores page: ${id} passed`);
    }
    async function Frame() {
      const frame=await page.evaluate(()=>window.toomFrame&&({...window.toomFrame,buf:Array.from(window.toomFrame.buf)}));
      if(frame)frame.buf=Uint8Array.from(frame.buf);return frame;
    }
    function Text(frame,x=0,y=0) {
      const buf=frame.buf.subarray(y*frame.w+x);
      return Array.from({length:Math.floor((frame.h-y)/8)},(_,row)=>TextRow(buf,frame.w,row)).join('\n');
    }
    async function ScreenWait(pattern) {
      const end=performance.now()+60000;let frame;
      while(performance.now()<end) {
        frame=await Frame();
        if(frame)for(const [x,y] of [[0,0],[0,4],[4,0],[4,4]])if(pattern.test(Text(frame,x,y)))return frame;
        const faults=await page.evaluate(()=>window.machine.events.filter(m=>m.cmd==='error'||m.cmd==='guestResult'&&m.state==='failed'));
        assert.deepEqual(faults,[]);await page.waitForTimeout(100);
      }
      assert.fail(`Page did not display ${pattern}:\n${frame&&Text(frame,0,4)}`);
    }
    async function Exit(id,key) {
      if(await page.evaluate(()=>!!document.pointerLockElement)) {
        await page.keyboard.press('Escape');
        await page.waitForFunction(()=>!document.pointerLockElement);
        assert(!await page.evaluate(id=>window.machine.events.some(m=>m.id===id&&m.cmd==='guestResult'&&m.state==='done'),id),
          'The first Escape releases browser capture without closing the native game.');
        await page.locator('#canvas').click();
        assert(!await page.evaluate(()=>!!document.pointerLockElement),'Refocus preserves the choice to release capture.');
        captureReleases++;
      }
      await page.keyboard.press(key);await Event(id,'guestResult','done');
    }
    try {
      await page.goto(url+(count===1?'/?single':'/'),{waitUntil:'load'});
      await MachineReady(page,count);
      await page.waitForFunction(()=>document.getElementById('loadui').style.display==='none');
      await page.waitForFunction(()=>window.machine.events.some(m=>m.cmd==='guestPatch'&&m.state==='installed'),null,{timeout:60000});
      await Done('probe-vars',probe);
      await page.evaluate(async names=>{
        const files=await Promise.all(names.map(async name=>({path:'C:/TOOM/'+name,
          bytes:new Uint8Array(await (await fetch('/__toom/'+name)).arrayBuffer())})));
        window.machine.workers.findLast(w=>w.machineCore===0&&!w.machineTerminated).postMessage({cmd:'osInstall',id:'install',files});
      },[...files.keys()]);
      const installed=await Event('install');assert(installed.ok,installed.msg);
      const src='Cd("C:/Home");ExeFile("C:/TOOM/Run.HC");';
      await MachinePost(page,{cmd:'osLaunch',id:'run',name:'Native TOOM',src});
      assert((await Event('run')).ok);
      const running=await Event('run','guestResult','running');assert.match(running.task,/^0x[0-9a-f]+$/i);
      await Done('probe-task',`tm_worker_task=${running.task};`);
      const initial=await ScreenWait(/ARROWS\/WASD MOVE/);
      await page.locator('#canvas').click();
      await page.locator('#canvas').screenshot({path:resolve(out,`frame-${count}.png`)});
      await Done('audio-owner',"TmWorkerAudio;if (!tm_worker_snd_owner) throw('Sound');");
      const readyStart=performance.now();await Done('weapon-ready','TmWorkerWeaponReady;');
      const weaponReadyMs=performance.now()-readyStart;
      const beforeSound=await page.evaluate(()=>window.toomSound.length);
      await page.keyboard.down('Control');
      let audibleRms;
      try {
        await Done('native-fire','TmWorkerFire;');
        await page.waitForFunction(()=>window.speakerRms()>.01,null,{timeout:10000});
        audibleRms=await page.evaluate(()=>window.speakerRms());
      } finally {await page.keyboard.up('Control');}
      const soundMessages=await page.evaluate(n=>window.toomSound.slice(n),beforeSound);
      assert(soundMessages.some(m=>m.f>0));
      await page.keyboard.down('p');await ScreenWait(/PAUSED/);
      await page.waitForFunction(()=>window.speakerRms()===0,null,{timeout:2000});
      await Done('audio-paused',"TmWorkerAudio;if (!tm_worker_snd_paused || tm_worker_snd_period || tm_worker_snd_gate) throw('Sound');");
      await Done('pause-before',"TmWorkerProbe;if (!tm_worker_state) throw('Owner');tm_worker_old_tic=tm_worker_tic;");
      await page.keyboard.down('p');await page.waitForTimeout(200);
      await Done('pause-after',"TmWorkerProbe;if (tm_worker_tic!=tm_worker_old_tic) throw('Pause');");
      await page.keyboard.up('p');await page.keyboard.press('p');
      await ScreenWait(/ARROWS\/WASD MOVE/);
      await Done('move-before','TmWorkerProbe;tm_worker_old_x=tm_worker_x;tm_worker_old_y=tm_worker_y;');
      await page.keyboard.down('ArrowUp');
      try {await Done('held-move','TmWorkerMove;');}finally {await page.keyboard.up('ArrowUp');}
      const moved=await ScreenWait(/ARROWS\/WASD MOVE/);
      await Done('move-after',"TmWorkerProbe;if (!tm_worker_state || (tm_worker_x==tm_worker_old_x && tm_worker_y==tm_worker_old_y)) throw('Move');");
      assert.notEqual(hash(initial.buf.subarray(640*64,640*320)),hash(moved.buf.subarray(640*64,640*320)));
      let progressFrames=null;
      if(progression) {
        const ownerSource=readFileSync(new URL('ProgressOwner.HC',import.meta.url),'latin1');
        await MachinePost(page,{cmd:'osExec',id:'finish-level',src:ownerSource,target:Number(running.task),force:true});
        const finish=await Event('finish-level');assert(finish.ok,finish.msg);
        const stats=await ScreenWait(/FINISHED/);
        await page.locator('#canvas').screenshot({path:resolve(out,`stats-${count}.png`)});
        await Done('stats-state','TmWorkerProgressWait(1,-1,0,1);');
        await page.keyboard.down('Control');
        try {await Done('stats-skip','TmWorkerProgressWait(1,10,0,1);');}
        finally {await page.keyboard.up('Control');}
        await page.waitForTimeout(80);await page.keyboard.down('Space');
        try {await Done('next-location','TmWorkerProgressWait(1,10,1,1);');}
        finally {await page.keyboard.up('Space');}
        const entering=await ScreenWait(/ENTERING/);
        await page.locator('#canvas').screenshot({path:resolve(out,`entering-${count}.png`)});
        await page.waitForTimeout(80);await page.keyboard.down('Space');
        try {await Done('next-level','TmWorkerProgressWait(0,-1,-1,2);');}
        finally {await page.keyboard.up('Space');}
        const next=await ScreenWait(/ARROWS\/WASD MOVE/);
        await page.locator('#canvas').screenshot({path:resolve(out,`next-${count}.png`)});
        progressFrames={statsHash:hash(stats.buf),enteringHash:hash(entering.buf),nextHash:hash(next.buf),
          ownerProbeSha256:hash(Buffer.from(ownerSource,'latin1'))};
      }
      let finaleFrames=null;
      if(finale) {
        const ownerSource=readFileSync(new URL('FinaleOwner.HC',import.meta.url),'latin1');
        await MachinePost(page,{cmd:'osExec',id:'story-owner',src:ownerSource,target:Number(running.task),force:true});
        assert((await Event('story-owner')).ok);
        await Done('story-state','TmWorkerFinaleWait(0,6);TmWorkerFinaleFrame;');
        await page.waitForTimeout(150);const story=await Frame();
        await page.locator('#canvas').screenshot({path:resolve(out,`story-${count}.png`)});
        await page.keyboard.down('Control');
        try {await Done('story-next','TmWorkerProgressWait(0,-1,-1,7);');}
        finally {await page.keyboard.up('Control');}
        const next=await ScreenWait(/ARROWS\/WASD MOVE/);
        await page.locator('#canvas').screenshot({path:resolve(out,`story-next-${count}.png`)});
        await MachinePost(page,{cmd:'osExec',id:'cast-owner',src:'TmFinaleOwner(30);',target:Number(running.task),force:true});
        assert((await Event('cast-owner')).ok);
        await Done('cast-text','TmWorkerFinaleWait(0,30);');
        await page.keyboard.down('Space');
        try {await Done('cast-start','TmWorkerFinaleWait(2,30,0,0);');}
        finally {await page.keyboard.up('Space');}
        await Done('cast-frame','TmWorkerFinaleFrame;');
        await page.waitForTimeout(150);const cast=await Frame();
        await page.locator('#canvas').screenshot({path:resolve(out,`cast-${count}.png`)});
        assert.notEqual(hash(story.buf),hash(cast.buf));
        await page.keyboard.press('p');
        await Done('cast-paused','TmWorkerFinalePause;tm_worker_old_final=tm_worker_final_tic;');
        await page.waitForTimeout(150);
        await Done('cast-still','TmWorkerFinale;if (tm_worker_final_tic!=tm_worker_old_final) throw(\'Pause\');');
        await page.keyboard.press('p');
        await page.keyboard.down('x');
        try {await Done('cast-death','TmWorkerFinaleWait(2,30,0,1);');}
        finally {await page.keyboard.up('x');}
        await Done('cast-next','TmWorkerFinaleWait(2,30,1,0);TmWorkerFinaleFrame;');
        await page.waitForTimeout(150);const castNext=await Frame();
        await page.locator('#canvas').screenshot({path:resolve(out,`cast-next-${count}.png`)});
        finaleFrames={storyHash:hash(story.buf),nextHash:hash(next.buf),castHash:hash(cast.buf),castNextHash:hash(castNext.buf),
          ownerProbeSha256:hash(Buffer.from(ownerSource,'latin1'))};
      }
      await Exit('run','Escape');
      await Done('exit-owner',"TmWorkerProbe;if (tm_worker_state) throw('Owner');");
      await Done('audio-stopped',"TmWorkerAudio;if (tm_worker_snd_gate) throw('Sound');");
      await page.waitForFunction(()=>window.speakerRms()===0,null,{timeout:2000});
      await MachinePost(page,{cmd:'osLaunch',id:'again',name:'Native TOOM Again',src});
      assert((await Event('again')).ok);await ScreenWait(/ARROWS\/WASD MOVE/);
      await page.locator('#canvas').click();await Exit('again','Shift+Escape');
      const final=await page.evaluate(()=>({keys:window.toomKeys,errors:window.machine.events.filter(m=>m.cmd==='error'||m.cmd==='guestResult'&&m.state==='failed')}));
      for(const key of [0x1D,0x9D,0x19,0x99,0xE0,0x48,0xC8,0x01,0x81,0x2A,0xAA])assert(final.keys.includes(key),`DOM keyboard produced set1 ${key.toString(16)}`);
      assert.deepEqual(final.errors,[]);assert.deepEqual(errors,[]);
      const result={cores:count,weaponReadyMs,audibleRms,soundMessages,captureReleases,progressFrames,finaleFrames,keys:final.keys,initialHash:hash(initial.buf),movedHash:hash(moved.buf),
        screenshot:resolve(out,`frame-${count}.png`),screenshotSha256:hash(readFileSync(resolve(out,`frame-${count}.png`)))};
      results.push(result);writeFileSync(resolve(out,`browser-${count}.json`),JSON.stringify(result,null,2)+'\n');
    } catch(error) {
      await page.screenshot({path:resolve(out,`failed-${count}.png`)}).catch(()=>{});
      console.error(await page.evaluate(()=>window.machine.events.slice(-12)).catch(()=>[]));throw error;
    } finally {await context.close();}
  }
  for(const name of runtimeNames)assert.equal(hash(readFileSync(resolve(web,name))),runtimeHashes[name]);
  for(const name of names)assert.equal(hash(readFileSync(resolve(game,name))),fileHashes[name]);
  const evidence={browser:browser.version(),fileHashes,runtimeHashes,probeSha256:hash(Buffer.from(probe,'latin1')),checks:results};
  writeFileSync(resolve(out,`result-${cores.join('-')}.json`),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
} finally {await browser.close();await new Promise(done=>server.close(done));}
