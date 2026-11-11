import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root} from './Assets.mjs';
import {EnemyFunction} from './EnemyRef.mjs';

export async function FinaleSource(name='f_finale.c') {
  const dir=resolve(root,'tools/toom/source'),meta=JSON.parse(readFileSync(resolve(dir,'finale.json'))),
    file=meta.files.find(f=>f.path.endsWith('/'+name)),path=resolve(dir,name);assert(file);
  if(!existsSync(path)) {
    const response=await fetch(`https://raw.githubusercontent.com/id-Software/DOOM/${meta.revision}/${file.path}`);
    assert(response.ok);writeFileSync(path,Buffer.from(await response.arrayBuffer()));
  }
  const bytes=readFileSync(path);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
  return bytes.toString('ascii').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
}

export async function FinaleReference() {
  const original=await FinaleSource(),cases=[],ticks=1500,fields=7;
  const textCount=EnemyFunction(original,'F_TextWrite').match(/count\s*=\s*\(finalecount[\s\S]*?count\s*=\s*0;/)?.[0];
  assert(textCount,'Original F_TextWrite character-delay calculation is present.');
  const maps=[[1,8,0],[2,8,0],[3,8,0],[4,8,0],...[6,11,20,30,15,31].map(n=>[1,n,1])];
  for(const map of maps)for(const len of [0,1,400])for(let pattern=0;pattern<4;pattern++)
    cases.push([...map,len,pattern]);
  const c=`#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#define MAXPLAYERS 1
#define TEXTSPEED 3
#define TEXTWAIT 250
#define true 1
#define false 0
enum {shareware=1,registered,retail,commercial};
enum {ga_nothing,ga_worlddone};
enum {mus_victor,mus_read_m,mus_bunny};
#define GS_FINALE 1
typedef struct {struct {int buttons;} cmd;} player_t;
player_t players[1];
int gameaction,gamestate,viewactive,automapactive,gamemode,gameepisode,gamemap;
int finalestage,finalecount,wipegamestate,events,bunny;
char texts[10][401],*finaletext,*finaleflat;
char *e1text=texts[0],*e2text=texts[1],*e3text=texts[2],*e4text=texts[3];
char *c1text=texts[4],*c2text=texts[5],*c3text=texts[6],*c4text=texts[7],*c5text=texts[8],*c6text=texts[9];
void S_ChangeMusic(int music,int loop){(void)music;(void)loop;}
void S_StartMusic(int music){if(music!=mus_bunny)abort();bunny++;}
void F_StartCast(void){finalestage=2;events|=2;}
void F_CastTicker(void){}
${EnemyFunction(original,'F_StartFinale')}
${EnemyFunction(original,'F_Ticker')}
static int chars(void){int count;${textCount}
 if(count>(int)strlen(finaletext))count=(int)strlen(finaletext);return count;}
static void word(int64_t value){uint64_t v=(uint64_t)value;int b;for(b=0;b<8;b++)putchar((int)(v>>(b*8)&255));}
int main(void){int row[5],i,t,buttons,old,selected,active;
 while(scanf("%d",row)==1){for(i=1;i<5;i++)if(scanf("%d",row+i)!=1)abort();
  gameepisode=row[0];gamemap=row[1];gamemode=row[2]?commercial:retail;
  for(i=0;i<10;i++){memset(texts[i],'A',row[3]);texts[i][row[3]]=0;}
  F_StartFinale();selected=-1;for(i=0;i<10;i++)if(finaletext==texts[i])selected=i;
  if(selected<0)abort();word(selected);bunny=0;
  for(t=0;t<${ticks};t++){
   buttons=0;events=0;old=finalestage;
   switch(row[4]){
    case 1:buttons=1;break;
    case 2:if(t>=49&&t<=53)buttons=2;break;
    case 3:if(t==52||t==900||t==902)buttons=4;break;
   }
   players[0].cmd.buttons=buttons;active=gameaction==ga_nothing;
   if(active)F_Ticker();
   if(old==0&&finalestage==1)events|=1;
   if(active&&gameaction==ga_worlddone)events|=4;
   word(buttons);word(finalestage);word(finalecount);word(gameaction==ga_worlddone);word(events);word(bunny);word(chars());
  }
 }
}
`;
  const scratch=mkdtempSync(join(tmpdir(),'toom-finale-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    execFileSync(process.env.CC||'cc',['-std=c99','-O2','-Wall','-Wextra','-Werror','-Wno-sign-compare','-Wno-misleading-indentation','-fsanitize=undefined',src,'-o',exe]);
    const out=execFileSync(exe,{input:cases.map(r=>r.join(' ')).join('\n')+'\n',maxBuffer:16*1024*1024});
    const rowBytes=8+ticks*fields*8;assert.equal(out.length,cases.length*rowBytes);
    const header=Buffer.alloc(24);[cases.length,ticks,fields].forEach((n,i)=>header.writeBigInt64LE(BigInt(n),i*8));
    const rows=cases.map((r,i)=>{
      const input=Buffer.alloc(r.length*8);r.forEach((n,j)=>input.writeBigInt64LE(BigInt(n),j*8));
      return Buffer.concat([input,out.subarray(i*rowBytes,(i+1)*rowBytes)]);
    });
    return {bytes:Buffer.concat([header,...rows]),cases:cases.length,ticks,fields};
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
