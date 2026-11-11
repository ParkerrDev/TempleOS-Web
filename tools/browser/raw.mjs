import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright-core';
import {compileHolyC} from '../../holyc-wasm/src/compiler.js';
import {createHost} from '../../holyc-wasm/src/runtime/host.js';
import {Framebuffer} from '../../holyc-wasm/src/runtime/graphics.js';
const site=new URL('../../',import.meta.url);
const draw=`text.raw_flags=RWF_SCROLL|RWF_SHOW_DOLLAR;
RawPutChar('F');`,scroll=`I64 i; text.raw_col=4799;
for(i=0;i<100;i++) RawPutChar('A'+i%26);
RawPutChar('\\t');RawPutChar('\\n');RawPutChar(CH_BACKSPACE);RawPutChar('!');`;
function expected(source){
  const frame=new Framebuffer(null),host=createHost({gfx:frame,onText:()=>{}}),result=compileHolyC(source,{lenient:false});
  assert.deepEqual(result.warnings,[]);
  const instance=new WebAssembly.Instance(new WebAssembly.Module(result.bytes),{env:host.env});
  host.attach(instance);instance.exports.__main();return Array.from(frame.indices);
}
const glyph=expected(draw),scrolled=expected(draw+scroll);
const server=spawn(process.execPath,['server.mjs'],{cwd:site,env:{...process.env,PORT:'8186'},stdio:['ignore','pipe','inherit']});
await once(server.stdout,'data');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
 await context.route('**/hemu/*.gz',r=>r.abort());
 await context.route('https://templeosweb-*.workers.dev/**',r=>r.abort());
 await context.addInitScript(()=>{
  const Base=Worker;
  window.Worker=class extends Base{
   postMessage(message,...args){
    if(message.type==='run')window.rawCtrl=new Int32Array(message.controlSAB);
    return super.postMessage(message,...args);
   }
  };
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:8186/',{waitUntil:'load'});
 await page.locator('#editorBtn').click();await page.waitForFunction(()=>!!window.__holycEditor);
 await page.evaluate(async()=>{
  window.rawProtocol=(await import('/holyc-wasm/src/runtime/protocol.js')).CTRL;
  const {Framebuffer}=await import('/holyc-wasm/src/runtime/graphics.js'),present=Framebuffer.prototype.present;
  window.rawPresentCount=0;
  Framebuffer.prototype.present=function(...args){rawPresentCount++;return present.apply(this,args);};
 });
 async function run(source){await page.evaluate(()=>{__holycEditor.stop();rawPresentCount=0;window.__nativeFps=0;});await page.locator('#editor').fill(source);await page.locator('#runBtn').click();}
 async function text(label){
  try{await page.waitForFunction(label=>document.getElementById('console').textContent.includes(label),label,{timeout:10000});}
  catch(error){throw new Error(await page.locator('#console').innerText(),{cause:error});}
 }
 async function pixels(expected,white=[255,255,255]){
  try{await page.waitForFunction(({expected,white})=>{
   const data=document.getElementById('screen').getContext('2d').getImageData(0,0,640,480).data;
   for(let i=0;i<expected.length;i++){
    const color=expected[i]?white:[0,0,0];
    if(data[4*i]!==color[0]||data[4*i+1]!==color[1]||data[4*i+2]!==color[2]||data[4*i+3]!==255)return false;
   }
   return true;
  },{expected,white},{timeout:10000});}catch(error){
    const actual=await page.evaluate(({expected,white})=>{
      const d=document.getElementById('screen').getContext('2d').getImageData(0,0,640,480).data,mismatch=[];
      for(let i=0;i<expected.length&&mismatch.length<12;i++){
        const c=expected[i]?white:[0,0,0];
        if(d[4*i]!==c[0]||d[4*i+1]!==c[1]||d[4*i+2]!==c[2]||d[4*i+3]!==255)mismatch.push([i,expected[i],Array.from(d.slice(4*i,4*i+4))]);
      }
      return {mismatch,console:document.getElementById('console').textContent,status:document.getElementById('status').textContent};
    },{expected,white});
    throw new Error(JSON.stringify(actual),{cause:error});
  }
 }
 // Block on a real key first so the main thread has presented the initial
 // blank frame. Then raw output must publish even while the worker cannot yield.
 await run('gr.dc->color=BLACK; GrRect(,0,0,640,480); "READY\\n"; GetKey;'+draw+'"BUSY\\n"; while(TRUE);');
 await text('READY');await pixels(Array(640*480).fill(0));
 const before=await page.evaluate(()=>Atomics.load(rawCtrl,rawProtocol.FRAME));
 await page.locator('#screen').focus();await page.keyboard.press('a');
 await text('BUSY');await pixels(glyph);
 assert(await page.evaluate(before=>Atomics.load(rawCtrl,rawProtocol.FRAME)>before,before),
  'Raw output must publish a frame without yielding.');
 await run(draw+scroll+'"SCROLL\\n"; GetKey; GrPaletteColorSet(WHITE,0xFFFF00000000); "RED\\n"; GetKey;');
 await page.locator('#screen').focus();
 await text('SCROLL');await pixels(scrolled);
 await page.waitForFunction(()=>window.__nativeFps>0);
 const rate=await page.evaluate(()=>({fps:__nativeFps,presents:rawPresentCount,updates:Atomics.load(rawCtrl,rawProtocol.FRAME)}));
 assert(rate.updates>=100,'The complete diagnostic burst reached the shared screen.');
 assert(rate.fps<=rate.presents,'FPS counts presented frames, not individual raw glyph updates: '+JSON.stringify(rate));
 await page.keyboard.press('a');
 await text('RED');await pixels(scrolled,[255,0,0]);await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!__holycEditor.isRunning());
 await run(draw);await page.waitForFunction(()=>!__holycEditor.isRunning());await pixels(glyph);
 assert.deepEqual(errors,[]);
 console.log('Raw browser device: visible during non-yielding loop, full native-cache-derived scroll image, palette, displayed FPS and clean finite rerun pass.');
}finally{await browser.close();server.kill();await once(server,'exit');}
