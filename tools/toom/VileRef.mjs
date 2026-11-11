import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root} from './Assets.mjs';
import {EnemySource,EnemyFunction} from './EnemyRef.mjs';

export async function VileReference() {
  const original=await EnemySource(),data=readFileSync(resolve(root,'games/Toom/TMDATA.BIN'));
  const defs=Object.fromEntries([...readFileSync(resolve(root,'games/Toom/TmData.HH'),'ascii')
    .matchAll(/^#define (TM_\w+)\s+(\d+)$/gm)].map(m=>[m[1],Number(m[2])]));
  const info=Array.from({length:137},(_,type)=>Array.from({length:23},(_,i)=>data.readInt32LE(32+967*28+type*92+i*4))),cases=[];
  for(let type=0;type<137;type++)for(const cfg of [0,1,2,3,4])for(const delta of [-1,0,1])for(const allow of [0,1])
    cases.push([0,type,0,cfg,info[type][16]+info[defs.TM_MT_VILE][16]+delta,0,allow]);
  for(const type of ['TROOP','SERGEANT','BRUISER','SKULL','VILE'].map(n=>defs['TM_MT_'+n]))
    for(let dir=0;dir<=8;dir++)for(const cfg of [2,3,4])for(const xy of [[-30,-30],[-1,1],[0,0],[1,-1],[30,30],[-257,257]])
      for(const allow of [0,1,2,4,7])cases.push([1,type,dir,cfg,xy[0]*65536,xy[1]*65536,allow]);
  const c=`#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
typedef int boolean;typedef int32_t fixed_t;
#define true 1
#define false 0
#define S_NULL 0
#define MF_CORPSE ${defs.TM_MF_CORPSE}
#define MF_AMBUSH ${defs.TM_MF_AMBUSH}
#define MF_SHADOW ${defs.TM_MF_SHADOW}
#define MT_VILE ${defs.TM_MT_VILE}
#define S_VILE_HEAL1 ${defs.TM_S_VILE_HEAL1}
#define sfx_slop ${defs.TM_SFX_SLOP}
#define MAXRADIUS (32*65536)
#define MAPBLOCKSHIFT 23
#define DI_NODIR 8
typedef struct {int doomednum,spawnstate,spawnhealth,seestate,seesound,reactiontime,attacksound,painstate,painchance,painsound,meleestate,missilestate,deathstate,xdeathstate,deathsound,speed,radius,height,mass,damage,activesound,flags,raisestate;} mobjinfo_t;
mobjinfo_t mobjinfo[137]={${info.map(r=>'{'+r.join(',')+'}').join(',')}};
typedef struct mobj_s mobj_t;
struct mobj_s {int x,y,z,radius,height,momx,momy,flags,tics,health,state,angle,movedir; mobj_t *target,*next; mobjinfo_t *info;};
mobj_t a,t,body[3],*blocks[16],*corpsehit,*vileobj;
int viletryx,viletryy,bmaporgx=-256*65536,bmaporgy=-256*65536;
int xspeed[8]={65536,47000,0,-47000,-65536,-47000,0,47000},yspeed[8]={0,47000,65536,47000,0,-47000,-65536,-47000};
int allow,cnt;long long trace[24];
int who(mobj_t *actor){if(actor==&a)return -1;return actor-body;}
void record(int event,int actor,int value){if(cnt>=8)abort();trace[cnt*3]=event;trace[cnt*3+1]=actor;trace[cnt*3+2]=value;cnt++;}
boolean P_CheckPosition(mobj_t *actor,int x,int y){if(x!=actor->x||y!=actor->y)abort();int n=who(actor);record(1,n,actor->height);return(allow>>n)&1;}
boolean P_BlockThingsIterator(int x,int y,boolean(*fn)(mobj_t*)){if(x<0||x>=4||y<0||y>=4)return true;for(mobj_t *m=blocks[x+y*4];m;m=m->next)if(!fn(m))return false;return true;}
void A_FaceTarget(mobj_t *actor){record(2,who(actor->target),0);actor->flags&=~MF_AMBUSH;actor->angle=123+who(actor->target);}
void P_SetMobjState(mobj_t *actor,int n){record(3,who(actor),n);actor->state=n;}
void S_StartSound(mobj_t *actor,int n){record(4,who(actor),n);}
void A_Chase(mobj_t *actor){if(actor!=&a)abort();record(5,-1,0);}
${['PIT_VileCheck','A_VileChase'].map(n=>EnemyFunction(original,n)).join('\n')}
int main(void){long long row[7],out[54];int i,j,n,x,y,res;
 while(scanf("%lld",row)==1){for(i=1;i<7;i++)if(scanf("%lld",row+i)!=1)abort();
  memset(&a,0,sizeof(a));memset(&t,0,sizeof(t));memset(body,0,sizeof(body));memset(blocks,0,sizeof(blocks));
  a.info=mobjinfo+MT_VILE;a.x=a.y=-16*65536;a.flags=MF_AMBUSH;a.state=100;a.angle=999;a.target=&t;a.movedir=row[2];
  for(i=0;i<3;i++){mobj_t *m=body+i;m->info=mobjinfo+(i?${defs.TM_MT_TROOP}:row[1]);m->x=i==1?-row[4]:row[4];m->y=i==2?-row[5]:row[5];
   m->radius=m->info->radius;m->height=m->info->height/4;if(row[3]==4)m->height=m->radius=0;
   m->momx=7;m->momy=9;m->health=-5;m->state=400;m->target=&t;m->tics=row[3]==1?0:-1;m->flags=row[3]?MF_CORPSE:0;if(row[3]==3)m->flags|=MF_SHADOW;
   x=(m->x-bmaporgx)>>MAPBLOCKSHIFT;y=(m->y-bmaporgy)>>MAPBLOCKSHIFT;if(x>=0&&x<4&&y>=0&&y<4){m->next=blocks[x+y*4];blocks[x+y*4]=m;}
  }
  allow=row[6];cnt=0;for(i=0;i<24;i++)trace[i]=-1;res=-1;
  if(row[0]==0){viletryx=viletryy=0;res=!PIT_VileCheck(body);}else A_VileChase(&a);
  out[0]=res;out[1]=a.state;out[2]=a.flags;out[3]=a.angle;out[4]=a.target==&t;out[5]=cnt;
  for(j=0;j<3;j++){mobj_t*m=body+j;n=6+j*8;out[n]=m->height;out[n+1]=m->momx;out[n+2]=m->momy;out[n+3]=m->health;out[n+4]=m->flags;out[n+5]=m->target==&t;out[n+6]=m->state;out[n+7]=m->tics;}
  for(i=0;i<24;i++)out[30+i]=trace[i];for(i=0;i<54;i++)printf("%lld ",out[i]);puts("");
 }
}
`;
  const scratch=mkdtempSync(join(tmpdir(),'toom-vile-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    execFileSync(process.env.CC||'cc',['-std=c99','-O2','-Wall','-Wextra','-Werror','-Wno-misleading-indentation',src,'-o',exe]);
    const out=execFileSync(exe,{input:cases.map(r=>r.join(' ')).join('\n')+'\n',encoding:'utf8',maxBuffer:16*1024*1024})
      .trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
    assert.equal(out.length,cases.length);assert(out.every(r=>r.length===54));
    return cases.map((row,i)=>[...row,...out[i]]);
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
