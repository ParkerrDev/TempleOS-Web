import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root} from './Assets.mjs';
import {EnemySource,EnemyFunction} from './EnemyRef.mjs';

export async function FatReference() {
  const original=await EnemySource(),data=readFileSync(resolve(root,'games/Toom/TMDATA.BIN'));
  const defs=Object.fromEntries([...readFileSync(resolve(root,'games/Toom/TmData.HH'),'ascii')
    .matchAll(/^#define (TM_\w+)\s+(\d+)$/gm)].map(m=>[m[1],Number(m[2])]));
  const actions=[['FAT_RAISE','A_FatRaise'],['FAT_ATTACK1','A_FatAttack1'],['FAT_ATTACK2','A_FatAttack2'],
    ['FAT_ATTACK3','A_FatAttack3'],['SKULL_ATTACK','A_SkullAttack']];
  const cases=[],angles=[0,0x3ffffff,0x7ffffff,0x8000000,0x80000000,0xf8000000,0xffffffff];
  for(const [name]of actions)for(const angle of angles)for(const shadow of [0,262144])
    for(const [dx,dy,z,tz,height]of [[0,0,0,0,56],[19,0,80,-80,55],[20,0,-80,80,56],[100,50,0,0,0],[-4096,4096,30,80,64]])
      for(const seed of [0,127,255])cases.push([defs['TM_A_'+name],1,shadow,angle,angle,(angle+0x80000000)>>>0,dx*65536,dy*65536,z*65536,tz*65536,height*65536,seed]);
  for(const [name]of actions)for(let seed=0;seed<256;seed++)
    cases.push([defs['TM_A_'+name],1,262144,0xffffffff,0xffffffff,0x8000000,128*65536,0,0,32*65536,56*65536,seed]);
  for(const name of ['FAT_RAISE','SKULL_ATTACK'])for(const seed of [0,255])
    cases.push([defs['TM_A_'+name],0,0,0,0,0,0,0,0,0,0,seed]);
  const trig=32+967*28+137*92+138*4+109*8;
  const sine=Array.from({length:10240},(_,i)=>data.readInt32LE(trig+i*4));
  const speed=data.readInt32LE(32+967*28+defs.TM_MT_FATSHOT*92+15*4);
  const c=`#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
typedef uint32_t angle_t;typedef int32_t fixed_t;
#define FRACUNIT 65536
#define ANG90 0x40000000
#define ANGLETOFINESHIFT 19
#define FATSPREAD (ANG90/8)
#define SKULLSPEED (20*FRACUNIT)
#define MF_AMBUSH 32
#define MF_SHADOW 262144
#define MF_SKULLFLY 16777216
#define MT_FATSHOT ${defs.TM_MT_FATSHOT}
#define sfx_manatk ${defs.TM_SFX_MANATK}
typedef struct {int speed,attacksound;} info_t;
typedef struct mobj_s mobj_t;
struct mobj_s {int x,y,z,height,momx,momy,momz,flags;angle_t angle;info_t *info;mobj_t *target;};
mobj_t a,t,m[2];info_t ai={0,7},mi={${speed},0};
uint8_t rnd[256]={${[...data.subarray(-256)].join(',')}};
int32_t finesine[10240]={${sine.join(',')}};int32_t *finecosine=finesine+2048;
angle_t fakeangle,ma[2];int rn,mc,cnt;long long trace[24];
void record(int event,long long x,long long y){if(cnt>=6)abort();trace[cnt*4]=event;trace[cnt*4+1]=x;trace[cnt*4+2]=y;trace[cnt*4+3]=rn;cnt++;}
int P_Random(void){rn=(rn+1)&255;return rnd[rn];}
fixed_t FixedMul(fixed_t a,fixed_t b){return(int32_t)((int64_t)a*b>>16);}
fixed_t P_AproxDistance(fixed_t x,fixed_t y){x=abs(x);y=abs(y);return x+y-(x<y?x:y)/2;}
angle_t R_PointToAngle2(fixed_t x,fixed_t y,fixed_t tx,fixed_t ty){record(1,tx-x,ty-y);return fakeangle;}
void S_StartSound(mobj_t *actor,int sound){if(actor!=&a)abort();record(2,sound,actor->flags);}
mobj_t *P_SpawnMissile(mobj_t *source,mobj_t *target,int type){if(source!=&a||target!=&t||type!=MT_FATSHOT||mc>=2)abort();
 mobj_t *mo=m+mc;memset(mo,0,sizeof(*mo));mo->info=&mi;mo->angle=ma[mc];mo->x=(mc+1)*FRACUNIT;mo->y=-FRACUNIT;mo->z=2*FRACUNIT;
 mo->momx=111;mo->momy=222;mo->momz=333;P_Random();P_Random();record(3,a.angle,mc);mc++;return mo;}
${['A_FaceTarget',...actions.map(a=>a[1])].map(n=>EnemyFunction(original,n)).join('\n')}
int main(void){long long row[12],out[46];int i,j;
 while(scanf("%lld",row)==1){for(i=1;i<12;i++)if(scanf("%lld",row+i)!=1)abort();
  memset(&a,0,sizeof(a));memset(&t,0,sizeof(t));memset(m,0,sizeof(m));a.info=&ai;a.flags=MF_AMBUSH;a.angle=0x11223344;
  a.x=-64*FRACUNIT;a.y=16*FRACUNIT;a.z=row[8];a.target=row[1]?&t:NULL;t.flags=row[2];fakeangle=row[3];ma[0]=row[4];ma[1]=row[5];
  t.x=a.x+row[6];t.y=a.y+row[7];t.z=row[9];t.height=row[10];rn=row[11];mc=cnt=0;for(i=0;i<24;i++)trace[i]=-1;
  switch(row[0]){${actions.map(([name,fn])=>`case ${defs['TM_A_'+name]}:${fn}(&a);break;`).join('')}default:abort();}
  out[0]=a.flags;out[1]=a.angle;out[2]=a.momx;out[3]=a.momy;out[4]=a.momz;out[5]=rn;out[6]=mc;out[7]=cnt;
  for(j=0;j<2;j++){i=8+j*7;out[i]=m[j].angle;out[i+1]=m[j].momx;out[i+2]=m[j].momy;out[i+3]=m[j].momz;out[i+4]=m[j].x;out[i+5]=m[j].y;out[i+6]=m[j].z;}
  for(i=0;i<24;i++)out[22+i]=trace[i];for(i=0;i<46;i++)printf("%lld ",out[i]);puts("");
 }
}
`;
  const scratch=mkdtempSync(join(tmpdir(),'toom-fat-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    execFileSync(process.env.CC||'cc',['-std=c99','-O2','-Wall','-Wextra','-Werror','-Wno-misleading-indentation',src,'-o',exe]);
    const out=execFileSync(exe,{input:cases.map(r=>r.join(' ')).join('\n')+'\n',encoding:'utf8',maxBuffer:8*1024*1024})
      .trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
    assert.equal(out.length,cases.length);assert(out.every(r=>r.length===46));
    return cases.map((row,i)=>[...row,...out[i]]);
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
