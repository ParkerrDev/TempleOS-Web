import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root} from './Assets.mjs';
import {EnemySource,EnemyFunction} from './EnemyRef.mjs';

export async function FireReference() {
  const original=await EnemySource(),data=readFileSync(resolve(root,'games/Toom/TMDATA.BIN'));
  const defs=Object.fromEntries([...readFileSync(resolve(root,'games/Toom/TmData.HH'),'ascii')
    .matchAll(/^#define (TM_\w+)\s+(\d+)$/gm)].map(m=>[m[1],Number(m[2])]));
  const cases=[];
  for(let action=0;action<6;action++)for(let present=0;present<8;present++)for(const visible of [0,1])
    for(const angle of [0,0x40000000,0xffffffff])for(const shadow of [0,262144])for(const seed of [0,255])
      for(const mass of [1,100,500,1000])cases.push([action,present,visible,angle,shadow,seed,mass]);
  for(let action=0;action<6;action++)for(let seed=0;seed<256;seed++)cases.push([action,7,1,0xffffffff,262144,seed,100]);
  const trig=32+967*28+137*92+138*4+109*8,sine=Array.from({length:10240},(_,i)=>data.readInt32LE(trig+i*4));
  const c=`#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
typedef int boolean;typedef uint32_t angle_t;typedef int32_t fixed_t;
#define FRACUNIT 65536
#define ANGLETOFINESHIFT 19
#define MF_AMBUSH 32
#define MF_SHADOW 262144
#define MT_FIRE ${defs.TM_MT_FIRE}
${['vilatk','flamst','flame','barexp'].map(n=>`#define sfx_${n} ${defs['TM_SFX_'+n.toUpperCase()]}`).join('\n')}
typedef struct {int mass;} info_t;
typedef struct mobj_s mobj_t;
struct mobj_s {int x,y,z,flags,health,momz,lastlook;angle_t angle;mobj_t*target,*tracer;info_t*info;};
mobj_t a,t,f,m;info_t ti;int rn,visible,cnt,spawned;long long trace[32];
int32_t finesine[10240]={${sine.join(',')}};int32_t *finecosine=finesine+2048;
uint8_t rnd[256]={${[...data.subarray(-256)].join(',')}};
int who(mobj_t *actor){if(actor==&a)return 0;if(actor==&t)return 1;if(actor==&f)return 2;if(actor==&m)return 3;return -1;}
void record(int event,int actor,int value){if(cnt>=8)abort();trace[cnt*4]=event;trace[cnt*4+1]=actor;trace[cnt*4+2]=value;trace[cnt*4+3]=rn;cnt++;}
int P_Random(void){rn=(rn+1)&255;return rnd[rn];}
fixed_t FixedMul(fixed_t a,fixed_t b){return(int32_t)((int64_t)a*b>>16);}
angle_t R_PointToAngle2(int x,int y,int tx,int ty){if(tx-x!=128*FRACUNIT||ty!=y)abort();record(2,1,0);return 0;}
boolean P_CheckSight(mobj_t *actor,mobj_t *target){if(!actor)return 0;if(actor!=&a||target!=&t)abort();record(1,0,visible);return visible;}
void S_StartSound(mobj_t *actor,int n){record(3,who(actor),n);}
void P_UnsetThingPosition(mobj_t *actor){(void)actor;}
void P_SetThingPosition(mobj_t *actor){(void)actor;}
mobj_t *P_SpawnMobj(int x,int y,int z,int type){if(type!=MT_FIRE||x!=t.x||y!=t.x||z!=t.z)abort();memset(&m,0,sizeof(m));
 m.x=x;m.y=t.y;m.z=z;m.lastlook=P_Random()%4;spawned=1;record(4,3,m.lastlook);return &m;}
void P_DamageMobj(mobj_t *target,mobj_t *inflictor,mobj_t *source,int damage){if(target!=&t||inflictor!=&a||source!=&a||damage!=20)abort();record(5,1,damage);target->health-=damage;}
void P_RadiusAttack(mobj_t *spot,mobj_t *source,int damage){if(source!=&a||damage!=70)abort();record(6,who(spot),damage);}
void A_Fire(mobj_t *actor);
${['A_FaceTarget','A_VileStart','A_StartFire','A_FireCrackle','A_Fire','A_VileTarget','A_VileAttack'].map(n=>EnemyFunction(original,n)).join('\n')}
int main(void){long long row[7],out[50];int i;
 while(scanf("%lld",row)==1){for(i=1;i<7;i++)if(scanf("%lld",row+i)!=1)abort();memset(&a,0,sizeof(a));memset(&t,0,sizeof(t));memset(&f,0,sizeof(f));memset(&m,0,sizeof(m));
  a.x=-64*FRACUNIT;a.y=16*FRACUNIT;a.z=32*FRACUNIT;a.angle=0xc0000000;a.flags=MF_AMBUSH;
  t.x=64*FRACUNIT;t.y=16*FRACUNIT;t.z=8*FRACUNIT;t.angle=row[3];t.flags=row[4];t.health=1000;t.info=&ti;ti.mass=row[6];
  f.x=-100*FRACUNIT;f.y=-90*FRACUNIT;f.z=7*FRACUNIT;
  if(row[1]&1){a.target=&t;f.tracer=&t;}if(row[1]&2)f.target=&a;if(row[1]&4)a.tracer=&f;
  visible=row[2];rn=row[5];spawned=cnt=0;for(i=0;i<32;i++)trace[i]=-1;
  switch(row[0]){case 0:A_VileStart(&a);break;case 1:A_StartFire(&f);break;case 2:A_FireCrackle(&f);break;case 3:A_Fire(&f);break;case 4:A_VileTarget(&a);break;case 5:A_VileAttack(&a);break;default:abort();}
  out[0]=a.angle;out[1]=a.flags;out[2]=who(a.tracer);out[3]=t.health;out[4]=t.momz;out[5]=rn;out[6]=spawned;out[7]=cnt;
  out[8]=f.x;out[9]=f.y;out[10]=f.z;out[11]=m.x;out[12]=m.y;out[13]=m.z;out[14]=who(m.target);out[15]=who(m.tracer);out[16]=m.lastlook;out[17]=who(a.target);
  for(i=0;i<32;i++)out[18+i]=trace[i];for(i=0;i<50;i++)printf("%lld ",out[i]);puts("");
 }
}
`;
  const scratch=mkdtempSync(join(tmpdir(),'toom-fire-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    execFileSync(process.env.CC||'cc',['-std=c99','-O2','-Wall','-Wextra','-Werror','-Wno-misleading-indentation',src,'-o',exe]);
    const out=execFileSync(exe,{input:cases.map(r=>r.join(' ')).join('\n')+'\n',encoding:'utf8',maxBuffer:16*1024*1024})
      .trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
    assert.equal(out.length,cases.length);assert(out.every(r=>r.length===50));
    return cases.map((row,i)=>[...row,...out[i]]);
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
