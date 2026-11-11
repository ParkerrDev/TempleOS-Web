import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FreedoomRead,root} from './Assets.mjs';
import {WadRead} from './Wad.mjs';

assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the compiler checkout with the native oracle.');
const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,
  'tests/oracle/Qemu.mjs')));
const bytes=FreedoomRead(),lumps=WadRead(bytes),indices=new Set();
const find=name=>lumps.findLastIndex(l=>l.name===name);
const names=lumps[find('PNAMES')].bytes;
for (let i=0;i<names.readUInt32LE(0);i++) {
  const name=names.toString('ascii',4+i*8,12+i*8).replace(/\0.*$/s,'');
  const index=find(name);assert(index>=0,name);indices.add(index);
}
for (let i=find('S_START')+1;i<find('S_END');i++) indices.add(i);
for (let i=0;i<lumps.length;i++)
  if (/^(STBAR|STT|STY|STG|STF|STARMS$|STKEYS|STDISK$|STCDROM$|WI|M_|BRDR|AMMNUM|TITLEPIC$|CREDIT$|HELP[12]$|ENDPIC$|INTERPIC$)/.test(lumps[i].name))
    indices.add(i);
const records=[];
for (const index of indices) {
  const b=lumps[index].bytes,w=b.readUInt16LE(0),h=b.readUInt16LE(2);
  const pixels=new Uint16Array(w*h).fill(256);
  for (let x=0;x<w;x++) {
    let at=b.readUInt32LE(8+x*4),previous=-1;
    while (b[at]!==255) {
      assert(at+3<b.length,lumps[index].name);
      const count=b[at+1];let y=b[at];
      if (y<=previous)y+=previous;
      previous=y;
      assert(y+count<=h&&at+count+4<=b.length,lumps[index].name);
      for (let i=0;i<count;i++) pixels[(y+i)*w+x]=b[at+3+i];
      at+=count+4;
    }
  }
  let hash=2166136261;
  for (const p of pixels)hash=Math.imul(hash^p,16777619)>>>0;
  records.push([index,w,h,b.readInt16LE(4),b.readInt16LE(6),hash]);
}
const expected=Buffer.alloc(records.length*24);
records.flat().forEach((value,i)=>expected.writeUInt32LE(value>>>0,i*4));
let source=['TmGlbls.HH','TmWad.HC','TmGr.HC']
  .map(name=>readFileSync(resolve(root,'games/Toom',name),'latin1')).join('\n');
source+=`
U0 TmPatchTest()
{
  I64 i,j,lump,bad=0,hash,pixels=0,peak=0;
  F64 start=tS;
  U8 *src;
  U32 *expected=FileRead("C:/ORACLE/PATCHES.BIN");
  Wad *tmpw=WadNew("C:/ORACLE/FREEDOOM.WAD");
  Image *tmpi;
  if (!tmpw || !expected) throw('Files');
  for (i=0;i<${records.length};i++) {
    lump=expected[i*6];
    tmpi=PatchNew(tmpw,lump);
    if (!tmpi) {"REJECT PATCH %d\\n",lump; throw('Patch');}
    if (tmpi->width!=expected[i*6+1] || tmpi->height!=expected[i*6+2] ||
        tmpi->left!=expected(I32 *)[i*6+3] ||
        tmpi->top!=expected(I32 *)[i*6+4]) throw('Header');
    hash=2166136261;
    for (j=0;j<tmpi->width*tmpi->height;j++)
      hash=(hash^tmpi->pix[j])*16777619&0xFFFFFFFF;
    if (hash!=expected[i*6+5]) bad++;
    pixels+=j;
    peak=MaxI64(peak,j*2);
    ImageDel(tmpi);
    if (!i) {
      src=LumpRead(tmpw,lump);
      if (PatchChk(src,7) || PatchChk(src,8)) throw('Truncate');
      *(src+8)(U32 *)=tmpw->dir[lump].size;
      if (PatchChk(src,tmpw->dir[lump].size)) throw('Column');
      Free(src);
    }
  }
  "PATCHES ${records.length} PIXELS %d BAD %d PEAK %d MS %.1f\\n",
        pixels,bad,peak,(tS-start)*1000;
  Free(expected);
  WadDel(tmpw);
  if (bad) throw('Pixels');
}
TmPatchTest;
`;
const result=await QemuRun([Buffer.from(source,'latin1')],{files:[
  {name:'FREEDOOM.WAD',bytes},{name:'PATCHES.BIN',bytes:expected}],timeout:240});
console.log(JSON.stringify(result,null,2));
assert.equal(result.results.length,1);
assert.equal(result.results[0].except,'');
assert.match(result.results[0].out,new RegExp(`PATCHES ${records.length} PIXELS \\d+ BAD 0`));
