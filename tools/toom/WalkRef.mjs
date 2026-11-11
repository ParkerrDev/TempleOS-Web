import assert from 'node:assert/strict';
import {writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {EnemySource,EnemyFunction} from './EnemyRef.mjs';

export async function WalkReference() {
  const original=await EnemySource(),cases=[];
  for(let dir=0;dir<=8;dir++)for(const flags of [0,16384,2097152,16384|2097152])for(const speed of [1,8])
    for(const z of [0,40*65536])for(const floor of [0,20*65536])for(const ok of [0,1])for(const floats of [0,1])
      for(const count of [0,1,3,12])for(const mask of [0,1,4095])cases.push([dir,flags,speed,z,floor,ok,floats,count,mask]);
  const c=`#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
typedef int boolean;
typedef int32_t fixed_t;
#define true 1
#define false 0
#define FRACUNIT 65536
#define FLOATSPEED (4*FRACUNIT)
#define DI_NODIR 8
#define MF_FLOAT 16384
#define MF_INFLOAT 2097152
typedef struct {int speed;} info_t;
typedef struct {int x,y,z,floorz,flags,movedir;info_t *info;} mobj_t;
typedef struct {int id;} line_t;
mobj_t a;info_t info;line_t lines[12],*spechit[12];
int numspechit,floatok,tmfloorz,ok,inputfloat,inputfloor,inputcount,mask,calls,tx,ty,used,trace[12];
fixed_t xspeed[8]={FRACUNIT,47000,0,-47000,-FRACUNIT,-47000,0,47000};
fixed_t yspeed[8]={0,47000,FRACUNIT,47000,0,-47000,-FRACUNIT,-47000};
void I_Error(const char *msg){(void)msg;abort();}
boolean P_TryMove(mobj_t *actor,fixed_t x,fixed_t y){int i;calls++;tx=x;ty=y;
 floatok=inputfloat;tmfloorz=inputfloor;numspechit=inputcount;
 for(i=0;i<inputcount;i++){lines[i].id=i*3+1;spechit[i]=lines+i;}
 if(ok){actor->x=x;actor->y=y;actor->floorz=inputfloor;}return ok;}
boolean P_UseSpecialLine(mobj_t *actor,line_t *line,int side){if(actor!=&a||side||used>=12)abort();
 trace[used++]=line->id;return !!(mask&(1<<(line->id/3)));}
${EnemyFunction(original,'P_Move')}
int main(void){int row[9],out[22],i,result;
 while(scanf("%d",row)==1){for(i=1;i<9;i++)if(scanf("%d",row+i)!=1)abort();
  a.x=31*FRACUNIT;a.y=-17*FRACUNIT;a.movedir=row[0];a.flags=row[1];info.speed=row[2];a.info=&info;
  a.z=row[3];a.floorz=0;inputfloor=row[4];ok=row[5];inputfloat=row[6];inputcount=row[7];mask=row[8];
  calls=tx=ty=used=0;for(i=0;i<12;i++)trace[i]=-1;result=P_Move(&a);
  out[0]=result;out[1]=a.x;out[2]=a.y;out[3]=a.z;out[4]=a.flags;out[5]=a.movedir;
  out[6]=calls;out[7]=tx;out[8]=ty;out[9]=used;for(i=0;i<12;i++)out[10+i]=trace[i];
  for(i=0;i<22;i++)printf("%d ",out[i]);puts("");
 }
}
`;
  const scratch=mkdtempSync(join(tmpdir(),'toom-walk-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    execFileSync(process.env.CC||'cc',['-std=c99','-O2','-Wall','-Wextra','-Werror','-Wno-misleading-indentation',src,'-o',exe]);
    const out=execFileSync(exe,{input:cases.map(r=>r.join(' ')).join('\n')+'\n',encoding:'utf8',maxBuffer:16*1024*1024})
      .trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
    assert.equal(out.length,cases.length);assert(out.every(r=>r.length===22));
    return cases.map((row,i)=>[...row,...out[i]]);
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
