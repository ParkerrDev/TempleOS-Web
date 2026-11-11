import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root} from './Assets.mjs';
import {EnemySource,EnemyFunction} from './EnemyRef.mjs';

export async function ChaseReference() {
  const original=await EnemySource(),cases=[],data=readFileSync(resolve(root,'games/Toom/TMDATA.BIN'));
  function add(change) {
    const row=[0,100*65536,100*65536,8,0,0,0,0,0,1,100,4,0,0,0,0,2,0,0,0,0,255,0];
    for(const [k,v]of Object.entries(change))row[Number(k)]=v;cases.push(row);
  }
  for(let mask=0;mask<256;mask++)for(let old=0;old<=8;old++)
    for(const [x,y]of [[100,100],[-100,100],[100,-100],[-100,-100]])for(const seed of [0,255])
      add({1:x*65536,2:y*65536,3:old,21:mask,22:seed});
  const vectors=[[0,0],[0,100],[100,0],[10,10],[-10,-10],[11,-11],[-11,11],[20,100],[100,20]];
  for(const [x,y]of vectors)for(let old=0;old<=8;old++)for(const mask of [0,1,128,85,170,255])
    for(const seed of [1,63,127,128,254])add({1:x*65536,2:y*65536,3:old,21:mask,22:seed});
  for(let seed=0;seed<256;seed++)for(const mask of [0,1,128,85,170,255])add({21:mask,22:seed});
  for(let old=0;old<=8;old++)for(const angle of [0,1,0x1fffffff,0x20000000,0x7fffffff,0x80000000,0xe0000000,0xffffffff])
    for(const target of [0,1])for(const flags of [0,4])for(const health of [0,100])for(const found of [0,1])
      add({0:1,3:old,4:angle,6:3,7:2,9:target,10:health,11:flags,20:found});
  for(const skill of [0,2,4])for(const fast of [0,1])for(const flags of [0,128])for(const count of [-1,0,1,3])
    for(const melee of [0,90])for(const missile of [0,91])for(const hit of [0,1])for(const shot of [0,1])
      for(const mask of [0,85,255])for(const seed of [0,255])
        add({0:1,3:0,4:0xffffffff,5:count,6:1,7:1,8:flags,12:melee,13:missile,14:2,15:3,
          16:skill,17:fast,18:hit,19:shot,21:mask,22:seed});
  for(let seed=0;seed<256;seed++)for(const sound of [0,3])for(const mask of [0,255])
    add({0:1,3:7,5:2,15:sound,21:mask,22:seed});
  const c=`#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
typedef int boolean;
typedef int32_t fixed_t;
typedef uint32_t angle_t;
typedef int dirtype_t;
#define true 1
#define false 0
#define FRACUNIT 65536
#define ANG90 0x40000000U
#define MF_SHOOTABLE 4
#define MF_JUSTATTACKED 128
#define DI_EAST 0
#define DI_NORTH 2
#define DI_WEST 4
#define DI_SOUTH 6
#define DI_SOUTHEAST 7
#define DI_NODIR 8
#define sk_nightmare 4
typedef struct {int spawnstate,meleestate,missilestate,attacksound,activesound;} info_t;
typedef struct mobj_s mobj_t;
struct mobj_s {int x,y,movedir,movecount,reactiontime,threshold,flags,health,state;angle_t angle;mobj_t *target;info_t *info;};
int opposite[9]={4,5,6,7,0,1,2,3,8},diags[4]={3,1,5,7};
mobj_t a,t,p;info_t info;
int gameskill,fastparm,netgame,rn,rc,mask,melee,missile,found,mc,ic,pc,stc,snd,sndcnt,cnt,trace[32];
uint8_t rnd[256]={${[...data.subarray(-256)].join(',')}};
void record(int n){if(cnt>=32)abort();trace[cnt++]=n;}
int P_Random(void){rc++;rn=(rn+1)&255;return rnd[rn];}
void I_Error(const char *msg){(void)msg;abort();}
boolean P_Move(mobj_t *actor){record(actor->movedir);return !!(mask&(1<<actor->movedir));}
boolean P_LookForPlayers(mobj_t *actor,boolean around){if(!around)abort();pc++;record(3000);if(found)actor->target=&p;return found;}
boolean P_CheckMeleeRange(mobj_t *actor){(void)actor;mc++;record(3001);return melee;}
boolean P_CheckMissileRange(mobj_t *actor){(void)actor;ic++;record(3002);return missile;}
boolean P_CheckSight(mobj_t *actor,mobj_t *target){(void)actor;(void)target;abort();}
void S_StartSound(mobj_t *actor,int sound){if(actor!=&a)abort();snd=sound;sndcnt++;record(1000+sound);}
boolean P_SetMobjState(mobj_t *actor,int state){stc++;actor->state=state;record(2000+state);return true;}
${['P_TryWalk','P_NewChaseDir','A_Chase'].map(n=>EnemyFunction(original,n)).join('\n')}
int main(void){long long row[23],out[49];int i;
 while(scanf("%lld",row)==1){for(i=1;i<23;i++)if(scanf("%lld",row+i)!=1)abort();
  memset(&a,0,sizeof(a));memset(&t,0,sizeof(t));memset(&p,0,sizeof(p));
  t.x=row[1];t.y=row[2];a.movedir=row[3];a.angle=row[4];a.movecount=row[5];
  a.reactiontime=row[6];a.threshold=row[7];a.flags=row[8];a.target=row[9]?&t:NULL;
  t.health=row[10];t.flags=row[11];info.spawnstate=88;info.meleestate=row[12];info.missilestate=row[13];
  info.attacksound=row[14];info.activesound=row[15];a.info=&info;a.state=77;
  gameskill=row[16];fastparm=row[17];melee=row[18];missile=row[19];found=row[20];mask=row[21];rn=row[22];
  rc=mc=ic=pc=stc=sndcnt=cnt=0;snd=-1;for(i=0;i<32;i++)trace[i]=-1;
  if(row[0])A_Chase(&a);else P_NewChaseDir(&a);
  out[0]=a.target==&t?1:a.target==&p?2:0;out[1]=(uint32_t)a.flags;out[2]=a.angle;out[3]=a.movecount;
  out[4]=a.reactiontime;out[5]=a.threshold;out[6]=a.movedir;out[7]=a.state;out[8]=snd;out[9]=sndcnt;
  out[10]=rn;out[11]=rc;out[12]=mc;out[13]=ic;out[14]=pc;out[15]=stc;out[16]=cnt;
  for(i=0;i<32;i++)out[17+i]=trace[i];for(i=0;i<49;i++)printf("%lld ",out[i]);puts("");
 }
}
`;
  const scratch=mkdtempSync(join(tmpdir(),'toom-chase-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    execFileSync(process.env.CC||'cc',['-std=c99','-O2','-Wall','-Wextra','-Werror','-Wno-misleading-indentation',src,'-o',exe]);
    const out=execFileSync(exe,{input:cases.map(r=>r.join(' ')).join('\n')+'\n',encoding:'utf8',maxBuffer:32*1024*1024})
      .trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
    assert.equal(out.length,cases.length);assert(out.every(r=>r.length===49));
    return cases.map((row,i)=>[...row,...out[i]]);
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
