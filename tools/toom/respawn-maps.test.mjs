import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FreedoomRead,root} from './Assets.mjs';
import {ToomText} from './Package.mjs';
import {WadRead,MapRead} from './Wad.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const wad=FreedoomRead(),data=readFileSync(resolve(root,'games/Toom/TMDATA.BIN')),lumps=WadRead(wad),
  types=Array.from({length:137},(_,i)=>({number:data.readInt32LE(32+967*28+i*92),flags:data.readUInt32LE(32+967*28+i*92+84)})),
  expected=[];
for(let episode=1;episode<=4;episode++)for(let n=1;n<=9;n++) {
  const map=MapRead(lumps,lumps.findIndex(l=>l.name===`E${episode}M${n}`));
  expected.push(map.things.filter(t=>t[4]&4&&!(t[4]&16)&&types.some(info=>info.number===t[3]&&info.flags&0x400000)).length);
}
const packed=Buffer.alloc(36*8);expected.forEach((n,i)=>packed.writeBigInt64LE(BigInt(n),i*8));
const 
  source=ToomText()+'\n'+
    readFileSync(new URL('RespawnMaps.HC',import.meta.url),'latin1'),
  hash=b=>createHash('sha256').update(b).digest('hex'),sourceSha256=hash(Buffer.from(source,'latin1')),
  files=[{name:'FREEDOOM.WAD',bytes:wad},{name:'TMDATA.BIN',bytes:data},{name:'MAPS.BIN',bytes:packed}],
  assetHashes=Object.fromEntries(files.map(f=>[f.name,hash(f.bytes)]));
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the original TempleOS oracle checkout.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:180});
  const trace=[...result.results[0].out.matchAll(/RESPAWN MAP (\d+) MONSTERS (\d+) REPLACED (\d+) BLOCKED (\d+) HASH (\d+)/g)].map(m=>m.slice(1).map(Number));
  console.log(JSON.stringify({...result,sourceSha256,assetHashes,trace},null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,/RESPAWN MAPS 36 BAD 0/);assert.equal(trace.length,36);
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
  assert.equal(h.gx.rd64(h.gx.varFind('tm_respawn_map_done')),1);
  assert.equal(h.gx.rd64(h.gx.varFind('tm_respawn_map_cases')),36);
  const buf=Buffer.from(h.gx.rdBytes(h.gx.varFind('tm_respawn_map_trace'),36*5*8)),
    trace=Array.from({length:36},(_,i)=>Array.from({length:5},(_,j)=>Number(buf.readBigInt64LE((i*5+j)*8))));
  if(process.env.REFERENCE) {
    const ref=JSON.parse(readFileSync(process.env.REFERENCE));assert.equal(ref.sourceSha256,sourceSha256);
    assert.deepEqual(ref.assetHashes,assetHashes);assert.deepEqual(trace,ref.trace);
  }
  console.log(JSON.stringify({backend,sourceSha256,assetHashes,trace,cases:36,bad:0},null,2));
}
