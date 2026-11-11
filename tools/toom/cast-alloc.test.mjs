import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const game=resolve(root,'games/Toom'),read=n=>readFileSync(resolve(game,n),'latin1'),
  source=readFileSync(new URL('LoadProbe.HC',import.meta.url),'latin1')+
    '\n#define MAlloc TmLoadAlloc\n#define CAlloc TmLoadCAlloc\n#define FOpen TmLoadOpen\n#define FClose TmLoadClose\n#define FileRead TmLoadRead\n#define FBlkRead TmLoadBlocks\n'+
    [...read('Load.HC').matchAll(/#include "([^"]+)"/g)]
      .map(m=>read(m[1].includes('.')?m[1]:m[1]+'.HC')).join('\n')+'\n'+
    readFileSync(new URL('CastAlloc.HC',import.meta.url),'latin1'),
  hash=b=>createHash('sha256').update(b).digest('hex'),sourceSha256=hash(Buffer.from(source,'latin1')),
  files=[{name:'FREEDOOM.WAD',bytes:readFileSync(resolve(root,'tools/toom/.assets/freedoom-0.13.0-phase2.wad'))},
    {name:'TMDATA.BIN',bytes:readFileSync(resolve(game,'TMDATA.BIN'))}],assetSha256=hash(files[0].bytes);
assert.equal(assetSha256,'a8772e088847032510d97ba2312406a6998f21cbab44d4ff10696faa9c0ecd4b');
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the original TempleOS oracle checkout.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:180});
  console.log(JSON.stringify({...result,sourceSha256,assetSha256},null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,/CAST ALLOC \d+ CASES \d+ FAULTS BAD 0/);
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to a frozen built runtime.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true}),check=source+"\nif (!tm_cast_alloc_done || tm_cast_alloc_cases<32 || tm_cast_alloc_faults!=tm_cast_alloc_cases-2) throw('Count');\n";
  for(const file of [...files,{name:'CASTALL.HC',bytes:Buffer.from(check,'latin1')}]) {
    const id=h.gx.writeFile({path:'C:/ORACLE/'+file.name,bytes:file.bytes});
    for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  const id=h.gx.launch({path:'C:/ORACLE/CASTALL.HC'});
  for(let i=0;i<16000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
  assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  console.log(JSON.stringify({backend,sourceSha256,assetSha256,bad:0},null,2));
}
