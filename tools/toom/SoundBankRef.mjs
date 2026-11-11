import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {FreedoomRead,root} from './Assets.mjs';
import {BrainMaps} from './BrainMaps.mjs';
import {WadRead} from './Wad.mjs';
import {EnemyFunction} from './EnemyRef.mjs';
import {PcSoundRead} from './SoundRef.mjs';

export async function SoundDefinitions() {
  const hash=b=>createHash('sha256').update(b).digest('hex');
  const id=JSON.parse(readFileSync(new URL('source/source.json',import.meta.url))),source={};
  for(const name of ['sounds.c','sounds.h']) {
    const path=resolve(root,'tools/toom/source',name),entry=id.files.find(f=>f.path.endsWith('/'+name));assert(entry);
    if(!existsSync(path)) {
      const url=`https://raw.githubusercontent.com/id-Software/DOOM/${id.revision}/${entry.path}`;
      const response=await fetch(url);assert(response.ok,`${response.status} ${url}`);
      writeFileSync(path,Buffer.from(await response.arrayBuffer()));
    }
    const bytes=readFileSync(path);assert.equal(hash(bytes),entry.sha256);
    source[name]=bytes.toString('ascii');
  }
  const table=source['sounds.c'].match(/sfxinfo_t S_sfx\[\] =\s*\{[\s\S]*?\n\};/);assert(table);
  const enums=[...source['sounds.h'].matchAll(/typedef enum\s*\{[\s\S]*?\}\s*\w+\s*;/g)].map(m=>m[0]).join('\n');
  assert(enums.includes('NUMSFX'));
  return {id,table:table[0],enums};
}

export async function SoundBankReference() {
  const {manifest:pc,bytes:pcBytes}=await PcSoundRead();
  const {id,table,enums}=await SoundDefinitions();
  const c=`#include <stdio.h>
#include <stdbool.h>
#include <string.h>
#define DEH_String(s) (s)
#define M_snprintf snprintf
#define doom 0
#define strife 1
static int gamemission=doom;
static char lump_name[9];
static int W_GetNumForName(const char *name){snprintf(lump_name,sizeof(lump_name),"%s",name);return 0;}
static int W_CheckNumForName(const char *name){(void)name;return 0;}
static void M_StringCopy(char *dst,const char *src,size_t size){snprintf(dst,size,"%s",src);}
#define arrlen(a) (sizeof(a)/sizeof((a)[0]))
typedef int boolean;
typedef struct sfxinfo_s sfxinfo_t;
struct sfxinfo_s {char *name;int singularity,priority;sfxinfo_t *link;int pitch,volume;void *data;int usefulness,lumpnum;};
${enums}
${table}
${EnemyFunction(pcBytes.toString('ascii'),'IsDisabledSound')}
${EnemyFunction(pcBytes.toString('ascii'),'I_PCS_GetSfxLumpNum')}
int main(void){for(int i=0;i<NUMSFX;i++){
  int n=i;if(!i||IsDisabledSound(S_sfx+i))n=0;
  I_PCS_GetSfxLumpNum(S_sfx+i);
  printf("%d %d %s\\n",i,n,lump_name);
}return 0;}`;
  const dir=mkdtempSync(join(tmpdir(),'toom-sound-bank-'));let rows;
  try {
    writeFileSync(join(dir,'ref.c'),c);execFileSync('cc',['-std=c99','-O2',join(dir,'ref.c'),'-o',join(dir,'ref')]);
    rows=execFileSync(join(dir,'ref')).toString().trim().split('\n').map(line=>{const [id,index,name]=line.split(' ');return {id:Number(id),index:Number(index),name};});
  } finally {rmSync(dir,{recursive:true,force:true});}
  assert.equal(rows.length,109);
  const phase1=FreedoomRead(),{bytes:phase2}=await BrainMaps(),words=[2,rows.length],counts=[];
  const fnv=bytes=>{let h=2166136261;for(const b of bytes)h=Math.imul(h^b,16777619)>>>0;return h;};
  for(const wad of [phase1,phase2]) {
    const lumps=WadRead(wad);let present=0;
    for(const row of rows) {
      let lump=-1,count=-1,sum=0;
      if(row.index)for(let i=lumps.length-1;i>=0;i--)if(lumps[i].name===row.name.toUpperCase()){lump=i;break;}
      if(lump>=0) {
        const bytes=lumps[lump].bytes;assert(bytes.length>=4);assert.equal(bytes.readUInt16LE(0),0);
        count=bytes.readUInt16LE(2);assert(count<=bytes.length-4);sum=fnv(bytes.subarray(4,4+count));present++;
      }
      words.push(row.index,lump,count,sum);
    }
    counts.push(present);
  }
  const expected=Buffer.alloc(words.length*8);words.forEach((n,i)=>expected.writeBigInt64LE(BigInt(n),i*8));
  return {files:[{name:'PHASE1.WAD',bytes:phase1},{name:'PHASE2.WAD',bytes:phase2},{name:'BANK.BIN',bytes:expected}],reference:{pc,
    idRevision:id.revision,idFiles:id.files.filter(f=>f.path.endsWith('/sounds.c')||f.path.endsWith('/sounds.h')),
    cases:rows.length*2,present:counts,lookupPolicy:'Unchanged PC-speaker lookup uses each effect name; sampled-sound link resolution is not inferred.',disabled:rows.filter(r=>r.id&&!r.index)}};
}
