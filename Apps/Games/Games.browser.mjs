import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {BrowserInputs,Hash,root} from '../../Demo/Games/Test/BrowserEvidence.mjs';
import {START_WAIT,START_QUIT} from '../../Demo/Games/Test/Install.mjs';
import {FrameRle,KEYS,MS_START,PlayEnd,PlayEvents,PlayRecord,SnapSave} from '../../Demo/Games/Test/Play.mjs';
import {PlayCompare,PlayVerdict} from '../../Demo/Games/Test/PlayCmp.mjs';
import {CTRL,KEY_PACKET} from '../../hemu/holyc-wasm/src/runtime/protocol.js';

//Every Games entry that HolyC-WASM compiles, run from its Games window card as
//Run in Browser does, and every program of Apps/Programs.js the browser runs,
//from the editor's Run or the God Tools window, each played by its script
//(Apps/Games/GamePlays.js), with a control run without the input, as
//Demo/Games/Test/Start.mjs plays it in V5.03 and HEMU. Usage:
//  node Apps/Games/Games.browser.mjs [--write] [NAME...]
//--write writes Demo/Games/BrowserChks.json and the browser part of
//Demo/Games/Play.json, with names only theirs; each run keeps inputsSha256,
//the hash of the browser inputs it was made with. Without it, every entry
//Play.json says plays in the browser must still play. The page's gates are
//given a Play.json and a Compatibility.json that pass all, as the checks are
//what make them.
//Frames go to OUT (tmp/games/browser/); the site is served on PORT, or on a
//free port. JOBS runs up to four entries at once (default one).
globalThis.fetch=async url=>new Response(await readFile(new URL(url,root)));
globalThis.localStorage={getItem:()=>null};
const {gameProject}=await import('./GameSrc.js'),
 {ENTRIES,PROGRAMS,ProgramSrc,STARTER}=await import('../Programs.js'),
 {compileProject}=await import('../../hemu/holyc-wasm/src/project.js');
const write=process.argv.includes('--write'),names=process.argv.slice(2).filter(a=>a!=='--write'),
 out=resolve(process.env.OUT||fileURLToPath(new URL('tmp/games/browser/',root))),
 file=new URL('Demo/Games/BrowserChks.json',root),playFile=new URL('Demo/Games/Play.json',root);
await mkdir(out,{recursive:true});
const jobs=Number(process.env.JOBS||1);
assert(Number.isInteger(jobs) && jobs>=1 && jobs<=4,'JOBS must be 1 to 4.');
const inputs=await BrowserInputs(),evidence={format:1,...inputs,programs:{}},games=[];
for(const game of names.length?names.map(name=>ENTRIES.find(g=>g.name===name)||assert.fail('Unknown entry: '+name)):ENTRIES){
 if(PROGRAMS.includes(game)){ //The editor compiles it on Run, and says so if it cannot.
  if(game.runs!=='templeos')games.push({game,id:game.file,sourceSha256:Hash(await ProgramSrc(game))});
  continue;
 }
 const project=await (await gameProject(game)).native();
 try{compileProject(project);}catch{continue;}
 games.push({game,id:game.packageId||game.file,sourceSha256:Hash(JSON.stringify(project))});
}
const port=process.env.PORT||await new Promise(done=>{const s=createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>done(p));});}),
 site='http://localhost:'+port+'/';
const server=spawn(process.execPath,['Misc/Server.mjs'],{cwd:root,env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','inherit']});
await once(server.stdout,'data');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});

async function Context()
{//A fresh profile, so no run restores the last one's game window.
 const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
 await context.route('**/hemu/*.gz',r=>r.abort()); //No snapshot: a browser run must need no HEMU.
 await context.route('https://templeosweb-*.workers.dev/**',r=>r.abort());
 await context.routeWebSocket(/^wss:\/\//,ws=>ws.close());
 await context.addInitScript(()=>{ //Sees the frame buffer the editor hands its worker.
  const post=Worker.prototype.postMessage;
  Worker.prototype.postMessage=function(m,...rest){
   if(m?.type==='run')window.__playFb={fb:new Uint8Array(m.fbSAB),ctrl:new Int32Array(m.controlSAB)};
   return post.call(this,m,...rest);
  };
 });
 await context.route('**/Demo/Games/Play.json',route=>route.fulfill({json:{games:ENTRIES.map(e=>
  ({name:e.name,verdict:{browserPlays:true,templeos:true}}))}}));
 await context.route('**/Demo/Games/Compatibility.json',route=>route.fulfill({json:{programs:
  Object.fromEntries(ENTRIES.map(e=>[e.packageId||e.file,{compile:true,browserStartup:true}]))}}));
 return context;
}

async function Launch(page,game)
{//Starts an entry as the site's button does: how to see it run and end.
 if(game.runs==='editor'){
  await page.locator('#editorBtn').click();
  await page.waitForFunction(()=>window.__holycEditor && !document.getElementById('editor').disabled);
  if(game.path){
   await page.locator('#demoSelect').selectOption(game.path.slice('Editor/'.length));
   await page.waitForFunction(()=>/^loaded /.test(document.getElementById('status').textContent));
  }else
   await page.waitForFunction(text=>document.getElementById('editor').value===text,STARTER);
  await page.locator('#runBtn').click();
  return {screen:'#screen',status:'#status',close:'#runBtn'};
 }
 await page.locator('#gamesBtn').click();
 await page.locator('#gmSearch').fill(game.name);
 const card=page.locator('.gm-card').filter({has:page.getByRole('heading',{name:game.name,exact:true})});
 await card.getByRole('button',{name:'Run in Browser',exact:true}).click();
 return {screen:'#gameWinSlot #screen',status:'#gameWinStatus',close:'#gameWinClose'};
}

async function God({game},kind)
{//A God Tools browser tool: its button, then what it put out. It takes no
//input, so a control and a play are the same run.
 const context=await Context(),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(site,{waitUntil:'load'});
 await page.locator('#godBtn').click();
 const button=page.locator('#godBar [data-action="'+game.action+'"]');
 await page.waitForFunction(b=>!b.disabled,await button.elementHandle());
 await button.click();
 let res;
 try{
  await page.waitForFunction(()=>document.getElementById('godOut').childElementCount>0,null,{timeout:60000});
  const text=await page.locator('#godOut').innerText();
  res={start:'returned',quit:'-',end:'-',snaps:[],detail:errors.join('; ')||undefined,text};
 }catch{
  res={start:'except',quit:'-',end:'-',snaps:[],detail:[await page.locator('#godStatus').innerText(),...errors].join('; ')};
 }
 await context.close();
 return res;
}

async function Run({game,id},kind)
{//One run of an entry's events, from the click that starts it to how it ended.
 if(game.runs==='god')return God({game},kind);
 const context=await Context(),page=await context.newPage(),errors=[],events=PlayEvents(game.name,kind),res={snaps:[]};
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(site,{waitUntil:'load'});
 const view=await Launch(page,game),
  running=()=>page.evaluate(()=>!!window.__holycEditor?.isRunning()),
  status=()=>page.locator(view.status).innerText(),
  //A HolyC throw is named as Start.mjs names it, from what the worker says.
  end=async()=>{
   if(!/error|could not/i.test(await status()))return 'returned';
   const ch=(await page.locator('#console').innerText()).match(/\[error\] Except:([^:\n]*):/);
   return ch?'except:'+ch[1]:'except';
  };
 //Measure from the worker entering the guest. Compiling and seeding FNAF
 //or a fresh editor task can take several seconds before its first tick.
 try{
  await page.waitForFunction(({RUNNING,DONE})=>{
   const ctrl=window.__playFb?.ctrl;
   return ctrl && (Atomics.load(ctrl,RUNNING) || Atomics.load(ctrl,DONE));
  },{RUNNING:CTRL.RUNNING,DONE:CTRL.DONE},{timeout:60000});
 }
 catch{
  res.start='never';res.quit=res.end='-';res.detail=await status();
  await context.close();return res;
 }
 //An editor program can finish before the first animation frame.
 if(!await running()){
  res.start=await end();res.quit=res.end='-';
  res.detail=errors.join('; ')||undefined;
  await context.close();return res;
 }
 const t0=Date.now(),screen=await page.locator(view.screen).boundingBox(),
  at=(x,y)=>[screen.x+(x+0.5)*screen.width/640,screen.y+(y+0.5)*screen.height/480];
 await page.mouse.move(...at(...MS_START));
 let base=START_WAIT*1000,i,ms={l:0,r:0},captured=false;
 for(i=0;i<events.length;i++){
  const ev=events[i];
  while(Date.now()-t0<base+ev.t && await running())await page.waitForTimeout(5);
  if(!await running())break;
  res.start='running';
  //A game that hides the mouse plays captured: a player's first click
  //captures it, and the browser takes a player's first Esc to release it
  //(App.js does the same with an Esc it sees). The check does both itself, as
  //a player would before the script's step, so its clicks and keys reach the
  //game as in V5.03. A release resets the key ring, which takes no key until
  //the worker acknowledges it, so the check waits for that as a player's
  //second Esc would.
  if(ev.op==='key' && ev.down && KEYS[ev.key][1]==='Escape')
   await Capture(page,true);
  else if(!captured)
   captured=await Capture(page,false);
  if(ev.op==='snap'){
   const snap=await page.evaluate(Snap);
   res.snaps.push({updates:snap.updates,...await SnapSave(resolve(out,id),'browser-'+kind+'-'+res.snaps.length,FrameRle(snap.rle))});
   base=Date.now()-t0-ev.t;
  }else if(ev.op==='key'){
   //The editor's screen takes keys once a player has clicked it.
   await page.locator(view.screen).evaluate(c=>c.ownerDocument.activeElement===c || c.focus({preventScroll:true}));
   await page.keyboard[ev.down?'down':'up'](KEYS[ev.key][1]);
  }
  else if(ev.op==='ms'){
   await page.mouse.move(...at(ev.x,ev.y));
   for(const [b,button] of [['l','left'],['r','right']])
    if(ev[b]!==ms[b])await page.mouse[ev[b]?'down':'up']({button});
   ms=ev;
  }else{
   const quit=Date.now();
   while(Date.now()-quit<START_QUIT*1000 && await running())await page.waitForTimeout(20);
   if(!await running())break;
   base=Date.now()-t0-ev.t; //What follows a quit counts from its end.
  }
 }
 if(!res.start){ //Over before START_WAIT, as Start.HC's START line says.
  res.start=await end();res.quit=res.end='-';
 }else{
  res.quit=PlayEnd(events,i);
  res.end=i<events.length?await end():'-';
 }
 if(i>=events.length){ //A player's Esc frees a captured mouse before the close click.
  await Capture(page,true);
  await page.locator(view.close).click();
 }
 res.detail=[...errors,...(await page.locator('#console').innerText()).match(/\[error\][^\n]*/g)||[]].join('; ')||undefined;
 await context.close();
 return res;
}

function Capture(page,esc)
{//Capture when the game first asks. After an Esc keep the mouse free until a
//player clicks it again. Recapturing on keyup resets the pending Esc packet.
 return page.evaluate(async ({esc,reset,ack})=>{
  const ed=window.__holycEditor,ctrl=window.__playFb.ctrl;
  if(esc?!ed.isMouseCaptured():!ed.captureWanted())return false;
  if(!esc && ed.isMouseCaptured())return true;
  const changed=new Promise(done=>{
   const finish=()=>{
    document.removeEventListener('pointerlockchange',finish);
    document.removeEventListener('pointerlockerror',finish);
    clearTimeout(timer);done();
   };
   const timer=setTimeout(finish,3000);
   document.addEventListener('pointerlockchange',finish);
   document.addEventListener('pointerlockerror',finish);
  });
  if(esc)ed.releaseMouse();
  else ed.captureMouse({automatic:true});
  await changed;
  for(let n=0;n<500 && Atomics.load(ctrl,reset)!==Atomics.load(ctrl,ack);n++)
   await new Promise(done=>setTimeout(done,10));
  return true;
 },{esc,reset:KEY_PACKET.RESET,ack:KEY_PACKET.ACK});
}

function Snap()
{//In the page: the next frame the worker publishes, as Start.HC's runs.
 const {fb,ctrl}=window.__playFb,FRAME=11,old=Atomics.load(ctrl,FRAME),t=performance.now();
 return new Promise(function (done){
  (function Try(){
   const seq=Atomics.load(ctrl,FRAME);
   if(seq&1 || seq===old && performance.now()-t<1000)return setTimeout(Try,2);
   const frame=fb.slice();
   if(Atomics.load(ctrl,FRAME)!==seq)return setTimeout(Try,2);
   let rle='';
   for(let i=0,j;i<frame.length;i=j){
    for(j=i+1;j<frame.length && (frame[j]&15)===(frame[i]&15);j++);
    rle+=String.fromCharCode(65+(frame[i]&15))+(j-i>1?j-i:'');
   }
   done({updates:seq>>>1,rle});
  })();
 });
}

async function Check(g)
{//Run both scripts for this game and retain their input and frame records.
  const [control,play]=await Promise.all([Run(g,'control'),Run(g,'play')]),
   r={...g,control:PlayRecord(control,'control'),play:PlayRecord(play,'play')};
  //The HolyC throw that ends a run, as one ends it in V5.03, is its end, not a fault.
  const ended=/^except:/.test(control.end)?'[error] Except:'+control.end.slice(7)+':':null;
  r.startup=control.start==='running' && control.quit!=='early' && r.control.snaps.length>0 && r.control.snaps.every(s=>+s.split(':')[1]>=2) &&
   (control.detail||'').split('; ').every(d=>!d || d===ended);
  await writeFile(resolve(out,g.id+'.json'),JSON.stringify({...r,detail:{control:control.detail,play:play.detail}},null,1)+'\n');
  const words=r=>[r.start,r.quit,r.end].join(' ');
  console.log(g.game.name+': browser '+words(control)+' / play '+words(play)+
   [control.detail,play.detail].filter(Boolean).map(d=>'; '+d).join(''));
  return r;
}

try{
 const results=new Array(games.length),pending=games.entries();
 await Promise.all(Array.from({length:Math.min(jobs,games.length)},async()=>{
  for(const [i,g] of pending)results[i]=await Check(g);
 }));
 for(const r of results)evidence.programs[r.id]={sourceSha256:r.sourceSha256,startup:r.startup};
 const context=await Context(),gate=await context.newPage(),
  mock=(name,json)=>gate.route('**/Demo/Games/'+name+'.json',route=>route.fulfill(json?{json}:{status:503,body:'unavailable'}));
 await mock('Compatibility',{programs:{'HolyCraft.HC':{compile:true,browserStartup:false},
  'Babel.HC':{compile:true,browserStartup:true},'Snake.HC':{compile:true,browserStartup:true}}});
 await mock('Startup',{games:[{name:'Babel',same:true,real:{run:'running',quit:'esc'}},
  {name:'Snake',same:true,real:{run:'running',quit:'esc'}}]});
 await mock('Play',{games:[{name:'Babel',verdict:{browserPlays:true,templeos:true}},
  {name:'Snake',verdict:{browserPlays:false,templeos:false}}]});
 await gate.goto(site,{waitUntil:'load'});
 await gate.locator('#gamesBtn').click();
 const button=(name,n)=>gate.locator('.gm-card').filter({has:gate.getByRole('heading',{name,exact:true})}).locator('.gm-play').nth(n);
 await button('HolyCraft',0).waitFor({state:'attached'});
 assert(await button('HolyCraft',0).isDisabled(),'Compilation alone must not enable browser launch.');
 assert(await button('Babel',0).isEnabled(),'Recorded startup and play evidence enables browser launch.');
 assert(await button('Babel',1).isEnabled(),'Recorded TempleOS play evidence enables TempleOS launch.');
 assert(await button('Snake',0).isDisabled(),'A failed browser play check must not enable browser launch.');
 assert(await button('Snake',1).isDisabled(),'A failed TempleOS play check must not enable TempleOS launch.');
 await gate.unroute('**/Demo/Games/Play.json');
 await mock('Play',null);
 await gate.reload({waitUntil:'load'});
 await gate.locator('#gamesOverlay.open').waitFor({state:'visible'});
 await button('Babel',0).waitFor({state:'attached'});
 assert(await button('Babel',0).isDisabled(),'Missing evidence must not enable browser launch.');
 assert(await button('Babel',1).isDisabled(),'Missing evidence must not enable TempleOS launch.');
 await gate.close();
 assert.deepEqual(await BrowserInputs(),inputs,'Runtime changed during browser checks.');
 if(write){
  const record=JSON.parse(await readFile(playFile)),made=Hash(JSON.stringify(inputs)),
   was=record.browser && Hash(JSON.stringify(record.browser)),
   old=JSON.parse(await readFile(file).catch(()=>'null'));
  if(names.length && old)evidence.programs={...old.programs,...evidence.programs};
  await writeFile(file,JSON.stringify(evidence,null,2)+'\n');
  record.browser=inputs;
  for(const g of record.games){
   const r=results.find(r=>r.game.name===g.name);
   if(r)g.browser={sourceSha256:r.sourceSha256,inputsSha256:made,control:r.control,play:r.play};
   else if(!names.length)g.browser=undefined;
   else if(g.browser && !g.browser.inputsSha256)g.browser.inputsSha256=was;
   g.verdict=PlayCompare(g);
  }
  await writeFile(playFile,JSON.stringify(record,null,1)+'\n');
 }else{ //Without --write: what the record says plays must still play.
  const record=JSON.parse(await readFile(playFile).catch(()=>'null'));
  for(const r of results){
   const g=record?.games.find(g=>g.name===r.game.name);
   assert(!g?.verdict.browserPlays || PlayCompare({...g,browser:{control:r.control,play:r.play}}).browserPlays,
    r.game.name+' no longer plays in the browser as Demo/Games/Play.json records.');
  }
 }
 const plays=results.filter(r=>{
  const v=PlayVerdict(r.play,r.control);
  return PROGRAMS.includes(r.game)?v.runs:v.plays;
 }).length;
 console.log(results.length+' of '+(names.length||ENTRIES.length)+' compile or are programs the browser runs; '+
  plays+' play or run in the browser.');
}finally{await browser.close();server.kill();await once(server,'exit');}
