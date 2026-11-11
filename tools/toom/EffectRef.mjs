import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root} from './Assets.mjs';
import {EnemySource,EnemyFunction} from './EnemyRef.mjs';

export async function EffectReference() {
  const original=await EnemySource(),data=readFileSync(resolve(root,'games/Toom/TMDATA.BIN'));
  const defs=Object.fromEntries([...readFileSync(resolve(root,'games/Toom/TmData.HH'),'ascii')
    .matchAll(/^#define (TM_\w+)\s+(\d+)$/gm)].map(m=>[m[1],Number(m[2])]));
  const actions=[['SCREAM','A_Scream'],['XSCREAM','A_XScream'],['PAIN','A_Pain'],['FALL','A_Fall'],
    ['PLAYER_SCREAM','A_PlayerScream'],['HOOF','A_Hoof'],['METAL','A_Metal'],['BABY_METAL','A_BabyMetal'],['EXPLODE','A_Explode']];
  const sounds=['podth1','podth2','podth3','bgdth1','bgdth2','slop','pldeth','pdiehi','hoof','metal','bspwlk'];
  const cases=[];
  function add(name,type,sound,health,commercial,flags,target,seed) {
    cases.push([defs['TM_A_'+name],defs['TM_MT_'+type],sound,health,commercial,flags,target,seed]);
  }
  for(const type of ['TROOP','SPIDER','CYBORG'])for(const sound of [0,...sounds.slice(0,6).map(n=>defs['TM_SFX_'+n.toUpperCase()]),1])
    for(let seed=0;seed<256;seed++) add('SCREAM',type,sound,-1,0,6,1,seed);
  for(const sound of [0,1,108])for(const seed of [0,255])add('PAIN','TROOP',sound,100,0,6,1,seed);
  for(const commercial of [0,1])for(const health of [-100,-51,-50,-49,0])for(const seed of [0,255])
    add('PLAYER_SCREAM','TROOP',0,health,commercial,6,0,seed);
  for(const name of ['XSCREAM','FALL','HOOF','METAL','BABY_METAL','EXPLODE'])for(const flags of [0,2,6,0x800000])
    for(const target of [0,1])for(const seed of [0,255])add(name,'TROOP',0,0,0,flags,target,seed);
  const c=`#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#define commercial 1
#define MF_SOLID 2
#define MT_SPIDER ${defs.TM_MT_SPIDER}
#define MT_CYBORG ${defs.TM_MT_CYBORG}
${sounds.map(n=>`#define sfx_${n} ${defs['TM_SFX_'+n.toUpperCase()]}`).join('\n')}
typedef struct {int deathsound,painsound;} info_t;
typedef struct mobj_s mobj_t;
struct mobj_s {int type,health,flags;info_t *info;mobj_t *target;};
mobj_t a,t;info_t info;int gamemode,rn,rc,cnt;long long trace[8];
uint8_t rnd[256]={${[...data.subarray(-256)].join(',')}};
void record(int event,int x,int y){if(cnt>=2)abort();trace[cnt*4]=event;trace[cnt*4+1]=x;trace[cnt*4+2]=y;trace[cnt*4+3]=rn;cnt++;}
int P_Random(void){rc++;rn=(rn+1)&255;return rnd[rn];}
void S_StartSound(mobj_t *actor,int sound){if(actor&&actor!=&a)abort();record(1,actor?1:0,sound);}
void A_Chase(mobj_t *actor){if(actor!=&a)abort();record(2,0,0);}
void P_RadiusAttack(mobj_t *actor,mobj_t *source,int damage){if(actor!=&a||(source&&source!=&t))abort();record(3,source?1:0,damage);}
${actions.map(a=>EnemyFunction(original,a[1])).join('\n')}
int main(void){long long row[8],out[12];int i;
 while(scanf("%lld",row)==1){for(i=1;i<8;i++)if(scanf("%lld",row+i)!=1)abort();
  memset(&a,0,sizeof(a));a.type=row[1];info.deathsound=info.painsound=row[2];a.info=&info;a.health=row[3];gamemode=row[4];
  a.flags=row[5];a.target=row[6]?&t:NULL;rn=row[7];rc=cnt=0;for(i=0;i<8;i++)trace[i]=-1;
  switch(row[0]){${actions.map(([name,fn])=>`case ${defs['TM_A_'+name]}:${fn}(&a);break;`).join('')}default:abort();}
  out[0]=a.flags;out[1]=rn;out[2]=rc;out[3]=cnt;for(i=0;i<8;i++)out[4+i]=trace[i];
  for(i=0;i<12;i++)printf("%lld ",out[i]);puts("");
 }
}
`;
  const scratch=mkdtempSync(join(tmpdir(),'toom-effect-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    execFileSync(process.env.CC||'cc',['-std=c99','-O2','-Wall','-Wextra','-Werror','-Wno-misleading-indentation',src,'-o',exe]);
    const out=execFileSync(exe,{input:cases.map(r=>r.join(' ')).join('\n')+'\n',encoding:'utf8',maxBuffer:8*1024*1024})
      .trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
    assert.equal(out.length,cases.length);assert(out.every(r=>r.length===12));
    return cases.map((row,i)=>[...row,...out[i]]);
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
