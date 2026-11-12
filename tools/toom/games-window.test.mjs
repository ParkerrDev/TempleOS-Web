//TOOM as a visitor starts it: the Games window's Run in TempleOS installs the
//catalog package through the production installer, and the game must show
//its HUD and draw new views while the player turns and walks.
//  node tools/toom/games-window.test.mjs [site url]	(default: this checkout)
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {root} from './Assets.mjs';

const out=resolve(process.env.OUT||'/tmp/toom-games-window');
const {BrowserMachine}=await import(pathToFileURL(resolve(root,'tools/hemu/BrowserMachine.mjs')));
const {TextRow}=await import(pathToFileURL(resolve(root,'tools/hemu/WorkerHost.mjs')));
let url=process.argv[2],server;
if(!url) {
  const {ServeReq}=await import(pathToFileURL(resolve(root,'server.mjs')));
  server=createServer(ServeReq).listen(0,'127.0.0.1');await once(server,'listening');
  url=`http://127.0.0.1:${server.address().port}/`;
}
const browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
  const context=await browser.newContext({viewport:{width:1440,height:900}}),errors=[];
  await BrowserMachine(context);
  await context.addInitScript(()=>{//Count the frames HEMU sends, and the ones whose 3D view changed.
    window.vga={frames:0,changes:0,last:0};
    const Base=Worker;
    window.Worker=class extends Base {
      constructor(...args) {
        super(...args);
        this.addEventListener('message',({data:m})=>{
          if(m.cmd!=='frame'||!m.buf)return;
          const b=new Uint8Array(m.buf);let h=0;
          for(let y=Math.floor(m.h*0.2);y<m.h*0.6;y+=3)for(let x=Math.floor(m.w*0.25);x<m.w*0.75;x+=5)h=(h*31+b[y*m.w+x])|0;
          Object.assign(window.vga,{buf:b,w:m.w,h:m.h});window.vga.frames++;
          if(h!==window.vga.last){window.vga.changes++;window.vga.last=h;}
        });
      }
    };
  });
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  async function Text() {
    const f=await page.evaluate(()=>window.vga.buf&&{w:window.vga.w,h:window.vga.h,buf:Array.from(window.vga.buf)});
    if(!f)return '';
    const buf=Uint8Array.from(f.buf);let res='';
    for(const [x,y] of [[0,0],[0,4],[4,0],[4,4]])
      for(let r=0;r<Math.floor((f.h-y)/8);r++)res+=TextRow(buf.subarray(y*f.w+x),f.w,r)+'\n';
    return res;
  }
  const Count=()=>page.evaluate(()=>({frames:window.vga.frames,changes:window.vga.changes}));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.getElementById('loadui')?.style.display==='none',null,{timeout:90000});
  await page.evaluate(()=>document.getElementById('gamesBtn').click());
  const card=page.locator('#gmGrid > *').filter({hasText:'TOOM'}).first();
  await card.getByText('Run in TempleOS').click();
  const start=performance.now();
  let text='';
  while(performance.now()-start<180000 && !/ARROWS\/WASD MOVE/.test(text=await Text())) {
    const faults=await page.evaluate(()=>window.machine.events.filter(m=>m.cmd==='error'||m.state==='failed'));
    assert.deepEqual(faults,[]);
    assert.doesNotMatch(await page.evaluate(()=>document.getElementById('gmToastBody')?.textContent||''),/Could not|failed/i);
    await page.waitForTimeout(250);
  }
  assert.match(text,/ARROWS\/WASD MOVE/,'TOOM did not show its HUD.');
  assert.match(text,/E1M1/);
  const playableMs=Math.round(performance.now()-start);
  await page.locator('#canvas').click();
  await page.screenshot({path:resolve(out+'-start.png')}).catch(()=>{});
  const rates={};
  for(const [name,key] of [['turn','ArrowLeft'],['walk','ArrowUp']]) {
    await page.keyboard.down(key);
    const a=await Count(),t=performance.now();
    await page.waitForTimeout(6000);
    const b=await Count(),sec=(performance.now()-t)/1000;
    await page.keyboard.up(key);
    rates[name]={screen:+((b.frames-a.frames)/sec).toFixed(1),view:+((b.changes-a.changes)/sec).toFixed(1)};
    assert(rates[name].view>=5,`${name}: the 3D view changed ${rates[name].view} times a second.`);
  }
  await page.screenshot({path:resolve(out+'-play.png')}).catch(()=>{});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({url,playableMs,rates},null,2));
} finally {await browser.close();server?.close();}
