import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FreedoomRead,root} from './Assets.mjs';
import {WadRead,MapRead,SubsectorAt} from './Wad.mjs';

assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the compiler checkout with the native oracle.');
const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,
  'tests/oracle/Qemu.mjs')));
const bytes=FreedoomRead(),lumps=WadRead(bytes),maps=[];
for (let i=0;i<lumps.length;i++) if (/^E[1-4]M[1-9]$/.test(lumps[i].name))
  maps.push(MapRead(lumps,i));
assert.equal(maps.length,36);
const queries=[];
for (const map of maps) {
  map.first=queries.length;
  const points=map.things.map(t=>t.slice(0,2));
  for (const node of map.nodes) {
    points.push(node.origin);
    points.push([node.origin[0]+0.5,node.origin[1]-0.5]);
  }
  for (const [x,y] of points) {
    const sub=SubsectorAt(map,x,y),[count,first]=map.subsectors[sub];
    assert(count>0);
    const seg=map.segs[first],line=map.lines[seg[3]],sector=map.sides[line[5+seg[4]]].sector;
    queries.push([x,y,sub,sector]);
  }
  map.end=queries.length;
}
const array=(type,name,values)=>`${type} ${name}[${values.length}]={\n`+
  values.map((v,i)=>(i&&i%16===0?'\n':'')+v).join(',')+'};\n';
let source=['TmGlbls.HH','TmWad.HC','TmMap.HC']
  .map(name=>readFileSync(resolve(root,'games/Toom',name),'latin1')).join('\n');
source+='F64 *tm_queries;I64 *tm_sectors;\n'+
  array('I64','tm_offsets',[...maps.map(m=>m.first),queries.length])+
  array('I64','tm_counts',maps.flatMap(m=>[m.vertices.length,m.lines.length,
    m.sides.length,m.sectors.length,m.segs.length,m.subsectors.length,
    m.nodes.length,m.things.length]));
source+=`
U0 TmTest()
{
  I64 i,j,n,q,bad=0,peak=0,old,first,size,offset,lump_offset;
  F64 start=tS;
  U8 name[9],buf[16];
  Wad *tmpw;
  Map *tmpm;
  tm_queries=FileRead("C:/ORACLE/QUERIES.BIN");
  tm_sectors=FileRead("C:/ORACLE/SECTORS.BIN");
  if (!tm_sectors || sizeof(SectorDisk)!=26) throw('Sectors');
  if (!tm_queries) throw('Queries');
  tmpw=WadNew("C:/ORACLE/FREEDOOM.WAD");
  if (!tmpw) throw('Wad');
  if (tmpw->cnt!=${lumps.length}) throw('Lumps');
  if (tmpw->read_bytes!=12+16*tmpw->cnt) throw('Eager');
  if (WadRead(tmpw,buf,-1,1) || WadRead(tmpw,buf,0,-1) ||
        WadRead(tmpw,buf,tmpw->size,1)) throw('Bounds');
  offset=0;
  for (i=0;i<36;i++) {
    StrPrint(name,"E%dM%d",i/9+1,i%9+1);
    tmpm=MapNew(tmpw,name);
    if (!tmpm) {"REJECT %s\\n",name; throw('Map');}
    n=i*8;
    if (tmpm->vertex_cnt!=tm_counts[n++] ||
        tmpm->line_cnt!=tm_counts[n++] ||
        tmpm->side_cnt!=tm_counts[n++] ||
        tmpm->sector_cnt!=tm_counts[n++] ||
        tmpm->seg_cnt!=tm_counts[n++] ||
        tmpm->subsector_cnt!=tm_counts[n++] ||
        tmpm->node_cnt!=tm_counts[n++] ||
        tmpm->thing_cnt!=tm_counts[n++]) throw('Counts');
    for (j=tm_offsets[i];j<tm_offsets[i+1];j++) {
      q=j*4;
      if (MapSubsector(tmpm,tm_queries[q],tm_queries[q+1])!=
            tm_queries[q+2] ||
          MapSector(tmpm,tm_queries[q],tm_queries[q+1])!=tm_queries[q+3])
        bad++;
    }
    for (j=0;j<tmpm->sector_cnt;j++,offset+=5)
      if (tmpm->sector[j].floor!=tm_sectors[offset]*65536 ||
          tmpm->sector[j].ceil!=tm_sectors[offset+1]*65536 ||
          tmpm->sector[j].light!=tm_sectors[offset+2] ||
          tmpm->sector[j].special!=tm_sectors[offset+3] ||
          tmpm->sector[j].tag!=tm_sectors[offset+4]) throw('Sector');
    peak=MaxI64(peak,tmpm->bytes);
    if (!i) {
      old=tmpm->line[0].v1; tmpm->line[0].v1=0xFFFF;
      if (MapChk(tmpm)) throw('Vertex');
      tmpm->line[0].v1=old;
      old=tmpm->seg[0].side; tmpm->seg[0].side=2;
      if (MapChk(tmpm)) throw('Side');
      tmpm->seg[0].side=old;
      old=tmpm->node[0].child[0]; tmpm->node[0].child[0]=0;
      if (MapChk(tmpm)) throw('Cycle');
      tmpm->node[0].child[0]=old;
      old=tmpm->blockmap[4]; tmpm->blockmap[4]=0;
      if (MapChk(tmpm)) throw('Block');
      tmpm->blockmap[4]=old;
      first=tmpm->lump+2; size=tmpw->dir[first].size;
      tmpw->dir[first].size--;
      if (MapNew(tmpw,name)) throw('Align');
      tmpw->dir[first].size=size;
      lump_offset=tmpw->dir[first].offset;
      tmpw->dir[first].offset=tmpw->size;
      if (MapNew(tmpw,name)) throw('Range');
      tmpw->dir[first].offset=lump_offset;
    }
    MapDel(tmpm);
  }
  "MAPS 36 QUERIES ${queries.length} BAD %d PEAK %d READ %d MS %.1f\\n",
        bad,peak,tmpw->read_bytes,(tS-start)*1000;
  WadDel(tmpw);
  Free(tm_queries); Free(tm_sectors);
  if (bad) throw('BSP');
}
TmTest;
`;
const queryBytes=Buffer.alloc(queries.length*32);
queries.flat().forEach((value,i)=>queryBytes.writeDoubleLE(value,i*8));
const sectorValues=maps.flatMap(m=>{const b=lumps[m.index+8].bytes;
  return m.sectors.flatMap((_,i)=>[b.readInt16LE(i*26),b.readInt16LE(i*26+2),
    b.readInt16LE(i*26+20),b.readUInt16LE(i*26+22),b.readUInt16LE(i*26+24)]);});
const sectorBytes=Buffer.alloc(sectorValues.length*8);
sectorValues.forEach((v,i)=>sectorBytes.writeBigInt64LE(BigInt(v),i*8));
const result=await QemuRun([Buffer.from(source,'latin1')],
  {files:[{name:'FREEDOOM.WAD',bytes},{name:'QUERIES.BIN',bytes:queryBytes},{name:'SECTORS.BIN',bytes:sectorBytes}],timeout:240});
console.log(JSON.stringify(result,null,2));
assert.equal(result.results.length,1);
assert.equal(result.results[0].except,'');
assert.match(result.results[0].out,new RegExp(`MAPS 36 QUERIES ${queries.length} BAD 0`));
