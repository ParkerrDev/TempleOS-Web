import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root} from './Assets.mjs';
import {EnemyFunction} from './EnemyRef.mjs';

export async function PositionReference() {
  const dir=resolve(root,'tools/toom/source'),manifest=JSON.parse(readFileSync(resolve(dir,'collision.json'))),
    file=manifest.files.find(f=>f.path.endsWith('/p_map.c')),path=resolve(dir,'p_map.c');assert(file);
  if(!existsSync(path)){const r=await fetch(`https://raw.githubusercontent.com/id-Software/DOOM/${manifest.revision}/${file.path}`);assert(r.ok);writeFileSync(path,Buffer.from(await r.arrayBuffer()));}
  const bytes=readFileSync(path);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
  const original=bytes.toString('ascii').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
  const defs=Object.fromEntries([...readFileSync(resolve(root,'games/Toom/TmData.HH'),'ascii')
    .matchAll(/^#define (TM_\w+)\s+(\d+)$/gm)].map(m=>[m[1],Number(m[2])]));
  const flags=['NOCLIP','DROPOFF','FLOAT','TELEPORT','MISSILE'],cases=[];
  for(const floor of [-32,0,24,25,64])for(const ceil of [0,32,56,64,128])for(const z of [-32,0,32])
    for(const height of [0,56,112])for(const flag of [0,...flags.map(n=>defs['TM_MF_'+n])])for(const blocked of [0,1,2,3])
      cases.push([floor*65536,ceil*65536,z*65536,height*65536,flag,blocked]);
  const c=`#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
typedef int boolean;typedef int32_t fixed_t;
#define true 1
#define false 0
#define FRACUNIT 65536
#define MAXRADIUS (32*FRACUNIT)
#define MAPBLOCKSHIFT 23
#define BOXTOP 0
#define BOXBOTTOM 1
#define BOXLEFT 2
#define BOXRIGHT 3
${flags.map(n=>`#define MF_${n} ${defs['TM_MF_'+n]}`).join('\n')}
typedef struct {int x,y;} vertex_t;
typedef struct {vertex_t *v1;int dx,dy,special;} line_t;
typedef struct {int floorheight,ceilingheight;} sector_t;
typedef struct {sector_t *sector;} subsector_t;
typedef struct {int x,y,z,radius,height,flags,floorz,ceilingz;} mobj_t;
mobj_t a,*tmthing;sector_t sector;subsector_t sub={&sector};line_t lines[1],*ceilingline,*spechit[1];
int tmbbox[4],tmflags,tmx,tmy,tmfloorz,tmdropoffz,tmceilingz,validcount,numspechit,floatok,blocked;
int bmaporgx=-256*FRACUNIT,bmaporgy=-256*FRACUNIT;
subsector_t *R_PointInSubsector(int x,int y){if(x||y)abort();return &sub;}
boolean PIT_CheckThing(mobj_t *thing){(void)thing;return true;}
boolean PIT_CheckLine(line_t *line){(void)line;return true;}
boolean P_BlockThingsIterator(int x,int y,boolean(*fn)(mobj_t*)){(void)x;(void)y;(void)fn;return blocked!=2;}
boolean P_BlockLinesIterator(int x,int y,boolean(*fn)(line_t*)){(void)x;(void)y;(void)fn;
 if(blocked==3||(blocked==1&&!(tmflags&MF_MISSILE)))return false;
 if(tmfloorz<0)tmfloorz=0;if(tmceilingz>128*FRACUNIT)tmceilingz=128*FRACUNIT;if(tmdropoffz>0)tmdropoffz=0;return true;}
void P_UnsetThingPosition(mobj_t *thing){(void)thing;}
void P_SetThingPosition(mobj_t *thing){(void)thing;}
int P_PointOnLineSide(int x,int y,line_t *line){(void)x;(void)y;(void)line;return 0;}
void P_CrossSpecialLine(int line,int side,mobj_t *thing){(void)line;(void)side;(void)thing;}
${['P_CheckPosition','P_TryMove'].map(n=>EnemyFunction(original,n)).join('\n')}
int main(void){long long row[6],out[9];int i;
 while(scanf("%lld",row)==1){for(i=1;i<6;i++)if(scanf("%lld",row+i)!=1)abort();
  memset(&a,0,sizeof(a));a.x=-64*FRACUNIT;a.radius=20*FRACUNIT;a.z=row[2];a.height=row[3];a.flags=row[4];blocked=row[5];sector.floorheight=row[0];sector.ceilingheight=row[1];
  out[0]=P_CheckPosition(&a,0,0);out[1]=tmfloorz;out[2]=tmceilingz;out[3]=tmdropoffz;
  out[4]=P_TryMove(&a,0,0);out[5]=tmfloorz;out[6]=tmceilingz;out[7]=tmdropoffz;out[8]=floatok;
  for(i=0;i<9;i++)printf("%lld ",out[i]);puts("");
 }
}
`;
  const scratch=mkdtempSync(join(tmpdir(),'toom-position-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    execFileSync(process.env.CC||'cc',['-std=c99','-O2','-Wall','-Wextra','-Werror','-Wno-misleading-indentation',src,'-o',exe]);
    const out=execFileSync(exe,{input:cases.map(r=>r.join(' ')).join('\n')+'\n',encoding:'utf8',maxBuffer:4*1024*1024})
      .trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
    assert.equal(out.length,cases.length);assert(out.every(r=>r.length===9));
    return cases.map((row,i)=>[...row,...out[i]]);
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
