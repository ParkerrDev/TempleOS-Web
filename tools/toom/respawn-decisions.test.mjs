import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';
import {ToomIncludes} from './Package.mjs';
import {RespawnReference} from './RespawnRef.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const {rows,reference}=RespawnReference(),values=[rows.length,...rows.flat()],packed=Buffer.alloc(values.length*8);
values.forEach((v,i)=>packed.writeBigInt64LE(BigInt(v),i*8));
const game=resolve(root,'games/Toom'),
  names=ToomIncludes(),
  probe=readFileSync(new URL('RespawnProbe.HC',import.meta.url),'latin1')+'\n'+
    readFileSync(resolve(game,'TmRespawn.HC'),'latin1')
      .replace(/\bWorldPosition\b/g,'TmRespawnPosition').replace(/\bWorldSpawn\b/g,'TmRespawnSpawn')
      .replace(/\bFixedSector\b/g,'TmRespawnSector').replace(/\bActorTick\b/g,'TmRespawnTick'),
  source=names.map(n=>n==='TmRespawn'?probe:readFileSync(resolve(game,n.includes('.')?n:n+'.HC'),'latin1')).join('\n')+'\n'+
    ['Rooms.HC','RespawnDecisions.HC'].map(n=>readFileSync(new URL(n,import.meta.url),'latin1')).join('\n'),
  sourceSha256=createHash('sha256').update(Buffer.from(source,'latin1')).digest('hex'),
  fixtureSha256=createHash('sha256').update(packed).digest('hex'),
  files=[{name:'TMDATA.BIN',bytes:readFileSync(resolve(game,'TMDATA.BIN'))},{name:'RESPAWN.BIN',bytes:packed}];
assert(names.includes('TmRespawn'));
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:180});
  console.log(JSON.stringify({...result,sourceSha256,fixtureSha256,reference,cases:rows.length},null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,new RegExp(`RESPAWN ${rows.length} DECISIONS BAD 0`));
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to the frozen runtime.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  for(const file of files) {
    const id=h.gx.writeFile({path:`C:/ORACLE/${file.name}`,bytes:file.bytes});
    for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  await h.Exec(source);
  assert.equal(h.gx.rd64(h.gx.varFind('tm_respawn_done')),1);
  assert.equal(h.gx.rd64(h.gx.varFind('tm_respawn_cases')),rows.length);
  console.log(JSON.stringify({backend,sourceSha256,fixtureSha256,reference,cases:rows.length,bad:0},null,2));
}
