import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root} from './Assets.mjs';
import {EnemySource,EnemyFunction} from './EnemyRef.mjs';

export async function AwakeReference() {
  const original=await EnemySource(),defs=Object.fromEntries([...readFileSync(resolve(root,'games/Toom/TmData.HH'),'ascii')
    .matchAll(/^#define (TM_\w+)\s+(\d+)$/gm)].map(m=>[m[1],Number(m[2])])),cases=[];
  for(const n of [0,1,2,16,31,32])for(let pattern=0;pattern<6;pattern++)
    for(const cursor of [0,7,99])for(const easy of [0,1])for(const seed of [0,127,254,255])
      cases.push([n,pattern,cursor,easy,seed]);
  const c=`#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define MT_BOSSTARGET ${defs.TM_MT_BOSSTARGET}
#define sfx_bossit ${defs.TM_SFX_BOSSIT}
typedef struct mobj_s mobj_t;typedef void(*actionf_p1)(mobj_t*);
typedef struct thinker_s thinker_t;struct thinker_s {thinker_t *next;union {actionf_p1 acp1;} function;};
struct mobj_s {thinker_t thinker;int type,health;};
thinker_t thinkercap;mobj_t a,body[32],dummy;mobj_t *braintargets[32];
int numbraintargets,braintargeton,sounds,sound;
void P_MobjThinker(mobj_t *actor){(void)actor;}
void S_StartSound(mobj_t *actor,int n){if(actor)abort();sounds++;sound=n;}
${EnemyFunction(original,'A_BrainAwake')}
int main(void){long long row[5];int i;thinker_t *last;
 while(scanf("%lld",row)==1){for(i=1;i<5;i++)if(scanf("%lld",row+i)!=1)abort();
  memset(body,0,sizeof(body));memset(&dummy,0,sizeof(dummy));memset(&a,0,sizeof(a));dummy.type=MT_BOSSTARGET;dummy.health=100;
  a.thinker.function.acp1=P_MobjThinker;thinkercap.next=&a.thinker;a.thinker.next=&dummy.thinker;last=&dummy.thinker;
  for(i=0;i<row[0];i++){mobj_t*m=body+i;m->type=MT_BOSSTARGET;m->health=row[1]==4?0:100;m->thinker.function.acp1=P_MobjThinker;
   if(row[1]==1||(row[1]==2&&i%2))m->type=-1;if(row[1]==3&&i%3==1)m->thinker.function.acp1=NULL;
   if(row[1]==5){if(i%3==0)m->type=-1;if(i%3==1)m->thinker.function.acp1=NULL;}
   last->next=&m->thinker;last=&m->thinker;
  }last->next=&thinkercap;numbraintargets=32;braintargeton=row[2];sounds=sound=0;
  A_BrainAwake(&a);
  printf("%d %d %lld %lld %d %d",numbraintargets,braintargeton,row[3],row[4],sounds,sound);
  for(i=0;i<32;i++)printf(" %ld",i<numbraintargets?(long)(braintargets[i]-body):-1L);puts("");
 }
}
`;
  const scratch=mkdtempSync(join(tmpdir(),'toom-awake-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    execFileSync(process.env.CC||'cc',['-std=c99','-O2','-Wall','-Wextra','-Werror','-Wno-misleading-indentation','-Wno-unused-parameter',src,'-o',exe]);
    const out=execFileSync(exe,{input:cases.map(r=>r.join(' ')).join('\n')+'\n',encoding:'utf8',maxBuffer:1024*1024})
      .trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
    assert.equal(out.length,cases.length);assert(out.every(r=>r.length===38));
    return cases.map((row,i)=>[...row,...out[i]]);
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
