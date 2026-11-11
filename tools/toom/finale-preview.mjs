import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root,FreedoomRead} from './Assets.mjs';
import {FrameWrite} from './Frame.mjs';

assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the original TempleOS oracle checkout.');
const episode=Number(process.env.EPISODE||1),stage=Number(process.env.STAGE||0),tic=Number(process.env.TIC||3000);
assert(Number.isInteger(episode)&&episode>=1&&episode<=4);
assert(Number.isInteger(stage)&&stage>=0&&stage<=1);
assert(Number.isInteger(tic)&&tic>=0&&tic<=100000);
const game=resolve(root,'games/Toom'),read=n=>readFileSync(resolve(game,n),'latin1');
const source=[...read('Load.HC').matchAll(/#include "([^"]+)"/g)]
  .map(m=>read(m[1].includes('.')?m[1]:m[1]+'.HC')).join('\n')+'\n'+
  `
U0 TmFinalePreview()
{
  Wad *wad=WadNew("C:/ORACLE/FREEDOOM.WAD");
  Story *story=StoryNew(wad);
  Finale finale;
  FinaleGr *graphics;
  Intermission result;
  CDC *dc=DCNew(640,400);
  I64 i,n;
  U8 *out=MAlloc(640*400*2+1),*hex="0123456789ABCDEF";
  MemSet(&result,0,sizeof(Intermission));
  result.episode=${episode}; result.map_num=8;
  FinaleStart(&finale,story,&result);
  graphics=FinaleGrNew(wad,&finale);
  finale.stage=${stage}; finale.tic=${tic};
  FinaleGrDraw(graphics,&finale); FinaleGrBlot(graphics,dc);
  for (i=0;i<640*400;i++) {
    n=dc->body[i]; out[i*2]=hex[n>>4]; out[i*2+1]=hex[n&15];
  }
  out[640*400*2]=0;
  "FINALE E${episode} STAGE ${stage} TIC ${tic}\\nPIX %s\\n",out;
  Free(out); DCDel(dc); FinaleGrDel(graphics); StoryDel(story); WadDel(wad);
}
TmFinalePreview;
`;
const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
const result=await QemuRun([Buffer.from(source,'latin1')],{files:[{name:'FREEDOOM.WAD',bytes:FreedoomRead()}],timeout:120});
assert.equal(result.results[0].except,'');
const match=result.results[0].out.match(/PIX ([0-9A-F]+)\n/);assert(match);
const pixels=Buffer.from(match[1],'hex'),path=resolve(process.env.OUT||`/tmp/toom-finale-${episode}-${stage}-${tic}.png`);
FrameWrite(pixels,path,640,400);
console.log(JSON.stringify({path,summary:result.results[0].out.split('\n')[0],backend:result.backend,evidence:result.evidence},null,2));
