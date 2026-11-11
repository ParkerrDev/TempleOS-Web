import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {chromium} from 'playwright-core';
import {ServeReq} from '../../server.mjs';
import {BrowserMachine} from '../hemu/BrowserMachine.mjs';

const headers={'Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin'};
const Wait=promise=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Route was not requested')),30000);})]).finally(()=>clearTimeout(timer));};
const root=new URL('../../',import.meta.url),site=createServer(ServeReq).listen(0,'127.0.0.1');
await once(site,'listening');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',
  headless:true,args:['--no-sandbox']});
try {
  for(const cores of [1,4])for(const outcome of ['ready','disk-error','early-disk-error','boot-error','restart']) {
    const context=await browser.newContext({viewport:{width:1280,height:800}});
    let releaseBoot=()=>{},releaseDisk=()=>{};
    try {
      await BrowserMachine(context);
      if(outcome==='early-disk-error') {
        const source=await readFile(new URL('engine/hemu-worker.js',root),'utf8'),needle='gxFrames >= 3';
        assert.equal(source.split(needle).length,2);
        await context.route('**/engine/hemu-worker.js',route=>route.fulfill({contentType:'text/javascript',headers,
          body:'let testProbe=false;addEventListener("message",e=>{if(e.data.cmd==="testProbe")testProbe=true;});\n'+
            source.replace(needle,'testProbe && '+needle)}));
      }
      await context.addInitScript(()=>{
        const Base=Worker;window.guestSent=[];
        window.Worker=class extends Base {
          postMessage(message,...args) {
            if(['osWrite','osLaunch'].includes(message.cmd))
              window.guestSent.push({cmd:message.cmd,id:message.id,path:message.path});
            return super.postMessage(message,...args);
          }
        };
      });
      let bootHeld,firstBoot=true,diskHeld,firstDisk=true;
      const bootWait=new Promise(resolve=>bootHeld=resolve),diskWait=new Promise(resolve=>diskHeld=resolve);
      await context.route('**/build/hemu*.wasm',async route=>{
        if(firstBoot) {
          firstBoot=false;bootHeld();await new Promise(resolve=>releaseBoot=resolve);
        }
        const binary=new URL(route.request().url()).pathname.split('/').pop();
        await route.fulfill({body:outcome==='boot-error'?Buffer.from([0]):
          await readFile(new URL('build/'+binary,root)),contentType:'application/wasm'});
      });
      await context.route('**/vendor/images/templeos-hd.qcow2.gz',async route=>{
        if(firstDisk) {
          firstDisk=false;diskHeld();await new Promise(resolve=>releaseDisk=resolve);
          if(outcome.endsWith('disk-error')){await route.abort();return;}
        }
        await route.fulfill({body:await readFile(new URL('vendor/images/templeos-hd.qcow2.gz',root)),contentType:'application/gzip'});
      });
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(`http://127.0.0.1:${site.address().port}/?${cores===1?'single':'smp'}`);
      await Wait(bootWait);
      await page.evaluate(async()=>{
        const {OsFileWrite,OsLaunch}=await import('/Os.js');
        window.guestResults={};window.guestBytes=new TextEncoder().encode('"Ready";').buffer;
        OsFileWrite('C:/Home/Readiness.HC',window.guestBytes).then(result=>window.guestResults.file=result);
        OsLaunch({src:'"Memory ready";',name:'Readiness'}).then(result=>window.guestResults.source=result);
      });
      assert.deepEqual(await page.evaluate(()=>window.guestSent),[]);
      assert.equal(await page.evaluate(()=>window.guestBytes.byteLength),8);
      if(outcome==='boot-error') {
        releaseBoot();
        await page.waitForFunction(()=>window.guestResults.file&&window.guestResults.source);
        const failed=await page.evaluate(()=>({results:window.guestResults,sent:window.guestSent,bytes:window.guestBytes.byteLength}));
        assert.equal(failed.results.file.ok,false);assert.equal(failed.results.source.ok,false);
        assert.deepEqual(failed.sent,[]);assert.equal(failed.bytes,8);
        const retry=await page.evaluate(async()=>{
          const {OsLaunch}=await import('/Os.js');return OsLaunch({src:'"Still stopped";'});
        });
        assert.equal(retry.ok,false);assert.equal(retry.msg,failed.results.source.msg);
      } else if(outcome==='restart') {
        await page.locator('#restartBtn').click();
        await page.waitForFunction(()=>window.guestResults.file&&window.guestResults.source);
        const canceled=await page.evaluate(()=>({results:window.guestResults,sent:window.guestSent,bytes:window.guestBytes.byteLength}));
        assert.equal(canceled.results.file.ok,false);assert.equal(canceled.results.source.ok,false);
        assert.deepEqual(canceled.sent,[]);assert.equal(canceled.bytes,8);
        releaseBoot();await Wait(diskWait);releaseDisk();
        await page.waitForFunction(()=>window.machine.events.some(m=>m.cmd==='diskInfo'&&m.ok));
        assert.deepEqual(await page.evaluate(()=>window.guestSent),[]);
      } else {
        releaseBoot();
        if(outcome==='early-disk-error') {
          await Wait(diskWait);releaseDisk();
          await page.waitForFunction(()=>window.guestResults.file);
          assert.equal(await page.evaluate(()=>window.guestResults.file.ok),false);
          assert.deepEqual(await page.evaluate(()=>window.guestSent),[]);
          await page.evaluate(()=>window.machine.workers.find(w=>w.machineCore===0).postMessage({cmd:'testProbe'}));
        }
        await page.waitForFunction(()=>window.guestResults.source);
        assert.equal(await page.evaluate(()=>window.guestResults.source.ok),true);
        assert.deepEqual(await page.evaluate(()=>window.guestSent.map(m=>m.cmd)),['osLaunch']);
        assert.equal(await page.evaluate(()=>window.guestBytes.byteLength),8);
        await Wait(diskWait);releaseDisk();
        await page.waitForFunction(()=>window.guestResults.file);
        const result=await page.evaluate(()=>({file:window.guestResults.file,sent:window.guestSent,bytes:window.guestBytes.byteLength}));
        assert.equal(result.file.ok,outcome==='ready',result.file.msg);
        assert.deepEqual(result.sent.map(m=>m.cmd),outcome==='ready'?['osLaunch','osWrite']:['osLaunch']);
        assert.equal(result.bytes,outcome==='ready'?0:8);
        if(outcome==='early-disk-error') {
          assert.equal(await page.evaluate(()=>window.machine.events.find(m=>m.cmd==='guestReady').diskPending),false);
          const after=await page.evaluate(async()=>{
            const {OsFileWrite}=await import('/Os.js');
            return OsFileWrite('C:/Home/StillMissing.HC',new ArrayBuffer(0));
          });
          assert.equal(after.ok,false);assert.equal(after.msg,result.file.msg);
          assert.deepEqual(await page.evaluate(()=>window.guestSent.map(m=>m.cmd)),['osLaunch']);
        }
      }
      assert.deepEqual(errors,[]);
      console.log(`${cores}-core page guest readiness ${outcome}: source waits for API, file waits for disk, requests transfer once or cancel without transfer.`);
    } finally {releaseBoot();releaseDisk();await context.close();}
  }
} finally {
  await browser.close();site.closeAllConnections();await new Promise(resolve=>site.close(resolve));
}
