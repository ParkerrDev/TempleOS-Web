import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FreedoomRead,root} from './Assets.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const game=resolve(root,'games/Toom'),read=n=>readFileSync(resolve(game,n),'latin1');
const hook="Bool tm_progress_fail=FALSE;\nU8 *TmProgressAlloc(I64 size)\n{\n  if (tm_progress_fail) throw('NextFail');\n  return CAlloc(size);\n}\n";
const source=hook+[...read('Load.HC').matchAll(/#include "([^"]+)"/g)]
  .map(m=>{const n=m[1].includes('.')?m[1]:m[1]+'.HC',s=read(n);
    return n==='TmLevel.HC'?s.replace('tmpl=CAlloc(sizeof(Level))','tmpl=TmProgressAlloc(sizeof(Level))'):s;}).join('\n')+'\n'+
  ['TmOverlay.HC','TmScreen.HC','TmPlay.HC'].map(read).join('\n')+'\n'+
  readFileSync(new URL('Progress.HC',import.meta.url),'latin1');
const hash=b=>createHash('sha256').update(b).digest('hex'),sourceSha256=hash(Buffer.from(source,'latin1')),
  files=[{name:'FREEDOOM.WAD',bytes:FreedoomRead()},{name:'TMDATA.BIN',bytes:readFileSync(resolve(game,'TMDATA.BIN'))}],
  assetHashes=Object.fromEntries(files.map(f=>[f.name,hash(f.bytes)]));
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the original TempleOS oracle checkout.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:180});
  console.log(JSON.stringify({...result,sourceSha256,assetHashes},null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,/PROGRESS 8 CASES HASH 2903551559 BAD 0/);
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to a frozen built runtime.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  for(const f of [...files,{name:'PROGRESS.HC',bytes:Buffer.from(source+"\nif (!tm_progress_done || tm_progress_cases!=8 || tm_progress_hash!=2903551559) throw('Count');\n",'latin1')}]) {
    const id=h.gx.writeFile({path:'C:/ORACLE/'+f.name,bytes:f.bytes});
    for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  const id=h.gx.launch({path:'C:/ORACLE/PROGRESS.HC'});
  for(let i=0;i<8000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
  assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  console.log(JSON.stringify({backend,sourceSha256,assetHashes,cases:8,bad:0},null,2));
}
