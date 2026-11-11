import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const bytes=readFileSync(resolve(root,'games/Toom/TMDATA.BIN'));
const source=['TmGlbls.HH','TmWad.HC','TmMap.HC','TmData.HH','TmClip.HC',
  'TmState.HC','TmMath.HC','TmWorld.HC','TmContact.HC','TmMove.HC','TmPath.HC','TmSlide.HC','TmPlayer.HH','TmMotion.HC','TmAttack.HC','TmDamage.HC','TmItems.HC','TmImpact.HC','TmWeapon.HC']
  .map(n=>readFileSync(resolve(root,'games/Toom',n),'latin1')).join('\n')+'\n'+
  ['Rooms.HC','Weapon.HC'].map(n=>readFileSync(resolve(root,'tools/toom',n),'latin1')).join('\n');
const offset=bytes.length-256-216;
const rows=Array.from({length:9},(_,i)=>Array.from({length:6},(_,j)=>bytes.readInt32LE(offset+i*24+j*4)));
const profiles=[[0,0,0,0],[1,1,1,1],[0,2,39,0],[0,2,40,1],[0,0,41,0],[50,8,100,2]];
const priorities=[5,8,3,2,1,7,4,6,0],need=n=>n===6?40:n===8?2:1,cases=[];
for(let ready=0;ready<9;ready++)for(let mask=1;mask<512;mask+=2)for(const ammo of profiles){
  const own=mask|1<<ready,kind=rows[ready][0],ok=kind===5||ammo[kind]>=need(ready);
  const pending=ok?10:priorities.find(n=>(own&(1<<n))&&(rows[n][0]===5||ammo[rows[n][0]]>=need(n)));
  cases.push([ready,own,...ammo,+ok,pending,ok?0:rows[ready][2]]);
}
const records=Buffer.alloc(8+cases.length*72);records.writeBigInt64LE(BigInt(cases.length));
cases.flat().forEach((n,i)=>records.writeBigInt64LE(BigInt(n),8+i*8));
const total=cases.length+32;
const files=[{name:'TMDATA.BIN',bytes},{name:'WPAMMO.BIN',bytes:records}];
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:120});
  console.log(JSON.stringify(result,null,2));
  assert.equal(result.results[0].except,'');
  assert.match(result.results[0].out,new RegExp(`WEAPON ${total} CASES BAD 0`));
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
  const done=h.gx.varFind('tm_weapon_done');assert(done);assert.equal(h.gx.rd64(done),1);
  assert.equal(h.gx.rd64(h.gx.varFind('tm_weapon_cnt')),total);
  console.log(JSON.stringify({backend,cases:total,bad:0},null,2));
}
