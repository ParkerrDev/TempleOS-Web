import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root} from './Assets.mjs';
import {EnemyFunction} from './EnemyRef.mjs';

export async function TouchReference() {
  const dir=resolve(root,'tools/toom/source'),manifest=JSON.parse(readFileSync(resolve(dir,'collision.json'))),
    entry=manifest.files.find(f=>f.path.endsWith('/p_map.c')),path=resolve(dir,'p_map.c');
  assert(entry);
  if(!existsSync(path)) {
    const response=await fetch(`https://raw.githubusercontent.com/id-Software/DOOM/${manifest.revision}/${entry.path}`);
    assert(response.ok);writeFileSync(path,Buffer.from(await response.arrayBuffer()));
  }
  const bytes=readFileSync(path);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
  const fn=EnemyFunction(bytes.toString('ascii').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,''),'PIT_CheckThing');
  const defs=Object.fromEntries([...readFileSync(resolve(root,'games/Toom/TmData.HH'),'ascii')
    .matchAll(/^#define (TM_\w+)\s+(\d+)$/gm)].map(m=>[m[1],Number(m[2])]));
  const F=n=>defs['TM_MF_'+n],data=readFileSync(resolve(root,'games/Toom/TMDATA.BIN')),
    random=[...data.subarray(-256)],inputs=[];
  for(let seed=0;seed<256;seed++)for(const base of [0,1,3,10,20])
    for(const flag of [F('PICKUP'),F('MISSILE'),F('SKULLFLY')])
      inputs.push([flag,F('SOLID')|F('SPECIAL')|F('SHOOTABLE'),seed,base,1,0]);
  for(const flag of [0,F('PICKUP'),F('MISSILE'),F('SKULLFLY'),F('SKULLFLY')|F('MISSILE')])
    for(let bits=0;bits<8;bits++)for(const owner of [0,1,2,3])for(const z of [-57,-56,0,56,57]) {
      const other=(bits&1?F('SOLID'):0)|(bits&2?F('SPECIAL'):0)|(bits&4?F('SHOOTABLE'):0);
      inputs.push([flag,other,255,7,owner,z*65536]);
    }
  const names=['MF_SOLID','MF_SPECIAL','MF_SHOOTABLE','MF_PICKUP','MF_MISSILE','MF_SKULLFLY',
    'MT_PLAYER','MT_TROOP','MT_KNIGHT','MT_BRUISER'];
  const c=`#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
typedef int boolean;
typedef int32_t fixed_t;
#define true 1
#define false 0
${names.map(n=>`#define ${n} ${defs['TM_'+n]}`).join('\n')}
typedef struct {int damage,spawnstate;} info_t;
typedef struct mobj_s mobj_t;
struct mobj_s {int flags,x,y,z,radius,height,type,momx,momy,momz,state;info_t *info;mobj_t *target;};
mobj_t a,b,c,*tmthing=&a;info_t info;int tmx,tmy,tmflags;
int rn,dc,damage,source,pc,sc;
uint8_t rnd[256]={${random.join(',')}};
int P_Random(void){rn=(rn+1)&255;return rnd[rn];}
void P_DamageMobj(mobj_t *victim,mobj_t *inflictor,mobj_t *owner,int n){
 if(victim!=&b||inflictor!=&a)abort();dc++;damage=n;
 source=owner==&a?1:owner==&b?2:owner==&c?3:0;
}
boolean P_SetMobjState(mobj_t *who,int state){if(who!=&a)abort();sc++;who->state=state;return true;}
void P_TouchSpecialThing(mobj_t *item,mobj_t *who){if(item!=&b||who!=&a)abort();pc++;}
${fn}
int main(void){long long row[6];int i,result;
 while(scanf("%lld",row)==1){for(i=1;i<6;i++)if(scanf("%lld",row+i)!=1)abort();
  memset(&a,0,sizeof(a));memset(&b,0,sizeof(b));memset(&c,0,sizeof(c));
  a.info=&info;a.flags=tmflags=row[0];b.flags=row[1];rn=row[2];info.damage=row[3];
  info.spawnstate=123;a.state=456;a.radius=b.radius=20*65536;a.height=b.height=56*65536;
  b.z=row[5];b.type=MT_TROOP;c.type=row[4]==3?MT_TROOP:MT_PLAYER;
  a.target=row[4]==2?&b:row[4]?&c:NULL;a.momx=11;a.momy=-22;a.momz=33;
  dc=damage=source=pc=sc=0;result=PIT_CheckThing(&b);
  printf("%d %d %d %d %d %d %d %d %d %d %d %d\\n",result,rn,dc,damage,source,pc,sc,a.state,a.flags,a.momx,a.momy,a.momz);
 }
}`;
  const work=mkdtempSync(join(tmpdir(),'toom-touch-'));
  try {
    writeFileSync(join(work,'ref.c'),c);
    execFileSync('cc',['-std=c99','-O2',join(work,'ref.c'),'-o',join(work,'ref')]);
    const text=execFileSync(join(work,'ref'),{input:inputs.map(r=>r.join(' ')).join('\n')+'\n',maxBuffer:16*1024*1024,encoding:'utf8'});
    const outputs=text.trim().split('\n').map(l=>l.split(' ').map(Number));assert.equal(outputs.length,inputs.length);
    return {rows:inputs.map((r,i)=>[...r,...outputs[i]]),reference:{revision:manifest.revision,path:entry.path,sha256:entry.sha256}};
  } finally {rmSync(work,{recursive:true,force:true});}
}
