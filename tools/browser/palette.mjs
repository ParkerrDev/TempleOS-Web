import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright-core';
const site=new URL('../../',import.meta.url);
const server=spawn(process.execPath,['server.mjs'],{cwd:site,env:{...process.env,PORT:'8185'},stdio:['ignore','pipe','inherit']});
await once(server.stdout,'data');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
 await context.route('**/hemu/*.gz',r=>r.abort());
 await context.route('https://templeosweb-*.workers.dev/**',r=>r.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:8185/',{waitUntil:'load'});
 await page.locator('#editorBtn').click();await page.waitForFunction(()=>!!window.__holycEditor);
 const red=[170,0,0,255],green=[0,255,0,255];
 async function pixel(expected){
  try{await page.waitForFunction(expected=>{const a=Array.from(document.getElementById('screen').getContext('2d').getImageData(0,0,1,1).data);return a.every((v,i)=>v===expected[i]);},expected,{timeout:10000});}
  catch(error){throw new Error(await page.locator('#console').innerText()+'; '+await page.locator('#status').innerText(),{cause:error});}
 }
 async function run(source){
  await page.evaluate(()=>__holycEditor.stop());await page.locator('#editor').fill(source);await page.locator('#runBtn').click();
 }
 await run('gr.dc->color=RED; GrRect(,0,0,20,20); "READY\\n"; GetKey; GrPaletteColorSet(RED,0x0000FFFF0000); "GREEN\\n"; GetKey; PaletteSetStd; "RESTORED\\n"; GetKey;');
 await page.waitForFunction(()=>document.getElementById('console').textContent.includes('READY'));await pixel(red);
 await page.locator('#screen').focus();await page.keyboard.press('a');
 await page.waitForFunction(()=>document.getElementById('console').textContent.includes('GREEN'));await pixel(green);
 await page.keyboard.press('a');await page.waitForFunction(()=>document.getElementById('console').textContent.includes('RESTORED'));await pixel(red);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!__holycEditor.isRunning());
 await run('gr.dc->color=RED; GrRect(,0,0,20,20); GrPaletteColorSet(RED,0x0000FFFF0000);');
 await page.waitForFunction(()=>!__holycEditor.isRunning());await pixel(green);
 await run('gr.dc->color=RED; GrRect(,0,0,20,20);');
 await page.waitForFunction(()=>!__holycEditor.isRunning());await pixel(red);
 assert.deepEqual(errors,[]);
 console.log('Native browser palette: existing pixels recolor while waiting, standard restore, finite legacy presentation and clean rerun pass.');
}finally{await browser.close();server.kill();await once(server,'exit');}
