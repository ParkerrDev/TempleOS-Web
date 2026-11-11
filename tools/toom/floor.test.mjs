import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const bytes=readFileSync(resolve(root,'games/Toom/TMDATA.BIN')),cases=[];
let steps=0;
for(let type=0;type<12;type++)for(const old of [-513,-32,0,48])
 for(const near of [-768,-16,16,64])for(const ceiling of [64,128])for(const nearCeil of [64,192]) {
  let dest=old,direction=1,speed=1,changed=false;
  switch(type) {
    case 0:direction=-1;dest=near;break;
    case 1:direction=-1;dest=Math.min(old,near);break;
    case 2:direction=-1;dest=near+(near===old?0:8);speed=4;break;
    case 3:dest=Math.min(ceiling,nearCeil);break;
    case 4:dest=Math.min(ceiling,nearCeil)-8;break;
    case 5:speed=4;
    case 6:dest=near>old?near:old;break;
    case 7:dest=old+24;break;
    case 8:dest=old+512;break;
    case 9:dest=old+24;changed=true;break;
    case 10:dest=old+24;break;
    case 11:direction=-1;dest=Math.min(old,near);changed=near<=old;break;
  }
  const count=Math.max(1,Math.floor(direction*(dest-old)/speed)+1);steps+=count;
  cases.push([type,old*65536,near*65536,ceiling*65536,nearCeil*65536,
    direction,speed*65536,dest*65536,count,+changed]);
 }
const records=Buffer.alloc(8+cases.length*80);records.writeBigInt64LE(BigInt(cases.length));
cases.flat().forEach((n,i)=>records.writeBigInt64LE(BigInt(n),8+i*8));
const source=['TmGlbls.HH','TmWad.HC','TmMap.HC','TmGr.HC','TmTex.HC','TmData.HH','TmClip.HC',
  'TmState.HC','TmMath.HC','TmWorld.HC','TmContact.HC','TmMove.HC','TmPath.HC',
  'TmSlide.HC','TmPlayer.HH','TmMotion.HC','TmDamage.HC','TmSector.HC','TmFloor.HC']
  .map(n=>readFileSync(resolve(root,'games/Toom',n),'latin1')).join('\n')+'\n'+
  ['Rooms.HC','Floor.HC'].map(n=>readFileSync(resolve(root,'tools/toom',n),'latin1')).join('\n');
const files=[{name:'TMDATA.BIN',bytes},{name:'FLOORS.BIN',bytes:records}];
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:180});
  console.log(JSON.stringify(result,null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,new RegExp(`FLOOR ${cases.length} CASES ${steps} TICS BAD 0`));
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
  const done=h.gx.varFind('tm_floor_done');assert(done);assert.equal(h.gx.rd64(done),1);
  assert.equal(h.gx.rd64(h.gx.varFind('tm_floor_cnt')),cases.length);
  assert.equal(h.gx.rd64(h.gx.varFind('tm_floor_tics')),steps);
  console.log(JSON.stringify({backend,cases:cases.length,tics:steps,bad:0},null,2));
}
