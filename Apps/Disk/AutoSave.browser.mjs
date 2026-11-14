import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {chromium} from 'playwright-core';
import {ServeReq} from '../../Misc/Server.mjs';
import {BrowserMachine} from '../../Kernel/Test/BrowserMachine.mjs';
const site=createServer(ServeReq).listen(0,'127.0.0.1');
await once(site,'listening');
const url='http://127.0.0.1:'+site.address().port;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
  for(const cores of [1,4]) {
    const context=await browser.newContext();
    await BrowserMachine(context);
    let page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url+(cores===1?'/?single':'/?smp'));
    await page.waitForFunction(()=>window.machine.events.some(m=>m.cmd==='diskInfo'&&m.diskReady),null,{timeout:120000});
    const write=await page.evaluate(async()=>{
      const os=await import('/Adam/Os.js');
      return os.OsFileWrite('C:/Home/Persist.HC',new TextEncoder().encode('"saved automatically";\n').buffer);
    });
    assert.equal(write.ok,true,write.msg);
    await page.evaluate(async()=>{(await import("/Apps/Disk/DiskWin.js")).Open();});
    await page.waitForFunction(()=>document.querySelector("#diskSaveStatus")?.textContent==="C: saved in this browser.");
    await page.click("#diskClose");
    await page.click('#restartBtn');
    await page.waitForFunction(()=>window.machine.events.filter(m=>m.cmd==='diskInfo'&&m.diskReady).length>=2,null,{timeout:120000});
    async function Check() {
      const list=await page.evaluate(async()=>{const os=await import('/Adam/Os.js');return os.OsDirList('Home');});
      assert.equal(list.ok,true,list.msg);assert(list.files.some(f=>f.name==='Persist.HC'));
    }
    await Check();
    await page.close();page=await context.newPage();
    await page.goto(url+(cores===1?'/?single':'/?smp'));
    await page.waitForFunction(()=>window.machine.events.some(m=>m.cmd==='diskInfo'&&m.diskReady),null,{timeout:120000});
    await Check();
    const second=await context.newPage();await second.goto(url+'/?single');
    await second.evaluate(async()=>{(await import('/Apps/Disk/DiskWin.js')).Open();});
    await second.waitForFunction(()=>document.querySelector('#diskSaveStatus')?.textContent.includes('another tab'),null,{timeout:120000});
    assert.deepEqual(errors,[]);
    console.log(cores+' cores: guest file survives restart and tab close/reopen; concurrent writer refused.');
    await context.close();
  }
} finally {await browser.close();site.closeAllConnections();site.close();}
