import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root,FreedoomRead} from './Assets.mjs';
import {EnemyFunction} from './EnemyRef.mjs';
import {FinaleSource} from './FinaleRef.mjs';
import {StoryReference} from './StoryRef.mjs';

export async function FinaleDrawReference() {
  const original=await FinaleSource(),video=await FinaleSource('v_video.c'),story=await StoryReference();
  const wads=[FreedoomRead(),readFileSync(resolve(root,'tools/toom/.assets/freedoom-0.13.0-phase2.wad'))];
  const hash=b=>createHash('sha256').update(b).digest('hex');
  assert.equal(hash(wads[1]),'a8772e088847032510d97ba2312406a6998f21cbab44d4ff10696faa9c0ecd4b');
  const scenes=[];
  for(let i=0;i<10;i++) {
    const phase=Number(i>=4),episode=phase?1:i+1,map=phase?[6,11,20,30,15,31][i-4]:8;
    const text=story.cases[phase].strings[68+i],flat=story.cases[phase].strings[78+i];
    assert(text&&flat);assert(!text.includes(96),'The original font lookup is undefined for backtick.');
    for(const tic of [0,9,10,12,13,14,50,51,52,200,500,1500,text.length*3+10])
      scenes.push({phase,episode,map,stage:0,tic,text,flat});
    if(!phase&&episode!==3)scenes.push({phase,episode,map,stage:1,tic:0,text,flat});
    if(episode===3)for(const tic of [0,229,230,231,232,300,869,870,871,1129,1130,1179,1180,1184,1185,1190,1195,1200,1205,1210,1250])
      scenes.push({phase,episode,map,stage:1,tic,text,flat});
  }
  const c=`#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#define SCREENWIDTH 320
#define SCREENHEIGHT 200
#define TEXTSPEED 3
#define HU_FONTSTART 33
#define HU_FONTSIZE 63
#define PU_CACHE 0
#define PU_LEVEL 0
#define SHORT(x) (x)
#define LONG(x) (x)
#define RANGECHECK
#define retail 3
#define sfx_pistol 1
typedef unsigned char byte;
typedef struct __attribute__((packed)){int16_t width,height,leftoffset,topoffset;int32_t columnofs[1];} patch_t;
typedef struct __attribute__((packed)){byte topdelta,length,pad;} column_t;
byte pixels[320*200],*screens[5]={pixels},*wad;
size_t wad_size;
patch_t *hu_font[HU_FONTSIZE];
int finalestage,finalecount,gameepisode,gamemode,sounds;
char *finaletext,*finaleflat;
static uint32_t u32(byte *p){return (uint32_t)p[0]|(uint32_t)p[1]<<8|(uint32_t)p[2]<<16|(uint32_t)p[3]<<24;}
void *W_CacheLumpName(char *name,int tag){(void)tag;uint32_t n=u32(wad+4),dir=u32(wad+8);char key[8]={0};
 if(strlen(name)>8)abort();memcpy(key,name,strlen(name));
 while(n--){byte *p=wad+dir+n*16;if(!memcmp(p+8,key,8)){if((size_t)u32(p)+u32(p+4)>wad_size)abort();return wad+u32(p);}}
 fprintf(stderr,"Missing %s\\n",name);abort();}
void V_MarkRect(int x,int y,int w,int h){(void)x;(void)y;(void)w;(void)h;}
void S_StartSound(void *origin,int sound){if(origin||sound!=sfx_pistol)abort();sounds++;}
void F_CastDrawer(void){abort();}
${EnemyFunction(video,'V_DrawPatch')}
${['F_TextWrite','F_DrawPatchCol','F_BunnyScroll','F_Drawer'].map(n=>EnemyFunction(original,n)).join('\n')}
static uint32_t word(void){byte b[4];if(fread(b,1,4,stdin)!=4)exit(0);return u32(b);}
int main(int argc,char **argv){if(argc!=3)abort();byte *wads[2];size_t sizes[2];
 for(int i=0;i<2;i++){FILE *f=fopen(argv[i+1],"rb");if(!f)abort();fseek(f,0,SEEK_END);sizes[i]=ftell(f);rewind(f);wads[i]=malloc(sizes[i]);if(fread(wads[i],1,sizes[i],f)!=sizes[i])abort();fclose(f);}
 for(;;){uint32_t phase=word();if(phase>1)abort();wad=wads[phase];wad_size=sizes[phase];
  gameepisode=word();finalestage=word();finalecount=word();uint32_t len=word(),flen=word();
  finaletext=malloc(len+1);finaleflat=malloc(flen+1);if(fread(finaletext,1,len,stdin)!=len||fread(finaleflat,1,flen,stdin)!=flen)abort();finaletext[len]=finaleflat[flen]=0;
  for(int i=0;i<HU_FONTSIZE;i++){char name[9];snprintf(name,sizeof(name),"STCFN%03d",i+HU_FONTSTART);hu_font[i]=W_CacheLumpName(name,0);}
  gamemode=retail;sounds=0;memset(pixels,0,sizeof(pixels));F_Drawer();
  uint32_t s=(uint32_t)sounds;fwrite(&s,4,1,stdout);fwrite(pixels,1,sizeof(pixels),stdout);
  free(finaletext);free(finaleflat);
 }
}
`;
  const scratch=mkdtempSync(join(tmpdir(),'toom-finale-draw-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    const paths=wads.map((w,i)=>{const p=join(scratch,`phase${i}.wad`);writeFileSync(p,w);return p;});
    execFileSync(process.env.CC||'cc',['-std=c99','-O2','-Wall','-Wextra','-Werror','-Wno-unused-variable','-Wno-misleading-indentation','-fsanitize=undefined',src,'-o',exe]);
    const input=scenes.map(s=>{const h=Buffer.alloc(24);[s.phase,s.episode,s.stage,s.tic,s.text.length,s.flat.length].forEach((v,i)=>h.writeUInt32LE(v,i*4));return Buffer.concat([h,s.text,s.flat]);});
    const out=execFileSync(exe,paths,{input:Buffer.concat(input),maxBuffer:16*1024*1024});
    const size=4+320*200;assert.equal(out.length,scenes.length*size);
    return {wads,sourceSha256:hash(c),scenes:scenes.map((s,i)=>({...s,sounds:out.readUInt32LE(i*size),pixels:out.subarray(i*size+4,(i+1)*size)}))};
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
