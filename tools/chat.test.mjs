// The chat rules (chat/rules.js) and the page's side (chat.js). The Worker itself: tools/chat-worker.test.mjs.
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {BURST,cleanNick,cleanText,FORGET_MS,ipKey,limit,MAX_NICK,MAX_TEXT,REFILL_MS,REPEAT_MS,textHash} from '../chat/rules.js';
import {CHAT_URL,createChat,readEvent,stamp} from '../chat.js';

// what a message may say
{
  assert.equal(cleanText('  hello   there \n\t friend  '),'hello there friend','Whitespace collapses to single spaces');
  assert.equal(cleanText('a\u0000b\u0007c\u001bd'),'a b c d','Control characters become spaces');
  assert.equal(cleanText('safe\u202Etxt.exe\u2066x\u2069\u200F'),'safetxt.exex','Bidi overrides and marks are removed');
  assert.equal(cleanText('one\u2028two\u2029three'),'onetwothree','Line and paragraph separators are removed');
  assert.equal(cleanText('q\u0301\u0302\u0303\u0304\u0305\u0306'),'q\u0301\u0302\u0303','Combining marks stop at three');
  assert.equal(cleanText('\u{1F469}\u200D\u{1F4BB} \u2764\uFE0F'),'\u{1F469}\u200D\u{1F4BB} \u2764\uFE0F','Emoji keep their joiners and selectors');
  assert.equal(cleanText('e\u0301'),'\u00E9','Text is normalized to NFC');
  assert.equal([...cleanText('\u{1F600}'.repeat(400))].length,MAX_TEXT,'The limit counts characters, not UTF-16 units');
  assert.equal(cleanText('x'.repeat(MAX_TEXT)+' tail'),'x'.repeat(MAX_TEXT));
  assert.equal(cleanText('x'.repeat(MAX_TEXT-1)+' y'),'x'.repeat(MAX_TEXT-1),'No trailing space is left at the cut');
  for(const v of [undefined,null,42,{},['hi']])assert.equal(cleanText(v),'','Anything but a string is empty');
  assert.equal(cleanText(' \u0000 \u202E '),'','Nothing visible is empty');
  assert.equal(cleanText('y'.repeat(5_000_000)).length,MAX_TEXT,'A huge string is cut before it is worked on');
}

// names
{
  assert.equal(cleanNick(''),'Guest');
  assert.equal(cleanNick(undefined),'Guest');
  assert.equal(cleanNick(' \u202E '),'Guest');
  assert.equal(cleanNick('Terry#a1f3'),'Terrya1f3','A name cannot carry its own tag');
  assert.equal(cleanNick('@#@'),'Guest');
  assert.equal(cleanNick('A  very  long name that goes on'),'A very long name');
  assert.ok([...cleanNick('n'.repeat(40))].length<=MAX_NICK);
}

// who is rate limited together
{
  assert.equal(ipKey('203.0.113.9'),'203.0.113.9');
  assert.equal(ipKey('2001:db8:85a3:8d3:1319:8a2e:370:7348'),'2001:db8:85a3:8d3::/64');
  assert.equal(ipKey('2001:db8:85a3:8d3:ffff::1'),'2001:db8:85a3:8d3::/64','One /64 is one sender');
  assert.equal(ipKey('2001:0DB8::1'),'2001:db8:0:0::/64','Leading zeros and case do not matter');
  assert.equal(ipKey('::1'),'0:0:0:0::/64');
  assert.equal(ipKey('::ffff:198.51.100.7'),'198.51.100.7','An IPv4 address written as IPv6 is that IPv4 address');
  assert.equal(ipKey(null),'?');
  assert.equal(ipKey(''),'?');
}

// the limiter: a burst, then one every few seconds, never the same thing twice in a row. The room keeps
// `kept` in storage between messages, so it goes through JSON here as it would through SQL.
{
  let kept=null;
  const take=(text,now)=>{const r=limit(kept,text,now);kept=JSON.parse(JSON.stringify(r.kept));return r.why;};
  for(let i=0;i<BURST;i++)assert.equal(take(`m${i}`,0),null,'A burst goes out');
  assert.equal(take('more',0),'slow','Then the burst is spent');
  assert.equal(take('more',REFILL_MS-1),'slow');
  assert.equal(take('more',REFILL_MS),null,'One comes back each refill');
  assert.equal(take('more',3*REFILL_MS),'repeat','The same text again is refused');
  assert.equal(take('other',3*REFILL_MS),null,'and a refused message costs nothing');
  assert.equal(take('other',3*REFILL_MS+REPEAT_MS),null,'The same text is fine once enough time has passed');
  const at=kept.at;
  assert.equal(take('back',at-100000),null);
  assert.ok(kept.at>=at,'A clock that steps back gives no extra messages');
  assert.equal(limit(null,'m0',0).why,null,'Someone new may speak');
  const quiet=limit(limit(null,'same',0).kept,'same',FORGET_MS);
  assert.equal(quiet.why,null,'After FORGET_MS a sender is the same as someone new, so their row can go');
  assert.ok(FORGET_MS>=REPEAT_MS&&FORGET_MS>=BURST*REFILL_MS);
  assert.equal(textHash('hello'),textHash('hello'));
  assert.notEqual(textHash('hello'),textHash('hellO'));
  assert.ok(Number.isSafeInteger(textHash('\u{1F600}'.repeat(300)))&&textHash('')>=0,'The hash is a plain integer SQL can keep');
}

// what the page accepts from the Worker
{
  const msg={n:7,at:1730000000000,nick:'Terry',tag:'a1f3',text:'hi'};
  assert.deepEqual(readEvent(JSON.stringify({t:'msg',...msg,extra:'<b>'})),{t:'msg',...msg},'Unknown fields are dropped');
  assert.deepEqual(readEvent(JSON.stringify({t:'hello',tag:'a1f3',people:2,log:[msg,{n:'x'},null]})),
    {t:'hello',tag:'a1f3',people:2,log:[msg]},'A bad line in the log is skipped, not the whole log');
  assert.deepEqual(readEvent('{"t":"people","n":3}'),{t:'people',n:3});
  assert.deepEqual(readEvent('{"t":"del","n":7}'),{t:'del',n:7});
  assert.deepEqual(readEvent('{"t":"clear"}'),{t:'clear'});
  assert.deepEqual(readEvent('{"t":"err","why":"slow"}'),{t:'err',why:'slow'});
  for(const bad of ['pong','','{','null','[]','{"t":"msg"}','{"t":"msg","n":-1,"at":1,"nick":"a","tag":"b","text":"c"}',
    '{"t":"msg","n":1,"at":1,"nick":5,"tag":"b","text":"c"}','{"t":"people","n":1.5}','{"t":"hello","tag":"a","people":1,"log":{}}',
    '{"t":"err","why":7}','{"t":"eval","code":"alert(1)"}'])
    assert.equal(readEvent(bad),null,`Not an event: ${bad}`);
  const long=readEvent(JSON.stringify({t:'msg',...msg,nick:'n'.repeat(500),text:'t'.repeat(5000)}));
  assert.ok(long.nick.length<=MAX_NICK*2&&long.text.length<=MAX_TEXT*2,'Overlong strings are cut');
}

// the page's connection
{
  mock.timers.enable({apis:['setTimeout','setInterval','Date']});
  Math.random=()=>0;
  const sockets=[],heard=[];
  const open=(url)=>{const s={url,readyState:1,sent:[],send(m){this.sent.push(m);},close(){}};sockets.push(s);return s;};
  const chat=createChat((e)=>heard.push(e),{id:'b'.repeat(32),open});
  assert.equal(sockets.length,0,'Nothing connects before the window opens');
  assert.equal(chat.say('me','early'),false,'Nothing can be said before it connects');
  chat.wake();
  const ws=sockets[0];
  assert.equal(ws.url,`${CHAT_URL}?id=${'b'.repeat(32)}`);
  assert.equal(chat.say('me','too early'),false,'or before the room has said hello');
  assert.deepEqual(ws.sent,[]);
  ws.onmessage({data:JSON.stringify({t:'hello',tag:'beef',people:1,log:[]})});
  assert.equal(chat.live,true);
  assert.equal(chat.say('me','hi'),true);
  assert.deepEqual(JSON.parse(ws.sent[0]),{t:'say',nick:'me',text:'hi'});
  ws.onmessage({data:'pong'});
  ws.onmessage({data:'not json'});
  assert.deepEqual(heard.map((e)=>e.t),['hello'],'Pongs and junk are not events');
  ws.readyState=3;
  assert.equal(chat.say('me','into a closing socket'),false);
  ws.onclose();
  assert.equal(chat.live,false);
  assert.deepEqual(heard.at(-1),{t:'offline'});
  mock.timers.tick(2000);
  assert.equal(sockets.length,2,'It reconnects after a loss');
  assert.equal(chat.say('me','hi'),false,'and waits for hello again');
  mock.timers.reset();
}

// times
{
  const now=new Date(2026,10,5,18,30).getTime();
  assert.equal(stamp(new Date(2026,10,5,9,4).getTime(),now),'09:04');
  assert.equal(stamp(new Date(2026,10,4,23,59).getTime(),now),'11/04 23:59');
}

console.log('chat: ok');
