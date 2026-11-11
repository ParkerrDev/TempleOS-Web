import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const bytes=readFileSync(resolve(root,'games/Toom/TMDATA.BIN'));
const meta=JSON.parse(readFileSync(resolve(root,'games/Toom/data.json')));
const offset=32+meta.states*28+meta.actors*92+meta.sprites*4+meta.sounds*8;
const sine=Array.from({length:10240},(_,i)=>bytes.readInt32LE(offset+i*4));
const angles=Array.from({length:2049},(_,i)=>bytes.readUInt32LE(offset+40960+i*4));
const mul=(a,b)=>Number(BigInt.asIntN(32,BigInt(a)*BigInt(b)>>16n));
const angle=(x,y)=>{
  if(!x&&!y)return 0;
  const ax=Math.abs(x),ay=Math.abs(y),n=Math.min(ax,ay),d=Math.max(ax,ay);
  const low=angles[d<512?2048:Math.min(2048,Number((BigInt(n)<<3n)/(BigInt(d)>>8n)))];
  if(x>=0&&y>=0)return (ax>ay?low:0x40000000-1-low)>>>0;
  if(x<0&&y>=0)return (ax>ay?0x80000000-1-low:0x40000000+low)>>>0;
  if(x<0&&y<0)return (ax>ay?0x80000000+low:0xC0000000-1-low)>>>0;
  return (ax>ay?-low:0xC0000000+low)>>>0;
};
const project=(dx,dy,x,y,vx,vy)=>{
  if(!dy)return [vx,0];
  if(!dx)return [0,vy];
  let a=angle(dx*65536,dy*65536);
  if((BigInt(dx)*BigInt(y)>>16n)>=(BigInt(dy)*BigInt(x)>>16n))a=(a+0x80000000)>>>0;
  let delta=(angle(vx,vy)-a)>>>0;
  if(delta>0x80000000)delta=(delta+0x80000000)>>>0;
  const distance=Math.abs(vx)+Math.abs(vy)-Math.floor(Math.min(Math.abs(vx),Math.abs(vy))/2);
  const length=mul(distance,sine[(delta>>>19)+2048]);
  return [mul(length,sine[(a>>>19)+2048]),mul(length,sine[a>>>19])];
};
let seed=0xCEDA1534;
const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
const records=[];
for(let i=0;i<1024;i++) {
  let dx=next()%1025-512,dy=next()%1025-512;
  if(i<8) {dx=[0,0,1,-1,1,-1,1,-1][i];dy=[1,-1,0,0,1,-1,-1,1][i];}
  const x=(next()%257-128)*65536,y=(next()%257-128)*65536;
  const vx=(next()%3932161)-1966080,vy=(next()%3932161)-1966080;
  records.push([dx,dy,x,y,vx,vy,...project(dx,dy,x,y,vx,vy)]);
}
const vectors=Buffer.alloc(records.length*64);
records.flat().forEach((n,i)=>vectors.writeBigInt64LE(BigInt(n),i*8));
const source=['TmGlbls.HH','TmWad.HC','TmMap.HC','TmData.HH','TmClip.HC',
  'TmState.HC','TmMath.HC','TmWorld.HC','TmContact.HC','TmMove.HC','TmPath.HC','TmSlide.HC']
  .map(n=>readFileSync(resolve(root,'games/Toom',n),'latin1')).join('\n')+'\n'+
  ['Rooms.HC','Slide.HC'].map(n=>readFileSync(resolve(root,'tools/toom',n),'latin1')).join('\n');
const files=[{name:'TMDATA.BIN',bytes},{name:'SLIDE.BIN',bytes:vectors}];
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:120});
  console.log(JSON.stringify(result,null,2));
  assert.equal(result.results[0].except,'');
  assert.match(result.results[0].out,/SLIDE 19 CASES VECTORS 1024 BAD 0/);
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
  const done=h.gx.varFind('tm_slide_done');assert(done);assert.equal(h.gx.rd64(done),1);
  assert.equal(h.gx.rd64(h.gx.varFind('tm_slide_cnt')),19);
  console.log(JSON.stringify({backend,cases:19,vectors:1024,bad:0},null,2));
}
