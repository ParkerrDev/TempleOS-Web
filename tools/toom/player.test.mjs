import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const bytes=readFileSync(resolve(root,'games/Toom/TMDATA.BIN'));
const source=['TmGlbls.HH','TmWad.HC','TmMap.HC','TmData.HH','TmClip.HC',
  'TmState.HC','TmMath.HC','TmWorld.HC','TmContact.HC','TmMove.HC','TmPath.HC','TmSlide.HC','TmPlayer.HH','TmMotion.HC','TmAttack.HC','TmDamage.HC','TmItems.HC','TmImpact.HC','TmWeapon.HC','TmPlayer.HC']
  .map(n=>readFileSync(resolve(root,'games/Toom',n),'latin1')).join('\n')+'\n'+
  ['Rooms.HC','Player.HC'].map(n=>readFileSync(resolve(root,'tools/toom',n),'latin1')).join('\n');
const defs=Object.fromEntries([...readFileSync(resolve(root,'games/Toom/TmData.HH'),'ascii')
  .matchAll(/^#define (TM_\w+)\s+(\d+)$/gm)].map(m=>[m[1],Number(m[2])]));
const trig=32+967*28+137*92+138*4+109*8;
const sine=n=>bytes.readInt32LE(trig+n*4),fixed=(a,b)=>Number(BigInt.asIntN(32,BigInt(a)*BigInt(b)>>16n));
const cases=[];
for(const angle of [0,1,0x1fffffff,0x20000000,0x40000000,0x7fffffff,0x80000000,0xbfffffff,0xc0000000,0xffffffff])
 for(const forward of [-100,-50,0,50,100])for(const side of [-50,0,50])for(const turn of [-40000,-1024,0,1024,40000])for(const air of [0,1]){
  const f=Math.max(-50,Math.min(50,forward)),t=Math.max(-32768,Math.min(32767,turn));
  const a=(angle+t*65536)>>>0,ix=a>>>19,si=((a-0x40000000)>>>0)>>>19;
  const vx=air?0:fixed(f*2048,sine(ix+2048))+fixed(side*2048,sine(si+2048));
  const vy=air?0:fixed(f*2048,sine(ix))+fixed(side*2048,sine(si));
  cases.push([angle,forward,side,turn,air,a,vx,vy,f||side?defs.TM_S_PLAY_RUN1:defs.TM_S_PLAY]);
 }
const records=Buffer.alloc(8+cases.length*72);records.writeBigInt64LE(BigInt(cases.length));
cases.flat().forEach((n,i)=>records.writeBigInt64LE(BigInt(n),8+i*8));
const total=cases.length+181;
const files=[{name:'TMDATA.BIN',bytes},{name:'PLAYER.BIN',bytes:records}];
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:120});
  console.log(JSON.stringify(result,null,2));
  assert.equal(result.results[0].except,'');
  assert.match(result.results[0].out,new RegExp(`PLAYER ${total} CASES BAD 0`));
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
  const done=h.gx.varFind('tm_player_done');assert(done);assert.equal(h.gx.rd64(done),1);
  assert.equal(h.gx.rd64(h.gx.varFind('tm_player_cnt')),total);
  console.log(JSON.stringify({backend,cases:total,bad:0},null,2));
}
