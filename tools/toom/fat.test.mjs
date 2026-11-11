import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const game=resolve(root,'games/Toom'),load=readFileSync(resolve(game,'Load.HC'),'latin1');
const source=[...load.matchAll(/#include "([^"]+)"/g)]
  .map(m=>readFileSync(resolve(game,m[1].includes('.')?m[1]:m[1]+'.HC'),'latin1')).join('\n')+'\n'+
  ['Rooms.HC','Fat.HC'].map(n=>readFileSync(resolve(root,'tools/toom',n),'latin1')).join('\n');
const data=readFileSync(resolve(game,'TMDATA.BIN')),rnd=data.subarray(-256),rows=[];
const trig=32+967*28+137*92+138*4+109*8,sine=n=>data.readInt32LE(trig+n*4);
const fixed=(a,b)=>Number(BigInt.asIntN(32,BigInt(a)*BigInt(b)>>16n));
const type=9,off=32+967*28+type*92,speed=data.readInt32LE(off+15*4),state=data.readInt32LE(off+4);
for(const n of [1,2,3])for(const shadow of [0,262144])for(const seed of [0,1,63,127,255])for(const z of [-40*65536,0,60*65536]) {
  let index=seed;const rand=()=>rnd[index=(index+1)&255];
  let actorAngle=0;if(shadow){const first=rand();actorAngle=((first-rand())*2097152)>>>0;}
  actorAngle=(actorAngle+(n===1?0x8000000:n===2?-0x8000000:0))>>>0;
  const missiles=[];
  for(let j=0;j<2;j++) {
    const look=rand()&3,soundRng=index;let angle=0;
    if(shadow){const first=rand();angle=((first-rand())*1048576)>>>0;}
    let vx=fixed(speed,sine((angle>>>19)+2048)),vy=fixed(speed,sine(angle>>>19));
    const vz=Math.trunc(z/6),x=-64*65536+(vx>>1),y=vy>>1,pz=32*65536+(vz>>1);
    const tics=Math.max(1,data.readInt32LE(32+state*28+8)-(rand()&3));
    const delta=n===3?(j?0x4000000:-0x4000000):(j?(n===1?0x8000000:-0x10000000):0);
    if(delta){angle=(angle+delta)>>>0;vx=fixed(speed,sine((angle>>>19)+2048));vy=fixed(speed,sine(angle>>>19));}
    missiles.push(angle,vx,vy,vz,x,y,pz,tics,look,soundRng);
  }
  rows.push([n,shadow,seed,z,actorAngle,index,...missiles]);
}
const values=[rows.length,...rows.flat()],packed=Buffer.alloc(values.length*8);
values.forEach((v,i)=>packed.writeBigInt64LE(BigInt(v),i*8));
const total=rows.length+12,files=[{name:'TMDATA.BIN',bytes:data},{name:'FATREAL.BIN',bytes:packed}];
const sourceSha256=createHash('sha256').update(Buffer.from(source,'latin1')).digest('hex');
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:120});
  console.log(JSON.stringify({...result,sourceSha256},null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,new RegExp(`FAT ${total} REAL CASES BAD 0`));
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to the checkout with built HEMU dependencies.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  const check=source+`\nif (tm_fat_real_done!=1 || tm_fat_real_cases!=${total}) throw('Count');\n`;
  for(const file of [...files,{name:'FATREAL.HC',bytes:Buffer.from(check,'latin1')}]) {
    const id=h.gx.writeFile({path:`C:/ORACLE/${file.name}`,bytes:file.bytes});
    for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  const id=h.gx.launch({path:'C:/ORACLE/FATREAL.HC'});
  for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
  assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  console.log(JSON.stringify({backend,sourceSha256,cases:total,bad:0},null,2));
}
