import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root,FreedoomRead} from './Assets.mjs';
import {ToomText} from './Package.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const game=resolve(root,'games/Toom'),read=n=>readFileSync(resolve(game,n),'latin1');
const source=readFileSync(new URL('LoadProbe.HC',import.meta.url),'latin1')+
  '\n#define MAlloc TmLoadAlloc\n#define CAlloc TmLoadCAlloc\n#define FOpen TmLoadOpen\n#define FClose TmLoadClose\n#define FileRead TmLoadRead\n#define FBlkRead TmLoadBlocks\n'+
  ToomText(()=>true,read)+'\n'+
  readFileSync(new URL('FinaleAlloc.HC',import.meta.url),'latin1');
const hash=b=>createHash('sha256').update(b).digest('hex'),sourceSha256=hash(Buffer.from(source,'latin1')),
  files=[{name:'FREEDOOM.WAD',bytes:FreedoomRead()}],assetSha256=hash(files[0].bytes);
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the original TempleOS oracle checkout.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:180});
  console.log(JSON.stringify({...result,sourceSha256,assetSha256},null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,/FINALE ALLOC 187 CASES 181 FAULTS BAD 0/);
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to a frozen built runtime.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  const check=source+"\nif (!tm_final_alloc_done || tm_final_alloc_cases!=187 || tm_final_alloc_faults!=181) throw('Count');\n";
  for(const file of [...files,{name:'ENDALLOC.HC',bytes:Buffer.from(check,'latin1')}]) {
    const id=h.gx.writeFile({path:'C:/ORACLE/'+file.name,bytes:file.bytes});
    for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  const id=h.gx.launch({path:'C:/ORACLE/ENDALLOC.HC'});
  for(let i=0;i<8000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
  assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  console.log(JSON.stringify({backend,sourceSha256,assetSha256,cases:187,faults:181,bad:0},null,2));
}
