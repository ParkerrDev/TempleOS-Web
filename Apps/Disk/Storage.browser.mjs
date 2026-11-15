import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {chromium} from 'playwright-core';
import {ServeReq} from '../../Misc/Server.mjs';
const site=createServer((req,res)=>req.url==='/test'?res.end('<title>Disk storage test</title>'):ServeReq(req,res)).listen(0,'127.0.0.1');
await once(site,'listening');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage();await page.goto('http://127.0.0.1:'+site.address().port+'/test');
 const result=await page.evaluate(async()=>{
   const {DiskStoreOpen}=await import('/hemu/holyc-wasm/Apps/HEMU/Kernel/DiskStore.js'),{makeDisk}=await import('/hemu/holyc-wasm/Apps/HEMU/Kernel/QCow2.js');
   const events=[],store=await DiskStoreOpen(m=>events.push(m)),disk=await makeDisk(new Uint8Array(2048));
   await store.Attach(disk);
   disk.writeInto(1,1,new Uint8Array(512).fill(7),0);
   await Promise.resolve();
   disk.writeInto(2,1,new Uint8Array(512).fill(9),0);
   await store.Flush();
   const restored=await store.Load(),a=new Uint8Array(1024);restored.readInto(1,2,a,0);
   await store.SessionSave(new Uint8Array([1,2,3]).buffer);
   const saved=await store.SessionRead(),putSession=IDBObjectStore.prototype.put;
   IDBObjectStore.prototype.put=function(value,key){const request=putSession.call(this,value,key);if(key==='session')request.addEventListener('success',()=>this.transaction.abort());return request;};
   let sessionRejected=false;try{await store.SessionSave(new Uint8Array([4,5,6]).buffer);}catch{sessionRejected=true;}
   IDBObjectStore.prototype.put=putSession;
   const retained=await store.SessionRead();
   disk.writeInto(3,1,new Uint8Array(512).fill(5),0);await store.Flush();
   const invalidated=await store.SessionRead();
   const replacement=await makeDisk(new Uint8Array(1024).fill(3));await store.Attach(replacement);
   const replaced=await store.Load(),b=new Uint8Array(1024);replaced.readInto(0,2,b,0);
   const put=IDBObjectStore.prototype.put;
   IDBObjectStore.prototype.put=function(value,key){if(typeof key==='number')throw new DOMException('Storage full','QuotaExceededError');return put.call(this,value,key);};
   replacement.writeInto(0,1,new Uint8Array(512).fill(8),0);
   let rejected=false;try{await store.Flush();}catch{rejected=true;}
   IDBObjectStore.prototype.put=put;
   const kept=await store.Load(),c=new Uint8Array(512);kept.readInto(0,1,c,0);
   const blockedEvents=[],waitStarted=performance.now(),blocked=await DiskStoreOpen(m=>blockedEvents.push(m),false,true),waitMs=performance.now()-waitStarted;
   if(!blocked)throw Error('A lock held by an older tab must still allow reading saved C:');
   const old=await blocked.Load(),readOnly=new Uint8Array(512);old.readInto(0,1,readOnly,0);
   let staleCode;try{await blocked.Load(saved.revision);}catch(e){staleCode=e.code;}
   await blocked.Attach(old,true);
   let blockedSave=false;try{await blocked.SessionSave(new Uint8Array([7]).buffer);}catch{blockedSave=true;}
   blocked.Close();
   return {session:[...new Uint8Array(saved.bytes)],retained:[...new Uint8Array(retained.bytes)],sessionRejected,invalidated,first:[...a],replacement:[...b],kept:[...c],rejected,error:events.at(-1),waitMs,readOnly:[...readOnly],blockedSave,blockedError:blockedEvents.at(-1),staleCode};
 });
 assert.deepEqual(result.session,[1,2,3]);assert.deepEqual(result.retained,[1,2,3]);
 assert.equal(result.sessionRejected,true);assert.equal(result.invalidated,null);
 assert.deepEqual(result.first,[...new Uint8Array(512).fill(7),...new Uint8Array(512).fill(9)]);
 assert(result.replacement.every(x=>x===3));assert(result.kept.every(x=>x===3));
 assert.equal(result.rejected,true);assert.equal(result.error.state,'error');
 assert(result.waitMs<8000,'Storage wait finishes before the ten-second machine startup deadline');
 assert(result.readOnly.every(x=>x===3));assert.equal(result.blockedSave,true);
 assert.match(result.blockedError.msg,/Close it and Restart/);
 assert.equal(result.staleCode,'SESSION_STALE','Disk revision is rechecked atomically with the sectors after lock acquisition');
 console.log('Sector writes restore exactly; disk replacement removes old sectors; failed transactions preserve the last disk/session save; disk revision invalidates stale session.');
} finally {await browser.close();site.closeAllConnections();site.close();}
