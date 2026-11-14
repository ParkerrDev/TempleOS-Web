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
   const {DiskStoreOpen}=await import('/Kernel/DiskStore.js'),{makeDisk}=await import('/Kernel/QCow2.js');
   const events=[],store=await DiskStoreOpen(m=>events.push(m)),disk=makeDisk(new Uint8Array(2048));
   await store.Attach(disk);
   disk.writeInto(1,1,new Uint8Array(512).fill(7),0);
   await Promise.resolve();
   disk.writeInto(2,1,new Uint8Array(512).fill(9),0);
   await store.Flush();
   const restored=await store.Load(),a=new Uint8Array(1024);restored.readInto(1,2,a,0);
   const replacement=makeDisk(new Uint8Array(1024).fill(3));await store.Attach(replacement);
   const replaced=await store.Load(),b=new Uint8Array(1024);replaced.readInto(0,2,b,0);
   const put=IDBObjectStore.prototype.put;
   IDBObjectStore.prototype.put=function(value,key){if(typeof key==='number')throw new DOMException('Storage full','QuotaExceededError');return put.call(this,value,key);};
   replacement.writeInto(0,1,new Uint8Array(512).fill(8),0);
   let rejected=false;try{await store.Flush();}catch{rejected=true;}
   IDBObjectStore.prototype.put=put;
   const kept=await store.Load(),c=new Uint8Array(512);kept.readInto(0,1,c,0);
   return {first:[...a],replacement:[...b],kept:[...c],rejected,error:events.at(-1)};
 });
 assert.deepEqual(result.first,[...new Uint8Array(512).fill(7),...new Uint8Array(512).fill(9)]);
 assert(result.replacement.every(x=>x===3));assert(result.kept.every(x=>x===3));
 assert.equal(result.rejected,true);assert.equal(result.error.state,'error');
 console.log('Sector writes restore exactly; disk replacement removes old sectors; failed transaction preserves last save and reports failure.');
} finally {await browser.close();site.closeAllConnections();site.close();}
