import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {deflateSync} from 'node:zlib';
import {FreedoomRead,root} from './Assets.mjs';

assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the compiler checkout with the native oracle.');
const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
const map=process.env.MAP||'E1M1';assert(/^E[1-4]M[1-9]$/.test(map));
const game=resolve(root,'games/Toom'),load=readFileSync(resolve(game,'Load.HC'),'latin1');
let source=[...load.matchAll(/#include "([^"]+)"/g)]
  .map(m=>readFileSync(resolve(game,m[1].includes('.')?m[1]:m[1]+'.HC'),'latin1')).join('\n')+'\n'+
  ['TmOverlay.HC','TmScreen.HC'].map(n=>readFileSync(resolve(game,n),'latin1')).join('\n');
source+=`
U0 TmPreview()
{
  I64 i,n;
  F64 start,elapsed;
  U8 *out=MAlloc(640*336*2+1),*hex="0123456789ABCDEF";
  Game *game=GameNew("C:/ORACLE/FREEDOOM.WAD","C:/ORACLE/TMDATA.BIN");
  CDC *dc=DCNew(640,336);
  GameLoad(game,${Number(map[1])},${Number(map[3])});
  for (i=0;i<16;i++) GameTick(game);
  start=tS; GameDraw(game,dc); elapsed=(tS-start)*1000;
  for (i=0;i<640*336;i++) {
    n=dc->body[i]; out[i*2]=hex[n>>4]; out[i*2+1]=hex[n&15];
  }
  out[640*336*2]=0;
  "VIEW ${map} TICS %d ACTORS %d MS %.2f READ %d TEXTURES %d SPRITES %d\\n",
        game->level->world->tic,game->level->world->actor_cnt,elapsed,
        game->wad->read_bytes,game->graphics->cache_size,game->sprites->cache_size;
  "PIX %s\\n",out;
  Free(out); DCDel(dc); GameDel(game);
}
TmPreview;
`;
const result=await QemuRun([Buffer.from(source,'latin1')],{files:[
  {name:'FREEDOOM.WAD',bytes:FreedoomRead()},
  {name:'TMDATA.BIN',bytes:readFileSync(resolve(root,'games/Toom/TMDATA.BIN'))}],timeout:240});
assert.equal(result.results[0].except,'');
const match=result.results[0].out.match(/PIX ([0-9A-F]+)\n/);assert(match);
const pixels=Buffer.from(match[1],'hex');assert.equal(pixels.length,640*336);
const palette=[0x000000,0x0000AA,0x00AA00,0x00AAAA,0xAA0000,0xAA00AA,0xAA5500,0xAAAAAA,
  0x555555,0x5555FF,0x55FF55,0x55FFFF,0xFF5555,0xFF55FF,0xFFFF55,0xFFFFFF];
const raw=Buffer.alloc((640*3+1)*336);
for(let y=0;y<336;y++)for(let x=0;x<640;x++) {
  const rgb=palette[pixels[x+y*640]];assert(rgb!==undefined);
  const at=y*(640*3+1)+1+x*3;raw[at]=rgb>>16;raw[at+1]=rgb>>8;raw[at+2]=rgb;
}
function chunk(name,data) {
  const body=Buffer.concat([Buffer.from(name),data]);let crc=0xFFFFFFFF;
  for(const b of body) {crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xEDB88320:0);}
  const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);body.copy(out,4);
  out.writeUInt32BE((crc^0xFFFFFFFF)>>>0,out.length-4);return out;
}
const header=Buffer.alloc(13);header.writeUInt32BE(640);header.writeUInt32BE(336,4);header[8]=8;header[9]=2;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),
  chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
const path=resolve(process.env.OUT||`/tmp/toom-${map}.png`);writeFileSync(path,png);
console.log(JSON.stringify({path,summary:result.results[0].out.split('\n')[0],backend:result.backend,evidence:result.evidence},null,2));
