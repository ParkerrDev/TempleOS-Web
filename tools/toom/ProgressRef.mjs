import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root} from './Assets.mjs';
import {EnemyFunction} from './EnemyRef.mjs';

export async function ProgressSource(name) {
  const dir=resolve(root,'tools/toom/source'),meta=JSON.parse(readFileSync(resolve(dir,'progression.json'))),
    file=meta.files.find(f=>f.path.endsWith('/'+name)),path=resolve(dir,name);assert(file);
  if(!existsSync(path)) {
    const response=await fetch(`https://raw.githubusercontent.com/id-Software/DOOM/${meta.revision}/${file.path}`);
    assert(response.ok);writeFileSync(path,Buffer.from(await response.arrayBuffer()));
  }
  const bytes=readFileSync(path);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
  return bytes.toString('ascii').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
}

export async function RouteReference() {
  const original=await ProgressSource('g_game.c'),cases=[];
  for(let episode=1;episode<=4;episode++)for(let map=1;map<=9;map++)for(const secret of [0,1])
    for(const did of [0,1])cases.push([episode,map,0,secret,did]);
  for(let map=1;map<=32;map++)for(const secret of [0,1])if(!secret||map===15||map===31)
    for(const did of [0,1])cases.push([1,map,1,secret,did]);
  const c=`#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define MAXPLAYERS 4
#define commercial 1
#define true 1
#define false 0
#define ga_nothing 0
#define ga_victory 1
#define ga_worlddone 2
#define GS_INTERMISSION 1
typedef struct {int didsecret,killcount,itemcount,secretcount,frags[4];} player_t;
typedef struct {int in,skills,sitems,ssecret,stime,frags[4];} wbplayer_t;
typedef struct {int didsecret,epsd,last,next,maxkills,maxitems,maxsecret,maxfrags,partime,pnum;wbplayer_t plyr[4];} wbstartstruct_t;
player_t players[4];wbstartstruct_t wminfo;
int gameaction,gamestate,gamemap,gameepisode,gamemode,secretexit,consoleplayer;
int playeringame[4]={1},totalkills,totalitems,totalsecret,leveltime,viewactive,automapactive,finale;
void *statcopy;
/* Routing only: a safe dummy episode4 row avoids the original unrelated par-table overread. */
int pars[5][10],cpars[32];
void G_PlayerFinishLevel(int n){(void)n;}
void AM_Stop(void){}
void WI_Start(wbstartstruct_t *info){if(info!=&wminfo)abort();}
void F_StartFinale(void){finale=gamemap==30?3:2;}
${EnemyFunction(original,'G_DoCompleted')}
${EnemyFunction(original,'G_WorldDone')}
int main(void){int row[5],i,next,did;
 while(scanf("%d",row)==1){for(i=1;i<5;i++)if(scanf("%d",row+i)!=1)abort();
  memset(players,0,sizeof(players));memset(&wminfo,0,sizeof(wminfo));
  gameepisode=row[0];gamemap=row[1];gamemode=row[2];secretexit=row[3];players[0].didsecret=row[4];finale=0;
  G_DoCompleted();did=players[0].didsecret;
  if(gameaction==ga_victory){next=0;finale=1;}else{next=wminfo.next+1;G_WorldDone();}
  printf("%d %d %d\\n",next,finale,did);
 }
}
`;
  const scratch=mkdtempSync(join(tmpdir(),'toom-route-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    execFileSync(process.env.CC||'cc',['-std=c99','-O2','-Wall','-Wextra','-Werror','-Wno-misleading-indentation','-Wno-implicit-fallthrough','-fsanitize=undefined',src,'-o',exe]);
    const out=execFileSync(exe,{input:cases.map(r=>r.join(' ')).join('\n')+'\n',encoding:'utf8'})
      .trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
    assert.equal(out.length,cases.length);assert(out.every(r=>r.length===3));
    return cases.map((row,i)=>[...row,...out[i]]);
  } finally {rmSync(scratch,{recursive:true,force:true});}
}

export async function IntermissionReference() {
  const original=await ProgressSource('wi_stuff.c'),cases=[],ticks=640;
  const stats=[[0,0,0,0,0,0,0,0],[1,3,2,3,1,2,36,69],
    [1,1,2,2,3,3,350,1050],[4,3,9,4,3,2,12345,24150],
    [200,300,50,51,0,1,21000,1050],[0,20,0,25,0,2,2100,0]];
  for(const commercial of [0,1])for(const row of stats)for(let pattern=0;pattern<6;pattern++)
    for(const held of [0,3])cases.push([commercial,...row,pattern,held]);
  const names=['WI_initStats','WI_initNoState','WI_updateNoState','WI_initShowNextLoc',
    'WI_updateShowNextLoc','WI_updateStats','WI_checkForAccelerate','WI_Ticker'];
  const c=`#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#define MAXPLAYERS 1
#define TICRATE 35
#define SHOWNEXTLOCDELAY 4
#define commercial 1
#define true 1
#define false 0
#define BT_ATTACK 1
#define BT_USE 2
#define sfx_pistol 1
#define sfx_sgcock 3
#define sfx_barexp 82
#define mus_dm2int 0
#define mus_inter 1
enum {NoState=-1,StatCount,ShowNextLoc};
typedef struct {int buttons;} cmd_t;
typedef struct {cmd_t cmd;int attackdown,usedown;} player_t;
typedef struct {int skills,sitems,ssecret,stime;} wbplayer_t;
typedef struct {int maxkills,maxitems,maxsecret,partime;} wbstartstruct_t;
wbplayer_t plrs[1];wbstartstruct_t info,*wbs=&info;player_t players[1];
int playeringame[1]={1},me,gamemode,deathmatch,netgame;
int state,acceleratestage,sp_state,cnt_kills[1],cnt_items[1],cnt_secret[1];
int cnt_time,cnt_par,cnt_pause,cnt,bcnt,snl_pointeron,done,sounds;
uint32_t sound_hash;
void WI_initAnimatedBack(void){}
void WI_updateAnimatedBack(void){}
void WI_End(void){}
void G_WorldDone(void){done++;}
void WI_updateDeathmatchStats(void){abort();}
void WI_updateNetgameStats(void){abort();}
void S_StartSound(void *origin,int sound){if(origin)abort();sounds++;sound_hash=(sound_hash^(uint32_t)sound)*16777619u;}
void S_ChangeMusic(int music,int loop){(void)music;(void)loop;}
${names.map(n=>EnemyFunction(original,n)).join('\n')}
static void word(int64_t value){uint64_t v=(uint64_t)value;int b;for(b=0;b<8;b++)putchar((int)(v>>(b*8)&255));}
int main(void){int row[11],i,t,buttons;
 while(scanf("%d",row)==1){for(i=1;i<11;i++)if(scanf("%d",row+i)!=1)abort();
  gamemode=row[0];plrs[0].skills=row[1];info.maxkills=row[2]?row[2]:1;
  plrs[0].sitems=row[3];info.maxitems=row[4]?row[4]:1;
  plrs[0].ssecret=row[5];info.maxsecret=row[6]?row[6]:1;
  plrs[0].stime=row[7];info.partime=row[8];
  players[0].attackdown=!!(row[10]&1);players[0].usedown=!!(row[10]&2);
  bcnt=cnt=done=sounds=0;sound_hash=2166136261u;WI_initStats();
  for(t=0;t<${ticks};t++){
   buttons=0;
   switch(row[9]){
    case 1:buttons=3;break;
    case 2:if(t<3)buttons=1;else if(t>=5&&t<8)buttons=2;else if(t==10)buttons=1;break;
    case 3:buttons=t%7==0;break;
    case 4:buttons=1+(t&1);break;
    case 5:if(t==600||t==602||t==604)buttons=2;break;
   }
   players[0].cmd.buttons=buttons;
   if(!done)WI_Ticker();
   word(buttons);word(done?3:state<0?2:state);word(sp_state);word(state==StatCount?cnt_pause:cnt);word(bcnt);
   word(cnt_kills[0]);word(cnt_items[0]);word(cnt_secret[0]);word(cnt_time);word(cnt_par);
   word(players[0].attackdown);word(players[0].usedown);word(sounds);word(sound_hash);
  }
 }
}
`;
  const scratch=mkdtempSync(join(tmpdir(),'toom-intermission-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    execFileSync(process.env.CC||'cc',['-std=c99','-O2','-Wall','-Wextra','-Werror','-Wno-misleading-indentation','-fsanitize=undefined',src,'-o',exe]);
    const out=execFileSync(exe,{input:cases.map(r=>r.join(' ')).join('\n')+'\n',maxBuffer:32*1024*1024});
    assert.equal(out.length,cases.length*ticks*14*8);
    const header=Buffer.alloc(24);[cases.length,ticks,14].forEach((n,i)=>header.writeBigInt64LE(BigInt(n),i*8));
    const rows=cases.map((r,i)=>{
      const input=Buffer.alloc(r.length*8);r.forEach((n,j)=>input.writeBigInt64LE(BigInt(n),j*8));
      return Buffer.concat([input,out.subarray(i*ticks*14*8,(i+1)*ticks*14*8)]);
    });
    return {bytes:Buffer.concat([header,...rows]),cases:cases.length,ticks,fields:14};
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
