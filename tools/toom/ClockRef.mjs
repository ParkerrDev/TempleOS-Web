import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root} from './Assets.mjs';

export async function ClockReference() {
  const dir=resolve(root,'tools/toom/source'),manifest=JSON.parse(readFileSync(resolve(dir,'collision.json'))),
    file=manifest.files.find(f=>f.path.endsWith('/p_tick.c')),path=resolve(dir,'p_tick.c');assert(file);
  if(!existsSync(path)) {
    const response=await fetch(`https://raw.githubusercontent.com/id-Software/DOOM/${manifest.revision}/${file.path}`);
    assert(response.ok);writeFileSync(path,Buffer.from(await response.arrayBuffer()));
  }
  const bytes=readFileSync(path);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
  const original=bytes.toString('ascii').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
  const m=/void\s+P_Ticker\s*\([^)]*\)\s*\{/.exec(original);assert(m);
  let at=m.index+m[0].length,depth=1;
  for(;depth&&at<original.length;at++){if(original[at]==='{')depth++;if(original[at]==='}')depth--;}
  assert.equal(depth,0);
  const c=`#include <stdio.h>
#define MAXPLAYERS 1
typedef struct { int viewz; } player_t;
player_t players[1]={{41}};
int paused,netgame,menuactive,demoplayback,consoleplayer,playeringame[1]={1};
int leveltime,cnt,trace[6];
void record(int phase) {trace[cnt++]=phase;trace[cnt++]=leveltime;}
void P_PlayerThink(player_t *p) {(void)p;record(1);}
void P_RunThinkers(void) {record(2);}
void P_UpdateSpecials(void) {record(3);}
void P_RespawnSpecials(void) {}
${original.slice(m.index,at)}
int main(void) {
  int starts[4]={0,7,31,65535},i,mask,t,j,before;
  for(i=0;i<4;i++)for(mask=0;mask<16;mask++) {
    leveltime=starts[i];
    for(t=0;t<4;t++) {
      before=leveltime;paused=(mask>>t)&1;cnt=0;
      for(j=0;j<6;j++)trace[j]=-1;
      P_Ticker();
      printf("%d %d %d %d",before,paused,leveltime,cnt);
      for(j=0;j<6;j++)printf(" %d",trace[j]);
      puts("");
    }
  }
}
`;
  const scratch=mkdtempSync(join(tmpdir(),'toom-clock-ref-'));
  try {
    const src=join(scratch,'ref.c'),exe=join(scratch,'ref');writeFileSync(src,c);
    execFileSync(process.env.CC||'cc',['-std=c99','-Wall','-Wextra','-Werror','-O2',src,'-o',exe]);
    const rows=execFileSync(exe,{encoding:'utf8'}).trim().split('\n').map(s=>s.split(' ').map(Number));
    assert.equal(rows.length,256);assert(rows.every(r=>r.length===10));return rows;
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
