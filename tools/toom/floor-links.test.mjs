import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const source=['TmGlbls.HH','TmWad.HC','TmMap.HC','TmGr.HC','TmTex.HC','TmData.HH','TmClip.HC',
  'TmState.HC','TmMath.HC','TmWorld.HC','TmContact.HC','TmMove.HC','TmPath.HC',
  'TmSlide.HC','TmPlayer.HH','TmMotion.HC','TmDamage.HC','TmSector.HC','TmFloor.HC']
  .map(n=>readFileSync(resolve(root,'games/Toom',n),'latin1')).join('\n')+'\n'+
  ['Rooms.HC','FloorLinks.HC'].map(n=>readFileSync(resolve(root,'tools/toom',n),'latin1')).join('\n');
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{timeout:120});
  console.log(JSON.stringify(result,null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,/FLOOR LINKS 607 CASES BAD 0/);
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to the checkout with built HEMU dependencies.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness();await h.Exec(source);
  const done=h.gx.varFind('tm_floor_links_done');assert(done);assert.equal(h.gx.rd64(done),1);
  assert.equal(h.gx.rd64(h.gx.varFind('tm_floor_links_cnt')),607);
  console.log(JSON.stringify({backend,cases:607,bad:0},null,2));
}
