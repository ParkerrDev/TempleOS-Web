import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root,FreedoomRead} from './Assets.mjs';
import {ToomText} from './Package.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const game=resolve(root,'games/Toom');
const source=ToomText()+'\n'+
  ['Rooms.HC','Clock.HC'].map(n=>readFileSync(resolve(root,'tools/toom',n),'latin1')).join('\n');
const files=[{name:'TMDATA.BIN',bytes:readFileSync(resolve(game,'TMDATA.BIN'))},
  {name:'FREEDOOM.WAD',bytes:FreedoomRead()}];
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:180});
  console.log(JSON.stringify(result,null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,/CLOCK 20 REAL CASES BAD 0/);
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to the checkout with built HEMU dependencies.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  const check=source+"\nif (tm_clock_done!=1 || tm_clock_cases!=20) throw('Count');\n";
  for(const file of [...files,{name:'CLOCK.HC',bytes:Buffer.from(check,'latin1')}]) {
    const id=h.gx.writeFile({path:`C:/ORACLE/${file.name}`,bytes:file.bytes});
    for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  const id=h.gx.launch({path:'C:/ORACLE/CLOCK.HC'});
  for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
  assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  console.log(JSON.stringify({backend,cases:20,bad:0},null,2));
}
