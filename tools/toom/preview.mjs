import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FrameWrite} from './Frame.mjs';
import {FreedoomRead,root} from './Assets.mjs';
import {ToomText} from './Package.mjs';

assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the compiler checkout with the native oracle.');
const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
const host=process.env.HOST==='1',height=host?400:336;
const map=process.env.MAP||'E1M1';assert(/^E[1-4]M[1-9]$/.test(map));
const game=resolve(root,'games/Toom');
let source=ToomText()+'\n'+
  ['TmOverlay.HC','TmScreen.HC',...(host?['TmPlay.HC']:[])].map(n=>readFileSync(resolve(game,n),'latin1')).join('\n');
source+=`
U0 TmPreview()
{
  I64 i,n;
  F64 start,elapsed;
  U8 *out=MAlloc(640*${height}*2+1),*hex="0123456789ABCDEF";
  ${host?'Play *play=PlayNew("C:/ORACLE/FREEDOOM.WAD","C:/ORACLE/TMDATA.BIN");\n  Game *game=play->game;\n  CDC *dc;':'Game *game=GameNew("C:/ORACLE/FREEDOOM.WAD","C:/ORACLE/TMDATA.BIN");\n  CDC *dc=DCNew(640,336);'}
  ${!host||map!=='E1M1'?`GameLoad(game,${Number(map[1])},${Number(map[3])});`:''}
  for (i=0;i<16;i++) GameTick(game);
  start=tS;
  ${host?'play->focused=TRUE; PlayFrame(play); dc=play->front;':'GameDraw(game,dc);'}
  elapsed=(tS-start)*1000;
  for (i=0;i<640*${height};i++) {
    n=dc->body[i]; out[i*2]=hex[n>>4]; out[i*2+1]=hex[n&15];
  }
  out[640*${height}*2]=0;
  "VIEW ${map} TICS %d ACTORS %d MS %.2f READ %d TEXTURES %d SPRITES %d\\n",
        game->level->world->tic,game->level->world->actor_cnt,elapsed,
        game->wad->read_bytes,game->graphics->cache_size,game->sprites->cache_size;
  "PIX %s\\n",out;
  Free(out); ${host?'PlayDel(play);':'DCDel(dc); GameDel(game);'}
}
TmPreview;
`;
const result=await QemuRun([Buffer.from(source,'latin1')],{files:[
  {name:'FREEDOOM.WAD',bytes:FreedoomRead()},
  {name:'TMDATA.BIN',bytes:readFileSync(resolve(root,'games/Toom/TMDATA.BIN'))}],timeout:240});
assert.equal(result.results[0].except,'');
const match=result.results[0].out.match(/PIX ([0-9A-F]+)\n/);assert(match);
const pixels=Buffer.from(match[1],'hex');assert.equal(pixels.length,640*height);
const path=resolve(process.env.OUT||`/tmp/toom-${map}${host?'-host':''}.png`);FrameWrite(pixels,path,640,height);
console.log(JSON.stringify({path,summary:result.results[0].out.split('\n')[0],backend:result.backend,evidence:result.evidence},null,2));
