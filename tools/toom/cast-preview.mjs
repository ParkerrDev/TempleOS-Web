import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';
import {FrameWrite} from './Frame.mjs';

assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the original TempleOS oracle checkout.');
const actor=Number(process.env.ACTOR||0),tic=Number(process.env.TIC||0);
assert(Number.isInteger(actor)&&actor>=0&&actor<17);assert(Number.isInteger(tic)&&tic>=0&&tic<=10000);
const game=resolve(root,'games/Toom'),read=n=>readFileSync(resolve(game,n),'latin1'),
  source=[...read('Load.HC').matchAll(/#include "([^"]+)"/g)]
    .map(m=>read(m[1].includes('.')?m[1]:m[1]+'.HC')).join('\n')+'\n'+
    ['TmFinale.HC','TmFinaleGr.HC','TmCast.HC','TmCastGr.HC'].map(read).join('\n')+`
U0 TmCastPreview()
{
  Wad *wad=WadNew("C:/ORACLE/FREEDOOM.WAD");
  Story *story=StoryNew(wad);
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Sprites *sprites=SpritesNew(wad,data);
  Finale finale;
  FinaleGr *graphics;
  Intermission result;
  Cast cast;
  CDC *dc=DCNew(640,400);
  I64 i,n;
  U8 *out=MAlloc(640*400*2+1),*hex="0123456789ABCDEF";
  MemSet(&result,0,sizeof(Intermission));
  result.episode=1; result.map_num=30; result.commercial=TRUE;
  FinaleStart(&finale,story,&result); graphics=FinaleGrNew(wad,&finale);
  CastStart(&cast,data); cast.num=${actor};
  cast.state=data->info[tm_cast_types[cast.num]].see;
  cast.tics=data->state[cast.state].tics;
  for (i=0;i<${tic};i++) CastTick(&cast);
  CastGrDraw(graphics,&cast,sprites,story); FinaleGrBlot(graphics,dc);
  for (i=0;i<640*400;i++) {
    n=dc->body[i]; out[i*2]=hex[n>>4]; out[i*2+1]=hex[n&15];
  }
  out[640*400*2]=0;
  "CAST ${actor} TIC ${tic}\\nPIX %s\\n",out;
  Free(out); DCDel(dc); FinaleGrDel(graphics); SpritesDel(sprites);
  GameDataDel(data); StoryDel(story); WadDel(wad);
}
TmCastPreview;
`;
const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
const result=await QemuRun([Buffer.from(source,'latin1')],{files:[
  {name:'FREEDOOM.WAD',bytes:readFileSync(resolve(root,'tools/toom/.assets/freedoom-0.13.0-phase2.wad'))},
  {name:'TMDATA.BIN',bytes:readFileSync(resolve(game,'TMDATA.BIN'))}],timeout:120});
assert.equal(result.results[0].except,'');
const match=result.results[0].out.match(/PIX ([0-9A-F]+)\n/);assert(match);
const pixels=Buffer.from(match[1],'hex'),path=resolve(process.env.OUT||`/tmp/toom-cast-${actor}-${tic}.png`);
FrameWrite(pixels,path,640,400);
console.log(JSON.stringify({path,summary:result.results[0].out.split('\n')[0],backend:result.backend,evidence:result.evidence},null,2));
