import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const bytes=readFileSync(resolve(root,'games/Toom/TMDATA.BIN')),rows=[];
const random=bytes[bytes.length-255];let tics=0;
for(let kind=3;kind<=4;kind++)for(let type=0;type<(kind===3?5:6);type++) {
  const count=kind===3?500:800,initial=kind===3?32*65536:128*65536;
  let value=initial,active=1,direction=-1,delay=0,sounds=0,last=0;
  let speed=65536,low=0,high=initial,wait=105;
  const sound=n=>{sounds++;last=n;};
  if(kind===3) {
    switch(type) {
      case 0:direction=random&1?-1:1;break;
      case 1:speed*=4;break;
      case 2:speed/=2;wait=0;direction=1;high+=24*65536;low=initial;break;
      case 3:speed/=2;wait=0;direction=1;high=64*65536;low=initial;break;
      case 4:speed*=8;break;
    }
    sound(type===2||type===3?22:18);
  } else {
    if(type!==0)low=8*65536;
    if(type===1){direction=1;high=192*65536;}
    if(type===4)speed*=2;
  }
  rows.push(kind,type,count);
  for(let tic=0;tic<count;tic++) {
    if(active) {
      if(kind===3&&direction===0) {
        if(delay>0)delay--;
        if(!delay){direction=value===low?1:-1;sound(18);}
      } else {
        const dest=direction===1?high:low,next=value+direction*speed;
        const past=direction===1?next>dest:next<dest;
        value=past?dest:next;
        if(kind===3) {
          if(direction===1&&(type===2||type===3)&&!(tic&7))sound(22);
          if(past){delay=wait;const wasUp=direction===1;direction=0;sound(19);
            if(wasUp&&type!==0)active=0;}
        } else {
          if(!(tic&7)&&type!==5)sound(22);
          if(past) {
            if(type<3)active=0;
            else {if(type===5)sound(19);if(direction===-1&&type!==4)speed=65536;direction=-direction;}
          }
        }
      }
    }
    rows.push(value,active,active?direction:0,active?delay:0,active?speed:0,sounds,last);
  }
  tics+=count;
}
const records=Buffer.alloc(rows.length*8);rows.forEach((n,i)=>records.writeBigInt64LE(BigInt(n),i*8));
const source=['TmGlbls.HH','TmWad.HC','TmMap.HC','TmGr.HC','TmTex.HC','TmData.HH','TmClip.HC',
  'TmState.HC','TmMath.HC','TmWorld.HC','TmContact.HC','TmMove.HC','TmPath.HC',
  'TmSlide.HC','TmPlayer.HH','TmMotion.HC','TmDamage.HC','TmSector.HC','TmFloor.HC','TmPlat.HC','TmCeil.HC']
  .map(n=>readFileSync(resolve(root,'games/Toom',n),'latin1')).join('\n')+'\n'+
  ['Rooms.HC','Movers.HC'].map(n=>readFileSync(resolve(root,'tools/toom',n),'latin1')).join('\n');
const files=[{name:'TMDATA.BIN',bytes},{name:'MOVERS.BIN',bytes:records}];
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:180});
  console.log(JSON.stringify(result,null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,new RegExp(`MOVERS ${tics} TICS BAD 0`));
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
  const done=h.gx.varFind('tm_movers_done');assert(done);assert.equal(h.gx.rd64(done),1);
  assert.equal(h.gx.rd64(h.gx.varFind('tm_movers_tics')),tics);
  console.log(JSON.stringify({backend,tics,bad:0},null,2));
}
