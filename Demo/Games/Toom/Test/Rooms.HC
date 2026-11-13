Map *RoomsNew(Bool specials=TRUE)
{
  I64 i;
  Map *map=CAlloc(sizeof(Map));
  map->vertex_cnt=10; map->line_cnt=7;
  if (specials) map->line_cnt=9; map->side_cnt=2;
  map->sector_cnt=2; map->subsector_cnt=2; map->node_cnt=1;
  map->vertex=CAlloc(10*sizeof(Vertex)); map->line=CAlloc(9*sizeof(Line));
  map->side=CAlloc(2*sizeof(Side)); map->sector=CAlloc(2*sizeof(Sector));
  map->node=CAlloc(sizeof(Node)); map->subsector_sector=CAlloc(2*sizeof(I64));
  map->vertex[0].x=-128; map->vertex[0].y=-128;
  map->vertex[1].y=-128;
  map->vertex[2].x=128; map->vertex[2].y=-128;
  map->vertex[3].x=128; map->vertex[3].y=128;
  map->vertex[4].y=128;
  map->vertex[5].x=-128; map->vertex[5].y=128;
  map->vertex[6].x=-4; map->vertex[6].y=-128;
  map->vertex[7].x=-4; map->vertex[7].y=128;
  map->vertex[8].x=4; map->vertex[8].y=-128;
  map->vertex[9].x=4; map->vertex[9].y=128;
  for (i=0;i<6;i++) {
    map->line[i].v1=(i+1)%6; map->line[i].v2=i;
    map->line[i].side[1]=0xFFFF;
  }
  map->line[6].v1=1; map->line[6].v2=4;
  map->line[7].v1=6; map->line[7].v2=7;
  map->line[8].v1=8; map->line[8].v2=9;
  for (i=6;i<map->line_cnt;i++) {
    map->line[i].flags=4; map->line[i].side[1]=1;
    map->line[i].special=97;
  }
  map->side[1].sector=1;
  map->sector[0].ceil=map->sector[1].ceil=128*65536;
  map->node[0].dy=256;
  map->node[0].child[0]=TM_NF_SUBSECTOR;
  map->node[0].child[1]=TM_NF_SUBSECTOR|1;
  map->subsector_sector[1]=1;
  map->blockmap_cnt=30; map->blockmap=CAlloc(60);
  map->blockmap[0]=map->blockmap[1]=-256;
  map->blockmap[2]=map->blockmap[3]=4;
  for (i=0;i<16;i++) map->blockmap[4+i]=20;
  for (i=0;i<map->line_cnt;i++) map->blockmap[20+i]=i;
  map->blockmap[20+map->line_cnt]=-1;
  return map;
}
