import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root} from './Assets.mjs';

export async function EnemySource() {
  const dir=resolve(root,'tools/toom/source'),manifest=JSON.parse(readFileSync(resolve(dir,'collision.json'))),
    file=manifest.files.find(f=>f.path.endsWith('/p_enemy.c')),path=resolve(dir,'p_enemy.c');assert(file);
  if(!existsSync(path)) {
    const response=await fetch(`https://raw.githubusercontent.com/id-Software/DOOM/${manifest.revision}/${file.path}`);
    assert(response.ok);writeFileSync(path,Buffer.from(await response.arrayBuffer()));
  }
  const bytes=readFileSync(path);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
  const original=bytes.toString('ascii').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
  return original;
}

export function EnemyFunction(original,name) {
    const m=new RegExp(`(?:void|boolean|mobj_t\\s*\\*)\\s+${name}\\s*\\([^)]*\\)\\s*\\{`).exec(original);assert(m,name);
    let at=m.index+m[0].length,depth=1;
    for(;depth&&at<original.length;at++){if(original[at]==='{')depth++;if(original[at]==='}')depth--;}
    assert.equal(depth,0);return original.slice(m.index,at);
}

export async function EnemyReference() {
  const original=await EnemySource();
  const defs=Object.fromEntries([...readFileSync(resolve(root,'games/Toom/TmData.HH'),'ascii')
    .matchAll(/^#define (TM_\w+)\s+(\d+)$/gm)].map(m=>[m[1],Number(m[2])]));
  const data=readFileSync(resolve(root,'games/Toom/TMDATA.BIN')),random=[...data.subarray(-256)],cases=[];
  function add(change) {
    const r=[0,defs.TM_MT_POSSESSED,128*65536,0,1,20*65536,1,0,0,
      defs.TM_MF_SHOOTABLE,0,0,3,100,0,0,0,0,0];
    for(const [key,value]of Object.entries(change))r[Number(key)]=value;cases.push(r);
  }
  for(const radius of [0,16,20,64])for(const delta of [-1,0,1])for(const visible of [0,3])for(const target of [0,1,2])
    add({0:0,2:(44+radius)*65536+delta,4:target,5:radius*65536,12:visible});
  const types=['POSSESSED','TROOP','VILE','UNDEAD','CYBORG','SPIDER','SKULL'].map(n=>defs['TM_MT_'+n]);
  for(const type of types)for(const distance of [0,63,64,195,196,197,895,896,897,1024,4096])
    for(const melee of [0,1])for(const reaction of [0,3])for(const hit of [0,defs.TM_MF_JUSTHIT])
      for(const visible of [0,3])for(const seed of [0,1,2,63,127,128,254,255])
        add({0:1,1:type,2:distance*65536,6:melee,7:reaction,8:hit,12:visible,18:seed});
  for(let seed=0;seed<256;seed++)add({0:1,2:264*65536,18:seed});
  for(const look of [0,1,2,3])for(const around of [0,1])for(const visible of [0,1])for(const health of [0,100])
    for(const delta of [0,0x3fffffff,0x40000000,0x40000001,0xbfffffff,0xc0000000,0xc0000001])
      for(const distance of [63,64,65])for(const angle of [0,0x80000000,0xffffffff])
        add({0:2,2:distance*65536,4:2,10:look,11:around,12:visible,13:health,14:angle,15:(angle+delta)>>>0});
  for(const start of [0,0xffffffff])for(const angle of [0,0x80000000,0xffffffff])
    for(const shadow of [0,defs.TM_MF_SHADOW])for(let seed=0;seed<256;seed++)for(const target of [0,1,2])
      add({0:3,4:target,8:defs.TM_MF_AMBUSH,9:defs.TM_MF_SHOOTABLE|shadow,14:start,15:angle,18:seed});
  for(const look of [0,1,2,3])for(const heard of [0,1,2])for(const visible of [0,1,2,3])
    for(const ambush of [0,defs.TM_MF_AMBUSH])for(const shoot of [0,defs.TM_MF_SHOOTABLE])for(const health of [0,100])
      for(const sound of [0,defs.TM_SFX_POSIT1,defs.TM_SFX_POSIT3,defs.TM_SFX_BGSIT1,defs.TM_SFX_BGSIT2,1])
        for(const type of [defs.TM_MT_POSSESSED,defs.TM_MT_CYBORG])for(const seed of [0,255])
          add({0:4,1:type,4:2,8:ambush,9:shoot,10:look,12:visible,13:health,16:sound,17:heard,18:seed});
  const constants=['MF_SHOOTABLE','MF_JUSTHIT','MF_AMBUSH','MF_SHADOW','MT_VILE','MT_UNDEAD','MT_CYBORG','MT_SPIDER','MT_SKULL'];
  const sounds=['posit1','posit2','posit3','bgsit1','bgsit2'];
  const functions=['P_CheckMeleeRange','P_CheckMissileRange','P_LookForPlayers','A_FaceTarget','A_Look']
    .map(name=>EnemyFunction(original,name)).join('\n');
  const c=`#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
typedef int boolean;
typedef int32_t fixed_t;
typedef uint32_t angle_t;
#define true 1
#define false 0
#define FRACUNIT 65536
#define MELEERANGE (64*FRACUNIT)
#define ANG90 0x40000000U
#define ANG270 0xC0000000U
${constants.map(n=>`#define ${n} ${defs['TM_'+n]}`).join('\n')}
${sounds.map(n=>`#define sfx_${n} ${defs['TM_SFX_'+n.toUpperCase()]}`).join('\n')}
typedef struct mobj_s mobj_t;
typedef struct {mobj_t *soundtarget;} sector_t;
typedef struct {sector_t *sector;} subsector_t;
typedef struct {int radius,meleestate,seesound,seestate;} info_t;
struct mobj_s {int x,y,type,flags,reactiontime,lastlook,threshold,state;angle_t angle;info_t *info;mobj_t *target;subsector_t *subsector;};
typedef struct {int health;mobj_t *mo;} player_t;
mobj_t a,p,h;info_t ai,ti;sector_t sec;subsector_t sub;
player_t players[4];int playeringame[4]={1,0,0,0};
int rn,rc,sight,sc,ac,adx,ady,stc,snd,sndorigin,sndcnt;
angle_t fakeangle;
uint8_t rnd[256]={${random.join(',')}};
int kind(mobj_t *v){if(v==&a)return 3;if(v==&p)return 1;if(v==&h)return 2;return 0;}
int P_Random(void){rc++;rn=(rn+1)&255;return rnd[rn];}
fixed_t P_AproxDistance(fixed_t dx,fixed_t dy){dx=abs(dx);dy=abs(dy);return dx+dy-(dx<dy?dx:dy)/2;}
boolean P_CheckSight(mobj_t *source,mobj_t *target){if(source!=&a)abort();sc++;return !!(sight&(1<<(kind(target)-1)));}
angle_t R_PointToAngle2(fixed_t x,fixed_t y,fixed_t tx,fixed_t ty){ac++;adx=tx-x;ady=ty-y;return fakeangle;}
void S_StartSound(mobj_t *source,int sound){sndcnt++;snd=sound;sndorigin=kind(source);}
boolean P_SetMobjState(mobj_t *actor,int state){stc++;actor->state=state;return true;}
${functions}
int main(void){long long row[19],out[17];int i,res;
 while(scanf("%lld",row)==1){for(i=1;i<19;i++)if(scanf("%lld",row+i)!=1)abort();
  memset(&a,0,sizeof(a));memset(&p,0,sizeof(p));memset(&h,0,sizeof(h));
  p.x=row[2];p.y=row[3];h.x=-row[2];h.y=row[3];
  ti.radius=row[5];ai.meleestate=row[6];ai.seesound=row[16];ai.seestate=99;
  a.info=&ai;p.info=h.info=&ti;a.type=row[1];a.reactiontime=row[7];a.flags=row[8];
  p.flags=h.flags=row[9];a.lastlook=row[10];a.threshold=57;a.state=77;a.angle=row[14];
  a.target=row[4]==1?&p:row[4]==2?&h:NULL;
  sec.soundtarget=row[17]==1?&p:row[17]==2?&h:NULL;sub.sector=&sec;a.subsector=&sub;
  players[0].health=row[13];players[0].mo=&p;sight=row[12];fakeangle=row[15];
  rn=row[18];rc=sc=ac=adx=ady=stc=sndcnt=0;snd=sndorigin=-1;res=-1;
  switch(row[0]){case 0:res=P_CheckMeleeRange(&a);break;case 1:res=P_CheckMissileRange(&a);break;
   case 2:res=P_LookForPlayers(&a,row[11]);break;case 3:A_FaceTarget(&a);break;case 4:A_Look(&a);break;default:abort();}
  out[0]=res;out[1]=kind(a.target);out[2]=(uint32_t)a.flags;out[3]=a.angle;out[4]=a.lastlook;
  out[5]=a.threshold;out[6]=a.state;out[7]=snd;out[8]=sndorigin;out[9]=rn;out[10]=sc;
  out[11]=ac;out[12]=adx;out[13]=ady;out[14]=stc;out[15]=rc;out[16]=sndcnt;
  for(i=0;i<17;i++)printf("%lld ",out[i]);puts("");
 }
}
`;
  const scratch=mkdtempSync(join(tmpdir(),'toom-enemy-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    execFileSync(process.env.CC||'cc',['-std=c99','-O2','-Wall','-Wextra','-Werror','-Wno-unused-but-set-variable','-Wno-misleading-indentation',src,'-o',exe]);
    const out=execFileSync(exe,{input:cases.map(r=>r.join(' ')).join('\n')+'\n',encoding:'utf8',maxBuffer:32*1024*1024})
      .trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
    assert.equal(out.length,cases.length);assert(out.every(r=>r.length===17));
    return cases.map((row,i)=>[...row,...out[i]]);
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
