import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync,spawnSync} from 'node:child_process';
import {root} from './Assets.mjs';
import {EnemySource,EnemyFunction} from './EnemyRef.mjs';

export async function SpitReference() {
  const original=await EnemySource(),defs=Object.fromEntries([...readFileSync(resolve(root,'games/Toom/TmData.HH'),'ascii')
    .matchAll(/^#define (TM_\w+)\s+(\d+)$/gm)].map(m=>[m[1],Number(m[2])])),cases=[];
  for(const count of [1,2,7,32])for(const cursor of [0,count-1])for(const skill of [0,1,2,4])
    for(const speed of [-655360,-1,1,655360])for(const period of [1,3,10])for(const steps of [1,2,63])
      cases.push([count,cursor,skill,speed*period*steps,speed,period,71]);
  const c=`#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>
#define MT_SPAWNSHOT ${defs.TM_MT_SPAWNSHOT}
#define sfx_bospit ${defs.TM_SFX_BOSPIT}
#define sk_easy 1
typedef struct {int tics;} state_t;
typedef struct mobj_s mobj_t;
struct mobj_s {int y,momy,reactiontime;state_t *state;mobj_t *target;};
mobj_t a,m,targets[32],*braintargets[32];state_t state;
int gameskill,numbraintargets,braintargeton,spawns,selected,sounds,sound,phase;
mobj_t *P_SpawnMissile(mobj_t *actor,mobj_t *target,int type){if(actor!=&a||type!=MT_SPAWNSHOT)abort();
 spawns++;selected=target-targets;return &m;}
void S_StartSound(mobj_t *actor,int n){if(actor)abort();sounds++;sound=n;}
${EnemyFunction(original,'A_BrainSpit')}
int main(int argc,char **argv){long long row[7];int i,j;struct rlimit core={0,0};setrlimit(RLIMIT_CORE,&core);
 while(scanf("%lld",row)==1){for(i=1;i<7;i++)if(scanf("%lld",row+i)!=1)abort();
  memset(&a,0,sizeof(a));memset(&m,0,sizeof(m));memset(targets,0,sizeof(targets));
  numbraintargets=row[0];braintargeton=row[1];gameskill=row[2];state.tics=row[5];
  for(i=0;i<32;i++){braintargets[i]=targets+i;targets[i].y=row[3];}
  m.state=&state;m.momy=row[4];m.target=&a;m.reactiontime=-17;spawns=sounds=0;selected=sound=-1;phase^=1;
  A_BrainSpit(&a);
  if(argc>1){if(strcmp(argv[1],"countdown"))abort();for(j=0;j<80;j++)--m.reactiontime;printf("%d\\n",m.reactiontime);}
  else printf("%d %d %d %d %ld %d %d %d %lld\\n",braintargeton,phase,spawns,selected,
   m.target==&a?-1L:(long)(m.target-targets),m.reactiontime,sounds,sound,row[6]);
 }
}
`;
  assert.match(EnemyFunction(original,'A_SpawnFly'),/if\s*\(\s*--mo->reactiontime\s*\)\s*return\s*;/);
  const scratch=mkdtempSync(join(tmpdir(),'toom-spit-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    execFileSync(process.env.CC||'cc',['-std=c99','-O2','-Wall','-Wextra','-Werror','-Wno-misleading-indentation',src,'-o',exe]);
    const out=execFileSync(exe,{input:cases.map(r=>r.join(' ')).join('\n')+'\n',encoding:'utf8',maxBuffer:1024*1024})
      .trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
    assert.equal(out.length,cases.length);assert(out.every(r=>r.length===9));
    const failures=[];
    for(const [name,row]of [['empty',[0,0,2,100,1,3,0]],['zeroSpeed',[1,0,2,100,0,3,0]]]) {
      const result=spawnSync(exe,{input:row.join(' ')+'\n',encoding:'utf8'});
      assert.equal(result.signal,'SIGFPE',`${name}: ${result.status} ${result.stderr}`);
      failures.push({name,signal:result.signal,contract:'Undefined division by zero in the original C; no portable output exists.'});
    }
    for(const [name,distance]of [['short',1],['zeroDistance',0]]) {
      const result=execFileSync(exe,['countdown'],{input:`1 0 2 ${distance} 655360 3 0\n`,encoding:'utf8'}).trim();
      assert.equal(result,'-80');failures.push({name,initialReaction:0,after80Calls:-80});
    }
    return {rows:cases.map((row,i)=>[...row,...out[i]]),failures};
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
