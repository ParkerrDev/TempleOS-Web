import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {GuestRequests} from '../GuestRequests.js';

mock.timers.enable({apis:['setTimeout']});
try {
  const sent=[],requests=GuestRequests((message,transfer)=>{
    sent.push(structuredClone(message,{transfer}));
  });
  const bytes=new Uint8Array([1,2,3]).buffer;
  const file=requests.Request({cmd:'osWrite',path:'C:/Home/Test.HC',bytes},[bytes]),
    launch=requests.Request({cmd:'osLaunch',src:'"Hi";'});
  assert.equal(sent.length,0);assert.equal(bytes.byteLength,3);
  requests.Receive({cmd:'guestReady',ok:true,diskReady:false,diskPending:true});
  assert.deepEqual(sent.map(m=>m.cmd),['osLaunch']);
  requests.Receive({cmd:'guestReady',ok:true,diskReady:false,diskPending:true});
  assert.equal(sent.length,1);
  requests.Receive({cmd:'fileResult',id:sent[0].id,ok:true});assert.equal((await launch).ok,true);
  requests.Receive({cmd:'diskInfo',ok:true,diskReady:true});
  assert.deepEqual(sent.map(m=>m.cmd),['osLaunch','osWrite']);assert.equal(bytes.byteLength,0);
  assert.deepEqual([...new Uint8Array(sent[1].bytes)],[1,2,3]);
  requests.Receive({cmd:'fileResult',id:sent[1].id,ok:true});assert.equal((await file).ok,true);

  requests.Reset();
  const old=requests.Request({cmd:'osLaunch',path:'C:/Home/Test.HC'});
  requests.Receive({cmd:'diskInfo',ok:true,diskReady:true});assert.equal(sent.length,2);
  requests.Receive({cmd:'guestReady',ok:true,diskReady:true,diskPending:false});assert.equal(sent.length,3);
  const oldId=sent[2].id;
  requests.Reset();assert.equal((await old).ok,false);
  const next=requests.Request({cmd:'osLaunch',src:'"New";'});
  requests.Receive({cmd:'fileResult',id:oldId,ok:true});
  requests.Receive({cmd:'guestReady',ok:true,diskReady:true,diskPending:false});
  assert.equal(sent.length,4);assert.notEqual(sent[3].id,oldId);
  requests.Receive({cmd:'fileResult',id:sent[3].id,ok:true});assert.equal((await next).ok,true);

  requests.Reset();
  const untouched=new ArrayBuffer(4),waiting=requests.Request({cmd:'osWrite',bytes:untouched},[untouched]);
  requests.Reset();assert.equal((await waiting).ok,false);assert.equal(untouched.byteLength,4);
  const failed=requests.Request({cmd:'osLaunch',src:'"Unreachable";'});
  requests.Fail('CPU stopped');assert.equal((await failed).msg,'CPU stopped');
  assert.equal((await requests.Request({cmd:'osLaunch',src:'"Still stopped";'})).msg,'CPU stopped');
  assert.equal(sent.length,4);

  requests.Reset();
  const unavailable=requests.Request({cmd:'osWrite',bytes:new ArrayBuffer(0)}),
    memoryOnly=requests.Request({cmd:'osLaunch',src:'"Memory";'});
  requests.Receive({cmd:'guestReady',ok:true,diskReady:false,diskPending:false});
  assert.match((await unavailable).msg,/no disk/);assert.equal(sent.length,5);
  requests.Receive({cmd:'fileResult',id:sent[4].id,ok:true});assert.equal((await memoryOnly).ok,true);
  requests.Receive({cmd:'diskInfo',ok:true,diskReady:true});
  requests.Receive({cmd:'diskInfo',ok:false,diskReady:true,msg:'Invalid imported file'});
  const retained=requests.Request({cmd:'osLaunch',path:'C:/Home/Existing.HC'});
  assert.equal(sent.length,6);requests.Receive({cmd:'fileResult',id:sent[5].id,ok:true});assert.equal((await retained).ok,true);

  requests.Reset();
  const missing=requests.Request({cmd:'osWrite',bytes:new ArrayBuffer(0)});
  requests.Receive({cmd:'diskInfo',ok:false,diskReady:false,msg:'Download failed'});
  assert.equal((await missing).msg,'Download failed');assert.equal(sent.length,6);
  requests.Receive({cmd:'guestReady',ok:true,diskReady:false,diskPending:false});
  assert.equal((await requests.Request({cmd:'osLaunch',path:'C:/Home/StillMissing.HC'})).msg,'Download failed');
  assert.equal(sent.length,6);
  requests.Reset();
  requests.Receive({cmd:'guestReady',ok:true,diskReady:false,diskPending:true});
  const importing=requests.Request({cmd:'osWrite',bytes:new ArrayBuffer(0)});
  requests.Receive({cmd:'diskInfo',ok:false,diskReady:false,diskPending:true,msg:'Invalid imported file'});
  assert.equal(sent.length,6);
  requests.Receive({cmd:'diskInfo',ok:true,diskReady:true,diskPending:false});
  assert.equal(sent.length,7);
  requests.Receive({cmd:'fileResult',id:sent[6].id,ok:true});assert.equal((await importing).ok,true);
  requests.Reset();
  const timeout=requests.Request({cmd:'osLaunch',src:'"Late";'});
  mock.timers.tick(120000);assert.match((await timeout).msg,/timed out/);
  requests.Receive({cmd:'guestReady',ok:true,diskReady:true});assert.equal(sent.length,7);

  const broken=GuestRequests(()=>{throw new Error('transport failure');});
  broken.Receive({cmd:'guestReady',ok:true,diskReady:true});
  assert.equal((await broken.Request({cmd:'osLaunch',src:'"No transport";'})).msg,'transport failure');
  mock.timers.tick(120000);
  console.log('Guest requests wait for capabilities, transfer once, cancel across restart/fault, retain late-reply ownership, and stop on disk/transport/deadline failures.');
} finally {mock.timers.reset();}
