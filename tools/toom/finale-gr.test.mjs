import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';
import {FinaleDrawReference} from './FinaleDrawRef.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const reference=await FinaleDrawReference(),header=Buffer.alloc(8);header.writeBigInt64LE(BigInt(reference.scenes.length));
const bytes=Buffer.concat([header,...reference.scenes.flatMap(s=>{
  const row=Buffer.alloc(48);[s.phase,s.episode,s.map,s.stage,s.tic,s.sounds].forEach((n,i)=>row.writeBigInt64LE(BigInt(n),i*8));
  return [row,s.pixels];
})]);
const game=resolve(root,'games/Toom'),read=n=>readFileSync(resolve(game,n),'latin1');
const source=[...read('Load.HC').matchAll(/#include "([^"]+)"/g)]
  .map(m=>read(m[1].includes('.')?m[1]:m[1]+'.HC')).join('\n')+'\n'+
  readFileSync(new URL('FinaleGr.HC',import.meta.url),'latin1');
const hash=b=>createHash('sha256').update(b).digest('hex'),sourceSha256=hash(Buffer.from(source,'latin1')),
  referenceSha256=hash(bytes),assetHashes=reference.wads.map(hash),referenceSourceSha256=reference.sourceSha256,
  files=[{name:'PHASE1.WAD',bytes:reference.wads[0]},{name:'PHASE2.WAD',bytes:reference.wads[1]},{name:'ENDGR.BIN',bytes}];
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the original TempleOS oracle checkout.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:180});
  console.log(JSON.stringify({...result,sourceSha256,referenceSha256,referenceSourceSha256,assetHashes},null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,/FINALE GR 154 CASES 9856000 PIXELS BAD 0/);
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to a frozen built runtime.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  const check=source+"\nif (!tm_final_gr_done || tm_final_gr_cases!=154 || tm_final_gr_pixels!=9856000) throw('Count');\n";
  for(const file of [...files,{name:'ENDGR.HC',bytes:Buffer.from(check,'latin1')}]) {
    const id=h.gx.writeFile({path:'C:/ORACLE/'+file.name,bytes:file.bytes});
    for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  const id=h.gx.launch({path:'C:/ORACLE/ENDGR.HC'});
  for(let i=0;i<8000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
  assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  console.log(JSON.stringify({backend,sourceSha256,referenceSha256,referenceSourceSha256,assetHashes,cases:154,pixels:9856000,bad:0},null,2));
}
