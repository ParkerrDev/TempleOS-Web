import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const bytes=readFileSync(resolve(root,'games/Toom/TMDATA.BIN'));
const source=['TmGlbls.HH','TmWad.HC','TmMap.HC','TmData.HH','TmClip.HC',
  'TmState.HC','TmMath.HC','TmWorld.HC','TmContact.HC','TmMove.HC','TmPath.HC','TmSlide.HC','TmPlayer.HH','TmMotion.HC']
  .map(n=>readFileSync(resolve(root,'games/Toom',n),'latin1')).join('\n')+'\n'+
  ['Rooms.HC','Motion.HC'].map(n=>readFileSync(resolve(root,'tools/toom',n),'latin1')).join('\n');
const files=[{name:'TMDATA.BIN',bytes}];
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:120});
  console.log(JSON.stringify(result,null,2));
  assert.equal(result.results[0].except,'');
  assert.match(result.results[0].out,/MOTION 35 CASES BAD 0/);
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to the checkout with built HEMU dependencies.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  for(const file of files) {
    const id=h.gx.writeFile({path:`C:/ORACLE/${file.name}`,bytes:file.bytes});
    for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  await h.Exec(source);
  const done=h.gx.varFind('tm_motion_done');assert(done);assert.equal(h.gx.rd64(done),1);
  assert.equal(h.gx.rd64(h.gx.varFind('tm_motion_cnt')),35);
  console.log(JSON.stringify({backend,cases:35,bad:0},null,2));
}
