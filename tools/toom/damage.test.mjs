import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const bytes=readFileSync(resolve(root,'games/Toom/TMDATA.BIN'));
const cases=[];
for(const health of [1,100,200])for(const armor of [0,1,50,200])
  for(const type of [0,1,2])for(const damage of [-1,0,1,2,3,20,99,100,999,1000,10000])
    for(const skill of [0,2])for(const guard of [0,1,2])for(const sector of [0,11]) {
      let hp=health,ar=armor,at=type,count=0;
      if(damage>=0) {
        let d=skill===0?damage>>1:damage;
        if(sector===11&&d>=hp)d=hp-1;
        if(!(d<1000&&guard)) {
          if(at) {
            let save=Math.floor(d/(at===1?3:2));
            if(ar<=save){save=ar;at=0;}
            ar-=save;d-=save;
          }
          hp-=d;count=Math.min(d,100);
        }
      }
      cases.push([health,armor,type,damage,skill,guard===1?1:0,guard===2?1:0,sector,
        hp,ar,at,count,hp<=0?1:0,(hp<=0?14:56)*65536]);
    }
const records=Buffer.alloc(8+cases.length*112);records.writeBigInt64LE(BigInt(cases.length));
cases.flat().forEach((n,i)=>records.writeBigInt64LE(BigInt(n),8+i*8));
const badMass=Buffer.from(bytes);badMass.writeInt32LE(0,32+967*28+18*4);
const total=cases.length+20;
const source=['TmGlbls.HH','TmWad.HC','TmMap.HC','TmData.HH','TmClip.HC',
  'TmState.HC','TmMath.HC','TmWorld.HC','TmContact.HC','TmMove.HC','TmPath.HC','TmSlide.HC','TmMotion.HC','TmDamage.HC']
  .map(n=>readFileSync(resolve(root,'games/Toom',n),'latin1')).join('\n')+'\n'+
  ['Rooms.HC','Damage.HC'].map(n=>readFileSync(resolve(root,'tools/toom',n),'latin1')).join('\n');
const files=[{name:'TMDATA.BIN',bytes},{name:'DAMAGE.BIN',bytes:records},{name:'BADMASS.BIN',bytes:badMass}];
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:120});
  console.log(JSON.stringify(result,null,2));
  assert.equal(result.results[0].except,'');
  assert.match(result.results[0].out,new RegExp(`DAMAGE ${total} CASES BAD 0`));
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
  const done=h.gx.varFind('tm_damage_done');assert(done);assert.equal(h.gx.rd64(done),1);
  assert.equal(h.gx.rd64(h.gx.varFind('tm_damage_cnt')),total);
  console.log(JSON.stringify({backend,cases:total,bad:0},null,2));
}
