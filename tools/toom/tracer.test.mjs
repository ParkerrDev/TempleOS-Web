import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const game=resolve(root,'games/Toom'),load=readFileSync(resolve(game,'Load.HC'),'latin1');
let source=[...load.matchAll(/#include "([^"]+)"/g)]
  .map(m=>readFileSync(resolve(game,m[1].includes('.')?m[1]:m[1]+'.HC'),'latin1')).join('\n')+'\n'+
  ['Rooms.HC','Tracer.HC'].map(n=>readFileSync(resolve(root,'tools/toom',n),'latin1')).join('\n');
const data=readFileSync(resolve(game,'TMDATA.BIN')),rnd=data.subarray(-256),rows=[];
const trig=32+967*28+137*92+138*4+109*8,sine=n=>data.readInt32LE(trig+n*4);
const fixed=(a,b)=>Number(BigInt.asIntN(32,BigInt(a)*BigInt(b)>>16n));
const type=6,off=32+967*28+type*92,speed=data.readInt32LE(off+15*4),state=data.readInt32LE(off+4),sound=data.readInt32LE(off+16);
for(const x of [-64*65536,-10*65536])for(const z of [0,16*65536])for(const tz of [0,20*65536,80*65536])
  for(const shadow of [0,262144])for(const seed of [0,1,127,255]) {
  let index=seed;const rand=()=>rnd[index=(index+1)&255];
  let face=0;if(shadow){const first=rand();face=((first-rand())*2097152)>>>0;}
  const look=rand()&3,soundRng=index;let angle=0;
  if(shadow){const first=rand();angle=((first-rand())*1048576)>>>0;}
  const vx=fixed(speed,sine((angle>>>19)+2048)),vy=fixed(speed,sine(angle>>>19));
  const vz=Math.trunc((tz-z-16*65536)/Math.max(1,Math.trunc(128*65536/speed)));
  const tics=Math.max(1,data.readInt32LE(32+state*28+8)-(rand()&3));
  const px=x+(vx>>1)+vx,py=(vy>>1)+vy,pz=z+48*65536+(vz>>1),sector=px<=0?1:0;
  rows.push([x,z,tz,shadow,seed,face,z,index,angle,vx,vy,vz,px,py,pz,tics,look,sector,(sector?-3:7)*65536,(sector?128:96)*65536,sound,soundRng]);
}
const spawnTics=type=>{const state=data.readInt32LE(32+967*28+type*92+4);return data.readInt32LE(32+state*28+8);};
const defs=Object.fromEntries([...readFileSync(resolve(game,'TmData.HH'),'ascii').matchAll(/^#define (TM_\w+)\s+(\d+)$/gm)].map(m=>[m[1],Number(m[2])]));
source=`#define TM_TRACER_VX ${fixed(speed,sine(2048))}\n#define TM_TRACER_VY ${fixed(speed,sine(0))}\n`+
  `#define TM_TRACER_PUFF_Z ${32*65536+(rnd[1]-rnd[2])*1024}\n`+
  `#define TM_TRACER_PUFF_TICS ${Math.max(1,spawnTics(defs.TM_MT_PUFF)-(rnd[4]&3))}\n`+
  `#define TM_TRACER_SMOKE_TICS ${Math.max(1,spawnTics(defs.TM_MT_SMOKE)-(rnd[6]&3))}\n`+source;
const values=[rows.length,...rows.flat()],packed=Buffer.alloc(values.length*8);
values.forEach((v,i)=>packed.writeBigInt64LE(BigInt(v),i*8));
const total=rows.length+14,files=[{name:'TMDATA.BIN',bytes:data},{name:'TRACREAL.BIN',bytes:packed}];
const sourceSha256=createHash('sha256').update(Buffer.from(source,'latin1')).digest('hex');
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:120});
  console.log(JSON.stringify({...result,sourceSha256},null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,new RegExp(`TRACER ${total} REAL CASES BAD 0`));
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to the checkout with built HEMU dependencies.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  const check=source+`\nif (tm_tracer_real_done!=1 || tm_tracer_real_cases!=${total}) throw('Count');\n`;
  for(const file of [...files,{name:'TRACREAL.HC',bytes:Buffer.from(check,'latin1')}]) {
    const id=h.gx.writeFile({path:`C:/ORACLE/${file.name}`,bytes:file.bytes});
    for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  const id=h.gx.launch({path:'C:/ORACLE/TRACREAL.HC'});
  for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
  assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  console.log(JSON.stringify({backend,sourceSha256,cases:total,bad:0},null,2));
}
