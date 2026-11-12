import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';
import {ToomText} from './Package.mjs';
import {MapRead} from './Wad.mjs';
import {AnimReference} from './AnimRef.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const {bytes,lumps,names,first,last,cycles,frames}=await AnimReference();
const ticks=[...Array.from({length:128},(_,i)=>i),255,256,1023,1024,65535,65536,2147483647];
const records=[names.length,first,last-first,cycles.length,ticks.length,
  ...cycles.flatMap(c=>[c.a,c.b-c.a+1,+c.texture])];
for(const tic of ticks) {
  const {tex,flat}=frames(tic);
  records.push(tic,...tex,...flat);
}
const maps=Array.from({length:36},(_,i)=>`E${1+Math.floor(i/9)}M${1+i%9}`),scroll=[];let scrollLines=0,sides=0;
const signed=n=>(n<<16)>>16;
for(const name of maps) {
  const map=MapRead(lumps,lumps.findIndex(l=>l.name===name)),lines=map.lines.flatMap((l,i)=>l[3]===48?[i]:[]),
    refs=map.sides.map(()=>0);
  for(const i of lines)refs[map.lines[i][5]]++;
  scroll.push(map.sides.length,lines.length,...lines,...map.sides.map((s,i)=>signed(s.x+3*refs[i])));
  scrollLines+=lines.length;sides+=map.sides.length;
}
function pack(values){const b=Buffer.alloc(values.length*8);values.forEach((n,i)=>b.writeBigInt64LE(BigInt(n),i*8));return b;}
let source=ToomText();
source+='\n'+readFileSync(resolve(root,'tools/toom/Anim.HC'),'latin1');
const files=[{name:'FRAMES.BIN',bytes:pack(records)},{name:'SCROLL.BIN',bytes:pack(scroll)},
  {name:'FREEDOOM.WAD',bytes}];
const mappings=ticks.length*(names.length+last-first);
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:180});
  console.log(JSON.stringify(result,null,2));
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert(result.results[0].out.includes(`ANIM ${mappings} MAPPINGS ${scrollLines} SCROLL ${sides} SIDES BAD 0`));
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
  for(const [name,n] of [['done',1],['mappings',mappings],['scroll',scrollLines],['sides',sides]])
    assert.equal(h.gx.rd64(h.gx.varFind(`tm_anim_${name}`)),n);
  console.log(JSON.stringify({backend,cycles:cycles.length,ticks:ticks.length,mappings,scrollLines,sides,bad:0},null,2));
}
