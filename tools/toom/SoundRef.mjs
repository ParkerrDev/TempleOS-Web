import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {FreedoomRead,root} from './Assets.mjs';
import {BrainMaps} from './BrainMaps.mjs';
import {WadRead} from './Wad.mjs';
import {EnemyFunction} from './EnemyRef.mjs';

export async function SoundReference() {
  const manifest=JSON.parse(readFileSync(new URL('source/pcsound.json',import.meta.url))),
    path=resolve(root,'tools/toom/source/i_pcsound.c'),hash=b=>createHash('sha256').update(b).digest('hex');
  if(!existsSync(path)) {
    const response=await fetch(`${manifest.repository.replace('github.com','raw.githubusercontent.com')}/${manifest.revision}/${manifest.path}`);
    assert(response.ok);writeFileSync(path,Buffer.from(await response.arrayBuffer()));
  }
  const bytes=readFileSync(path);assert.equal(hash(bytes),manifest.sha256);
  const original=bytes.toString('ascii').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,''),
    table=original.match(/static const uint16_t divisors\[\] = \{[^}]+\};/);assert(table);
  const phase1=FreedoomRead(),{bytes:phase2}=await BrainMaps(),lumps=[];
  for(const [phase,wad]of [[1,phase1],[2,phase2]])for(const lump of WadRead(wad))
    if(lump.name.startsWith('DP'))lumps.push({name:`${phase}:${lump.name}`,bytes:lump.bytes});
  const assets=lumps.length;
  for(let size=0;size<4;size++)lumps.push({name:`short${size}`,bytes:Buffer.alloc(size)});
  function Add(name,kind,count,payload) {
    const bytes=Buffer.alloc(4+payload.length);bytes.writeUInt16LE(kind);bytes.writeUInt16LE(count,2);Buffer.from(payload).copy(bytes,4);
    lumps.push({name,bytes});
  }
  for(const kind of [1,256,65535])Add(`kind${kind}`,kind,1,[32]);
  Add('alltones',0,256,Array.from({length:256},(_,i)=>i));
  Add('empty',0,0,[]);Add('trailing',0,3,[1,0,127,250,251,252]);
  Add('emptytrailing',0,0,[35,36]);Add('truncated',0,4,[1,2,3]);
  Add('maximum',0,65535,Array.from({length:65535},(_,i)=>i&255));
  Add('maximumshort',0,65535,Array(65534).fill(34));
  const c=`#include <stdint.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
typedef int boolean;
typedef struct {int lumpnum;} sfxinfo_t;
#define TIMER_FREQ 1193181
#define PU_STATIC 0
#define arrlen(a) (sizeof(a)/sizeof((a)[0]))
static uint8_t data[70000],*current_sound_lump,*current_sound_pos;
static unsigned int current_sound_remaining;
static int current_sound_lump_num=-1,sound_lock,lumplen;
static int SDL_LockMutex(int x){(void)x;return 0;}
static void SDL_UnlockMutex(int x){(void)x;}
static void W_ReleaseLumpNum(int x){(void)x;}
static uint8_t *W_CacheLumpNum(int n,int tag){(void)n;(void)tag;return data;}
static int W_LumpLength(int n){(void)n;return lumplen;}
${table[0]}
${EnemyFunction(original,'PCSCallbackFunc')}
${EnemyFunction(original,'CachePCSLump')}
int main(void){
  uint32_t count,size;sfxinfo_t sfx={0};
  if(fread(&count,4,1,stdin)!=1)return 2;
  for(uint32_t i=0;i<count;i++){
    if(fread(&size,4,1,stdin)!=1||size>sizeof(data)||fread(data,1,size,stdin)!=size)return 3;
    lumplen=size;
    if(size<4){puts("-1");continue;}
    if(!CachePCSLump(&sfx)){puts("-1");continue;}
    unsigned int samples=current_sound_remaining;printf("%u",samples);
    for(unsigned int j=0;j<samples;j++){
      unsigned int tone=*current_sound_pos;int duration,freq;
      PCSCallbackFunc(&duration,&freq);if(duration!=7)return 4;
      unsigned int period=tone<arrlen(divisors)?divisors[tone]:0;
      printf(" %u %d",period,freq);
    }
    for(int j=0;j<2;j++){int duration,freq;PCSCallbackFunc(&duration,&freq);if(freq)return 5;}
    putchar(10);
  }
  return 0;
}`;
  const words=[lumps.length],buffers=[];
  for(const lump of lumps){const n=Buffer.alloc(4);n.writeUInt32LE(lump.bytes.length);buffers.push(n,lump.bytes);}
  const head=Buffer.alloc(4);head.writeUInt32LE(lumps.length);
  const dir=mkdtempSync(join(tmpdir(),'toom-sound-'));let rows;
  try {
    writeFileSync(join(dir,'ref.c'),c);
    execFileSync('cc',['-std=c99','-O2',join(dir,'ref.c'),'-o',join(dir,'ref')]);
    rows=execFileSync(join(dir,'ref'),{input:Buffer.concat([head,...buffers]),maxBuffer:8*1024*1024})
      .toString().trim().split('\n').map(line=>line.split(' ').map(Number));
  } finally {rmSync(dir,{recursive:true,force:true});}
  assert.equal(rows.length,lumps.length);
  for(const row of rows){assert.equal(row.length,row[0]<0?1:1+row[0]*2);for(const value of row)words.push(value);}
  let offset=12;const body=[],directory=Buffer.alloc(lumps.length*16);
  for(let i=0;i<lumps.length;i++){
    const bytes=lumps[i].bytes;directory.writeUInt32LE(offset,i*16);directory.writeUInt32LE(bytes.length,i*16+4);
    directory.write(`DP${i.toString().padStart(6,'0')}`,i*16+8,8,'ascii');body.push(bytes);offset+=bytes.length;
  }
  const wadHead=Buffer.alloc(12);wadHead.write('IWAD');wadHead.writeUInt32LE(lumps.length,4);wadHead.writeUInt32LE(offset,8);
  const wad=Buffer.concat([wadHead,...body,directory]),expected=Buffer.alloc(words.length*8);
  words.forEach((word,i)=>expected.writeBigInt64LE(BigInt(word),i*8));
  return {wad,expected,reference:{...manifest,phase1Sha256:hash(phase1),phase2Sha256:hash(phase2),assetLumps:assets,
    cases:lumps.length,samples:rows.reduce((n,row)=>n+Math.max(0,row[0]),0),
    shortHeaderRule:'The reference reads its first4 bytes unconditionally; native decoding explicitly rejects shorter buffers.',
    timingScope:'Only format, PIT periods and callback frequency outputs are compared; the reference7ms callback is not used as native scheduler proof.'}};
}
