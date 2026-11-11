import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root} from './Assets.mjs';
import {EnemyFunction} from './EnemyRef.mjs';

export async function InputReference() {
  const manifest=JSON.parse(readFileSync(resolve(root,'tools/toom/source/collision.json'))),
    file=manifest.files.find(f=>f.path.endsWith('/g_game.c')),path=resolve(root,'tools/toom/source/g_game.c');
  assert(file);
  if(!existsSync(path)) {
    const response=await fetch(`https://raw.githubusercontent.com/id-Software/DOOM/${manifest.revision}/${file.path}`);
    assert(response.ok);writeFileSync(path,Buffer.from(await response.arrayBuffer()));
  }
  const bytes=readFileSync(path);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
  const original=bytes.toString('ascii').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,''),inputs=[];
  for(const held of [0,1,2,3,4,5,6,35])for(let keys=0;keys<1024;keys++)inputs.push([keys,held]);
  for(const base of [0,64,128,1023])for(let weapons=0;weapons<256;weapons++)inputs.push([base|(weapons<<10),5]);
  const c=`#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <stdlib.h>
typedef int boolean;
typedef struct {signed char forwardmove,sidemove;short angleturn,consistancy;unsigned char chatchar,buttons;} ticcmd_t;
#define MAXPLMOVE 50
#define SLOWTURNTICS 6
#define BACKUPTICS 12
#define NUMWEAPONS 9
#define BT_ATTACK 1
#define BT_USE 2
#define BT_CHANGE 4
#define BT_WEAPONSHIFT 3
#define BT_SPECIAL 128
#define BTS_PAUSE 1
#define BTS_SAVEGAME 2
#define BTS_SAVESHIFT 2
#define false 0
int key_right=128,key_left=129,key_up=130,key_down=131,key_strafeleft=132,key_straferight=133,key_fire=134,key_use=135,key_strafe=136,key_speed=137;
int gamekeydown[256],mousebuttons[4],joybuttons[5],consistancy[4][BACKUPTICS];
int mousebstrafe,joybstrafe,joybspeed,mousebfire,joybfire,joybuse,mousebforward;
int consoleplayer,maketic,turnheld,ticdup=1,joyxmove,joyymove,mousex,mousey;
int dclicks,dclicktime,dclickstate,dclicks2,dclicktime2,dclickstate2,sendpause,sendsave,savegameslot;
int forwardmove[2]={25,50},sidemove[2]={24,40},angleturn[3]={640,1280,320};
ticcmd_t empty;
ticcmd_t *I_BaseTiccmd(void){return &empty;}
int HU_dequeueChatChar(void){return 0;}
${EnemyFunction(original,'G_BuildTiccmd')}
int main(void){int keys,held,i;ticcmd_t cmd;
 while(scanf("%d %d",&keys,&held)==2){
  memset(gamekeydown,0,sizeof(gamekeydown));
  for(i=0;i<10;i++)gamekeydown[128+i]=(keys>>i)&1;
  for(i=0;i<8;i++)gamekeydown['1'+i]=(keys>>(10+i))&1;
  turnheld=held;dclicks=dclicktime=dclickstate=dclicks2=dclicktime2=dclickstate2=0;
  G_BuildTiccmd(&cmd);
  printf("%d %d %d %d %d %d\\n",turnheld,cmd.forwardmove,cmd.sidemove,cmd.angleturn,cmd.buttons&3,(cmd.buttons&BT_CHANGE)?(cmd.buttons>>BT_WEAPONSHIFT)&7:10);
 }
 return 0;
}`;
  const work=mkdtempSync(join(tmpdir(),'toom-input-'));
  try {
    writeFileSync(join(work,'ref.c'),c);execFileSync('cc',['-std=c99','-O2',join(work,'ref.c'),'-o',join(work,'ref')]);
    const output=execFileSync(join(work,'ref'),[],{input:inputs.map(r=>r.join(' ')).join('\n')+'\n',encoding:'utf8',maxBuffer:4*1024*1024});
    const rows=output.trim().split('\n').map((line,i)=>[...inputs[i],...line.split(' ').map(Number)]);
    assert.equal(rows.length,inputs.length);assert(rows.every(r=>r.length===8));
    return {rows,reference:{revision:manifest.revision,...file,function:'G_BuildTiccmd',scope:'Keyboard-only commands: mouse, joystick, external driver, chat, demo, network, pause and save inputs are inactive.'}};
  } finally {rmSync(work,{recursive:true,force:true});}
}
