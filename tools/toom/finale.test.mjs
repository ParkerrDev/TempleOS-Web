import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';
import {FinaleReference} from './FinaleRef.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const {bytes}=await FinaleReference();
const game=resolve(root,'games/Toom'),read=n=>readFileSync(resolve(game,n),'latin1');
const source=[...read('Load.HC').matchAll(/#include "([^"]+)"/g)]
  .map(m=>read(m[1].includes('.')?m[1]:m[1]+'.HC')).join('\n')+'\n'+
  readFileSync(new URL('Finale.HC',import.meta.url),'latin1');
const hash=b=>createHash('sha256').update(b).digest('hex'),sourceSha256=hash(Buffer.from(source,'latin1')),
  referenceSha256=hash(bytes),files=[{name:'FINALE.BIN',bytes}];
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the original TempleOS oracle checkout.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:120});
  console.log(JSON.stringify({...result,sourceSha256,referenceSha256},null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,/FINALE 120 CASES 180000 TICS 64 FAULTS BAD 0/);
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to a frozen built runtime.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  const check=source+"\nif (!tm_final_done || tm_final_cases!=120 || tm_final_ticks!=180000 || tm_final_faults!=64) throw('Count');\n";
  for(const file of [...files,{name:'FINAL.HC',bytes:Buffer.from(check,'latin1')}]) {
    const id=h.gx.writeFile({path:'C:/ORACLE/'+file.name,bytes:file.bytes});
    for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  const id=h.gx.launch({path:'C:/ORACLE/FINAL.HC'});
  for(let i=0;i<8000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
  assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  console.log(JSON.stringify({backend,sourceSha256,referenceSha256,cases:120,ticks:180000,faults:64,bad:0},null,2));
}
