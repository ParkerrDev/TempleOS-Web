import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const bytes=readFileSync(resolve(root,'games/Toom/TMDATA.BIN')),cases=[];
// State/time expectations from the pinned T_VerticalDoor with empty-space planes.
for(let type=0;type<8;type++) {
  const closing=[1,2,7].includes(type),initial=closing?128*65536:0;
  const count=[300,1250,80,80,10800,220,24,24][type];
  let height=initial,dir=closing?-1:1,delay=0,active=1,kind=type;
  let sounds=type===4?0:1,last=closing?(type===7?89:21):(type>=5?88:20);
  if(type===4){dir=2;delay=10500;last=0;}
  const speed=(type>=5?8:2)*65536,top=128*65536;
  const sound=open=>{sounds++;last=kind>=5?(open?88:89):(open?20:21);};
  cases.push(type,initial,count);
  for(let tic=0;tic<count;tic++) {
    if(active)switch(dir) {
      case 0:
        if(--delay===0){dir=kind===1?1:-1;sound(dir===1);}break;
      case 2:
        if(--delay===0){dir=1;kind=0;sound(true);}break;
      case -1:
        height-=speed;
        if(height<0){height=0;if(kind===1){dir=0;delay=1050;}
          else {active=0;if(kind===5||kind===7)sound(false);}}
        break;
      case 1:
        height+=speed;
        if(height>top){height=top;if(kind===0||kind===5){dir=0;delay=150;}else active=0;}
        break;
    }
    cases.push(height,active,active?kind:-1,active?dir:0,active?delay:0,sounds,last);
  }
}
const records=Buffer.alloc(cases.length*8);cases.forEach((n,i)=>records.writeBigInt64LE(BigInt(n),i*8));
const source=['TmGlbls.HH','TmWad.HC','TmMap.HC','TmData.HH','TmClip.HC',
  'TmState.HC','TmMath.HC','TmWorld.HC','TmContact.HC','TmMove.HC','TmPath.HC',
  'TmSlide.HC','TmPlayer.HH','TmMotion.HC','TmDamage.HC','TmSector.HC','TmDoor.HC']
  .map(n=>readFileSync(resolve(root,'games/Toom',n),'latin1')).join('\n')+'\n'+
  ['Rooms.HC','Door.HC'].map(n=>readFileSync(resolve(root,'tools/toom',n),'latin1')).join('\n');
const files=[{name:'TMDATA.BIN',bytes},{name:'DOORS.BIN',bytes:records}];
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:180});
  console.log(JSON.stringify(result,null,2));
  assert.equal(result.results[0].except,'');
  assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,/DOOR 14873 CASES BAD 0/);
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
  const done=h.gx.varFind('tm_door_done');assert(done);assert.equal(h.gx.rd64(done),1);
  assert.equal(h.gx.rd64(h.gx.varFind('tm_door_cnt')),14873);
  console.log(JSON.stringify({backend,cases:14873,bad:0},null,2));
}
