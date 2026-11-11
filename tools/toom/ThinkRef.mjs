import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {root} from './Assets.mjs';

export async function ThinkReference() {
  const dir=resolve(root,'tools/toom/source'),manifest=JSON.parse(readFileSync(resolve(dir,'collision.json'))),
    file=manifest.files.find(f=>f.path.endsWith('/p_tick.c')),path=resolve(dir,'p_tick.c');assert(file);
  if(!existsSync(path)) {
    const response=await fetch(`https://raw.githubusercontent.com/id-Software/DOOM/${manifest.revision}/${file.path}`);
    assert(response.ok);writeFileSync(path,Buffer.from(await response.arrayBuffer()));
  }
  const bytes=readFileSync(path);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
  const original=bytes.toString('ascii').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
  function func(name) {
    const m=new RegExp(`void\\s+${name}\\s*\\([^)]*\\)\\s*\\{`).exec(original);assert(m,name);
    let at=m.index+m[0].length,depth=1;
    for(;depth&&at<original.length;at++){if(original[at]==='{')depth++;if(original[at]==='}')depth--;}
    assert.equal(depth,0);return original.slice(m.index,at);
  }
  const sources=['P_InitThinkers','P_AddThinker','P_RemoveThinker','P_RunThinkers'].map(func).join('\n');
  const c=`#include <stdio.h>
#include <stdlib.h>
#include <string.h>
typedef void (*actionf_v)(void);
typedef union { actionf_v acv; void (*acp1)(void *); } actionf_t;
typedef struct thinker_s { struct thinker_s *prev,*next; actionf_t function; } thinker_t;
thinker_t thinkercap;
typedef struct { thinker_t thinker; int kind,id,once,freed; } object_t;
object_t objects[5];
int count,trigger,child,retire,extra,trace[32],used;
void Z_Free(void *p) { ((object_t *)p)->freed=1; }
${sources}
void step(void *);
void add(int kind) {
  object_t *p=objects+count;memset(p,0,sizeof(*p));p->kind=kind;p->id=count++;
  p->thinker.function.acp1=step;P_AddThinker(&p->thinker);
}
void step(void *v) {
  object_t *p=v;if(used>=32)abort();trace[used++]=p->kind*16+p->id;
  if(!p->once) {
    p->once=1;
    if(p->id==trigger) {
      add(child);
      if(retire>=0)P_RemoveThinker(&objects[retire].thinker);
    } else if(p->id==3&&extra)add(child%3+1);
  }
}
int main(void) {
  int a,b,c,r,t,k,e,pass,i;
  for(a=1;a<=3;a++)for(b=1;b<=3;b++)for(c=1;c<=3;c++)if(a!=b&&a!=c&&b!=c)
  for(t=0;t<3;t++)for(k=1;k<=3;k++)for(r=-1;r<3;r++)if(r<0||(r==0?a:r==1?b:c)!=3)
  for(e=0;e<2;e++) {
    P_InitThinkers();count=0;trigger=t;child=k;retire=r;extra=e;add(a);add(b);add(c);
    printf("%d %d %d %d %d %d %d",a,b,c,t,k,r,e);
    for(pass=0;pass<2;pass++) {
      used=0;P_RunThinkers();printf(" %d",used);
      for(i=0;i<used;i++)printf(" %d",trace[i]);
    }
    puts("");
  }
}
`;
  const temp=mkdtempSync(join(tmpdir(),'toom-thinker-'));
  try {
    writeFileSync(join(temp,'oracle.c'),c);
    execFileSync(process.env.CC||'cc',['-std=c11','-O2','-Wall','-Wextra','-Werror',join(temp,'oracle.c'),'-o',join(temp,'oracle')]);
    const rows=execFileSync(join(temp,'oracle'),{encoding:'utf8'}).trim().split('\n').map(s=>s.split(' ').map(Number));
    assert.equal(rows.length,324);return {rows,revision:manifest.revision};
  } finally {rmSync(temp,{recursive:true,force:true});}
}
