import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FreedoomRead,root} from './Assets.mjs';
import {BrainMaps} from './BrainMaps.mjs';
import {WadRead,MapRead} from './Wad.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const phase1=FreedoomRead(),{bytes:phase2}=await BrainMaps(),data=readFileSync(resolve(root,'games/Toom/TMDATA.BIN'));
const types=Array.from({length:137},(_,i)=>({number:data.readInt32LE(32+967*28+i*92),flags:data.readUInt32LE(32+967*28+i*92+84)}));
const rows=[];
for(const [phase,bytes]of [[1,phase1],[2,phase2]]) {
  const lumps=WadRead(bytes);
  for(let i=0;i<lumps.length;i++)if(phase===1?/^E[1-4]M[1-9]$/.test(lumps[i].name):/^MAP\d\d$/.test(lumps[i].name)) {
    const map=MapRead(lumps,i),episode=phase===1?Number(map.name[1]):1,num=Number(map.name.slice(3));
    let actors=0,kills=0,items=0,players=0;
    for(const [,,,type,flags]of map.things) {
      if(type===1)players=1;
      else if((flags&2)&&!(flags&16)&&!(type>=2&&type<=4)&&type!==11) {
        const info=types.find(t=>t.number===type);assert(info,`${map.name}: unknown thing ${type}`);
        actors++;if(info.flags&0x400000)kills++;if(info.flags&0x800000)items++;
      }
    }
    assert.equal(players,1);actors+=players;
    rows.push([phase,episode,num,actors,kills,items,map.sectors.filter(s=>s.special===9).length,
      phase===1?episode:num<12?1:num<21?2:3]);
  }
}
assert.equal(rows.length,68);
const packed=Buffer.alloc(8+rows.length*64);packed.writeBigInt64LE(BigInt(rows.length));
rows.flat().forEach((n,i)=>packed.writeBigInt64LE(BigInt(n),8+i*8));
const game=resolve(root,'games/Toom'),load=readFileSync(resolve(game,'Load.HC'),'latin1');
const source=[...load.matchAll(/#include "([^"]+)"/g)].filter(m=>m[1]!=='TmLevel')
  .map(m=>readFileSync(resolve(game,m[1].includes('.')?m[1]:m[1]+'.HC'),'latin1')).join('\n')+'\n'+
  readFileSync(resolve(game,'TmLevel.HC'),'latin1')+'\n'+readFileSync(resolve(root,'tools/toom/LevelMaps.HC'),'latin1');
const files=[{name:'PHASE1.WAD',bytes:phase1},{name:'PHASE2.WAD',bytes:phase2},{name:'TMDATA.BIN',bytes:data},{name:'LVLMAPS.BIN',bytes:packed}];
const sourceSha256=createHash('sha256').update(Buffer.from(source,'latin1')).digest('hex'),assetHashes=Object.fromEntries(files.map(f=>[f.name,createHash('sha256').update(f.bytes).digest('hex')]));
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:180});
  const trace=[...result.results[0].out.matchAll(/LEVEL MAP (\d+) (\d+) (\d+) ACTORS (\d+) RNG (\d+) HASH (\d+)/g)].map(m=>m.slice(1).map(Number));
  console.log(JSON.stringify({...result,sourceSha256,assetHashes,trace},null,2));
  assert.equal(trace.length,68);
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,/LEVEL MAPS 68 ACTORS \d+ BAD 0/);
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to the checkout with built HEMU dependencies.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  const check=source+"\nif (tm_level_map_done!=1 || tm_level_map_cases!=68) throw('Count');\n";
  for(const file of [...files,{name:'LVLMAPS.HC',bytes:Buffer.from(check,'latin1')}]) {
    const id=h.gx.writeFile({path:`C:/ORACLE/${file.name}`,bytes:file.bytes});
    for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  const id=h.gx.launch({path:'C:/ORACLE/LVLMAPS.HC'});
  for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
  assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  await h.Exec('I64 tm_trace_size;U8 *tm_trace_bytes=FileRead("C:/ORACLE/LVLTRACE.BIN",&tm_trace_size);');
  const ptr=h.gx.rd64(h.gx.varFind('tm_trace_bytes')),size=h.gx.rd64(h.gx.varFind('tm_trace_size'));
  assert(ptr);assert.equal(size,68*6*8);
  const bytes=Buffer.from(h.gx.rdBytes(ptr,size)),trace=Array.from({length:68},(_,i)=>Array.from({length:6},(_,j)=>Number(bytes.readBigInt64LE((i*6+j)*8))));
  await h.Exec('Free(tm_trace_bytes);');
  if(process.env.REFERENCE) {
    const ref=JSON.parse(readFileSync(process.env.REFERENCE));
    assert.equal(sourceSha256,ref.sourceSha256);assert.deepEqual(assetHashes,ref.assetHashes);
    assert.deepEqual(trace,ref.trace);
  }
  console.log(JSON.stringify({backend,sourceSha256,assetHashes,trace,cases:68,bad:0},null,2));
}
