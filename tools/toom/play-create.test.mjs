import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FreedoomRead,root} from './Assets.mjs';
import {ToomText} from './Package.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const game=resolve(root,'games/Toom');
const source=readFileSync(resolve(root,'tools/toom/LoadProbe.HC'),'latin1')+'\nCDC *TmPlayDC(I64 width,I64 height)\n{\n  TmLoadFault;\n  return DCNew(width,height);\n}\n#define DCNew TmPlayDC\n#define MAlloc TmLoadAlloc\n#define CAlloc TmLoadCAlloc\n#define FOpen TmLoadOpen\n#define FClose TmLoadClose\n#define FileRead TmLoadRead\n#define FBlkRead TmLoadBlocks\n'+ToomText()+'\n'+
  ['TmOverlay.HC','TmScreen.HC','TmPlay.HC'].map(n=>readFileSync(resolve(game,n),'latin1')).join('\n')+'\n'+
  readFileSync(resolve(root,'tools/toom/PlayCreate.HC'),'latin1');
const files=[{name:'FREEDOOM.WAD',bytes:FreedoomRead()},{name:'TMDATA.BIN',bytes:readFileSync(resolve(game,'TMDATA.BIN'))}];
const sourceSha256=createHash('sha256').update(Buffer.from(source,'latin1')).digest('hex');
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:240});
  console.log(JSON.stringify({...result,sourceSha256},null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,/PLAY CREATE \d+ CASES \d+ FAULTS BAD 0/);
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to the checkout with built HEMU dependencies.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  const check=source+"\nif (tm_play_create_done!=1 || tm_play_create_cases!=tm_play_create_faults+1) throw('Count');\n";
  for(const file of [...files,{name:'PLAYNEW.HC',bytes:Buffer.from(check,'latin1')}]) {
    const id=h.gx.writeFile({path:`C:/ORACLE/${file.name}`,bytes:file.bytes});
    for(let i=0;i<20000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  const id=h.gx.launch({path:'C:/ORACLE/PLAYNEW.HC'});
  for(let i=0;i<20000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
  assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  console.log(JSON.stringify({backend,sourceSha256,bad:0},null,2));
}
