import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FreedoomRead,root} from './Assets.mjs';
import {WadRead,MapRead} from './Wad.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const bytes=FreedoomRead(),lumps=WadRead(bytes),values=[],max=(1n<<63n)-1n;
let sectors=0,edges=0;
for(let i=0;i<lumps.length;i++)if(/^E[1-4]M[1-9]$/.test(lumps[i].name)) {
  const map=MapRead(lumps,i);values.push(map.sectors.length);
  for(let n=0;n<map.sectors.length;n++) {
    const lines=[];let left=max,right=-max-1n,bottom=max,top=-max-1n;
    for(let j=0;j<map.lines.length;j++) {
      const line=map.lines[j],front=map.sides[line[5]].sector;
      const back=line[6]===65535?-1:map.sides[line[6]].sector;
      if(front===n||back===n) {
        const other=(line[2]&4)&&front!==back?(front===n?back:front):-1;
        lines.push(j,other);
        for(const vertex of [map.vertices[line[0]],map.vertices[line[1]]]) {
          const x=BigInt(vertex[0])*65536n,y=BigInt(vertex[1])*65536n;
          if(x<left)left=x;if(x>right)right=x;if(y<bottom)bottom=y;if(y>top)top=y;
        }
      }
    }
    values.push(lines.length/2,left,right,bottom,top,...lines);
    sectors++;edges+=lines.length/2;
  }
}
const records=Buffer.alloc(values.length*8);values.forEach((n,i)=>records.writeBigInt64LE(BigInt(n),i*8));
const source=['TmGlbls.HH','TmWad.HC','TmMap.HC','TmData.HH','TmClip.HC',
  'TmState.HC','TmMath.HC','TmWorld.HC','TmContact.HC','TmMove.HC','TmPath.HC',
  'TmSlide.HC','TmPlayer.HH','TmMotion.HC','TmDamage.HC','TmSector.HC']
  .map(n=>readFileSync(resolve(root,'games/Toom',n),'latin1')).join('\n')+`
I64 tm_sector_index_done=0,tm_sector_index_cnt=0,tm_sector_edge_cnt=0;
U0 TmSectorIndex()
{
  Wad *wad=WadNew("C:/ORACLE/FREEDOOM.WAD");
  Map *map;
  World *world;
  Motion *motion;
  Sectors *sectors;
  SectorArea *area;
  I64 i,j,k,used,size,*rows=FileRead("C:/ORACLE/INDEX.BIN",&size),*q=rows;
  U8 name[9];
  if (!rows) throw('Index');
  for (i=0;i<36;i++) {
    StrPrint(name,"E%dM%d",i/9+1,i%9+1);
    map=MapNew(wad,name); world=WorldNew(map,NULL); motion=MotionNew(world);
    used=Fs->data_heap->used_u8s; sectors=SectorsNew(motion);
    if (*q++!=map->sector_cnt) throw('Count');
    for (j=0;j<map->sector_cnt;j++) {
      area=sectors->area+j;
      if (area->cnt!=q[0] || area->left!=q[1] || area->right!=q[2] ||
            area->bottom!=q[3] || area->top!=q[4]) throw('Bounds');
      q+=5;
      for (k=0;k<area->cnt;k++,q+=2) {
        if (sectors->lines[area->first+k]!=q[0] ||
              SectorOther(sectors,j,q[0])!=q[1]) throw('Neighbor');
        tm_sector_edge_cnt++;
      }
      tm_sector_index_cnt++;
    }
    SectorsDel(sectors);
    if (Fs->data_heap->used_u8s!=used) throw('IndexMem');
    MotionDel(motion); WorldDel(world); MapDel(map);
  }
  if ((q(U8 *)-rows(U8 *))!=size) throw('Size');
  Free(rows); WadDel(wad); tm_sector_index_done=1;
  "INDEX %d SECTORS %d EDGES BAD 0\\n",tm_sector_index_cnt,tm_sector_edge_cnt;
}
TmSectorIndex;
`;
const files=[{name:'FREEDOOM.WAD',bytes},{name:'INDEX.BIN',bytes:records}];
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:180});
  console.log(JSON.stringify(result,null,2));
  assert.equal(result.results[0].except,'');
  assert.match(result.results[0].out,new RegExp(`INDEX ${sectors} SECTORS ${edges} EDGES BAD 0`));
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to the checkout with built HEMU dependencies.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  for(const file of files) {
    const id=h.gx.writeFile({path:`C:/ORACLE/${file.name}`,bytes:file.bytes});
    for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  await h.Exec(source);
  const done=h.gx.varFind('tm_sector_index_done');assert(done);assert.equal(h.gx.rd64(done),1);
  assert.equal(h.gx.rd64(h.gx.varFind('tm_sector_index_cnt')),sectors);
  assert.equal(h.gx.rd64(h.gx.varFind('tm_sector_edge_cnt')),edges);
  console.log(JSON.stringify({backend,sectors,edges,bad:0},null,2));
}
