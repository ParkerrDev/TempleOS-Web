import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';
import {ToomText} from './Package.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const game=resolve(root,'games/Toom');
const source=ToomText()+'\n'+
  ['Rooms.HC','Projectile.HC'].map(n=>readFileSync(resolve(root,'tools/toom',n),'latin1')).join('\n');
const data=readFileSync(resolve(game,'TMDATA.BIN')),rnd=data.subarray(-256),rows=[];
const trig=32+967*28+137*92+138*4+109*8,sine=n=>data.readInt32LE(trig+n*4);
const fixed=(a,b)=>Number(BigInt.asIntN(32,BigInt(a)*BigInt(b)>>16n));
for(const type of [6,9,16,28,31,32,33,36])for(const shadow of [0,262144])for(const seed of [0,1,127,255])for(const z of [0,20*65536]) {
  const off=32+967*28+type*92,speed=data.readInt32LE(off+15*4),state=data.readInt32LE(off+4),sound=data.readInt32LE(off+16);
  let index=(seed+1)&255;const look=rnd[index]&3,soundRng=sound?index:-1;
  let angle=0;
  if(shadow){index=(index+1)&255;const first=rnd[index];index=(index+1)&255;angle=((first-rnd[index])*1048576)>>>0;}
  const vx=fixed(speed,sine((angle>>>19)+2048)),vy=fixed(speed,sine(angle>>>19));
  const vz=Math.trunc(z/Math.max(1,Math.trunc(128*65536/speed)));
  index=(index+1)&255;const tics=Math.max(1,data.readInt32LE(32+state*28+8)-(rnd[index]&3));
  rows.push([type,shadow,seed,z,angle,vx,vy,vz,-64*65536+(vx>>1),vy>>1,32*65536+(vz>>1),tics,look,index,sound||-1,soundRng]);
}
const values=[rows.length,...rows.flat()],packed=Buffer.alloc(values.length*8);
values.forEach((v,i)=>packed.writeBigInt64LE(BigInt(v),i*8));
const total=rows.length+9,files=[{name:'TMDATA.BIN',bytes:data},{name:'PROJREAL.BIN',bytes:packed}];
const sourceSha256=createHash('sha256').update(Buffer.from(source,'latin1')).digest('hex');
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:120});
  console.log(JSON.stringify({...result,sourceSha256},null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,new RegExp(`PROJECTILE ${total} REAL CASES BAD 0`));
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to the checkout with built HEMU dependencies.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  const check=source+`\nif (tm_proj_real_done!=1 || tm_proj_real_cases!=${total}) throw('Count');\n`;
  for(const file of [...files,{name:'PROJREAL.HC',bytes:Buffer.from(check,'latin1')}]) {
    const id=h.gx.writeFile({path:`C:/ORACLE/${file.name}`,bytes:file.bytes});
    for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  const id=h.gx.launch({path:'C:/ORACLE/PROJREAL.HC'});
  for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
  assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  console.log(JSON.stringify({backend,sourceSha256,cases:total,bad:0},null,2));
}
