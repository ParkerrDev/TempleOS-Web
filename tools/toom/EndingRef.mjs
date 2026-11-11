import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root} from './Assets.mjs';
import {EnemySource,EnemyFunction} from './EnemyRef.mjs';

export async function EndingReference() {
  const original=await EnemySource(),data=readFileSync(resolve(root,'games/Toom/TMDATA.BIN'));
  const defs=Object.fromEntries([...readFileSync(resolve(root,'games/Toom/TmData.HH'),'ascii')
    .matchAll(/^#define (TM_\w+)\s+(\d+)$/gm)].map(m=>[m[1],Number(m[2])])),cases=[];
  for(let action=0;action<4;action++)for(let seed=0;seed<256;seed++)
    cases.push([action,seed,[-64,0,1024][seed%3]*65536,[16,-512][seed%2]*65536,(seed&1)*2]);
  const state=Array.from({length:7},(_,i)=>data.readInt32LE(32+defs.TM_S_BRAINEXPLODE1*28+i*4));
  const c=`#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define FRACUNIT 65536
#define MT_ROCKET ${defs.TM_MT_ROCKET}
#define S_BRAINEXPLODE1 ${defs.TM_S_BRAINEXPLODE1}
#define sfx_bospn ${defs.TM_SFX_BOSPN}
#define sfx_bosdth ${defs.TM_SFX_BOSDTH}
typedef struct {int x,y,z,momz,tics,lastlook,state,sprite,frame;} mobj_t;
mobj_t a,m[65];int count,rn,sound,sounds,sound_count,sound_random,exit_pending;
unsigned char rnd[256]={${[...data.subarray(-256)].join(',')}};
int P_Random(void){rn=(rn+1)&255;return rnd[rn];}
mobj_t *P_SpawnMobj(int x,int y,int z,int type){if(type!=MT_ROCKET||count>=65)abort();mobj_t *mo=m+count++;mo->x=x;mo->y=y;mo->z=z;mo->lastlook=P_Random()%4;return mo;}
void P_SetMobjState(mobj_t *actor,int state){if(state!=S_BRAINEXPLODE1)abort();actor->state=state;actor->sprite=${state[0]};actor->frame=${state[1]};actor->tics=${state[2]};}
void S_StartSound(mobj_t *actor,int n){if(actor)abort();sounds++;sound=n;sound_count=count;sound_random=rn;}
void G_ExitLevel(void){exit_pending=1;}
${['A_BrainPain','A_BrainScream','A_BrainExplode','A_BrainDie'].map(n=>EnemyFunction(original,n)).join('\n')}
int main(void){long long row[5],out[592];int i,j;
 while(scanf("%lld",row)==1){for(i=1;i<5;i++)if(scanf("%lld",row+i)!=1)abort();
  memset(&a,0,sizeof(a));memset(m,0,sizeof(m));a.x=row[2];a.y=row[3];rn=row[1];exit_pending=row[4];count=sound=sounds=sound_count=sound_random=0;
  switch(row[0]){case 0:A_BrainPain(&a);break;case 1:A_BrainScream(&a);break;case 2:A_BrainExplode(&a);break;case 3:A_BrainDie(&a);break;default:abort();}
  out[0]=count;out[1]=rn;out[2]=sound;out[3]=sounds;out[4]=sound_count;out[5]=sound_random;out[6]=exit_pending;
  for(i=0;i<65;i++){j=7+i*9;out[j]=m[i].x;out[j+1]=m[i].y;out[j+2]=m[i].z;out[j+3]=m[i].momz;out[j+4]=m[i].tics;out[j+5]=m[i].lastlook;out[j+6]=m[i].state;out[j+7]=m[i].sprite;out[j+8]=m[i].frame;}
  for(i=0;i<592;i++)printf("%lld ",out[i]);puts("");
 }
}
`;
  const scratch=mkdtempSync(join(tmpdir(),'toom-ending-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    execFileSync(process.env.CC||'cc',['-std=c99','-O2','-Wall','-Wextra','-Werror','-Wno-misleading-indentation','-Wno-unused-parameter',src,'-o',exe]);
    const out=execFileSync(exe,{input:cases.map(r=>r.join(' ')).join('\n')+'\n',encoding:'utf8',maxBuffer:8*1024*1024})
      .trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
    assert.equal(out.length,cases.length);assert(out.every(r=>r.length===592));
    return cases.map((row,i)=>[...row,...out[i]]);
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
