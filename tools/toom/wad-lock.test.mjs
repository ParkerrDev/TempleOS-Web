import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const read=n=>readFileSync(resolve(root,n),'latin1');
const source=read('games/Toom/TmGlbls.HH')+'\n'+read('tools/toom/WadLockHook.HC')+
  '\n#define FBlkRead TmWadBlocks\n'+read('games/Toom/TmWad.HC')+
  '\n'+read('tools/toom/WadLock.HC');
const sourceSha256=createHash('sha256').update(Buffer.from(source,'latin1')).digest('hex');
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the original TempleOS oracle checkout.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{timeout:90});
  console.log(JSON.stringify({...result,sourceSha256},null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,/WAD LOCK 26 CASES 16 FAULTS [1-7] GAPS BAD 0/);
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to a frozen built runtime.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  const bytes=Buffer.from(source+"\nif (!tm_wad_done || tm_wad_cases!=26 || tm_wad_faults!=16 || !tm_wad_gaps) throw('Count');\n",'latin1');
  let id=h.gx.writeFile({path:'C:/ORACLE/WADLOCK.HC',bytes});
  for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
  assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  id=h.gx.launch({path:'C:/ORACLE/WADLOCK.HC'});
  for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
  assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  console.log(JSON.stringify({backend,sourceSha256,cases:26,faults:16,bad:0},null,2));
}
