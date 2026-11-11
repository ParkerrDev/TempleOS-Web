import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FreedoomRead,root} from './Assets.mjs';
import {WadRead} from './Wad.mjs';

assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the compiler checkout with the native oracle.');
const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
const bytes=FreedoomRead(),lumps=WadRead(bytes),records=[];
let rng=0x31415926;
const next=()=>rng=(Math.imul(rng,1664525)+1013904223)>>>0;
const add=(offset,size)=>{
  let hash=2166136261;
  for(const b of bytes.subarray(offset,offset+size))hash=Math.imul(hash^b,16777619)>>>0;
  records.push([offset,size,hash]);
};
// Reopening the cached first cluster used to repeat it during a larger read.
for(const l of lumps)if(l.size>=8&&l.size<=16384&&l.start%512===0)add(l.start,l.size);
for(let i=0;i<512;i++) {const size=8+next()%16377;add(next()%(bytes.length-size),size);}
const expected=Buffer.alloc(records.length*12);records.flat().forEach((n,i)=>expected.writeUInt32LE(n,i*4));
const source=['TmGlbls.HH','TmWad.HC'].map(n=>readFileSync(resolve(root,'games/Toom',n),'latin1')).join('\n')+`
U0 TmIoTest()
{
  I64 i,j,pass,offset,size,hash,bad=0;
  U8 *mem=MAlloc(16384+128),*buf=mem+64;
  U32 *expected=FileRead("C:/ORACLE/RANGES.BIN");
  Wad *tmpw=WadNew("C:/ORACLE/FREEDOOM.WAD");
  if (!tmpw || !expected) throw('Files');
  MemSet(mem,0xA5,16384+128);
  for (i=0;i<${records.length};i++) {
    offset=expected[i*3]; size=expected[i*3+1];
    MemSet(mem,0xA5,16384+128);
    if (!WadRead(tmpw,buf,offset,8)) throw('Header');
    for (j=0;j<64;j++)
      if (mem[j]!=0xA5 || buf[8+j]!=0xA5) throw('Guard');
    for (pass=0;pass<2;pass++) {
      MemSet(mem,0xA5,16384+128);
      if (!WadRead(tmpw,buf,offset,size)) throw('Read');
      hash=2166136261;
      for (j=0;j<size;j++) hash=(hash^buf[j])*16777619&0xFFFFFFFF;
      if (hash!=expected[i*3+2]) {
        if (bad<8) "BAD %d OFFSET %d SIZE %d PASS %d\\n",i,offset,size,pass;
        bad++;
      }
      for (j=0;j<64;j++)
        if (mem[j]!=0xA5 || buf[size+j]!=0xA5) throw('Guard');
    }
  }
  if (WadRead(tmpw,buf,-1,8) || WadRead(tmpw,buf,tmpw->size-4,8))
    throw('Range');
  "RANGES ${records.length} READS ${records.length*3} BAD %d SPC %d\\n",bad,tmpw->file->dv->spc;
  WadDel(tmpw); Free(mem); Free(expected);
  if (bad) throw('Bytes');
}
TmIoTest;
`;
const result=await QemuRun([Buffer.from(source,'latin1')],{files:[
  {name:'FREEDOOM.WAD',bytes},{name:'RANGES.BIN',bytes:expected}],timeout:180});
console.log(JSON.stringify(result,null,2));
assert.equal(result.results[0].except,'');
assert.match(result.results[0].out,/RANGES \d+ READS \d+ BAD 0/);
