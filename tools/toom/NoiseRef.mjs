import assert from 'node:assert/strict';
import {writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {EnemySource,EnemyFunction} from './EnemyRef.mjs';

export async function NoiseReference() {
  const original=await EnemySource(),graphs=[];
  function add(sectors,edges,start=0) {
    graphs.push({sectors,edges,calls:[[start,2],[(start+sectors.length-1)%sectors.length,1]]});
  }
  const pairs=[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]];
  for(let mask=0;mask<729;mask++)for(let start=0;start<4;start++) {
    let code=mask;const edges=pairs.map(([a,b])=>{const flags=[0,4,68][code%3];code=Math.floor(code/3);return[a,b,flags];});
    add(Array.from({length:4},()=>[0,128*65536]),edges,start);
  }
  for(let mask=0;mask<256;mask++) {
    const sectors=Array.from({length:4},(_,i)=>[[0,0],[0,128*65536],[64*65536,128*65536],[128*65536,256*65536]][mask>>(i*2)&3]);
    add(sectors,pairs.map(([a,b],i)=>[a,b,i&1?68:4]),mask&3);
  }
  for(const n of [8,65,130])for(const closed of [false,true]) {
    const sectors=Array.from({length:n},(_,i)=>[0,(closed&&i===n-2?0:128)*65536]);
    const edges=Array.from({length:n},(_,i)=>[i,(i+1)%n,i%3?4:68]);
    for(let i=0;i<n-2;i++)edges.push([i,i+2,4]);
    edges.push([0,0,68]);add(sectors,edges,n-1);
  }
  const c=`#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define ML_TWOSIDED 4
#define ML_SOUNDBLOCK 64
typedef struct sector_s sector_t;
typedef struct {int flags,sidenum[2];} line_t;
typedef struct {sector_t *sector;} side_t;
typedef struct {sector_t *sector;} subsector_t;
typedef struct {subsector_t *subsector;} mobj_t;
struct sector_s {int validcount,soundtraversed,linecount,floor,ceil;line_t *lines[512];mobj_t *soundtarget;};
sector_t sectors[256];line_t lines[512];side_t sides[1024];
mobj_t targets[2],emitter,*soundtarget;subsector_t sub;
int validcount,openrange;
void P_LineOpening(line_t *line){sector_t *a=sides[line->sidenum[0]].sector,*b=sides[line->sidenum[1]].sector;
 int top=a->ceil<b->ceil?a->ceil:b->ceil,bottom=a->floor>b->floor?a->floor:b->floor;openrange=top-bottom;}
${EnemyFunction(original,'P_RecursiveSound')}
${EnemyFunction(original,'P_NoiseAlert')}
int main(void){int n,l,k,i,j,a,b,root,target;
 emitter.subsector=&sub;
 while(scanf("%d%d%d",&n,&l,&k)==3){if(n>256||l>512)abort();
  memset(sectors,0,sizeof(sectors));validcount=0;
  for(i=0;i<n;i++){if(scanf("%d%d",&sectors[i].floor,&sectors[i].ceil)!=2)abort();sectors[i].soundtarget=targets;}
  for(i=0;i<l;i++){if(scanf("%d%d%d",&a,&b,&lines[i].flags)!=3)abort();
   sides[i*2].sector=sectors+a;sides[i*2+1].sector=sectors+b;lines[i].sidenum[0]=i*2;lines[i].sidenum[1]=i*2+1;
   sectors[a].lines[sectors[a].linecount++]=lines+i;
   if(a!=b)sectors[b].lines[sectors[b].linecount++]=lines+i;}
  for(j=0;j<k;j++){if(scanf("%d%d",&root,&target)!=2)abort();sub.sector=sectors+root;P_NoiseAlert(targets+target-1,&emitter);
   for(i=0;i<n;i++)printf("%ld ",(long)(sectors[i].soundtarget-targets+1));
   for(i=0;i<n;i++)printf("%d ",sectors[i].validcount==validcount?sectors[i].soundtraversed-1:255);puts("");}
 }
}
`;
  const scratch=mkdtempSync(join(tmpdir(),'toom-noise-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    execFileSync(process.env.CC||'cc',['-std=c99','-O2','-Wall','-Wextra','-Werror','-Wno-misleading-indentation',src,'-o',exe]);
    const input=graphs.map(g=>[g.sectors.length,g.edges.length,g.calls.length,...g.sectors.flat(),...g.edges.flat(),...g.calls.flat()].join(' ')).join('\n');
    const out=execFileSync(exe,{input,encoding:'utf8',maxBuffer:8*1024*1024}).trim().split('\n').map(s=>s.trim().split(/\s+/).map(Number));
    assert.equal(out.length,graphs.length*2);let at=0;
    return graphs.map(g=>[g.sectors.length,g.edges.length,g.calls.length,...g.sectors.flat(),...g.edges.flat(),
      ...g.calls.flatMap(call=>{const result=out[at++];assert.equal(result.length,g.sectors.length*2);return[...call,...result];})]);
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
