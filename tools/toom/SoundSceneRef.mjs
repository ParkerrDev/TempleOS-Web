import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {FreedoomRead,root} from './Assets.mjs';
import {BrainMaps} from './BrainMaps.mjs';
import {WadRead,MapRead} from './Wad.mjs';

export async function SoundSceneReference() {
  const manifest=JSON.parse(readFileSync(new URL('source/collision.json',import.meta.url))),
    file=manifest.files.find(f=>f.path.endsWith('/p_setup.c')),path=resolve(root,'tools/toom/source/p_setup.c');
  assert(file);
  if(!existsSync(path)) {
    const response=await fetch(`https://raw.githubusercontent.com/id-Software/DOOM/${manifest.revision}/${file.path}`);
    assert(response.ok);writeFileSync(path,Buffer.from(await response.arrayBuffer()));
  }
  const bytes=readFileSync(path);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
  const assignments=bytes.toString('ascii').match(/sector->soundorg\.x\s*=\s*[^;]+;\s*sector->soundorg\.y\s*=\s*[^;]+;/);
  assert(assignments);
  const phase1=FreedoomRead(),{bytes:phase2}=await BrainMaps(),maps=[],boxes=[];
  for(const [phase,wad]of [[1,phase1],[2,phase2]]) {
    const lumps=WadRead(wad);
    for(let i=0;i<lumps.length;i++)if(/^(E[1-4]M[1-9]|MAP\d\d)$/.test(lumps[i].name)) {
      const map=MapRead(lumps,i),bounds=map.sectors.map(()=>[Infinity,-Infinity,Infinity,-Infinity]);
      for(const line of map.lines) {
        const sectors=[...new Set([line[5],line[6]].filter(s=>s!==65535).map(s=>map.sides[s].sector))];
        for(const sector of sectors)for(const vertex of [map.vertices[line[0]],map.vertices[line[1]]]) {
          const b=bounds[sector],x=vertex[0]*65536,y=vertex[1]*65536;
          b[0]=Math.min(b[0],x);b[1]=Math.max(b[1],x);b[2]=Math.min(b[2],y);b[3]=Math.max(b[3],y);
        }
      }
      for(const b of bounds) {
        assert(b.every(Number.isFinite),'The fixture must explicitly classify empty sectors.');
        for(const n of [b[0]+b[1],b[2]+b[3]])assert(n>=-2147483648&&n<=2147483647,'Original signed addition would overflow.');
        boxes.push(b);
      }
      maps.push({phase,name:map.name,sectors:bounds.length});
    }
  }
  const c=`#include <stdio.h>
#include <stdint.h>
#define BOXLEFT 0
#define BOXRIGHT 1
#define BOXBOTTOM 2
#define BOXTOP 3
typedef struct {struct {int32_t x,y;} soundorg;} sector_t;
static void Origin(int32_t *bbox,sector_t *sector){${assignments[0]}}
int main(void){int32_t b[4];sector_t sector;while(scanf("%d%d%d%d",b,b+1,b+2,b+3)==4){Origin(b,&sector);printf("%d %d\\n",sector.soundorg.x,sector.soundorg.y);}return 0;}`;
  const dir=mkdtempSync(join(tmpdir(),'toom-sound-origin-'));let points;
  try {
    writeFileSync(join(dir,'ref.c'),c);execFileSync('cc',['-std=c99','-O2','-fsanitize=undefined',join(dir,'ref.c'),'-o',join(dir,'ref')]);
    points=execFileSync(join(dir,'ref'),{input:boxes.map(b=>b.join(' ')).join('\n'),maxBuffer:4*1024*1024}).toString().trim().split('\n').map(l=>l.split(' ').map(Number));
  } finally {rmSync(dir,{recursive:true,force:true});}
  assert.equal(points.length,boxes.length);
  const words=[maps.length];let at=0;
  for(const map of maps) {
    words.push(map.phase,map.name.startsWith('E')?Number(map.name[1]):0,Number(map.name.slice(-2).replace('M','')),map.sectors);
    for(let i=0;i<map.sectors;i++)words.push(...points[at++]);
  }
  const expected=Buffer.alloc(words.length*8);words.forEach((n,i)=>expected.writeBigInt64LE(BigInt(n),i*8));
  return {files:[{name:'PHASE1.WAD',bytes:phase1},{name:'PHASE2.WAD',bytes:phase2},{name:'ORIGINS.BIN',bytes:expected}],
    reference:{repository:manifest.repository,revision:manifest.revision,...file,maps:maps.length,sectors:boxes.length,
      scope:'The two unchanged P_GroupLines soundorg assignments run as C with UBSan; an independent WAD reader supplies edge bounds. All official sector additions are in the defined signed32-bit range.'}};
}
