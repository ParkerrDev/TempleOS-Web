import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root} from './Assets.mjs';
import {EnemySource,EnemyFunction} from './EnemyRef.mjs';

export async function BossReference() {
  const original=await EnemySource(),defs=Object.fromEntries([...readFileSync(resolve(root,'games/Toom/TmData.HH'),'ascii')
    .matchAll(/^#define (TM_\w+)\s+(\d+)$/gm)].map(m=>[m[1],Number(m[2])])),cases=[];
  for(const commercial of [0,1])for(let episode=0;episode<=5;episode++)for(const map of [1,6,7,8,9])
    for(const type of ['BRUISER','CYBORG','SPIDER','FATSO','BABY','TROOP','KEEN'].map(n=>defs['TM_MT_'+n]))
      for(const player of [0,1,2])for(let other=0;other<5;other++)for(const exit of [0,2])
        cases.push([0,commercial,episode,map,type,player,other,exit]);
  for(let type=0;type<137;type++)for(const player of [0,2])for(let other=0;other<5;other++)for(const exit of [0,2])
    cases.push([1,0,0,0,type,player,other,exit]);
  const c=`#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define MF_SOLID 2
#define MAXPLAYERS 4
#define commercial 1
#define lowerFloorToLowest 1
#define raiseToTexture 10
#define blazeOpen 6
#define open 3
${['BRUISER','CYBORG','SPIDER','FATSO','BABY','TROOP','KEEN'].map(n=>`#define MT_${n} ${defs['TM_MT_'+n]}`).join('\n')}
typedef struct mobj_s mobj_t;typedef void(*actionf_p1)(mobj_t*);
typedef struct thinker_s thinker_t;struct thinker_s {thinker_t *next;union {actionf_p1 acp1;} function;};
struct mobj_s {thinker_t thinker;int type,health,flags;};
typedef struct {int tag;} line_t;typedef struct {int health;} player_t;
thinker_t thinkercap;mobj_t a,b;player_t players[4];int playeringame[4],gamemode,gameepisode,gamemap,exit_pending,event,tag,kind,cnt;
void P_MobjThinker(mobj_t *actor){(void)actor;}
void EV_DoFloor(line_t *line,int type){event=2;tag=line->tag;kind=type;cnt++;}
void EV_DoDoor(line_t *line,int type){event=1;tag=line->tag;kind=type;cnt++;}
void G_ExitLevel(void){exit_pending=1;}
${['A_Fall','A_KeenDie','A_BossDeath'].map(n=>EnemyFunction(original,n)).join('\n')}
int main(void){long long row[8];int i;
 while(scanf("%lld",row)==1){for(i=1;i<8;i++)if(scanf("%lld",row+i)!=1)abort();
  memset(&a,0,sizeof(a));memset(&b,0,sizeof(b));memset(players,0,sizeof(players));memset(playeringame,0,sizeof(playeringame));
  a.type=row[4];a.flags=2|32|262144;a.thinker.function.acp1=P_MobjThinker;thinkercap.next=&a.thinker;a.thinker.next=&thinkercap;
  if(row[6]){a.thinker.next=&b.thinker;b.thinker.next=&thinkercap;b.type=row[6]==4?(a.type+1)%137:a.type;b.health=row[6]==2?0:100;b.thinker.function.acp1=row[6]==3?NULL:P_MobjThinker;}
  playeringame[0]=row[5]!=0;players[0].health=row[5]==2?100:0;
  gamemode=row[1];gameepisode=row[2];gamemap=row[3];exit_pending=row[7];event=tag=kind=cnt=0;
  if(row[0])A_KeenDie(&a);else A_BossDeath(&a);
  printf("%d %d %d %d %d %d\\n",a.flags,exit_pending,event,tag,kind,cnt);
 }
}
`;
  const scratch=mkdtempSync(join(tmpdir(),'toom-boss-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    execFileSync(process.env.CC||'cc',['-std=c99','-O2','-Wall','-Wextra','-Werror','-Wno-misleading-indentation',src,'-o',exe]);
    const out=execFileSync(exe,{input:cases.map(r=>r.join(' ')).join('\n')+'\n',encoding:'utf8',maxBuffer:4*1024*1024})
      .trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
    assert.equal(out.length,cases.length);assert(out.every(r=>r.length===6));
    return cases.map((row,i)=>[...row,...out[i]]);
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
