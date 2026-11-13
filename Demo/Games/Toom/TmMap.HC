U0 MapDel(Map *tmpm)
{
  if (tmpm) {
    Free(tmpm->vertex);
    Free(tmpm->line);
    Free(tmpm->side);
    Free(tmpm->sector);
    Free(tmpm->seg);
    Free(tmpm->subsector);
    Free(tmpm->subsector_sector);
    Free(tmpm->node);
    Free(tmpm->thing);
    Free(tmpm->blockmap);
    Free(tmpm->reject);
    Free(tmpm);
  }
}

U8 *MapRead(Wad *tmpw,Map *tmpm,I64 n,U8 *name,I64 size,I64 *_cnt)
{//A map's records follow its marker in a fixed order.
  Lump *tmpl;
  U8 *res;
  n+=tmpm->lump;
  if (!(0<=n<tmpw->cnt)) return NULL;
  tmpl=tmpw->dir+n;
  if (!LumpName(tmpl->name,name) || tmpl->size%size) return NULL;
  if (res=LumpRead(tmpw,n)) {
    *_cnt=tmpl->size/size;
    tmpm->bytes+=tmpl->size;
  }
  return res;
}

Bool MapSectorsRead(Wad *tmpw,Map *tmpm)
{//The WAD has integer map units; live heights use Q16 like actor positions.
  SectorDisk *src;
  Sector *dst;
  I64 i;
  if (!(src=MapRead(tmpw,tmpm,8,"SECTORS",sizeof(SectorDisk),
	&tmpm->sector_cnt))) return FALSE;
  try {
    tmpm->sector=MAlloc(tmpm->sector_cnt*sizeof(Sector));
    for (i=0,dst=tmpm->sector;i<tmpm->sector_cnt;i++,dst++) {
      dst->floor=src[i].floor*65536; dst->ceil=src[i].ceil*65536;
      MemCpy(dst->floor_name,src[i].floor_name,8);
      MemCpy(dst->ceil_name,src[i].ceil_name,8);
      dst->light=src[i].light; dst->special=src[i].special; dst->tag=src[i].tag;
    }
    tmpm->bytes+=(sizeof(Sector)-sizeof(SectorDisk))*tmpm->sector_cnt;
  } catch {
    Free(src);
  }
  Free(src);
  return TRUE;
}

Bool BlockmapChk(Map *tmpm)
{//Each block ends in -1; offsets and linedefs must stay in the lump.
  I64 i,j,n,offset,line;
  U16 *src=tmpm->blockmap;
  if (tmpm->blockmap_cnt<4) return FALSE;
  n=src[2]*src[3];
  if (!src[2] || !src[3] || n>tmpm->blockmap_cnt-4) return FALSE;
  for (i=0;i<n;i++) {
    offset=src[4+i];
    if (!(4+n<=offset<tmpm->blockmap_cnt) || src[offset])
      return FALSE;
    j=offset+1;
    while (j<tmpm->blockmap_cnt && src[j]!=0xFFFF) {
      line=src[j++];
      if (line>=tmpm->line_cnt) return FALSE;
    }
    if (j==tmpm->blockmap_cnt) return FALSE;
  }
  return TRUE;
}

Bool MapChk(Map *tmpm)
{//Validate every index before the renderer or simulation can dereference it.
  I64 i,j,k;
  Line *tmpl;
  Seg *tmps;
  Subsector *tmpss;
  Node *tmpn;
  if (!tmpm->vertex_cnt || !tmpm->line_cnt || !tmpm->side_cnt ||
	!tmpm->sector_cnt || !tmpm->seg_cnt || !tmpm->subsector_cnt ||
	tmpm->subsector_cnt>TM_NF_SUBSECTOR ||
	tmpm->node_cnt>=TM_NF_SUBSECTOR)
    return FALSE;
  for (i=0;i<tmpm->line_cnt;i++) {
    tmpl=tmpm->line+i;
    if (tmpl->v1>=tmpm->vertex_cnt || tmpl->v2>=tmpm->vertex_cnt ||
	tmpl->side[0]>=tmpm->side_cnt ||
	tmpl->side[1]!=0xFFFF && tmpl->side[1]>=tmpm->side_cnt)
      return FALSE;
  }
  for (i=0;i<tmpm->side_cnt;i++)
    if (tmpm->side[i].sector>=tmpm->sector_cnt) return FALSE;
  for (i=0;i<tmpm->seg_cnt;i++) {
    tmps=tmpm->seg+i;
    if (tmps->v1>=tmpm->vertex_cnt || tmps->v2>=tmpm->vertex_cnt ||
	tmps->line>=tmpm->line_cnt || tmps->side>1)
      return FALSE;
    if (tmpm->line[tmps->line].side[tmps->side]==0xFFFF) return FALSE;
  }
  for (i=0;i<tmpm->subsector_cnt;i++) {
    tmpss=tmpm->subsector+i;
    if (!tmpss->cnt || tmpss->first+tmpss->cnt>tmpm->seg_cnt)
      return FALSE;
    //Self-referencing lines need not all name the subsector's sector.
    tmps=tmpm->seg+tmpss->first;
    k=tmpm->line[tmps->line].side[tmps->side];
    tmpm->subsector_sector[i]=tmpm->side[k].sector;
  }
  for (i=0;i<tmpm->node_cnt;i++) {
    tmpn=tmpm->node+i;
    if (!tmpn->dx && !tmpn->dy) return FALSE;
    for (j=0;j<2;j++) {
      k=tmpn->child[j];
      if (k&TM_NF_SUBSECTOR) {
	if (k&~TM_NF_SUBSECTOR>=tmpm->subsector_cnt) return FALSE;
      } else if (k>=i) //BSP children precede parents, so cycles cannot occur.
	return FALSE;
    }
  }
  if (!tmpm->node_cnt && tmpm->subsector_cnt!=1) return FALSE;
  return BlockmapChk(tmpm);
}

Map *MapNew(Wad *tmpw,U8 *name)
{//Build privately; a failed level load cannot damage the active level.
  Map *tmpm=CAlloc(sizeof(Map));
  Bool valid=FALSE;
  try {
    tmpm->lump=LumpFind(tmpw,name);
    if (tmpm->lump<0) goto mn_fail;
    if (!(tmpm->thing=MapRead(tmpw,tmpm,1,"THINGS",sizeof(Thing),
	  &tmpm->thing_cnt))) goto mn_fail;
    if (!(tmpm->line=MapRead(tmpw,tmpm,2,"LINEDEFS",sizeof(Line),
	  &tmpm->line_cnt))) goto mn_fail;
    if (!(tmpm->side=MapRead(tmpw,tmpm,3,"SIDEDEFS",sizeof(Side),
	  &tmpm->side_cnt))) goto mn_fail;
    if (!(tmpm->vertex=MapRead(tmpw,tmpm,4,"VERTEXES",sizeof(Vertex),
	  &tmpm->vertex_cnt))) goto mn_fail;
    if (!(tmpm->seg=MapRead(tmpw,tmpm,5,"SEGS",sizeof(Seg),
	  &tmpm->seg_cnt))) goto mn_fail;
    if (!(tmpm->subsector=MapRead(tmpw,tmpm,6,"SSECTORS",sizeof(Subsector),
	  &tmpm->subsector_cnt))) goto mn_fail;
    if (!(tmpm->node=MapRead(tmpw,tmpm,7,"NODES",sizeof(Node),
	  &tmpm->node_cnt))) goto mn_fail;
    if (!MapSectorsRead(tmpw,tmpm)) goto mn_fail;
    if (!(tmpm->reject=MapRead(tmpw,tmpm,9,"REJECT",1,
	  &tmpm->reject_size))) goto mn_fail;
    if (!(tmpm->blockmap=MapRead(tmpw,tmpm,10,"BLOCKMAP",sizeof(I16),
	  &tmpm->blockmap_cnt))) goto mn_fail;
    tmpm->subsector_sector=CAlloc(tmpm->subsector_cnt*sizeof(I64));
    tmpm->bytes+=tmpm->subsector_cnt*sizeof(I64);
    if (!MapChk(tmpm)) goto mn_fail;
    valid=TRUE;
mn_fail:;
  } catch {
    MapDel(tmpm);
  }
  if (valid) return tmpm;
  MapDel(tmpm);
  return NULL;
}

I64 NodeSide(Node *tmpn,F64 x,F64 y)
{//Axis-aligned partitions have an explicit on-line side convention.
  if (!tmpn->dx) {
    if (x<=tmpn->x) return tmpn->dy>0;
    return tmpn->dy<0;
  }
  if (!tmpn->dy) {
    if (y<=tmpn->y) return tmpn->dx<0;
    return tmpn->dx>0;
  }
  return (y-tmpn->y)*tmpn->dx>=(x-tmpn->x)*tmpn->dy;
}

I64 MapSubsector(Map *tmpm,F64 x,F64 y)
{//Walk the original BSP; a grid floor map is neither built nor needed.
  I64 n=tmpm->node_cnt-1,side;
  Node *tmpn;
  if (n<0) return 0;
  while (!(n&TM_NF_SUBSECTOR)) {
    tmpn=tmpm->node+n;
    side=NodeSide(tmpn,x,y);
    n=tmpn->child[side];
  }
  return n&~TM_NF_SUBSECTOR;
}

I64 MapSector(Map *tmpm,F64 x,F64 y)
{
  return tmpm->subsector_sector[MapSubsector(tmpm,x,y)];
}

Bool SectorSky(Sector *tmps)
{
  return !tmps->ceil_name[6] && !MemCmp(tmps->ceil_name,"F_SKY1",6);
}
