// The chat Worker (chat/ChatRoom.js) running in wrangler dev, on this machine only: nothing is deployed and the
// room's storage is a temporary folder. Needs wrangler 4 through npx. Run from the repository root.
//   node tools/chat-worker.test.mjs
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BURST,KEEP} from '../chat/rules.js';

const ORIGIN='http://chat.test',TOKEN='test-token';
const freePort=()=>new Promise((ok)=>{const s=createServer().listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(()=>ok(port));});});
const port=await freePort(),BASE=`http://127.0.0.1:${port}`;
const store=mkdtempSync(join(tmpdir(),'chat-worker-'));
const dev=spawn('npx',['--yes','wrangler@4','dev','--ip','127.0.0.1','--port',String(port),'--persist-to',store,
  '--var',`ORIGINS:${ORIGIN}`,'--var',`ADMIN_TOKEN:${TOKEN}`,'--show-interactive-dev-session=false','--log-level','warn'],
  {cwd:new URL('../chat/',import.meta.url),env:{...process.env,WRANGLER_SEND_METRICS:'false'},stdio:['ignore','pipe','pipe']});
let devLog='';
dev.stdout.on('data',(d)=>{devLog+=d;});
dev.stderr.on('data',(d)=>{devLog+=d;});
const stop=()=>{dev.kill();rmSync(store,{recursive:true,force:true});};

async function ready() {
  for(let i=0;i<120;i++){
    try{await fetch(BASE);return;}catch{}
    if(dev.exitCode!==null)break;
    await new Promise((r)=>setTimeout(r,500));
  }
  throw new Error('wrangler dev did not start:\n'+devLog);
}

let ids=0;
const newId=()=>(++ids).toString(16).padStart(32,'0');
function join_(id=newId(),{origin=ORIGIN,ip='198.51.100.1'}={}) {
  const ws=new WebSocket(`${BASE.replace('http','ws')}/?id=${id}`,{headers:{Origin:origin,'CF-Connecting-IP':ip}});
  const inbox=[],waiting=[];
  const opened=new Promise((ok,no)=>{ws.onopen=ok;ws.onerror=()=>no(new Error('refused'));});
  const closed=new Promise((ok)=>{ws.onclose=(e)=>ok({code:e.code,reason:e.reason});});
  opened.catch(()=>{});
  ws.onmessage=(e)=>{
    if(e.data==='pong'){inbox.push({t:'pong'});}
    else inbox.push(JSON.parse(e.data));
    for(const w of waiting.splice(0))w();
  };
  return {
    ws,opened,closed,id,
    say:(text,nick='tester')=>ws.send(JSON.stringify({t:'say',nick,text})),
    // the next event of type t (that `where` accepts), dropping anything before it
    async next(t,ms=5000,where=()=>true) {
      const until=Date.now()+ms;
      for(;;){
        const i=inbox.findIndex((m)=>m.t===t&&where(m));
        if(i>=0)return inbox.splice(0,i+1).at(-1);
        const left=until-Date.now();
        if(left<=0)throw new Error(`no ${t} within ${ms} ms; inbox: ${JSON.stringify(inbox)}`);
        await new Promise((ok)=>{const timer=setTimeout(ok,left);waiting.push(()=>{clearTimeout(timer);ok();});});
      }
    },
    none(t){assert.ok(!inbox.some((m)=>m.t===t),`unexpected ${t}: ${JSON.stringify(inbox)}`);},
    leave(){ws.close();return closed;},
  };
}
const admin=(body,token=TOKEN)=>fetch(`${BASE}/admin`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify(body)});

try {
  await ready();

  // who may connect
  await assert.rejects(join_(undefined,{origin:'https://evil.example'}).opened,'Another site cannot connect');
  await assert.rejects(join_('nothex').opened,'A malformed id cannot connect');
  assert.equal((await fetch(BASE,{headers:{Origin:ORIGIN}})).status,426,'Only WebSockets are served');

  // two people, an empty room, a message both see
  const a=join_(),b=join_(undefined,{ip:'198.51.100.2'});
  const helloA=await a.next('hello');
  assert.deepEqual(helloA.log,[],'A new room has nothing in it');
  assert.match(helloA.tag,/^[0-9a-f]{4}$/);
  const helloB=await b.next('hello');
  assert.equal(helloB.people,2);
  await a.next('people',5000,(m)=>m.n===2);   // everyone hears when someone joins
  a.say('  hello\u202E   world \u0007 ','#Ter@ry');
  const got=await b.next('msg'),echo=await a.next('msg');
  assert.deepEqual(got,echo,'Everyone gets the same message, the sender too');
  assert.equal(got.text,'hello world','The Worker cleans the text');
  assert.equal(got.nick,'Terry','and the name');
  assert.equal(got.tag,helloA.tag,"and tags it with the sender's tag");
  assert.ok(Number.isSafeInteger(got.n)&&Math.abs(got.at-Date.now())<60000);
  assert.ok(!JSON.stringify(got).includes(a.id),'The browser id never goes out');
  b.say('','nobody');
  assert.equal((await b.next('err')).why,'empty');

  // the same browser in a second tab: same tag, counted once
  const a2=join_(a.id);
  const helloA2=await a2.next('hello');
  assert.equal(helloA2.tag,helloA.tag,'One browser has one tag');
  assert.equal(helloA2.people,2,'Its tabs count once');
  assert.deepEqual(helloA2.log.map((m)=>m.text),['hello world'],'Whoever joins sees what was said');
  const leaving=Date.now(),bye=await a2.leave();
  assert.equal(bye.code,1000,'A page that leaves gets a clean close');
  assert.ok(Date.now()-leaving<2000,'and does not wait for it');

  // rate limits: per sender, the same thing twice, and a burst
  a.say('hello world');
  assert.equal((await a.next('err')).why,'repeat');
  for(let i=0;i<=BURST;i++)b.say(`burst ${i}`);
  for(let i=0;i<BURST;i++)assert.equal((await a.next('msg')).text,`burst ${i}`);
  assert.equal((await b.next('err')).why,'slow','Past the burst, a sender waits');
  a.say('a is not limited by b');
  assert.equal((await b.next('msg')).text,'a is not limited by b');

  // a page that sends anything else is cut off
  const rude=join_(undefined,{ip:'198.51.100.3'});
  await rude.next('hello');
  rude.ws.send('{"t":"shout"}');
  assert.equal((await rude.closed).code,1003);
  const huge=join_(undefined,{ip:'198.51.100.3'});
  await huge.next('hello');
  huge.ws.send(JSON.stringify({t:'say',text:'x'.repeat(5000)}));
  assert.equal((await huge.closed).code,1009);

  // pings are answered without waking the room
  a.ws.send('ping');
  await a.next('pong');

  // one sender cannot open sockets without end
  const tabs=[];
  for(let i=0;i<8;i++){const t=join_(undefined,{ip:'203.0.113.50'});tabs.push(t);await t.next('hello');}
  await assert.rejects(join_(undefined,{ip:'203.0.113.50'}).opened,'The ninth socket from one sender is refused');
  const v6=join_(undefined,{ip:'2001:db8:1:2::9'});
  await v6.next('hello');
  await v6.leave();
  for(const t of tabs)await t.leave();

  // the room keeps the last KEEP messages, by sending from enough addresses to get past the limiter
  const filler=[];
  for(let i=0;i<Math.ceil((KEEP+5)/BURST);i++){const f=join_(undefined,{ip:`192.0.2.${i+1}`});filler.push(f);await f.next('hello');}
  let sent=0;
  for(const f of filler)for(let i=0;i<BURST&&sent<KEEP+5;i++)f.say(`fill ${sent++}`);
  for(let i=0;i<KEEP+5;i++)await b.next('msg',20000);
  const late=join_(undefined,{ip:'198.51.100.9'});
  const kept=(await late.next('hello')).log;
  assert.equal(kept.length,KEEP,`Only the last ${KEEP} are kept`);
  assert.equal(kept.at(-1).text,`fill ${KEEP+4}`);
  for(const f of filler)await f.leave();

  // moderation
  assert.equal((await admin({list:true},'wrong')).status,401,'A wrong token is refused');
  assert.equal((await fetch(`${BASE}/admin`)).status,405);
  const listed=await (await admin({list:true})).json();
  assert.equal(listed.length,KEEP);
  const target=listed.at(-1).n;
  assert.deepEqual(await (await admin({delete:target})).json(),{deleted:1});
  assert.equal((await late.next('del')).n,target,'Everyone is told a message was removed');
  assert.ok(!(await (await admin({list:true})).json()).some((m)=>m.n===target));
  assert.deepEqual(await (await admin({delete:target})).json(),{deleted:0},'Removing it twice removes nothing');
  assert.equal((await admin({shout:true})).status,400);
  assert.deepEqual(await (await admin({clear:true})).json(),{cleared:true});
  await late.next('clear');
  const after=join_(undefined,{ip:'198.51.100.10'});
  assert.deepEqual((await after.next('hello')).log,[],'A cleared room is empty');

  // leaving
  await b.leave();
  await a.next('people',5000,(m)=>m.n===3);   // everyone hears when someone leaves: a, late and after remain
  for(const c of [a,late,after])await c.leave();

  console.log('chat worker: ok');
} catch(e) {
  console.error(devLog.slice(-4000));
  throw e;
} finally {
  stop();
}
