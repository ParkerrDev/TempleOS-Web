import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root} from './Assets.mjs';
import {SoundDefinitions} from './SoundBankRef.mjs';
import {EnemyFunction} from './EnemyRef.mjs';

export async function AudioReference() {
  const manifest=JSON.parse(readFileSync(new URL('source/audio.json',import.meta.url))),path=resolve(root,'tools/toom/source/s_sound.c');
  if(!existsSync(path)) {
    const response=await fetch(`https://raw.githubusercontent.com/id-Software/DOOM/${manifest.revision}/${manifest.path}`);
    assert(response.ok);writeFileSync(path,Buffer.from(await response.arrayBuffer()));
  }
  const bytes=readFileSync(path);assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.sha256);
  const original=bytes.toString('ascii').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,''),{table,enums}=await SoundDefinitions();
  const cases=[],distances=[];let seed=0x680304;
  const rand=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
  for(let i=0;i<768;i++) {
    const channels=Array.from({length:8},()=>({sound:rand(109),token:rand(3)*65536+rand(9)}));
    for(const c of channels)if(c.token<65536)c.token=0;
    if(i%4===0)channels[rand(8)].sound=0;
    if(i%4===1)for(const c of channels)c.sound=1+rand(108);
    const token=i%3?channels[rand(8)].token:rand(2)*65536+65536+rand(9),handle=rand(9)-1;
    const playing=handle>=0&&channels[handle].sound?1:0;
    cases.push({op:i%5===0?1:0,token,sound:1+i%108,handle,playing,channels});
  }
  const unit=65536,coordinates=[0,1,159*unit,160*unit-1,160*unit,160*unit+1,161*unit,
    1190*unit,1191*unit,1199*unit,1200*unit-1,1200*unit,1200*unit+1,1201*unit,2000*unit];
  for(const volume of [0,1,8,64,120,127])for(const map of [1,8])for(const d of coordinates)
    for(const [x,y]of [[d,0],[0,d],[-d,Math.floor(d/2)],[Math.floor(d/3),-d]])distances.push([100*unit,-30*unit,100*unit+x,-30*unit+y,map,volume]);
  const c=`#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <stdbool.h>
typedef struct sfxinfo_s sfxinfo_t;
struct sfxinfo_s {char *name;int singularity,priority;sfxinfo_t *link;int pitch,volume;void *data;int usefulness,lumpnum;};
${enums}
${table}
typedef struct {sfxinfo_t *sfxinfo;void *origin;int handle;} channel_t;
static channel_t channels[8];static int numChannels=8,playing,current_handle,gamemap,snd_SfxVolume;
static int I_SoundIsPlaying(int handle){return playing&&handle==current_handle;}
static void I_StopSound(int handle){if(handle==current_handle)playing=0;}
${EnemyFunction(original,'S_StopChannel')}
${EnemyFunction(original,'S_StopSound')}
${EnemyFunction(original,'S_getChannel')}
typedef int32_t fixed_t;typedef uint32_t angle_t;
typedef struct {fixed_t x,y;angle_t angle;} mobj_t;
#define S_CLIPPING_DIST (1200*65536)
#define S_CLOSE_DIST (160*65536)
#define S_ATTENUATOR 1040
#define FRACBITS 16
#define ANGLETOFINESHIFT 19
#define S_STEREO_SWING (96*65536)
static fixed_t finesine[8192];
static angle_t R_PointToAngle2(int x,int y,int sx,int sy){(void)x;(void)y;(void)sx;(void)sy;return 0;}
static int FixedMul(int a,int b){return (int)(((int64_t)a*b)>>16);}
${EnemyFunction(original,'S_AdjustSoundParams')}
int main(void){int count;if(scanf("%d",&count)!=1)return 2;for(int n=0;n<count;n++){
 int op,token,sound,res=-2;if(scanf("%d%d%d%d%d",&op,&token,&sound,&current_handle,&playing)!=5)return 3;
 for(int i=0;i<8;i++){int s,o;if(scanf("%d%d",&s,&o)!=2)return 4;channels[i].sfxinfo=s?S_sfx+s:NULL;channels[i].origin=(void*)(uintptr_t)o;channels[i].handle=i;}
 if(op)S_StopSound((void*)(uintptr_t)token);else res=S_getChannel((void*)(uintptr_t)token,S_sfx+sound);
 printf("%d %d",res,playing);for(int i=0;i<8;i++)printf(" %d %d",channels[i].sfxinfo?(int)(channels[i].sfxinfo-S_sfx):0,(int)(uintptr_t)channels[i].origin);putchar(10);
 }if(scanf("%d",&count)!=1)return 5;for(int n=0;n<count;n++){
 mobj_t listener={0},source={0};int volume,sep=0,pitch=0;
 if(scanf("%d%d%d%d%d%d",&listener.x,&listener.y,&source.x,&source.y,&gamemap,&snd_SfxVolume)!=6)return 6;
 volume=snd_SfxVolume;printf("%d\\n",S_AdjustSoundParams(&listener,&source,&volume,&sep,&pitch));
 }return 0;}`;
  const input=[cases.length,...cases.map(r=>[r.op,r.token,r.sound,r.handle,r.playing,...r.channels.flatMap(c=>[c.sound,c.token])].join(' ')),distances.length,...distances.map(r=>r.join(' '))].join('\n');
  const dir=mkdtempSync(join(tmpdir(),'toom-audio-'));let lines;
  try {
    writeFileSync(join(dir,'ref.c'),c);execFileSync('cc',['-std=c99','-O2',join(dir,'ref.c'),'-o',join(dir,'ref')]);
    lines=execFileSync(join(dir,'ref'),{input}).toString().trim().split('\n').map(l=>l.split(' ').map(Number));
  } finally {rmSync(dir,{recursive:true,force:true});}
  assert.equal(lines.length,cases.length+distances.length);
  const words=[cases.length,distances.length];
  for(let i=0;i<cases.length;i++) {
    const r=cases[i],out=lines[i];assert.equal(out.length,18);
    words.push(r.op,r.token>>16,r.token&65535,r.sound,r.handle,r.playing);
    for(const ch of r.channels)words.push(ch.sound,ch.token>>16,ch.token&65535);
    words.push(out[0],out[1]);
    for(let j=0;j<8;j++)words.push(out[2+j*2],out[3+j*2]>>16,out[3+j*2]&65535);
  }
  for(let i=0;i<distances.length;i++){assert.equal(lines[cases.length+i].length,1);words.push(...distances[i],lines[cases.length+i][0]);}
  const expected=Buffer.alloc(words.length*8);words.forEach((n,i)=>expected.writeBigInt64LE(BigInt(n),i*8));
  return {expected,reference:{...manifest,channelCases:cases.length,distanceCases:distances.length,
    domain:'Defined original32-bit distance inputs, volumes0..127, maps1/8; angle/separation math is stubbed because only returned audibility is compared.'}};
}
