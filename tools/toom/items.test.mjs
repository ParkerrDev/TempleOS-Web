import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const bytes=readFileSync(resolve(root,'games/Toom/TMDATA.BIN'));
const definitions=Object.fromEntries([...readFileSync(resolve(root,'games/Toom/TmData.HH'),'ascii')
  .matchAll(/^#define (TM_\w+)\s+(-?\d+)$/gm)].map(m=>[m[1],Number(m[2])]));
const clips=[10,4,20,1],maxima=[200,50,300,50],cases=[];
for(const skill of [0,2,4])for(const ready of [0,1,2,5])for(const owned of [3,511])
  for(let type=0;type<4;type++)for(const scale of [1,2]) {
    const max=maxima[type]*scale;
    for(const old of [0,max-1,max])for(const loads of [0,1,2,5]) {
      let count=old,pending=definitions.TM_WP_NOCHANGE,ok=old<max;
      if(ok) {
        const n=(loads?loads*clips[type]:Math.floor(clips[type]/2))*(skill===0||skill===4?2:1);
        count=Math.min(old+n,max);
        if(!old) {
          if(type===0&&ready===0)pending=owned&8?3:1;
          if(type===1&&ready<=1&&(owned&4))pending=2;
          if(type===2&&ready<=1&&(owned&32))pending=5;
          if(type===3&&ready===0&&(owned&16))pending=4;
        }
      }
      cases.push([skill,ready,owned,type,old,max,loads,ok?1:0,count,pending]);
    }
  }
const records=Buffer.alloc(8+cases.length*80);records.writeBigInt64LE(BigInt(cases.length));
cases.flat().forEach((n,i)=>records.writeBigInt64LE(BigInt(n),8+i*8));
const total=cases.length+52;
const source=['TmGlbls.HH','TmWad.HC','TmMap.HC','TmData.HH','TmClip.HC',
  'TmState.HC','TmMath.HC','TmWorld.HC','TmContact.HC','TmMove.HC','TmPath.HC','TmSlide.HC','TmPlayer.HH','TmMotion.HC','TmItems.HC']
  .map(n=>readFileSync(resolve(root,'games/Toom',n),'latin1')).join('\n')+'\n'+
  ['Rooms.HC','Items.HC'].map(n=>readFileSync(resolve(root,'tools/toom',n),'latin1')).join('\n');
const files=[{name:'TMDATA.BIN',bytes},{name:'AMMO.BIN',bytes:records}];
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:120});
  console.log(JSON.stringify(result,null,2));
  assert.equal(result.results[0].except,'');
  assert.match(result.results[0].out,new RegExp(`ITEMS ${total} CASES BAD 0`));
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
  const done=h.gx.varFind('tm_items_done');assert(done);assert.equal(h.gx.rd64(done),1);
  assert.equal(h.gx.rd64(h.gx.varFind('tm_items_cnt')),total);
  console.log(JSON.stringify({backend,cases:total,bad:0},null,2));
}
