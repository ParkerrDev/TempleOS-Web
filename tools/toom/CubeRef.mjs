import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root} from './Assets.mjs';
import {EnemySource,EnemyFunction} from './EnemyRef.mjs';

export async function CubeReference() {
  const original=await EnemySource(),defs=Object.fromEntries([...readFileSync(resolve(root,'games/Toom/TmData.HH'),'ascii')
    .matchAll(/^#define (TM_\w+)\s+(\d+)$/gm)].map(m=>[m[1],Number(m[2])])),cases=[];
  const data=readFileSync(resolve(root,'games/Toom/TMDATA.BIN')),random=[...data.subarray(-256)];
  for(let seed=0;seed<256;seed++)for(const reaction of [1,2])for(const sound of [0,1])
    for(const visible of [0,1])for(const shift of [0,1])cases.push([seed,reaction,sound,visible,shift,seed&1]);
  const info=Array.from({length:137},(_,i)=>{const off=32+967*28+i*92;return [data.readInt32LE(off+4),data.readInt32LE(off+12)];});
  const tics=Array.from({length:967},(_,i)=>data.readInt32LE(32+i*28+8));
  const names=['SPAWNFIRE','TROOP','SERGEANT','SHADOWS','PAIN','HEAD','VILE','UNDEAD','BABY','FATSO','KNIGHT','BRUISER'];
  const c=`#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#define true 1
${names.map(n=>`#define MT_${n} ${defs['TM_MT_'+n]}`).join('\n')}
#define sfx_boscub ${defs.TM_SFX_BOSCUB}
#define sfx_telept ${defs.TM_SFX_TELEPT}
typedef int mobjtype_t;typedef int boolean;
typedef struct {int spawnstate,seestate;} info_t;
typedef struct mobj_s mobj_t;
struct mobj_s {int x,y,z,type,state,tics,lastlook,reactiontime,active;info_t *info;mobj_t *target;};
info_t info[137]={${info.map(r=>'{'+r.join(',')+'}').join(',')}};
int tics[967]={${tics.join(',')}};uint8_t rnd[256]={${random.join(',')}};
mobj_t cube,target,player,fog,monster;int rn,spawns,visible,shift,stomp,trace[64],events,tx,ty,ts;
int who(mobj_t*a){if(a==&cube)return 0;if(a==&target)return 1;if(a==&player)return 2;if(a==&fog)return 3;if(a==&monster)return 4;abort();}
void event(int n,mobj_t*a,int value){if(events==16)abort();int *v=trace+4*events++;v[0]=n;v[1]=who(a);v[2]=value;v[3]=rn;}
int P_Random(void){rn=(rn+1)&255;return rnd[rn];}
mobj_t *P_SpawnMobj(int x,int y,int z,mobjtype_t type){mobj_t *a=spawns++?&monster:&fog;
 a->x=x;a->y=y;a->z=z;a->type=type;a->info=info+type;a->state=a->info->spawnstate;a->tics=tics[a->state];a->lastlook=P_Random()%4;
 event(2,a,type);return a;}
void S_StartSound(mobj_t*a,int n){event(1,a,n);}
boolean P_LookForPlayers(mobj_t*a,boolean around){if(a!=&monster||!around)abort();event(3,a,visible);if(visible)a->target=&player;return visible;}
boolean P_SetMobjState(mobj_t*a,int n){event(4,a,n);a->state=n;if(shift){a->x+=31*65536;a->y-=7*65536;}return 1;}
boolean P_TeleportMove(mobj_t*a,int x,int y){event(5,a,stomp);tx=x;ty=y;ts=stomp;return stomp;}
void P_RemoveMobj(mobj_t*a){event(6,a,0);a->active=0;}
${EnemyFunction(original,'A_SpawnFly')}
${EnemyFunction(original,'A_SpawnSound')}
int main(void){long long row[6],out[87];int i;
 while(scanf("%lld",row)==1){for(i=1;i<6;i++)if(scanf("%lld",row+i)!=1)abort();
  memset(&cube,0,sizeof(cube));memset(&target,0,sizeof(target));memset(&player,0,sizeof(player));
  memset(&fog,0,sizeof(fog));memset(&monster,0,sizeof(monster));memset(trace,-1,sizeof(trace));
  cube.target=&target;cube.active=1;cube.reactiontime=row[1];target.x=16*65536;target.y=-8*65536;target.z=3*65536;
  rn=row[0];visible=row[3];shift=row[4];stomp=row[5];spawns=events=0;tx=ty=ts=-1;
  if(row[2])A_SpawnSound(&cube);else A_SpawnFly(&cube);
  for(i=0;i<87;i++)out[i]=-1;out[0]=cube.reactiontime;out[1]=cube.active;out[2]=rn;out[3]=spawns;out[4]=events;
  if(spawns==2){out[5]=monster.type;out[6]=monster.x;out[7]=monster.y;out[8]=monster.z;out[9]=monster.state;
   out[10]=monster.lastlook;out[11]=monster.target?who(monster.target):-1;out[12]=monster.tics;}
  if(spawns){out[13]=fog.type;out[14]=fog.x;out[15]=fog.y;out[16]=fog.z;out[17]=fog.state;out[18]=fog.lastlook;out[19]=fog.tics;}
  out[20]=tx;out[21]=ty;out[22]=ts;for(i=0;i<64;i++)out[23+i]=trace[i];
  for(i=0;i<87;i++)printf("%lld ",out[i]);puts("");
 }
}
`;
  const scratch=mkdtempSync(join(tmpdir(),'toom-cube-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    execFileSync(process.env.CC||'cc',['-std=c99','-O2','-Wall','-Wextra','-Werror','-Wno-misleading-indentation',src,'-o',exe]);
    const out=execFileSync(exe,{input:cases.map(r=>r.join(' ')).join('\n')+'\n',encoding:'utf8',maxBuffer:8*1024*1024})
      .trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
    assert.equal(out.length,cases.length);assert(out.every(r=>r.length===87));
    return cases.map((row,i)=>[...row,...out[i]]);
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
