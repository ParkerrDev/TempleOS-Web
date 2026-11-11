import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {BrowserInputs,Hash,root} from '../games/BrowserEvidence.mjs';

const write=process.argv.includes('--write'),file=new URL('games/browser-checks.json',root);
const inputs=await BrowserInputs(),evidence={format:1,...inputs,programs:{}};
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:'8184'},stdio:['ignore','pipe','inherit']});
await once(server.stdout,'data');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
 await context.route('**/hemu/*.gz',r=>r.abort());
 await context.route('https://templeosweb-*.workers.dev/**',r=>r.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:8184/',{waitUntil:'load'});
 for(const [name,key]of[['HolyCraft','w'],['Babel','Space'],['Volley','Space'],['Snake','w']]){
  await page.locator('#gamesBtn').click();
  await page.locator('#gmSearch').fill(name);
  const card=page.locator('.gm-card').filter({has:page.getByRole('heading',{name,exact:true})});
  await card.getByRole('button',{name:'Edit source',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('editorRuntimeInfo').textContent.startsWith('Edit, Run') && !document.getElementById('editor').disabled);
  await page.locator('#gameRun').click();
  try{await page.waitForFunction(()=>/HolyC-WASM: (compiled|running)/.test(document.getElementById('gamePreviewStatus').textContent),null,{timeout:30000});}
  catch(error){throw new Error(name+' launch: '+await page.locator('#gamePreviewStatus').innerText()+'; '+await page.locator('#console').innerText(),{cause:error});}
  const sample=()=>page.locator('#screen').evaluate(c=>{
   const a=c.getContext('2d').getImageData(0,0,640,480).data,colors=new Set();let hash=0;
   for(let i=0;i<a.length;i+=4){const color=a[i]+256*a[i+1]+65536*a[i+2];hash=(Math.imul(hash,65599)+color)>>>0;colors.add(color);}
   return {hash,colors:colors.size};
  });
  await page.waitForFunction(()=>{const a=document.getElementById('screen').getContext('2d').getImageData(0,0,640,480).data,colors=new Set();for(let i=0;i<a.length;i+=4)colors.add(a[i]+256*a[i+1]+65536*a[i+2]);return colors.size>=3;},null,{timeout:10000});
  const before=await sample();
  await page.locator('#screen').focus();await page.keyboard.down(key);await page.waitForTimeout(350);await page.keyboard.up(key);await page.waitForTimeout(250);
  assert.notEqual((await sample()).hash,before.hash,name+' renders advancing frames');
  assert(await page.evaluate(()=>__holycEditor.isRunning()),name+' worker stays alive');
  assert(!/\[error\]/.test(await page.locator('#console').innerText()),name+' has no worker errors');
  const project=await page.evaluate(async name=>{
   const {GAMES}=await import('/GameCatalog.js'),{gameProject}=await import('/game-source.js');
   const game=GAMES.find(game=>game.name===name);
   return {id:game.packageId||game.file,source:await (await gameProject(game)).native()};
  },name);
  evidence.programs[project.id]={sourceSha256:Hash(JSON.stringify(project.source)),startup:true};
  await page.locator('#gameStop').click();
  assert(!await page.evaluate(()=>__holycEditor.isRunning()),name+' stops its worker');
  await page.locator('#editorClose').click();
  console.log(name+': actual editor worker starts, renders advancing frames and stops.');
 }
 const gate=await context.newPage();
 await gate.route('**/games/compatibility.json',route=>route.fulfill({json:{programs:{
  'HolyCraft.HC':{compile:true,browserStartup:false},
  'Babel.HC':{compile:true,browserStartup:true}
 }}}));
 await gate.goto('http://localhost:8184/',{waitUntil:'load'});
 await gate.locator('#gamesBtn').click();
 const button=name=>gate.locator('.gm-card').filter({has:gate.getByRole('heading',{name,exact:true})}).locator('.gm-play').first();
 await button('HolyCraft').waitFor({state:'attached'});
 assert(await button('HolyCraft').isDisabled(),'Compilation alone must not enable browser launch.');
 assert(await button('Babel').isEnabled(),'Recorded startup evidence enables browser launch.');
 await gate.unroute('**/games/compatibility.json');
 await gate.route('**/games/compatibility.json',route=>route.fulfill({status:503,body:'unavailable'}));
 await gate.reload({waitUntil:'load'});
 await gate.locator('#gamesBtn').click();
 await button('Babel').waitFor({state:'attached'});
 assert(await button('Babel').isDisabled(),'Missing evidence must not enable browser launch.');
 await gate.close();
 assert.deepEqual(errors,[]);
 assert.deepEqual(await BrowserInputs(),inputs,'Runtime changed during browser checks.');
 if(write)await writeFile(file,JSON.stringify(evidence,null,2)+'\n');
 else assert.deepEqual(JSON.parse(await readFile(file)),evidence,'Browser startup evidence is stale.');
 console.log('Startup checks do not establish keyboard response or gameplay parity.');
}finally{await browser.close();server.kill();await once(server,'exit');}
