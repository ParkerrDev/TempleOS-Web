import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync,spawnSync} from 'node:child_process';
import {root} from './Assets.mjs';
import {EnemyFunction} from './EnemyRef.mjs';
import {FinaleSource} from './FinaleRef.mjs';

export async function CastReference() {
  const original=await FinaleSource(),game=resolve(root,'games/Toom'),
    data=readFileSync(resolve(game,'TMDATA.BIN')),meta=JSON.parse(readFileSync(resolve(game,'data.json'))),
    hash=b=>createHash('sha256').update(b).digest('hex');
  assert.equal(hash(data),meta.sha256);
  const defs=Object.fromEntries([...readFileSync(resolve(game,'TmData.HH'),'ascii')
    .matchAll(/^#define (TM_\w+)\s+(\d+)$/gm)].map(m=>[m[1],Number(m[2])])),
    order=original.match(/castinfo_t\s+castorder\[\]\s*=\s*\{[\s\S]*?\n\};/)?.[0];
  assert(order);const names=[...order.matchAll(/\{(CC_\w+),/g)].map(m=>m[1]);assert.equal(names.length,17);
  const functions=['F_StartCast','F_CastTicker','F_CastResponder'].map(n=>EnemyFunction(original,n)).join('\n'),
    states=Array.from({length:meta.states},(_,i)=>Array.from({length:7},(_,j)=>data.readInt32LE(32+(i*7+j)*4))),
    info=Array.from({length:meta.actors},(_,i)=>Array.from({length:23},(_,j)=>data.readInt32LE(32+meta.states*28+(i*23+j)*4))),
    constants=[...new Set((order+functions).match(/\b(?:S_[A-Z0-9_]+|MT_[A-Z0-9_]+|sfx_[a-z0-9_]+)\b/g))],
    ticks=1500,fields=12,cases=[];
  for(let start=0;start<17;start++)for(let pattern=0;pattern<6;pattern++)cases.push([start,pattern]);
  const c=`#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
typedef int boolean;
typedef int mobjtype_t;
typedef struct {int type;} event_t;
enum {ev_keyup,ev_keydown};
#define true 1
#define false 0
#define mus_evil 0
${names.map(n=>`#define ${n} "${n}"`).join('\n')}
${constants.map(n=>`#define ${n} ${defs['TM_'+n.replace(/^sfx_/,'SFX_').toUpperCase()]}`).join('\n')}
typedef struct {int sprite,frame,tics,action,nextstate,misc1,misc2;} state_t;
typedef struct {int doomednum,spawnstate,spawnhealth,seestate,seesound,reactiontime,attacksound,
 painstate,painchance,painsound,meleestate,missilestate,deathstate,xdeathstate,deathsound,
 speed,radius,height,mass,damage,activesound,flags,raisestate;} mobjinfo_t;
typedef struct {char *name;mobjtype_t type;} castinfo_t;
state_t states[]={${states.map(s=>'{'+s.join(',')+'}').join(',')}};
mobjinfo_t mobjinfo[]={${info.map(s=>'{'+s.join(',')+'}').join(',')}};
${order}
int castnum,casttics,castdeath,castframes,castonmelee,castattacking,finalestage,wipegamestate;
state_t *caststate;int sound_count;uint32_t sound_hash,visited,sounds[109];
void S_ChangeMusic(int music,int loop){if(music!=mus_evil||!loop)abort();}
void S_StartSound(void *origin,int n){
 int a[8]={n,castnum,(int)(caststate-states),castframes,castdeath,castattacking,casttics,castonmelee},i;
 if(origin||n<=0||n>=109)abort();
 sound_count++;sounds[n]++;
 for(i=0;i<8;i++)sound_hash=sound_hash*33+(uint32_t)a[i];
}
${functions}
static void word(int64_t value){uint64_t v=(uint64_t)value;int b;for(b=0;b<8;b++)putchar((int)(v>>(b*8)&255));}
int main(void){int start,pattern,t,event,result;event_t key;
 while(scanf("%d%d",&start,&pattern)==2){
  F_StartCast();if(castnum||castdeath||castframes||castonmelee||castattacking||finalestage!=2)abort();
  castnum=start;caststate=&states[mobjinfo[castorder[start].type].seestate];casttics=caststate->tics;
  for(t=0;t<${ticks};t++){
   event=-1;switch(pattern){
    case 1:if(t%180<2)event=1;break;
    case 2:event=1;break;
    case 3:event=0;break;
    case 4:if(t%1000==999)event=1;break;
    case 5:if(castframes==12||t%37==0)event=t%2;break;
   }
   sound_count=0;sound_hash=0;result=-1;
   if(event!=-1){key.type=event?ev_keydown:ev_keyup;result=F_CastResponder(&key);}
   F_CastTicker();visited|=1U<<castnum;
   word(event);word(result);word(castnum);word(caststate-states);word(casttics);word(castdeath);
   word(castframes);word(castonmelee);word(castattacking);word(sound_count);word(sound_hash);word(castorder[castnum].type);
  }
 }
 if(visited!=0x1ffff)abort();
 fprintf(stderr,"%u",visited);for(t=0;t<109;t++)if(sounds[t])fprintf(stderr," %d:%u",t,sounds[t]);
 fputc('\\n',stderr);
}
`;
  assert(!c.includes('undefined'),'Every original cast symbol maps to the verified data pack.');
  const scratch=mkdtempSync(join(tmpdir(),'toom-cast-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    execFileSync(process.env.CC||'cc',['-std=c99','-O2','-Wall','-Wextra','-Werror','-fsanitize=undefined',src,'-o',exe]);
    const run=spawnSync(exe,{input:cases.map(r=>r.join(' ')).join('\n')+'\n',maxBuffer:20*1024*1024});
    assert.equal(run.status,0,run.stderr?.toString()||String(run.error));
    const out=run.stdout,coverage=run.stderr.toString().trim().split(' ');
    assert.equal(coverage.shift(),'131071');
    const sounds=Object.fromEntries(coverage.map(s=>s.split(':').map(Number)));
    const rowBytes=ticks*fields*8;assert.equal(out.length,cases.length*rowBytes);
    const header=Buffer.alloc(24);[cases.length,ticks,fields].forEach((n,i)=>header.writeBigInt64LE(BigInt(n),i*8));
    const rows=cases.map((r,i)=>{
      const input=Buffer.alloc(16);r.forEach((n,j)=>input.writeBigInt64LE(BigInt(n),j*8));
      return Buffer.concat([input,out.subarray(i*rowBytes,(i+1)*rowBytes)]);
    });
    return {bytes:Buffer.concat([header,...rows]),data,cases:cases.length,ticks,fields,sounds,referenceCsha256:hash(c)};
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
