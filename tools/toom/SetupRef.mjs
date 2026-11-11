import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root} from './Assets.mjs';
import {EnemyFunction} from './EnemyRef.mjs';

export async function SetupReference() {
  const revision='a77dfb96cb91780ca334d0d4cfd86957558007e0',files=[
    ['g_game.c','bc8e2e0d76a70f8120174946641a82c46f0116a624f51c011b292e2ffcb78a29'],
    ['p_mobj.c','21a39bdbd746d6fba38660500203216052f0723b8e0ab033ce2a650ada2b403f'],
    ['p_pspr.c','b47100f9c2c2c4f7913831c170bff55161af2d5d01f5467dbbc6be081c4f1af1']
  ],sources=[];
  for(const [name,sha]of files) {
    const path=resolve(root,'tools/toom/source',name);
    if(!existsSync(path)) {
      const response=await fetch(`https://raw.githubusercontent.com/id-Software/DOOM/${revision}/linuxdoom-1.10/${name}`);
      assert(response.ok);writeFileSync(path,Buffer.from(await response.arrayBuffer()));
    }
    const bytes=readFileSync(path);assert.equal(createHash('sha256').update(bytes).digest('hex'),sha);
    sources.push(bytes.toString('ascii').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,''));
  }
  const defs=Object.fromEntries([...readFileSync(resolve(root,'games/Toom/TmData.HH'),'ascii')
    .matchAll(/^#define (TM_\w+)\s+(\d+)$/gm)].map(m=>[m[1],Number(m[2])]));
  const begin=sources[0].indexOf('if (fastparm || (skill == sk_nightmare'),
    end=sources[0].indexOf('for (i=0 ; i<MAXPLAYERS',begin);
  assert(begin>=0&&end>begin&&end-begin<1200);
  const fast=sources[0].slice(begin,end),inputs=[];
  for(const mode of [0,1,2])for(const health of [1,73,200])for(const armor of [0,67])
    for(const ammo of [0,123])for(const ready of [1,2,7])inputs.push([mode,health,armor,ammo,ready]);
  const functions=[...['G_PlayerReborn','G_PlayerFinishLevel'].map(n=>EnemyFunction(sources[0],n)),
    ...['P_SetPsprite','A_Raise','P_BringUpWeapon','P_SetupPsprites'].map(n=>EnemyFunction(sources[2],n)),
    EnemyFunction(sources[1],'P_SpawnPlayer')].join('\n');
  const names=['S_SARG_RUN1','S_SARG_PAIN2','MT_BRUISERSHOT','MT_HEADSHOT','MT_TROOPSHOT','MT_PLAYER','MF_SHADOW'];
  const c=`#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#define MAXPLAYERS 4
#define NUMAMMO 4
#define NUMCARDS 6
#define NUMPSPRITES 2
#define MAXHEALTH 100
#define FRACBITS 16
#define FRACUNIT 65536
#define VIEWHEIGHT (41*FRACUNIT)
#define WEAPONBOTTOM (128*FRACUNIT)
#define WEAPONTOP (32*FRACUNIT)
#define RAISESPEED (6*FRACUNIT)
#define ONFLOORZ INT32_MIN
#define ANG45 0x20000000U
#define MF_TRANSSHIFT 26
#define true 1
#define false 0
#define PST_LIVE 0
#define PST_DEAD 1
#define PST_REBORN 2
#define wp_fist 0
#define wp_pistol 1
#define wp_chainsaw 7
#define wp_nochange 10
#define am_clip 0
#define ps_weapon 0
#define sfx_sawup 1
#define sk_nightmare 4
${names.map(n=>`#define ${n} ${defs['TM_'+n]}`).join('\n')}
typedef int fixed_t;
typedef int statenum_t;
typedef int skill_t;
typedef struct player_s player_t;
typedef struct psp_s pspdef_t;
typedef struct state_s {int sprite,frame,tics;union {void (*acp2)(player_t*,pspdef_t*);} action;int nextstate,misc1,misc2;} state_t;
struct psp_s {state_t *state;int tics,sx,sy;};
typedef struct {int number,spawn,health,see,see_snd,reaction,attack_snd,pain,pain_chance,pain_snd,melee,missile,death,xdeath,death_snd,speed,radius,height,mass,damage,active_snd,flags,raise;} info_t;
typedef struct mobj_s {int flags,health;uint32_t angle;player_t *player;} mobj_t;
struct player_s {mobj_t *mo;int frags[4],killcount,itemcount,secretcount,powers[6],cards[6],extralight,fixedcolormap,damagecount,bonuscount,usedown,attackdown,playerstate,health,readyweapon,pendingweapon,weaponowned[9],ammo[4],maxammo[4],armorpoints,armortype,backpack,refire,viewheight,viewz;char *message;pspdef_t psprites[2];};
typedef struct {int x,y,angle,type;} mapthing_t;
typedef struct {int ammo,upstate,downstate,readystate,atkstate,flashstate;} weaponinfo_t;
player_t players[4];mobj_t oldactor,newactor;
state_t states[967];info_t *mobjinfo;weaponinfo_t *weaponinfo;
int maxammo[4]={200,50,300,50},playeringame[4]={1,0,0,0},deathmatch,consoleplayer;
int fastparm,gameskill=2;
void P_SetPsprite(player_t*,int,statenum_t);
void A_Raise(player_t*,pspdef_t*);
void P_SetupPsprites(player_t*);
void S_StartSound(mobj_t *actor,int sound){(void)actor;(void)sound;}
void ST_Start(void){}
void HU_Start(void){}
mobj_t *P_SpawnMobj(fixed_t x,fixed_t y,fixed_t z,int type){(void)x;(void)y;(void)z;if(type!=MT_PLAYER)abort();memset(&newactor,0,sizeof(newactor));return &newactor;}
${functions}
void Fast(skill_t skill){int i;${fast}}
int main(int argc,char **argv){FILE *f;uint8_t *body;int *pack;int i,j,mode,health,armor,ammo,ready,out[64],n;player_t *p=&players[0];mapthing_t thing={0,0,90,1};
 if(argc<2)abort();f=fopen(argv[1],"rb");if(!f)abort();body=malloc(${defs.TM_DATA_SIZE});if(fread(body,1,${defs.TM_DATA_SIZE},f)!=${defs.TM_DATA_SIZE})abort();fclose(f);
 pack=(int*)(body+32);for(i=0;i<967;i++){states[i].sprite=pack[i*7];states[i].frame=pack[i*7+1];states[i].tics=pack[i*7+2];states[i].action.acp2=pack[i*7+3]==${defs.TM_A_RAISE}?A_Raise:NULL;states[i].nextstate=pack[i*7+4];states[i].misc1=pack[i*7+5];states[i].misc2=pack[i*7+6];}
 mobjinfo=(info_t*)(body+32+967*28);weaponinfo=(weaponinfo_t*)(body+${defs.TM_DATA_SIZE}-256-9*24);
 if(argc==4){fastparm=atoi(argv[3]);Fast(atoi(argv[2]));for(i=0;i<967;i++)pack[i*7+2]=states[i].tics;fwrite(body,1,${defs.TM_DATA_SIZE},stdout);free(body);return 0;}
 while(scanf("%d %d %d %d %d",&mode,&health,&armor,&ammo,&ready)==5){
  memset(p,0,sizeof(*p));memset(&oldactor,0,sizeof(oldactor));p->mo=&oldactor;oldactor.flags=MF_SHADOW;
  p->health=health;p->armorpoints=armor;p->armortype=1;p->backpack=1;p->readyweapon=ready;p->pendingweapon=10;
  p->weaponowned[0]=p->weaponowned[1]=p->weaponowned[ready]=1;
  p->ammo[0]=ammo;p->ammo[1]=11;p->ammo[2]=12;p->ammo[3]=13;
  for(i=0;i<4;i++)p->maxammo[i]=maxammo[i]*2;
  for(i=0;i<6;i++){p->cards[i]=1;p->powers[i]=i+1;}
  p->damagecount=p->bonuscount=p->refire=p->extralight=p->fixedcolormap=55;
  p->psprites[0].state=&states[100];p->psprites[0].tics=44;p->psprites[0].sx=123456;p->psprites[0].sy=654321;
  p->psprites[1].state=&states[200];p->psprites[1].tics=55;p->psprites[1].sx=-222222;p->psprites[1].sy=333333;
  p->playerstate=mode?PST_REBORN:PST_LIVE;
  if(!mode)G_PlayerFinishLevel(0);
  p->killcount=p->itemcount=p->secretcount=0;p->viewz=1;
  P_SpawnPlayer(&thing);
  n=0;out[n++]=p->health;out[n++]=p->armorpoints;out[n++]=p->armortype;out[n++]=p->readyweapon;out[n++]=p->pendingweapon;out[n++]=p->usedown;out[n++]=p->attackdown;out[n++]=p->killcount;out[n++]=p->itemcount;out[n++]=p->secretcount;out[n++]=p->damagecount;out[n++]=p->bonuscount;out[n++]=p->extralight;out[n++]=p->fixedcolormap;out[n++]=p->viewheight;out[n++]=p->viewz;out[n++]=p->refire;out[n++]=p->backpack;
  for(i=0;i<9;i++)out[n++]=p->weaponowned[i];for(i=0;i<4;i++)out[n++]=p->ammo[i];for(i=0;i<4;i++)out[n++]=p->maxammo[i];for(i=0;i<6;i++)out[n++]=p->cards[i];for(i=0;i<6;i++)out[n++]=p->powers[i];
  for(i=0;i<2;i++){out[n++]=p->psprites[i].state?p->psprites[i].state-states:0;out[n++]=p->psprites[i].tics;out[n++]=p->psprites[i].sx;out[n++]=p->psprites[i].sy;}
  if(n!=55)abort();for(j=0;j<n;j++)printf("%s%d",j?" ":"",out[j]);puts("");
 }
 free(body);return 0;
}`;
  const work=mkdtempSync(join(tmpdir(),'toom-setup-'));
  try {
    writeFileSync(join(work,'ref.c'),c);writeFileSync(join(work,'data.bin'),readFileSync(resolve(root,'games/Toom/TMDATA.BIN')));
    execFileSync('cc',['-std=c99','-O2',join(work,'ref.c'),'-o',join(work,'ref')]);
    const output=execFileSync(join(work,'ref'),[join(work,'data.bin')],{input:inputs.map(r=>r.join(' ')).join('\n')+'\n',encoding:'utf8'});
    const rows=output.trim().split('\n').map((line,i)=>[...inputs[i],...line.split(' ').map(Number)]);
    assert.equal(rows.length,inputs.length);assert(rows.every(r=>r.length===60));
    const fastData=[[2,0],[4,0],[2,1]].map(([skill,flag])=>execFileSync(join(work,'ref'),[join(work,'data.bin'),String(skill),String(flag)]));
    return {rows,fastData,reference:{revision,files:files.map(([name,sha256])=>({path:'linuxdoom-1.10/'+name,sha256}))}};
  } finally {rmSync(work,{recursive:true,force:true});}
}
