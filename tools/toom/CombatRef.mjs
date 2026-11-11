import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root} from './Assets.mjs';
import {EnemySource,EnemyFunction} from './EnemyRef.mjs';

export async function CombatReference() {
  const original=await EnemySource(),data=readFileSync(resolve(root,'games/Toom/TMDATA.BIN'));
  const defs=Object.fromEntries([...readFileSync(resolve(root,'games/Toom/TmData.HH'),'ascii')
    .matchAll(/^#define (TM_\w+)\s+(\d+)$/gm)].map(m=>[m[1],Number(m[2])]));
  const actions=[['POS_ATTACK','A_PosAttack'],['SPOS_ATTACK','A_SPosAttack'],['CPOS_ATTACK','A_CPosAttack'],
    ['CPOS_REFIRE','A_CPosRefire'],['SPID_REFIRE','A_SpidRefire'],['TROOP_ATTACK','A_TroopAttack'],
    ['SARG_ATTACK','A_SargAttack'],['HEAD_ATTACK','A_HeadAttack'],['BRUIS_ATTACK','A_BruisAttack'],
    ['SKEL_FIST','A_SkelFist'],['BSPI_ATTACK','A_BspiAttack'],['CYBER_ATTACK','A_CyberAttack'],['SKEL_WHOOSH','A_SkelWhoosh']];
  const cases=[];
  for(const [name]of actions)for(const distance of [59,60,128])for(const present of [0,1])for(const health of [0,100])
    for(const shadow of [0,262144])for(const sight of [0,1])for(const angle of [0,0xffffffff])for(const seed of [0,255])for(const slope of [0,32768])
      cases.push([defs['TM_A_'+name],distance*65536,present,health,shadow,sight,angle,0x11223344,slope,seed]);
  for(const [name]of actions)for(const distance of [59,128])for(const shadow of [0,262144])for(let seed=0;seed<256;seed++)
    cases.push([defs['TM_A_'+name],distance*65536,1,100,shadow,1,0xffffffff,0x11223344,-32768,seed]);
  const constants=['MF_AMBUSH','MF_SHADOW','MT_TROOPSHOT','MT_HEADSHOT','MT_BRUISERSHOT','MT_ROCKET','MT_ARACHPLAZ'];
  const sounds=['pistol','shotgn','claw','skepch','skeswg'];
  const c=`#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
typedef int boolean;
typedef int32_t fixed_t;
typedef uint32_t angle_t;
#define true 1
#define false 0
#define FRACUNIT 65536
#define MELEERANGE (64*FRACUNIT)
#define MISSILERANGE (2048*FRACUNIT)
${constants.map(n=>`#define ${n} ${defs['TM_'+n]}`).join('\n')}
${sounds.map(n=>`#define sfx_${n} ${defs['TM_SFX_'+n.toUpperCase()]}`).join('\n')}
typedef struct {int radius,seestate;} info_t;
typedef struct mobj_s mobj_t;
struct mobj_s {int x,y,flags,health,state;angle_t angle;info_t *info;mobj_t *target;};
mobj_t a,t,missile;info_t ai={0,99},ti={16*FRACUNIT,0};
int rn,rc,cnt,sight,slope;long long trace[64];
angle_t fakeangle;
uint8_t rnd[256]={${[...data.subarray(-256)].join(',')}};
void record(int event,long long x,long long y){if(cnt>=16)abort();trace[cnt*4]=event;trace[cnt*4+1]=x;trace[cnt*4+2]=y;trace[cnt*4+3]=rn;cnt++;}
int P_Random(void){rc++;rn=(rn+1)&255;return rnd[rn];}
fixed_t P_AproxDistance(fixed_t x,fixed_t y){x=abs(x);y=abs(y);return x+y-(x<y?x:y)/2;}
boolean P_CheckSight(mobj_t *source,mobj_t *target){if(source!=&a||target!=&t)abort();record(2,1,0);return sight;}
angle_t R_PointToAngle2(fixed_t x,fixed_t y,fixed_t tx,fixed_t ty){record(1,tx-x,ty-y);return fakeangle;}
void S_StartSound(mobj_t *actor,int sound){if(actor!=&a)abort();record(3,sound,2);}
boolean P_SetMobjState(mobj_t *actor,int state){if(actor!=&a)abort();actor->state=state;record(8,state,0);return true;}
fixed_t P_AimLineAttack(mobj_t *actor,angle_t angle,fixed_t range){if(actor!=&a||range!=MISSILERANGE)abort();record(4,angle,slope);return slope;}
void P_LineAttack(mobj_t *actor,angle_t angle,fixed_t range,fixed_t value,int damage){if(actor!=&a||range!=MISSILERANGE||value!=slope)abort();record(5,angle,damage);}
void P_DamageMobj(mobj_t *target,mobj_t *inflictor,mobj_t *source,int damage){if(target!=&t||inflictor!=&a||source!=&a)abort();record(6,damage,2);}
mobj_t *P_SpawnMissile(mobj_t *source,mobj_t *target,int type){if(source!=&a||target!=&t)abort();record(7,type,1);return &missile;}
${['P_CheckMeleeRange','A_FaceTarget',...actions.map(a=>a[1])].map(n=>EnemyFunction(original,n)).join('\n')}
int main(void){long long row[10],out[70];int i;
 while(scanf("%lld",row)==1){for(i=1;i<10;i++)if(scanf("%lld",row+i)!=1)abort();
  memset(&a,0,sizeof(a));memset(&t,0,sizeof(t));a.info=&ai;t.info=&ti;t.x=row[1];a.target=row[2]?&t:NULL;
  t.health=row[3];t.flags=row[4];sight=row[5];fakeangle=row[6];a.angle=row[7];a.flags=MF_AMBUSH;a.state=77;
  slope=row[8];rn=row[9];rc=cnt=0;for(i=0;i<64;i++)trace[i]=-1;
  switch(row[0]){${actions.map(([name,fn])=>`case ${defs['TM_A_'+name]}:${fn}(&a);break;`).join('')}default:abort();}
  out[0]=a.flags;out[1]=a.angle;out[2]=a.state;out[3]=rn;out[4]=rc;out[5]=cnt;
  for(i=0;i<64;i++)out[6+i]=trace[i];
  for(i=0;i<70;i++)printf("%lld ",out[i]);puts("");
 }
}
`;
  const scratch=mkdtempSync(join(tmpdir(),'toom-combat-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    execFileSync(process.env.CC||'cc',['-std=c99','-O2','-Wall','-Wextra','-Werror','-Wno-misleading-indentation',src,'-o',exe]);
    const out=execFileSync(exe,{input:cases.map(r=>r.join(' ')).join('\n')+'\n',encoding:'utf8',maxBuffer:32*1024*1024})
      .trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
    assert.equal(out.length,cases.length);assert(out.every(r=>r.length===70));
    return cases.map((row,i)=>[...row,...out[i]]);
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
