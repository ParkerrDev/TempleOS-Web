import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FreedoomRead,root} from './Assets.mjs';
import {WadRead} from './Wad.mjs';

assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the compiler checkout with the native oracle.');
const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,
  'tests/oracle/Qemu.mjs')));
const bytes=FreedoomRead(),lumps=WadRead(bytes),find=name=>lumps.findLast(l=>l.name===name);
const pn=find('PNAMES').bytes,pnames=Array.from({length:pn.readUInt32LE(0)},(_,i)=>
  pn.toString('ascii',4+i*8,12+i*8).replace(/\0.*$/s,''));
const records=[];
for (const name of ['TEXTURE1','TEXTURE2']) {
  const b=find(name).bytes;
  for (let i=0;i<b.readUInt32LE(0);i++) {
    const offset=b.readUInt32LE(4+i*4),w=b.readUInt16LE(offset+12),h=b.readUInt16LE(offset+14);
    const pixels=new Uint16Array(w*h).fill(256);
    for (let j=0;j<b.readUInt16LE(offset+20);j++) {
      const p=offset+22+j*10,x0=b.readInt16LE(p),y0=b.readInt16LE(p+2);
      const patch=find(pnames[b.readUInt16LE(p+4)]).bytes;
      for (let x=0;x<patch.readUInt16LE(0);x++) {
        let at=patch.readUInt32LE(8+x*4),previous=-1;
        while (patch[at]!==255) {
          const count=patch[at+1];let y=patch[at];
          if (y<=previous)y+=previous;
          previous=y;
          for (let k=0;k<count;k++) {
            const dx=x0+x,dy=y0+y+k;
            if (dx>=0&&dx<w&&dy>=0&&dy<h)pixels[dy*w+dx]=patch[at+3+k];
          }
          at+=count+4;
        }
      }
    }
    let hash=2166136261;
    for(const p of pixels)hash=Math.imul(hash^p,16777619)>>>0;
    records.push([w,h,hash]);
  }
}
assert.equal(records.length,903);
const expected=Buffer.alloc(records.length*12);
records.flat().forEach((value,i)=>expected.writeUInt32LE(value>>>0,i*4));
let source=['TmGlbls.HH','TmWad.HC','TmGr.HC','TmTex.HC']
  .map(name=>readFileSync(resolve(root,'games/Toom',name),'latin1')).join('\n');
source+=`
U0 TmTextureTest()
{
  I64 i,j,k,hash,bad=0,peak=0,pixels=0,read_bytes;
  F64 start=tS;
  U32 *expected=FileRead("C:/ORACLE/TEXTURES.BIN");
  Wad *tmpw=WadNew("C:/ORACLE/FREEDOOM.WAD");
  Graphics *tmpg;
  Image *tmpi;
  if (!tmpw || !expected) throw('Files');
  tmpg=GraphicsNew(tmpw);
  if (!tmpg || tmpg->tex_cnt!=903) throw('Graphics');
  if (tmpg->cache_size) throw('Eager');
  read_bytes=tmpw->read_bytes;
  if (read_bytes>150000) throw('ReadAll');
  for (i=0;i<903;i++) {
    tmpi=TextureGet(tmpg,i);
    if (!tmpi) {"REJECT TEXTURE %d\\n",i;throw('Texture');}
    if (tmpi->width!=expected[i*3] || tmpi->height!=expected[i*3+1])
      throw('Size');
    hash=2166136261;
    for (j=0;j<tmpi->width*tmpi->height;j++)
      hash=(hash^tmpi->pix[j])*16777619&0xFFFFFFFF;
    if (hash!=expected[i*3+2]) bad++;
    pixels+=j;
    peak=MaxI64(peak,tmpg->cache_size);
    k=tmpw->read_bytes;
    if (TextureGet(tmpg,i)!=tmpi || tmpw->read_bytes!=k)
      throw('Cache');
    if (peak>TM_CACHE_SIZE) throw('Limit');
  }
  tmpi=TextureGet(tmpg,0);
  if (!tmpi) throw('Reload');
  hash=2166136261;
  for (j=0;j<tmpi->width*tmpi->height;j++)
    hash=(hash^tmpi->pix[j])*16777619&0xFFFFFFFF;
  if (hash!=expected[2]) throw('Evict');
  "TEXTURES 903 PIXELS %d BAD %d START_READ %d CACHE_PEAK %d MS %.1f\\n",
        pixels,bad,read_bytes,peak,(tS-start)*1000;
  GraphicsDel(tmpg);
  WadDel(tmpw);
  Free(expected);
  if (bad) throw('Pixels');
}
TmTextureTest;
`;
const result=await QemuRun([Buffer.from(source,'latin1')],{files:[
  {name:'FREEDOOM.WAD',bytes},{name:'TEXTURES.BIN',bytes:expected}],timeout:240});
console.log(JSON.stringify(result,null,2));
assert.equal(result.results.length,1);
assert.equal(result.results[0].except,'');
assert.match(result.results[0].out,/TEXTURES 903 PIXELS \d+ BAD 0/);
