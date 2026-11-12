import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {chromium} from 'playwright-core';
import {ServeReq} from '../../server.mjs';
import {BrowserMachine,MachinePost} from '../hemu/BrowserMachine.mjs';

const headers={'Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin'};
const root=new URL('../../',import.meta.url),site=createServer(ServeReq).listen(0,'127.0.0.1');
await once(site,'listening');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const worker=await readFile(new URL('engine/hemu-worker.js',root),'utf8'),
  diskBody=await readFile(new URL('vendor/images/templeos-hd.qcow2.gz',root));
function Replace(source,needle,value) {
  assert.equal(source.split(needle).length,2);return source.replace(needle,value);
}
async function Request(page,message,cmd) {
  const after=await page.evaluate(()=>window.machine.events.length);
  await MachinePost(page,message);
  await page.waitForFunction(({after,cmd})=>window.machine.events.slice(after).some(m=>m.cmd===cmd),{after,cmd});
  return page.evaluate(({after,cmd})=>{
    const m=window.machine.events.slice(after).find(m=>m.cmd===cmd);
    return m.buf?{...m,buf:[...new Uint8Array(m.buf)]}:m;
  },{after,cmd});
}
try {
  for(const cores of [1,4])for(const outcome of ['scheduled','success','failure']) {
    const context=await browser.newContext({viewport:{width:1280,height:800}});
    let releaseDisk=()=>{},fetches=0;
    try {
      await BrowserMachine(context);
      await context.addInitScript(()=>{
        const Base=Worker;
        window.Worker=class extends Base {
          postMessage(m,...args) {
            if(m.cmd==='init')m={...m,patches:false};
            return super.postMessage(m,...args);
          }
        };
      });
      let source=Replace(worker,'StockModuleCheck,StockDiskAside}', 'StockModuleCheck,StockDiskAside as diskLoad}');
      source+='\nasync function StockDiskAside(...args) {try{return await diskLoad(...args);}finally{setTimeout(()=>postMessage({cmd:"testDiskSettled"}),0);}}\n';
      if(outcome==='scheduled') {
        source=Replace(source,'setTimeout(async()=>{','globalThis.testDiskStart=async()=>{');
        source=Replace(source,'},diskDelay);','};');
        source+='\naddEventListener("message",e=>{if(e.data.cmd==="testDiskStart")testDiskStart().then(()=>postMessage({cmd:"testDiskSettled"}));});\n';
      }
      await context.route('**/engine/hemu-worker.js',route=>route.fulfill({body:source,contentType:'text/javascript',headers}));
      let held;
      const diskHeld=new Promise(resolve=>held=resolve);
      await context.route('**/vendor/images/templeos-hd.qcow2.gz',async route=>{
        fetches++;held();await new Promise(resolve=>releaseDisk=resolve);
        if(outcome==='failure')await route.abort();
        else await route.fulfill({body:diskBody,contentType:'application/gzip'});
      });
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(`http://127.0.0.1:${site.address().port}/?${cores===1?'single':'smp'}`);
      await page.waitForFunction(()=>window.machine.events.some(m=>m.cmd==='guestReady'&&m.ok));
      if(cores===4)await page.waitForFunction(()=>window.machine.events.some(m=>m.cmd==='smpReady')&&window.machine.events.some(m=>m.cmd==='busReady'&&m.ready));
      await Request(page,{cmd:'pause',value:true},'paused');
      if(outcome!=='scheduled')await diskHeld;
      const missing=await Request(page,{cmd:'listDir',id:'before-disk',dir:'Home'},'dirList');
      assert.equal(missing.ok,false);assert.match(missing.msg,/disk is not available/);
      const invalid=await Request(page,{cmd:'importDisk',bytes:[0x51,0x46,0x49,0xfb]},'diskInfo');
      assert.equal(invalid.ok,false);assert.equal(invalid.diskReady,false);assert.equal(invalid.diskPending,true);
      const bytes=Array.from({length:1024},(_,i)=>(i*11+9)&255);
      const imported=await Request(page,{cmd:'importDisk',bytes},'diskInfo');
      assert.equal(imported.ok,true);assert.equal(imported.diskReady,true);assert.equal(imported.diskPending,false);
      if(outcome==='scheduled')await Request(page,{cmd:'testDiskStart'},'testDiskSettled');
      else {
        releaseDisk();
        await page.waitForFunction(()=>window.machine.events.some(m=>m.cmd==='testDiskSettled'));
      }
      assert.equal(fetches,outcome==='scheduled'?0:1);
      const rejected=await Request(page,{cmd:'importDisk',bytes:[0x51,0x46,0x49,0xfb]},'diskInfo');
      assert.equal(rejected.ok,false);assert.equal(rejected.diskReady,true);assert.equal(rejected.diskPending,false);
      const saved=await Request(page,{cmd:'exportDisk'},'exportResult');
      assert.equal(saved.ok,true,saved.msg);
      assert.deepEqual([...gunzipSync(Uint8Array.from(saved.buf))],bytes);
      assert.deepEqual(errors,[]);
      const diskEvents=await page.evaluate(()=>window.machine.events.filter(m=>m.cmd==='diskInfo'));
      assert.equal(diskEvents.length,3,'obsolete download publishes no success or failure over the imported disk');
      console.log(`${cores}-core disk import survives ${outcome} default load; failed imports preserve loading and installed disks.`);
    } finally {releaseDisk();await context.close();}
  }
} finally {await browser.close();site.closeAllConnections();await new Promise(resolve=>site.close(resolve));}
