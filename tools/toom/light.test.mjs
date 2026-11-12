import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';
import {ToomText} from './Package.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const bytes=readFileSync(resolve(root,'games/Toom/TMDATA.BIN')),randomTable=bytes.subarray(-256);
const records=[200];let seed=0;
// Timelines from pinned p_lights.c, including external light changes during cycles.
for(const special of [1,2,3,4,8,12,13,17])for(const high of [0,8,32,128,255])for(const neighbor of [0,8,16,128,255]) {
  let random=(seed++*43)&255,light=high,low=Math.min(high,neighbor),tics=0,direction=-1,dark=0;
  const initial=random,rnd=()=>randomTable[random=(random+1)&255];
  let kind='strobe',retained=0;
  if(special===1){kind='flash';tics=(rnd()&64)+1;}
  else if(special===8)kind='glow';
  else if(special===17){kind='fire';low+=16;tics=4;}
  else {if(low===high)low=0;dark=[2,4,13].includes(special)?15:35;tics=special>=12?1:(rnd()&7)+1;if(special===4)retained=4;}
  records.push(special,high,neighbor,initial,257);
  for(let tic=0;tic<=256;tic++) {
    if(tic) {
      if(tic===31)light=255;if(tic===79)light=0;
      if(kind==='glow') {
        if(direction<0){light-=8;if(light<=low){light+=8;direction=1;}}
        else {light+=8;if(light>=high){light-=8;direction=-1;}}
      } else if(--tics===0) {
        if(kind==='flash'){if(light===high){light=low;tics=(rnd()&7)+1;}else {light=high;tics=(rnd()&64)+1;}}
        else if(kind==='strobe'){if(light===low){light=high;tics=5;}else {light=low;tics=dark;}}
        else {const amount=(rnd()&3)*16;light=light-amount<low?low:high-amount;tics=4;}
      }
    }
    records.push(light,low,high,tics,direction,dark,random,retained);
  }
}
const packed=Buffer.alloc(records.length*8);records.forEach((v,i)=>packed.writeBigInt64LE(BigInt(v),i*8));
const source=ToomText()+'\n'+
  ['Rooms.HC','Light.HC'].map(n=>readFileSync(resolve(root,'tools/toom',n),'latin1')).join('\n');
const files=[{name:'TMDATA.BIN',bytes},{name:'LIGHTS.BIN',bytes:packed}];
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:180});
  console.log(JSON.stringify(result,null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,/LIGHT 209 CASES 51200 TICS BAD 0/);
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
  for(const [name,n] of [['done',1],['cases',209],['tics',51200]])
    assert.equal(h.gx.rd64(h.gx.varFind(`tm_light_${name}`)),n);
  console.log(JSON.stringify({backend,cases:209,tics:51200,bad:0},null,2));
}
