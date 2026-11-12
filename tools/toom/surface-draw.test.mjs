import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {root} from './Assets.mjs';
import {ToomText} from './Package.mjs';
import {AnimReference} from './AnimRef.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const {bytes,names,first,last,frames}=await AnimReference(),ticks=Array.from({length:12},(_,i)=>i*8),
  records=[ticks.length,names.length,first,last-first];
for(const tic of ticks){const {tex,flat}=frames(tic);records.push(tic,...tex,...flat);}
const packed=Buffer.alloc(records.length*8);records.forEach((n,i)=>packed.writeBigInt64LE(BigInt(n),i*8));
const source=ToomText()+'\n'+
  readFileSync(resolve(root,'tools/toom/SurfaceDraw.HC'),'latin1');
const result={backend,sourceHash:createHash('sha256').update(source,'latin1').digest('hex'),
  wadHash:createHash('sha256').update(bytes).digest('hex'),hashes:[]};
const files=[{name:'SURFACE.BIN',bytes:packed},{name:'FREEDOOM.WAD',bytes}];
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const native=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:180});
  const {out,except}=native.results[0];assert.equal(except,'',out);assert.doesNotMatch(out,/WARNING/);
  const m=out.match(/SURFACES 432 VIEWS (\d+) CHANGED 6 CACHE BAD 0/);assert(m,out);
  result.changed=Number(m[1]);result.evidence=native.evidence;
  result.hashes=[...out.matchAll(/SURFACE (\d+) (\d+)/g)].map((m,i)=>{assert.equal(Number(m[1]),i);return Number(m[2]);});
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to the checkout with built HEMU dependencies.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  for(const file of files) {
    const id=h.gx.writeFile({path:`C:/ORACLE/${file.name}`,bytes:file.bytes});
    for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  const id=h.gx.exec({src:source,target:'adam'});
  for(let i=0;i<12000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
  assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  for(const [name,n] of [['done',1],['cnt',432],['cache',6]])
    assert.equal(h.gx.rd64(h.gx.varFind(`tm_surface_${name}`)),n);
  result.changed=h.gx.rd64(h.gx.varFind('tm_surface_changed'));
  const at=h.gx.varFind('tm_surface_hash');result.hashes=Array.from({length:432},(_,i)=>h.gx.rd64(at+i*8));
}
assert.equal(result.hashes.length,432);assert(result.changed>0);
if(process.env.OUT)writeFileSync(process.env.OUT,JSON.stringify(result,null,2)+'\n');
if(process.env.REFERENCE) {
  const ref=JSON.parse(readFileSync(process.env.REFERENCE));
  for(const name of ['sourceHash','wadHash','changed','hashes'])assert.deepEqual(result[name],ref[name],name);
}
console.log(JSON.stringify(result,null,2));
