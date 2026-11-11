import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';
import {ThinkReference} from './ThinkRef.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const {rows}=await ThinkReference(),records=[rows.length,...rows.flat()],packed=Buffer.alloc(records.length*8);
records.forEach((n,i)=>packed.writeBigInt64LE(BigInt(n),i*8));
let calls=0;
for(const row of rows) {let at=7;for(let pass=0;pass<2;pass++){const n=row[at++];calls+=n;at+=n;}assert.equal(at,row.length);}
const game=resolve(root,'games/Toom'),load=readFileSync(resolve(game,'Load.HC'),'latin1');
let source=[...load.matchAll(/#include "([^"]+)"/g)].filter(m=>m[1]!=='TmTick')
  .map(m=>readFileSync(resolve(game,m[1].includes('.')?m[1]:m[1]+'.HC'),'latin1')).join('\n')+'\n'+
  readFileSync(resolve(root,'tools/toom/Rooms.HC'),'latin1');
const fixture=readFileSync(resolve(root,'tools/toom/ThinkOrder.HC'),'latin1'),marker='//ThinkersTick.';
assert.equal(fixture.split(marker).length,2);
source+='\n'+fixture.replace(marker,`
#define ActorMotion TmOrderMotion
#define ActorTick TmOrderActor
#define DoorTick TmOrderMover
#define FloorTick TmOrderMover
#define PlatTick TmOrderMover
#define CeilTick TmOrderMover
#define LightTick TmOrderLight
${readFileSync(resolve(game,'TmTick.HC'),'latin1')}
`);
const files=[{name:'THINK.BIN',bytes:packed},{name:'TMDATA.BIN',bytes:readFileSync(resolve(game,'TMDATA.BIN'))}];
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:180});
  console.log(JSON.stringify(result,null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert(result.results[0].out.includes(`THINK ${rows.length} CASES ${calls} CALLS BAD 0`));
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
  for(const [name,n] of [['done',1],['cases',rows.length],['calls',calls]])
    assert.equal(h.gx.rd64(h.gx.varFind(`tm_order_${name}`)),n);
  console.log(JSON.stringify({backend,cases:rows.length,calls,bad:0},null,2));
}
