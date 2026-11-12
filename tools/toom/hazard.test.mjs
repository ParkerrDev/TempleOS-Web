import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';
import {ToomText} from './Package.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const bytes=readFileSync(resolve(root,'games/Toom/TMDATA.BIN')),randomTable=bytes.subarray(-256);
const records=[384];
for(const original of [4,5,7,9,11,16])for(const boots of [0,1])for(const originalGod of [0,1])
for(const airborne of [0,1])for(const seed of [0,1,64,255])for(const skill of [0,2]) {
  const initialHealth=original===11?40:1000;
  let special=original,god=originalGod,health=initialHealth,random=seed,secrets=3,exits=0,damageCount=0;
  const rnd=()=>randomTable[random=(random+1)&255];
  records.push(original,boots,originalGod,airborne,seed,skill,128,initialHealth);
  for(let tic=0;tic<128;tic++) {
    if(!airborne) {
      let damage=0;
      if(special===5&&!boots)damage=10;
      if(special===7&&!boots)damage=5;
      if([4,16].includes(special)&&(!boots||rnd()<5))damage=20;
      if(special===9){secrets++;special=0;}
      if(special===11){god=0;damage=20;}
      if(damage&&!(tic&31)) {
        if(!skill)damage>>=1;
        if(special===11&&damage>=health)damage=health-1;
        if(!god){health-=damage;damageCount=Math.min(100,damageCount+damage);rnd();}
      }
      if(special===11&&health<=10)exits++;
    }
    records.push(health,random,special,god,secrets,exits,damageCount);
  }
}
const packed=Buffer.alloc(records.length*8);records.forEach((v,i)=>packed.writeBigInt64LE(BigInt(v),i*8));
const source=ToomText()+'\n'+
  ['Rooms.HC','Hazard.HC'].map(n=>readFileSync(resolve(root,'tools/toom',n),'latin1')).join('\n');
const files=[{name:'TMDATA.BIN',bytes},{name:'HAZARD.BIN',bytes:packed}];
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:180});
  console.log(JSON.stringify(result,null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,/HAZARD 391 CASES 49152 TICS BAD 0/);
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
  for(const [name,n] of [['done',1],['cases',391],['tics',49152]])
    assert.equal(h.gx.rd64(h.gx.varFind(`tm_hazard_${name}`)),n);
  console.log(JSON.stringify({backend,cases:391,tics:49152,bad:0},null,2));
}
