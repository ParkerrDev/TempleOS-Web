import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root} from './Assets.mjs';
import {EnemyFunction} from './EnemyRef.mjs';

export async function ProjectileReference() {
  const dir=resolve(root,'tools/toom/source'),manifest=JSON.parse(readFileSync(resolve(dir,'collision.json'))),
    file=manifest.files.find(f=>f.path.endsWith('/p_mobj.c')),path=resolve(dir,'p_mobj.c');assert(file);
  if(!existsSync(path)) {
    const response=await fetch(`https://raw.githubusercontent.com/id-Software/DOOM/${manifest.revision}/${file.path}`);
    assert(response.ok);writeFileSync(path,Buffer.from(await response.arrayBuffer()));
  }
  const bytes=readFileSync(path);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
  const original=bytes.toString('ascii').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
  const data=readFileSync(resolve(root,'games/Toom/TMDATA.BIN')),types=[6,9,16,28,31,32,33,36],cases=[];
  const vectors=[[0,0],[1,0],[9,10],[100,10],[-128,128],[4096,-4096]];
  for(const type of types)for(const [x,y]of vectors)for(const z of [0,80])for(const tz of [-80,0,80])
    for(const shadow of [0,262144])for(const angle of [0,1,0x20000000,0x80000000,0xc0000000,0xffffffff])
      for(const seed of [0,1,127,255])cases.push([type,x*65536,y*65536,z*65536,tz*65536,shadow,angle,seed]);
  for(const type of types)for(const shadow of [0,262144])for(let seed=0;seed<256;seed++)
    cases.push([type,128*65536,0,0,20*65536,shadow,0xffffffff,seed]);
  const info=Array.from({length:137},(_,type)=>{
    const off=32+967*28+type*92;return[data.readInt32LE(off+15*4),data.readInt32LE(off+4*4)];
  });
  const trig=32+967*28+137*92+138*4+109*8;
  const sine=Array.from({length:10240},(_,i)=>data.readInt32LE(trig+i*4));
  const c=`#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
typedef int32_t fixed_t;
typedef uint32_t angle_t;
typedef int mobjtype_t;
#define FRACUNIT 65536
#define ANGLETOFINESHIFT 19
#define MF_SHADOW 262144
typedef struct {int speed,seesound;} info_t;
typedef struct mobj_s mobj_t;
struct mobj_s {int x,y,z,momx,momy,momz,flags,lastlook,type;angle_t angle;info_t *info;mobj_t *target;};
info_t info[137]={${info.map(r=>'{'+r.join(',')+'}').join(',')}};
int32_t finesine[10240]={${sine.join(',')}};
int32_t *finecosine=finesine+2048;
uint8_t rnd[256]={${[...data.subarray(-256)].join(',')}};
mobj_t s,t,m;angle_t fakeangle;
int rn,spawns,sounds,soundid,soundrng,angles,anglerng,dx,dy,starts,startrng,spawnrng;
int P_Random(void){rn=(rn+1)&255;return rnd[rn];}
fixed_t FixedMul(fixed_t a,fixed_t b){return (int32_t)((int64_t)a*b>>16);}
fixed_t P_AproxDistance(fixed_t x,fixed_t y){x=abs(x);y=abs(y);return x+y-(x<y?x:y)/2;}
mobj_t *P_SpawnMobj(fixed_t x,fixed_t y,fixed_t z,mobjtype_t type){memset(&m,0,sizeof(m));spawns++;spawnrng=rn;
 m.x=x;m.y=y;m.z=z;m.type=type;m.info=info+type;m.lastlook=P_Random()%4;return &m;}
void S_StartSound(mobj_t *actor,int sound){if(actor!=&m)abort();sounds++;soundid=sound;soundrng=rn;}
angle_t R_PointToAngle2(fixed_t x,fixed_t y,fixed_t tx,fixed_t ty){angles++;anglerng=rn;dx=tx-x;dy=ty-y;return fakeangle;}
void P_CheckMissileSpawn(mobj_t *actor){if(actor!=&m)abort();starts++;startrng=rn;}
${EnemyFunction(original,'P_SpawnMissile')}
int main(void){long long row[8],out[22];int i;
 while(scanf("%lld",row)==1){for(i=1;i<8;i++)if(scanf("%lld",row+i)!=1)abort();
  s.x=-64*FRACUNIT;s.y=16*FRACUNIT;s.z=row[3];t.x=s.x+row[1];t.y=s.y+row[2];t.z=row[4];t.flags=row[5];
  fakeangle=row[6];rn=row[7];spawns=sounds=angles=starts=0;soundid=soundrng=anglerng=startrng=spawnrng=-1;
  if(P_SpawnMissile(&s,&t,row[0])!=&m)abort();
  out[0]=m.x;out[1]=m.y;out[2]=m.z;out[3]=m.momx;out[4]=m.momy;out[5]=m.momz;out[6]=m.angle;
  out[7]=m.target==&s;out[8]=m.lastlook;out[9]=rn;out[10]=spawns;out[11]=sounds;out[12]=soundid;out[13]=soundrng;
  out[14]=angles;out[15]=anglerng;out[16]=startrng;out[17]=starts;out[18]=dx;out[19]=dy;out[20]=m.type;out[21]=spawnrng;
  for(i=0;i<22;i++)printf("%lld ",out[i]);puts("");
 }
}
`;
  const scratch=mkdtempSync(join(tmpdir(),'toom-projectile-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    execFileSync(process.env.CC||'cc',['-std=c99','-O2','-Wall','-Wextra','-Werror','-Wno-misleading-indentation',src,'-o',exe]);
    const out=execFileSync(exe,{input:cases.map(r=>r.join(' ')).join('\n')+'\n',encoding:'utf8',maxBuffer:16*1024*1024})
      .trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
    assert.equal(out.length,cases.length);assert(out.every(r=>r.length===22));
    return cases.map((row,i)=>[...row,...out[i]]);
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
