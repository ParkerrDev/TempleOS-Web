import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const bytes=readFileSync(resolve(root,'games/Toom/TMDATA.BIN'));
const cases=[];
for(const floor of [-32,0,21,42,48,49,56,64])for(const ceil of [0,21,22,35,42,49,64,128])
 for(const sz of [0,32])for(const tz of [0,64]) {
  const eye=sz+42,lo=Math.max(0,floor),hi=Math.min(128,ceil);
  const bottom=Math.max(tz-eye,(lo-eye)*2),top=Math.min(tz+56-eye,(hi-eye)*2);
  cases.push([floor,ceil,sz,tz,+(lo<hi&&bottom<top)]);
 }
const records=Buffer.alloc(8+cases.length*40);records.writeBigInt64LE(BigInt(cases.length));
cases.flat().forEach((n,i)=>records.writeBigInt64LE(BigInt(n),8+i*8));
let index=0,damage=0;const rng=bytes.subarray(bytes.length-256),rand=()=>rng[index=(index+1)&255];
for(let i=0;i<40;i++){rand();for(let j=0;j<15;j++)damage+=(rand()&7)+1;rand();}
const total=cases.length+23;
const game=resolve(root,'games/Toom'),load=readFileSync(resolve(game,'Load.HC'),'latin1');
const source=`#define TM_BFG_DAMAGE ${damage}\n#define TM_BFG_RANDOM ${index}\n`+
  [...load.matchAll(/#include "([^"]+)"/g)]
  .map(m=>readFileSync(resolve(game,m[1].includes('.')?m[1]:m[1]+'.HC'),'latin1')).join('\n')+'\n'+
  ['Rooms.HC','Blast.HC'].map(n=>readFileSync(resolve(root,'tools/toom',n),'latin1')).join('\n');
const sourceSha256=createHash('sha256').update(Buffer.from(source,'latin1')).digest('hex');
const files=[{name:'TMDATA.BIN',bytes},{name:'SIGHT.BIN',bytes:records}];
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:120});
  console.log(JSON.stringify({...result,sourceSha256},null,2));
  assert.equal(result.results[0].except,'');
  assert.match(result.results[0].out,new RegExp(`BLAST ${total} CASES BAD 0`));
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
  const done=h.gx.varFind('tm_blast_done');assert(done);assert.equal(h.gx.rd64(done),1);
  assert.equal(h.gx.rd64(h.gx.varFind('tm_blast_cnt')),total);
  console.log(JSON.stringify({backend,sourceSha256,cases:total,bad:0},null,2));
}
