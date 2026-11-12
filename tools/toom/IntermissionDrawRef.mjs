import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root,FreedoomRead} from './Assets.mjs';
import {EnemyFunction} from './EnemyRef.mjs';
import {FinaleSource} from './FinaleRef.mjs';
import {ProgressSource} from './ProgressRef.mjs';

export async function IntermissionDrawReference() {
  const original=await ProgressSource('wi_stuff.c'),video=await FinaleSource('v_video.c'),
    hash=b=>createHash('sha256').update(b).digest('hex'),
    wads=[FreedoomRead(),readFileSync(resolve(root,'tools/toom/.assets/freedoom-0.13.0-phase2.wad'))];
  assert.equal(hash(wads[1]),'a8772e088847032510d97ba2312406a6998f21cbab44d4ff10696faa9c0ecd4b');
  const scenes=[];
  const add=(phase,episode,map,next,stage,pointer,did,stats,op=0,value=0,digits=0)=>
    scenes.push([phase,episode,map,next,stage,pointer,did,...stats,op,value,digits]);
  for(const phase of [0,1])for(let episode=1;episode<=(phase?1:4);episode++)
    for(let map=1;map<=(phase?32:9);map++) {
      if(!phase&&map===8)continue;
      const next=phase?(map>=31?16:map+1):(map===9?[4,6,7,3][episode-1]:map+1);
      for(const stats of [[-1,-1,-1,-1,-1],[0,99,100,0,59],[1994,125,5,3599,3600]])
        add(phase,episode,map,next,0,0,0,stats);
      for(const pointer of [0,1])add(phase,episode,map,next,1,pointer,1,[0,0,0,0,0]);
      if(!phase||[15,31].includes(map))
        add(phase,episode,map,phase?(map===15?31:32):9,2,0,0,[0,0,0,0,0]);
    }
  for(const value of [-1994,-123,-1,0,1,9,10,99,100,1994,123456])
    for(const digits of [-1,0,1,2,6])add(0,1,1,2,0,0,0,[0,0,0,0,0],1,value,digits);
  for(const value of [-1,0,1,59,60,61,599,600,3598,3599,3600,99999])
    add(0,1,1,2,0,0,0,[0,0,0,0,0],2,value,0);
  const nodes=original.match(/static point_t lnodes\[[\s\S]*?\n};/);assert(nodes);
  const names=['WI_slamBackground','WI_drawLF','WI_drawEL','WI_drawOnLnode',
    'WI_drawNum','WI_drawPercent','WI_drawTime','WI_drawShowNextLoc','WI_drawNoState','WI_drawStats'];
  const c=`#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#define SCREENWIDTH 320
#define SCREENHEIGHT 200
#define NUMEPISODES 3
#define NUMMAPS 9
#define WI_TITLEY 2
#define SP_STATSX 50
#define SP_STATSY 50
#define SP_TIMEX 16
#define SP_TIMEY 168
#define FB 0
#define SHORT(x) (x)
#define LONG(x) (x)
#define RANGECHECK
#define commercial 1
#define true 1
#define false 0
typedef int boolean;
typedef unsigned char byte;
typedef struct {int x,y;} point_t;
typedef struct __attribute__((packed)){int16_t width,height,leftoffset,topoffset;int32_t columnofs[1];} patch_t;
typedef struct __attribute__((packed)){byte topdelta,length,pad;} column_t;
typedef struct {int epsd,last,next,didsecret;} wbstartstruct_t;
wbstartstruct_t info,*wbs=&info;
byte pixels[64000],background[64000],*screens[5]={pixels,background},*wad;
size_t wad_size;
patch_t *num[10],*wiminus,*percent,*colon,*finished,*entering,*kills,*items,*sp_secret,*time,*par,*sucks;
patch_t *splat,*yah[2],*lnames[32];
int gamemode,snl_pointeron,cnt_kills[1],cnt_items[1],cnt_secret[1],cnt_time,cnt_par;
${nodes[0]}
static uint32_t u32(byte *p){return (uint32_t)p[0]|(uint32_t)p[1]<<8|(uint32_t)p[2]<<16|(uint32_t)p[3]<<24;}
void *patch(char *name){uint32_t n=u32(wad+4),dir=u32(wad+8);char key[8]={0};
 if(strlen(name)>8)abort();memcpy(key,name,strlen(name));
 while(n--){byte *p=wad+dir+n*16;if(!memcmp(p+8,key,8)){if((size_t)u32(p)+u32(p+4)>wad_size)abort();return wad+u32(p);}}
 fprintf(stderr,"Missing %s\\n",name);abort();}
void V_MarkRect(int x,int y,int w,int h){(void)x;(void)y;(void)w;(void)h;}
/* The released original WI_drawAnimatedBack returns unconditionally because
   it tests the nonzero commercial enum, not gamemode. Static parity keeps
   that behavior; maintained-source animation has a separate witness. */
void WI_drawAnimatedBack(void){}
${EnemyFunction(video,'V_DrawPatch')}
${names.map(n=>EnemyFunction(original,n)).join('\n')}
static int32_t word(void){byte b[4];if(fread(b,1,4,stdin)!=4)exit(0);return (int32_t)u32(b);}
int main(int argc,char **argv){if(argc!=3)abort();byte *wads[2];size_t sizes[2];
 for(int i=0;i<2;i++){FILE *f=fopen(argv[i+1],"rb");if(!f)abort();fseek(f,0,SEEK_END);sizes[i]=ftell(f);rewind(f);wads[i]=malloc(sizes[i]);if(fread(wads[i],1,sizes[i],f)!=sizes[i])abort();fclose(f);}
 for(;;){int row[15];for(int i=0;i<15;i++)row[i]=word();if(row[0]<0||row[0]>1)abort();
  wad=wads[row[0]];wad_size=sizes[row[0]];gamemode=row[0];info.epsd=row[1]-1;info.last=row[2]-1;info.next=row[3]-1;info.didsecret=row[6];snl_pointeron=row[5];
  cnt_kills[0]=row[7];cnt_items[0]=row[8];cnt_secret[0]=row[9];cnt_time=row[10];cnt_par=row[11];
  char name[9];for(int i=0;i<(gamemode?32:9);i++){if(gamemode)snprintf(name,sizeof(name),"CWILV%02d",i);else snprintf(name,sizeof(name),"WILV%d%d",info.epsd,i);lnames[i]=patch(name);}
  for(int i=0;i<10;i++){snprintf(name,sizeof(name),"WINUM%d",i);num[i]=patch(name);}
  wiminus=patch("WIMINUS");percent=patch("WIPCNT");colon=patch("WICOLON");finished=patch("WIF");entering=patch("WIENTER");
  kills=patch("WIOSTK");items=patch("WIOSTI");sp_secret=patch("WISCRT2");time=patch("WITIME");par=patch("WIPAR");sucks=patch("WISUCKS");
  if(!gamemode&&info.epsd<3){splat=patch("WISPLAT");yah[0]=patch("WIURH0");yah[1]=patch("WIURH1");
   /* No original scalar-splat overread is defined: verify every authored
      placement fits before executing unchanged WI_drawOnLnode. */
   for(int i=0;i<9;i++){int x=lnodes[info.epsd][i].x-splat->leftoffset,y=lnodes[info.epsd][i].y-splat->topoffset;if(x<0||y<0||x+splat->width>=320||y+splat->height>=200)abort();}
   snprintf(name,sizeof(name),"WIMAP%d",info.epsd);
  }else strcpy(name,"INTERPIC");
  memset(pixels,0,sizeof(pixels));memset(background,0,sizeof(background));V_DrawPatch(0,0,1,patch(name));
  int32_t result=0;
  if(row[12]==1)result=WI_drawNum(300,80,row[13],row[14]);
  else if(row[12]==2)WI_drawTime(300,80,row[13]);
  else if(row[4]==0)WI_drawStats();else if(row[4]==1)WI_drawShowNextLoc();else WI_drawNoState();
  fwrite(&result,4,1,stdout);fwrite(pixels,1,sizeof(pixels),stdout);
 }
}
`;
  const scratch=mkdtempSync(join(tmpdir(),'toom-intermission-draw-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    const paths=wads.map((w,i)=>{const p=join(scratch,`phase${i}.wad`);writeFileSync(p,w);return p;});
    execFileSync(process.env.CC||'cc',['-std=c99','-O2','-Wall','-Wextra','-Werror','-Wno-misleading-indentation','-Wno-format-truncation','-fsanitize=undefined',src,'-o',exe]);
    const input=scenes.map(s=>{const b=Buffer.alloc(s.length*4);s.forEach((n,i)=>b.writeInt32LE(n,i*4));return b;});
    const out=execFileSync(exe,paths,{input:Buffer.concat(input),maxBuffer:64*1024*1024}),size=64004;
    assert.equal(out.length,scenes.length*size);
    return {wads,sourceSha256:hash(c),scenes:scenes.map((row,i)=>({row,
      result:out.readInt32LE(i*size),pixels:out.subarray(i*size+4,(i+1)*size)}))};
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
