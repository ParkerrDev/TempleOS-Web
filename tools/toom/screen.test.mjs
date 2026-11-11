import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FreedoomRead,root} from './Assets.mjs';
import {BrainMaps} from './BrainMaps.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const game=resolve(root,'games/Toom'),load=readFileSync(resolve(game,'Load.HC'),'latin1');
const source=[...load.matchAll(/#include "([^"]+)"/g)].filter(m=>m[1]!=='TmScreen')
  .map(m=>readFileSync(resolve(game,m[1].includes('.')?m[1]:m[1]+'.HC'),'latin1')).join('\n')+'\n'+
  readFileSync(resolve(game,'TmScreen.HC'),'latin1')+'\n'+readFileSync(resolve(root,'tools/toom/Screen.HC'),'latin1');
const {bytes:phase2}=await BrainMaps();
const files=[{name:'PHASE1.WAD',bytes:FreedoomRead()},{name:'PHASE2.WAD',bytes:phase2},{name:'TMDATA.BIN',bytes:readFileSync(resolve(game,'TMDATA.BIN'))}];
const sourceSha256=createHash('sha256').update(Buffer.from(source,'latin1')).digest('hex'),
  assetHashes=Object.fromEntries(files.map(f=>[f.name,createHash('sha256').update(f.bytes).digest('hex')]));
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:180});
  const trace=[...result.results[0].out.matchAll(/^SCREEN (\d+) (\d+) (\d+) (\d+) (\d+) (\d+) (\d+) (\d+)$/gm)].map(m=>m.slice(1).map(Number));
  console.log(JSON.stringify({...result,sourceSha256,assetHashes,trace},null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,/SCREEN 31 CASES BAD 0/);assert.equal(trace.length,24);
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to the checkout with built HEMU dependencies.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  const check=source+"\nif (tm_screen_done!=1 || tm_screen_cases!=31) throw('Count');\n";
  for(const file of [...files,{name:'SCREEN.HC',bytes:Buffer.from(check,'latin1')}]) {
    const id=h.gx.writeFile({path:`C:/ORACLE/${file.name}`,bytes:file.bytes});
    for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  const id=h.gx.launch({path:'C:/ORACLE/SCREEN.HC'});
  for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
  assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  await h.Exec('I64 tm_screen_size;U8 *tm_screen_bytes=FileRead("C:/ORACLE/SCREEN.BIN",&tm_screen_size);');
  const ptr=h.gx.rd64(h.gx.varFind('tm_screen_bytes')),size=h.gx.rd64(h.gx.varFind('tm_screen_size'));
  assert(ptr);assert.equal(size,24*8*8);
  const bytes=Buffer.from(h.gx.rdBytes(ptr,size)),trace=Array.from({length:24},(_,i)=>Array.from({length:8},(_,j)=>Number(bytes.readBigInt64LE((i*8+j)*8))));
  await h.Exec('Free(tm_screen_bytes);');
  if(process.env.REFERENCE) {
    const ref=JSON.parse(readFileSync(process.env.REFERENCE));
    assert.equal(sourceSha256,ref.sourceSha256);assert.deepEqual(assetHashes,ref.assetHashes);assert.deepEqual(trace,ref.trace);
  }
  console.log(JSON.stringify({backend,sourceSha256,assetHashes,trace,cases:31,bad:0},null,2));
}
