import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root} from './Assets.mjs';
import {EnemyFunction} from './EnemyRef.mjs';

export function RespawnReference() {
  const manifest=JSON.parse(readFileSync(resolve(root,'tools/toom/source/collision.json'))),
    pin=manifest.files.find(f=>f.path.endsWith('/p_mobj.c')),
    bytes=readFileSync(resolve(root,'tools/toom/source/p_mobj.c'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),pin.sha256);
  const original=bytes.toString('ascii').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,''),
    data=readFileSync(resolve(root,'games/Toom/TMDATA.BIN')),cases=[];
  const add=(change={})=>{const r=[0,4,0x400000,-1,419,448,0,0,32,64,90,8,0,1];
    for(const [key,value]of Object.entries(change))r[Number(key)]=value;cases.push(r);};
  for(const skill of [0,2,4])for(const flags of [0,0x400000])for(const tics of [-1,1,2])
    for(const wait of [-8,418,419,420,1000])for(const tic of [0,31,32,447,448])for(const seed of [0,1,254,255])
      add({1:skill,2:flags,3:tics,4:wait,5:tic,6:seed});
  for(let seed=0;seed<256;seed++)for(const blocked of [0,1])add({6:seed,7:blocked});
  for(const blocked of [0,1])for(const x of [-32,0,31])for(const y of [-16,0,64])
    for(const angle of [-90,0,44,45,359])for(const options of [0,8])for(const ceiling of [0,256])
      for(const seed of [0,255])add({0:1,6:seed,7:blocked,8:x,9:y,10:angle,11:options,12:ceiling});
  for(const ceiling of [0,256])add({0:1,8:0,9:0,10:0,11:0,12:ceiling,13:0});
  const c=`#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
typedef int32_t fixed_t;
typedef uint32_t angle_t;
typedef void (*actionf_v)(void);
#define FRACBITS 16
#define MF_COUNTKILL 0x400000
#define MF_SKULLFLY 0x1000000
#define MF_SPAWNCEILING 256
#define MF_AMBUSH 32
#define MTF_AMBUSH 8
#define ANG45 0x20000000U
#define MT_TFOG 39
#define sfx_telept 35
#define ONFLOORZ INT32_MIN
#define ONCEILINGZ INT32_MAX
typedef struct {int x,y,angle,options;} mapthing_t;
typedef struct {int flags;} info_t;
typedef struct {fixed_t floorheight;} sector_t;
typedef struct {sector_t *sector;} subsector_t;
typedef struct {int nextstate;} state_t;
typedef struct {union {actionf_v acv;} function;} thinker_t;
typedef struct {fixed_t x,y,z,momx,momy,momz,floorz;int flags,tics,movecount,type,reactiontime,active;
 angle_t angle;thinker_t thinker;state_t *state;info_t *info;subsector_t *subsector;mapthing_t spawnpoint;} mobj_t;
mobj_t a,b[3];sector_t sector[2];subsector_t ss[2];state_t state={7};info_t info;
int respawnmonsters,leveltime,rn,blocked,spawncnt,tracecnt;long long trace[48];
uint8_t rnd[256]={${[...data.subarray(-256)].join(',')}};
void record(int event,long long a,long long b,long long c,long long d){if(tracecnt>=8)abort();
 long long *r=trace+tracecnt++*6;r[0]=event;r[1]=a;r[2]=b;r[3]=c;r[4]=d;r[5]=rn;}
int P_Random(void){rn=(rn+1)&255;return rnd[rn];}
int P_CheckPosition(mobj_t *mo,fixed_t x,fixed_t y){if(mo!=&a)abort();record(1,x,y,0,0);return !blocked;}
mobj_t *P_SpawnMobj(fixed_t x,fixed_t y,fixed_t z,int type){if(spawncnt>=3)abort();
 record(2,x,y,z,type);mobj_t *m=b+spawncnt++;memset(m,0,sizeof(*m));m->x=x;m->y=y;m->z=z;m->type=type;
 m->active=1;m->flags=type==39?0:info.flags;P_Random();return m;}
void S_StartSound(mobj_t *mo,int sound){record(3,mo-b,sound,0,0);}
subsector_t *R_PointInSubsector(fixed_t x,fixed_t y){record(4,x,y,0,0);return ss+1;}
void P_RemoveMobj(mobj_t *mo){if(mo!=&a)abort();record(5,0,0,0,0);mo->active=0;}
int P_SetMobjState(mobj_t *mo,int next){if(mo!=&a||next!=7)abort();record(6,next,0,0,0);mo->tics=3;return 1;}
void P_XYMovement(mobj_t *mo){(void)mo;abort();}
void P_ZMovement(mobj_t *mo){(void)mo;abort();}
${EnemyFunction(original,'P_NightmareRespawn')}
${EnemyFunction(original,'P_MobjThinker')}
int main(void){long long r[14],o[61];int i;
 while(scanf("%lld",r)==1){for(i=1;i<14;i++)if(scanf("%lld",r+i)!=1)abort();
 memset(&a,0,sizeof(a));memset(b,0,sizeof(b));a.active=1;a.type=11;a.state=&state;a.info=&info;
 sector[0].floorheight=3*65536;sector[1].floorheight=-5*65536;ss[0].sector=sector;ss[1].sector=sector+1;a.subsector=ss;
 a.x=-70*65536;a.y=11*65536;a.z=a.floorz=3*65536;a.flags=r[2];a.tics=r[3];a.movecount=r[4];
 respawnmonsters=r[1]==4;leveltime=r[5];rn=r[6];blocked=r[7];
 a.spawnpoint=(mapthing_t){r[8],r[9],r[10],r[11]};info.flags=r[12];spawncnt=tracecnt=0;
 for(i=0;i<48;i++)trace[i]=-1;
 if(r[0])P_NightmareRespawn(&a);else P_MobjThinker(&a);
 o[0]=a.tics;o[1]=a.movecount;o[2]=rn;o[3]=a.active;o[4]=spawncnt;o[5]=tracecnt;
 o[6]=b[2].angle;o[7]=b[2].reactiontime;o[8]=b[2].flags;
 o[9]=b[2].spawnpoint.x;o[10]=b[2].spawnpoint.y;o[11]=b[2].spawnpoint.angle;o[12]=b[2].spawnpoint.options;
 for(i=0;i<48;i++)o[13+i]=trace[i];for(i=0;i<61;i++)printf("%lld ",o[i]);puts("");
 }}
`;
  const scratch=mkdtempSync(join(tmpdir(),'toom-respawn-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    execFileSync(process.env.CC||'cc',['-std=c99','-O2','-fwrapv','-Wall','-Wextra','-Werror','-Wno-misleading-indentation',src,'-o',exe]);
    const lines=execFileSync(exe,{input:cases.map(r=>r.join(' ')).join('\n')+'\n',encoding:'utf8',maxBuffer:16*1024*1024})
      .trim().split('\n').map(s=>s.trim().split(/\s+/).map(Number));
    assert.equal(lines.length,cases.length);assert(lines.every(r=>r.length===61));
    return {rows:cases.map((r,i)=>[...r,...lines[i]]),reference:{...pin,revision:manifest.revision,
      generatedSha256:createHash('sha256').update(c).digest('hex'),cc:process.env.CC||'cc'}};
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
