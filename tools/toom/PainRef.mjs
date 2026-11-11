import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root} from './Assets.mjs';
import {EnemySource,EnemyFunction} from './EnemyRef.mjs';

export async function PainReference() {
  const original=await EnemySource(),data=readFileSync(resolve(root,'games/Toom/TMDATA.BIN'));
  const defs=Object.fromEntries([...readFileSync(resolve(root,'games/Toom/TmData.HH'),'ascii')
    .matchAll(/^#define (TM_\w+)\s+(\d+)$/gm)].map(m=>[m[1],Number(m[2])]));
  const cases=[];
  for(const mode of [0,1,2])for(const count of [0,19,20,21,22])for(const allow of [0,1,2,4,7])
    for(const target of [0,1])for(const shadow of [0,262144])for(const angle of [0,0x80000000,0xffffffff])for(const seed of [0,127,255])
      cases.push([mode,count,allow,target,shadow,angle,seed]);
  for(const mode of [0,1,2])for(let seed=0;seed<256;seed++)cases.push([mode,19,7,1,262144,0xffffffff,seed]);
  const trig=32+967*28+137*92+138*4+109*8;
  const sine=Array.from({length:10240},(_,i)=>data.readInt32LE(trig+i*4));
  const radius=type=>data.readInt32LE(32+967*28+type*92+16*4);
  const c=`#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
typedef int boolean;typedef uint32_t angle_t;typedef int32_t fixed_t;
#define FRACUNIT 65536
#define ANGLETOFINESHIFT 19
#define ANG90 0x40000000
#define ANG180 0x80000000
#define ANG270 0xc0000000
#define MF_SOLID 2
#define MF_AMBUSH 32
#define MF_SHADOW 262144
#define MT_SKULL ${defs.TM_MT_SKULL}
typedef struct mobj_s mobj_t;
typedef void(*actionf_p1)(mobj_t*);
typedef struct thinker_s thinker_t;
struct thinker_s {thinker_t *next;union {actionf_p1 acp1;} function;};
typedef struct {int radius;} info_t;
struct mobj_s {thinker_t thinker;int type,x,y,z,flags,lastlook,damage,charged;angle_t angle;info_t *info;mobj_t *target;};
thinker_t thinkercap; mobj_t a,t,existing[30],m[3];info_t ai={${radius(defs.TM_MT_PAIN)}},mobjinfo[137];
int32_t finesine[10240]={${sine.join(',')}};int32_t *finecosine=finesine+2048;
uint8_t rnd[256]={${[...data.subarray(-256)].join(',')}};
int rn,mc,cnt,allow;long long trace[40];
void record(int event,long long x,long long y){if(cnt>=10)abort();trace[cnt*4]=event;trace[cnt*4+1]=x;trace[cnt*4+2]=y;trace[cnt*4+3]=rn;cnt++;}
int P_Random(void){rn=(rn+1)&255;return rnd[rn];}
void P_MobjThinker(mobj_t *actor){(void)actor;}
void linkactor(mobj_t *actor,int active){actor->thinker.next=thinkercap.next;actor->thinker.function.acp1=active?P_MobjThinker:NULL;thinkercap.next=&actor->thinker;}
fixed_t FixedMul(fixed_t a,fixed_t b){return(int32_t)((int64_t)a*b>>16);}
angle_t R_PointToAngle2(fixed_t x,fixed_t y,fixed_t tx,fixed_t ty){if(tx-x!=128*FRACUNIT||ty!=y)abort();return 0;}
mobj_t *P_SpawnMobj(fixed_t x,fixed_t y,fixed_t z,int type){if(type!=MT_SKULL||mc>=3)abort();
 mobj_t *mo=m+mc;memset(mo,0,sizeof(*mo));mo->type=type;mo->info=mobjinfo+type;mo->x=x;mo->y=y;mo->z=z;
 mo->lastlook=P_Random()%4;linkactor(mo,1);record(1,mc,a.flags);mc++;return mo;}
boolean P_TryMove(mobj_t *actor,fixed_t x,fixed_t y){int n=actor-m;if(n<0||n>=mc||x!=actor->x||y!=actor->y)abort();int ok=(allow>>n)&1;record(2,n,ok);return ok;}
void P_DamageMobj(mobj_t *actor,mobj_t *inflictor,mobj_t *source,int damage){int n=actor-m;if(n<0||n>=mc||inflictor!=&a||source!=&a)abort();actor->damage=damage;record(3,n,damage);}
void A_SkullAttack(mobj_t *actor){int n=actor-m;if(n<0||n>=mc)abort();actor->charged=1;record(4,n,actor->target==&t);}
${['A_FaceTarget','A_Fall','A_PainShootSkull','A_PainAttack','A_PainDie'].map(n=>EnemyFunction(original,n)).join('\n')}
int main(void){long long row[7],out[66];int i,j,n;
 mobjinfo[MT_SKULL].radius=${radius(defs.TM_MT_SKULL)};
 while(scanf("%lld",row)==1){for(i=1;i<7;i++)if(scanf("%lld",row+i)!=1)abort();
  memset(&a,0,sizeof(a));memset(&t,0,sizeof(t));memset(m,0,sizeof(m));memset(existing,0,sizeof(existing));
  thinkercap.next=&thinkercap;for(i=0;i<row[1]+4;i++){existing[i].type=MT_SKULL;if(i>=row[1]+2)existing[i].type=0;linkactor(existing+i,i<row[1]||i>=row[1]+2);}
  a.info=&ai;a.x=-20*FRACUNIT;a.y=10*FRACUNIT;a.z=3*FRACUNIT;a.flags=MF_SOLID|MF_AMBUSH;a.angle=row[5];
  a.target=row[3]?&t:NULL;t.x=a.x+128*FRACUNIT;t.y=a.y;t.flags=row[4];rn=row[6];allow=row[2];mc=cnt=0;for(i=0;i<40;i++)trace[i]=-1;
  switch(row[0]){case 0:A_PainShootSkull(&a,a.angle);break;case 1:A_PainAttack(&a);break;case 2:A_PainDie(&a);break;default:abort();}
  out[0]=a.flags;out[1]=a.angle;out[2]=rn;out[3]=mc;out[4]=cnt;
  for(j=0;j<3;j++){n=5+j*7;out[n]=m[j].x;out[n+1]=m[j].y;out[n+2]=m[j].z;out[n+3]=m[j].target==&t;out[n+4]=m[j].charged;out[n+5]=m[j].damage;out[n+6]=m[j].lastlook;}
  for(i=0;i<40;i++)out[26+i]=trace[i];for(i=0;i<66;i++)printf("%lld ",out[i]);puts("");
 }
}
`;
  const scratch=mkdtempSync(join(tmpdir(),'toom-pain-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    execFileSync(process.env.CC||'cc',['-std=c99','-O2','-Wall','-Wextra','-Werror','-Wno-misleading-indentation',src,'-o',exe]);
    const out=execFileSync(exe,{input:cases.map(r=>r.join(' ')).join('\n')+'\n',encoding:'utf8',maxBuffer:16*1024*1024})
      .trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
    assert.equal(out.length,cases.length);assert(out.every(r=>r.length===66));
    return cases.map((row,i)=>[...row,...out[i]]);
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
