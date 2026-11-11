import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {FreedoomRead,root} from './Assets.mjs';
import {WadRead} from './Wad.mjs';

export async function AnimReference() {
  const manifest=JSON.parse(readFileSync(resolve(root,'tools/toom/source/collision.json'))),
    spec=manifest.files.find(f=>f.path.endsWith('/p_spec.c')),path=resolve(root,'tools/toom/source/p_spec.c');
  if(!existsSync(path)) {
    const response=await fetch(`https://raw.githubusercontent.com/id-Software/DOOM/${manifest.revision}/${spec.path}`);
    assert(response.ok);writeFileSync(path,Buffer.from(await response.arrayBuffer()));
  }
  const original=readFileSync(path);assert.equal(createHash('sha256').update(original).digest('hex'),spec.sha256);
  const definitions=original.toString('ascii').match(/animdef_t\s+animdefs\[\]\s*=\s*\{([\s\S]*?)\n\};/)[1];
  const bytes=FreedoomRead(),lumps=WadRead(bytes),names=[];
  for(const name of ['TEXTURE1','TEXTURE2']) {
    const lump=lumps.findLast(l=>l.name===name);if(!lump)continue;
    const b=lump.bytes;
    for(let i=0;i<b.readInt32LE(0);i++) {
      const p=b.readInt32LE(4+i*4);names.push(b.toString('ascii',p,p+8).replace(/\0.*$/,''));
    }
  }
  const first=lumps.findLastIndex(l=>l.name==='F_START')+1,last=lumps.findLastIndex(l=>l.name==='F_END'),cycles=[];
  for(const m of definitions.matchAll(/\{(false|true),\s*"([^"]+)",\s*"([^"]+)",\s*(\d+)\}/g)) {
    const texture=m[1]==='true',list=texture?names:lumps.map(l=>l.name),a=list.lastIndexOf(m[3]),b=list.lastIndexOf(m[2]);
    if(a<0)continue;assert(b>a);cycles.push({texture,a,b,speed:Number(m[4])});
  }
  assert.equal(cycles.length,22);
  function frames(tic) {
    const tex=names.map((_,i)=>i),flat=Array.from({length:last-first},(_,i)=>first+i);
    for(const c of cycles)for(let i=c.a;i<=c.b;i++) {
      const phase=c.texture?i:i-first,frame=c.a+(Math.floor(tic/c.speed)+phase)%(c.b-c.a+1);
      if(c.texture)tex[i]=frame;else flat[phase]=frame;
    }
    return {tex,flat};
  }
  return {bytes,lumps,names,first,last,cycles,frames};
}
