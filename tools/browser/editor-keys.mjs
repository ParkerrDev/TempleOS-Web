import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright-core';
const site=new URL('../../',import.meta.url).pathname;
const server=spawn(process.execPath,['server.mjs'],{cwd:site,env:{...process.env,PORT:'8183'},stdio:['ignore','pipe','inherit']});
await once(server.stdout,'data');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:1280,height:900},hasTouch:true,serviceWorkers:'block'});
 await context.route('**/hemu/*.gz',r=>r.abort());
 await context.route('https://templeosweb-*.workers.dev/**',r=>r.abort());
 await context.addInitScript(()=>{
  const Base=Worker;window.workerEvents=[];window.holdInput=false;
  window.Worker=class extends Base{
   constructor(...args){super(...args);this.addEventListener('message',e=>window.workerEvents.push(e.data));}
   postMessage(m,...args){
    if(m.type==='run'){window.inputWorker=this;window.inputCtrl=new Int32Array(m.controlSAB);}
    if(m.type==='input' && window.holdInput)return;
    return super.postMessage(m,...args);
   }
  };
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:8183/',{waitUntil:'load'});
 await page.locator('#editorBtn').click();
 await page.waitForFunction(()=>!!window.__holycEditor);
 await page.evaluate(async()=>{const protocol=await import('/holyc-wasm/src/runtime/protocol.js');window.packet=protocol.KEY_PACKET;window.control=protocol.CTRL;});
 async function run(source){
  await page.evaluate(()=>{__holycEditor.stop();workerEvents=[];holdInput=false;});
  await page.locator('#editor').fill(source);
  await page.locator('#runBtn').click();
 }
 async function ready(){
  try{await page.waitForFunction(()=>document.getElementById('console').textContent.includes('READY') && workerEvents.some(m=>m.type==='keyboardMode'&&m.native) && Atomics.load(inputCtrl,packet.RESET)===Atomics.load(inputCtrl,packet.ACK),null,{timeout:10000});}
  catch(error){throw new Error(JSON.stringify(await page.evaluate(()=>({text:document.getElementById('console').textContent,status:document.getElementById('status').textContent,events:workerEvents}))),{cause:error});}
  await page.locator('#screen').focus();
 }
 const keys='I64 ch,sc; "READY\\n"; while(TRUE) {ch=GetKey(&sc); "KEY:%d:%X\\n",ch,sc; if(ch==27) break;}';
 await run(keys);await ready();
 await page.keyboard.down('Shift');await page.keyboard.press('Escape');await page.keyboard.press('Space');await page.keyboard.up('Shift');
 await page.keyboard.press('ArrowLeft');await page.keyboard.down('a');await page.keyboard.down('a');await page.keyboard.up('a');await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!__holycEditor.isRunning());
 const text=await page.locator('#console').innerText();
 assert.deepEqual([...text.matchAll(/KEY:(\d+):/g)].map(m=>Number(m[1])),[0,28,31,0,97,97,27],text);
 console.log('Native GetKey: modifiers, extended arrow, repeats and idle worker wake pass.');
 await run('I64 ch; gr.dc->color=RED; GrRect(,0,0,20,20); "READY\\n"; while(TRUE) {ch=GetKey; if(ch==27) break; "HIT:%d\\n",ch;}');await ready();
 await page.waitForFunction(()=>{const c=document.getElementById('screen').getContext('2d').getImageData(0,0,1,1).data;return c[0]===170&&c[1]===0&&c[2]===0;});
 const frames=await page.evaluate(()=>Atomics.load(inputCtrl,control.FRAME));
 await page.keyboard.press('a');await page.waitForFunction(()=>document.getElementById('console').textContent.includes('HIT:97'));
 assert.equal(await page.evaluate(()=>Atomics.load(inputCtrl,control.FRAME)),frames,'key wakeups do not inflate display frames');
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!__holycEditor.isRunning());
 console.log('Pending graphics display before GetKey; input-only wakeups do not count as frames.');

 await run('"READY\\n"; while(!Bt(kbd.down_bitmap,SC_CURSOR_LEFT)) Sleep(1); "DOWN\\n"; while(Bt(kbd.down_bitmap,SC_CURSOR_LEFT)) Sleep(1); "UP\\n";');await ready();
 await page.keyboard.down('ArrowLeft');await page.waitForFunction(()=>document.getElementById('console').textContent.includes('DOWN'));
 await page.locator('#editor').focus();await page.waitForFunction(()=>document.getElementById('console').textContent.includes('UP'));
 await page.keyboard.up('ArrowLeft');await page.waitForFunction(()=>!__holycEditor.isRunning());
 console.log('Native bitmap polling and focus-loss release pass.');
 await run(keys);await ready();
 await page.evaluate(()=>{
  holdInput=true;
  for(let i=0;i<300;i++)dispatchEvent(new KeyboardEvent('keydown',{key:'a',code:'KeyA',repeat:i>0,cancelable:true}));
 });
 assert(await page.evaluate(()=>Atomics.load(inputCtrl,packet.OVERFLOW)>0));
 await page.evaluate(()=>{holdInput=false;inputWorker.postMessage({type:'input'});});
 await page.waitForFunction(()=>Atomics.load(inputCtrl,packet.RESET)===Atomics.load(inputCtrl,packet.ACK));
 await page.keyboard.press('a');await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!__holycEditor.isRunning());
 const after=await page.locator('#console').innerText();
 assert.deepEqual([...after.matchAll(/KEY:(\d+):/g)].map(m=>Number(m[1])),[97,27],after);
 console.log('Full raw-key queue resets held UI sources and recovers before later keys.');
 await run('U0 Child(U8 *) {Sleep(5);throw(73);} Spawn(&Child,,,,Fs); "READY\\n"; GetKey;');
 await page.waitForFunction(()=>document.getElementById('console').textContent.includes('[error]') && !__holycEditor.isRunning());
 console.log('Native child fault terminates its waiting session and reports an error.');
 await run('I64 sc,ch; "READY\\n"; ch=GetChar(&sc,FALSE); "CHAR:%d\\n",ch;');await ready();
 await page.keyboard.press('ArrowLeft');await page.keyboard.press('a');
 await page.waitForFunction(()=>document.getElementById('console').textContent.includes('CHAR:97') && !__holycEditor.isRunning());
 console.log('Native GetChar ignores zero-character keys and wakes on a character.');
 await run('I64 Side() {"SHOULD_NOT_RUN\\n";return 1;} I64 side=Side; U0 Child(U8 *) {Sleep(1);} Spawn(&Child); ScanChar;');
 await page.waitForFunction(()=>document.getElementById('console').textContent.includes('[error]') && !__holycEditor.isRunning());
 const refused=await page.locator('#console').innerText();assert.match(refused,/ScanChar is not yet supported/);assert(!refused.includes('SHOULD_NOT_RUN'));
 await context.route('**/editor/worker.js',route=>route.abort(),{times:1});
 await run('"NEVER\\n";');
 await page.waitForFunction(()=>document.getElementById('console').textContent.includes('[error]') && !__holycEditor.isRunning());
 assert.match(await page.locator('#console').innerText(),/worker could not start/);
 console.log('A failed worker module load reports an error and restores Run.');
 assert.deepEqual(errors,[]);
 await run(String.raw`"READY\n"; try {while(TRUE) GetKey;} catch {"BROKEN:%d\n",Fs->except_ch=='Break'; Fs->catch_except=TRUE;}`);await ready();
 await page.keyboard.press('Control+Alt+c');
 await page.waitForFunction(()=>!__holycEditor.isRunning());
 assert.match(await page.locator('#console').innerText(),/BROKEN:1/);
 assert(!/\[error\]/.test(await page.locator('#console').innerText()));
 console.log('Physical Ctrl-Alt-C enters the waiting program’s native Break catch and returns cleanly.');
 await page.setViewportSize({width:390,height:844});
 await run(keys);await ready();
 const bar=page.locator('#keysbar');
 await bar.getByRole('button',{name:'Shift',exact:true}).tap();
 await bar.getByRole('button',{name:'Esc',exact:true}).tap();
 await bar.getByRole('button',{name:'Space',exact:true}).tap();
 await bar.getByRole('button',{name:'Esc',exact:true}).tap();
 await page.waitForFunction(()=>!__holycEditor.isRunning());
 const mobile=await page.locator('#console').innerText();
 assert.deepEqual([...mobile.matchAll(/KEY:(\d+):/g)].map(m=>Number(m[1])),[0,28,32,27],mobile);
 assert.equal(await bar.getByRole('button',{name:'Shift',exact:true}).getAttribute('aria-pressed'),'false');
 await run('I64 sc=Char2ScanCode(32); "READY\\n"; while(!Bt(kbd.down_bitmap,sc.u8[0])) Sleep(1); "DOWN\\n"; while(Bt(kbd.down_bitmap,sc.u8[0])) Sleep(1); "UP\\n";');await ready();
 await page.keyboard.down('Space');await page.waitForFunction(()=>document.getElementById('console').textContent.includes('DOWN'));
 await bar.getByRole('button',{name:'Space',exact:true}).tap();
 assert(!/UP/.test(await page.locator('#console').innerText()),'A screen-key release cannot release a physical hold.');
 await page.keyboard.up('Space');await page.waitForFunction(()=>!__holycEditor.isRunning());
 assert.match(await page.locator('#console').innerText(),/UP/);
 await run('U8 BrowserKeys[128]; "READY\\n"; while(!BrowserKeys[0x39]) Sleep(1); "DOWN\\n"; while(BrowserKeys[0x39]) Sleep(1); "UP\\n";');
 await page.waitForFunction(()=>document.getElementById('console').textContent.includes('READY'));
 await page.locator('#screen').focus();
 const space=bar.getByRole('button',{name:'Space',exact:true});await space.scrollIntoViewIfNeeded();
 const box=await space.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 await page.waitForFunction(()=>document.getElementById('console').textContent.includes('DOWN'));
 await page.mouse.up();await page.waitForFunction(()=>!__holycEditor.isRunning());
 assert.match(await page.locator('#console').innerText(),/UP/);
 assert.deepEqual(errors,[]);
 await run('I64 ch; "READY\\n"; while(TRUE) {ch=KeyGet; "CHAR:%d\\n",ch; if(ch==27) break;}');
 await page.waitForFunction(()=>document.getElementById('console').textContent.includes('READY'));
 await page.locator('#screen').focus();
 await bar.getByRole('button',{name:'Shift',exact:true}).tap();
 await bar.getByRole('button',{name:'Space',exact:true}).tap();
 await bar.getByRole('button',{name:'Esc',exact:true}).tap();
 await page.waitForFunction(()=>!__holycEditor.isRunning());
 const legacy=await page.locator('#console').innerText();
 assert.deepEqual([...legacy.matchAll(/CHAR:(\d+)/g)].map(m=>Number(m[1])),[31,27],legacy);
 assert.deepEqual(errors,[]);
 console.log('On-screen mobile keys reach native and legacy previews, preserve physical holds and clear modifiers.');
 console.log('Unsupported blocking import refuses before source initialization; no page errors.');
}finally{await browser.close();server.kill();await once(server,'exit');}
