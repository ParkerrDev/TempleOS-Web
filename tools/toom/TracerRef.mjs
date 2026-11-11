import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root} from './Assets.mjs';
import {EnemySource,EnemyFunction} from './EnemyRef.mjs';

export async function TracerReference() {
  const original=await EnemySource(),data=readFileSync(resolve(root,'games/Toom/TMDATA.BIN'));
  const defs=Object.fromEntries([...readFileSync(resolve(root,'games/Toom/TmData.HH'),'ascii')
    .matchAll(/^#define (TM_\w+)\s+(\d+)$/gm)].map(m=>[m[1],Number(m[2])]));
  const cases=[],angles=[0,0xbffffff,0xc000000,0xc000001,0x7fffffff,0x80000000,0xf4000000,0xffffffff];
  for(const angle of angles)for(const exact of angles)for(const [dx,dy,z,vz]of [[0,0,0,0],[19,0,-40,0],[20,0,-40,8192],[100,20,80,-8192],[-4096,4096,0,8192]])
    for(const health of [0,100])for(const present of [0,1])for(const seed of [0,255])
      cases.push([0,angle,exact,dx*65536,dy*65536,z*65536,vz,present,health,seed]);
  for(const tic of [1,2,3,4,127,128])for(const seed of [0,255])cases.push([tic,0,0xffffffff,128*65536,0,0,0,1,100,seed]);
  for(let seed=0;seed<256;seed++)cases.push([4,0xffffffff,0,128*65536,0,0,0,1,100,seed]);
  const trig=32+967*28+137*92+138*4+109*8;
  const sine=Array.from({length:10240},(_,i)=>data.readInt32LE(trig+i*4));
  const infoOff=type=>32+967*28+type*92;
  const speed=data.readInt32LE(infoOff(defs.TM_MT_TRACER)+15*4);
  const smokeState=data.readInt32LE(infoOff(defs.TM_MT_SMOKE)+4),smokeTics=data.readInt32LE(32+smokeState*28+8);
  const c=`#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
typedef uint32_t angle_t;typedef int32_t fixed_t;
#define FRACUNIT 65536
#define ANGLETOFINESHIFT 19
#define MT_SMOKE ${defs.TM_MT_SMOKE}
typedef struct {int speed;} info_t;
typedef struct mobj_s mobj_t;
struct mobj_s {int x,y,z,momx,momy,momz,health,tics,lastlook;angle_t angle;info_t *info;mobj_t *tracer;};
mobj_t a,t,m;info_t info={${speed}};
int32_t finesine[10240]={${sine.join(',')}};int32_t *finecosine=finesine+2048;
uint8_t rnd[256]={${[...data.subarray(-256)].join(',')}};
int gametic,rn,cnt,spawns;angle_t fakeangle;int TRACEANGLE=0xc000000;long long trace[12];
void record(int event,int x,int y){if(cnt>=3)abort();trace[cnt*4]=event;trace[cnt*4+1]=x;trace[cnt*4+2]=y;trace[cnt*4+3]=rn;cnt++;}
int P_Random(void){rn=(rn+1)&255;return rnd[rn];}
fixed_t FixedMul(fixed_t a,fixed_t b){return(int32_t)((int64_t)a*b>>16);}
fixed_t P_AproxDistance(fixed_t x,fixed_t y){x=abs(x);y=abs(y);return x+y-(x<y?x:y)/2;}
angle_t R_PointToAngle2(fixed_t x,fixed_t y,fixed_t tx,fixed_t ty){record(3,tx-x,ty-y);return fakeangle;}
void P_SpawnPuff(fixed_t x,fixed_t y,fixed_t z){if(x!=a.x||y!=a.y||z!=a.z)abort();record(1,x,y);}
mobj_t *P_SpawnMobj(fixed_t x,fixed_t y,fixed_t z,int type){if(type!=MT_SMOKE||spawns++)abort();
 m.x=x;m.y=y;m.z=z;m.tics=${smokeTics};m.lastlook=P_Random()%4;record(2,x,y);return &m;}
${EnemyFunction(original,'A_Tracer')}
int main(void){long long row[10],out[25];int i;
 while(scanf("%lld",row)==1){for(i=1;i<10;i++)if(scanf("%lld",row+i)!=1)abort();
  memset(&a,0,sizeof(a));memset(&t,0,sizeof(t));memset(&m,0,sizeof(m));a.info=&info;a.x=-64*FRACUNIT;a.y=16*FRACUNIT;a.z=32*FRACUNIT;
  a.momx=12345;a.momy=-54321;a.momz=row[6];a.angle=row[1];fakeangle=row[2];gametic=row[0];rn=row[9];
  t.x=a.x+row[3];t.y=a.y+row[4];t.z=row[5];t.health=row[8];a.tracer=row[7]?&t:NULL;cnt=spawns=0;for(i=0;i<12;i++)trace[i]=-1;
  A_Tracer(&a);
  out[0]=a.angle;out[1]=a.momx;out[2]=a.momy;out[3]=a.momz;out[4]=rn;out[5]=spawns;out[6]=m.x;out[7]=m.y;out[8]=m.z;out[9]=m.momz;out[10]=m.tics;out[11]=m.lastlook;out[12]=cnt;
  for(i=0;i<12;i++)out[13+i]=trace[i];for(i=0;i<25;i++)printf("%lld ",out[i]);puts("");
 }
}
`;
  const scratch=mkdtempSync(join(tmpdir(),'toom-tracer-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    execFileSync(process.env.CC||'cc',['-std=c99','-O2','-Wall','-Wextra','-Werror','-Wno-misleading-indentation',src,'-o',exe]);
    const out=execFileSync(exe,{input:cases.map(r=>r.join(' ')).join('\n')+'\n',encoding:'utf8',maxBuffer:8*1024*1024})
      .trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
    assert.equal(out.length,cases.length);assert(out.every(r=>r.length===25));
    return cases.map((row,i)=>[...row,...out[i]]);
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
