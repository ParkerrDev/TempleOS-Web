import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {browserId,createPresence,PRESENCE_URL} from '../presence.js';

mock.timers.enable({apis:['setTimeout','setInterval','Date']});
Math.random=()=>0;

function room() {
  const sockets=[],counts=[];
  const open=(url)=>{
    const s={url,readyState:1,sent:[],closed:false,send(m){this.sent.push(m);},close(){this.closed=true;}};
    sockets.push(s);
    return s;
  };
  return {sockets,counts,open,report:(n)=>counts.push(n),get last(){return sockets[sockets.length-1];}};
}

// the number from the Worker includes this browser
{
  const r=room();
  const p=createPresence(r.report,{id:'a'.repeat(32),open:r.open});
  assert.equal(r.sockets.length,0,'Nothing connects before the page asks');
  p.wake();
  assert.equal(r.last.url,`${PRESENCE_URL}?id=${'a'.repeat(32)}`);
  assert.deepEqual(r.counts,[],'No count until the Worker sends one');
  r.last.onmessage({data:'1'});
  r.last.onmessage({data:'3'});
  assert.deepEqual(r.counts,[0,2],'Alone is zero others, three people is two others');
  for(const data of ['pong','','0','-1','1.5','abc','1e400',undefined])r.last.onmessage({data});
  assert.deepEqual(r.counts,[0,2],'Anything but a positive whole number changes nothing');
  p.wake();
  assert.equal(r.sockets.length,1,'Waking a connected page opens no second socket');
}

// pings
{
  const r=room();
  createPresence(r.report,{id:'a',open:r.open}).wake();
  r.last.readyState=0;
  mock.timers.tick(30000);
  assert.deepEqual(r.last.sent,[],'No ping while the socket is still connecting');
  r.last.readyState=1;
  r.last.onmessage({data:'pong'});
  mock.timers.tick(30000);
  assert.deepEqual(r.last.sent,['ping']);
}

// a lost socket clears the count and retries, further apart each time, up to the limit
{
  const r=room();
  const p=createPresence(r.report,{id:'a',open:r.open});
  p.wake();
  r.last.onmessage({data:'2'});
  r.last.onclose();
  assert.deepEqual(r.counts,[1,null],'A lost socket shows no number at all, not an old one');
  mock.timers.tick(1999);
  assert.equal(r.sockets.length,1);
  mock.timers.tick(1);
  assert.equal(r.sockets.length,2,'Retries after two seconds');
  for(const wait of [4000,8000,16000,32000,60000,60000]){
    r.last.onclose();
    mock.timers.tick(wait-1);
    const before=r.sockets.length;
    mock.timers.tick(1);
    assert.equal(r.sockets.length,before+1,`Retries after ${wait} ms`);
  }
  r.last.onmessage({data:'1'});
  r.last.onclose();
  mock.timers.tick(2000);
  assert.equal(r.sockets.length,9,'A working connection resets the wait');
  r.last.onclose();
  p.wake();
  assert.equal(r.sockets.length,10,'Coming back to the tab retries at once');
  mock.timers.tick(60000);
  assert.equal(r.sockets.length,10,'and cancels the retry that was waiting');
  const old=r.last;
  old.onerror();
  assert.equal(old.onclose,null,'A dropped socket cannot report anything later');
}

// a socket that looks open but has gone silent is replaced
{
  const r=room();
  createPresence(r.report,{id:'a',open:r.open}).wake();
  r.last.onmessage({data:'4'});
  mock.timers.tick(90000);
  assert.equal(r.sockets.length,1,'Still within the limit');
  const dead=r.last;
  mock.timers.tick(30000);
  assert.equal(dead.closed,true);
  assert.equal(r.counts.at(-1),null);
  mock.timers.tick(2000);
  assert.equal(r.sockets.length,2);
}

// a browser that refuses the socket outright
{
  const r=room();
  let tries=0;
  createPresence(r.report,{id:'a',open:(u)=>{if(++tries===1)throw new Error('blocked');return r.open(u);}}).wake();
  assert.deepEqual(r.counts,[null]);
  mock.timers.tick(2000);
  assert.equal(r.sockets.length,1);
}

// the id
{
  const store=new Map();
  const set=(value)=>Object.defineProperty(globalThis,'localStorage',{value,configurable:true});
  set({getItem:(k)=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)});
  const id=browserId();
  assert.match(id,/^[0-9a-f]{32}$/);
  assert.equal(browserId(),id,'One browser keeps one id, so its tabs count once');
  store.set('tos-presence-id','<not an id>');
  assert.match(browserId(),/^[0-9a-f]{32}$/,'A damaged id is replaced');
  set({getItem(){throw new Error('denied');},setItem(){throw new Error('denied');}});
  assert.match(browserId(),/^[0-9a-f]{32}$/,'Blocked storage still gives an id');
}

mock.timers.reset();
console.log('presence: ok');
