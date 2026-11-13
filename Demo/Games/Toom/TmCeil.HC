#define TM_CEIL_LOWER_FLOOR	0
#define TM_CEIL_RAISE_HIGHEST	1
#define TM_CEIL_LOWER_CRUSH	2
#define TM_CEIL_CRUSH_RAISE	3
#define TM_CEIL_FAST		4
#define TM_CEIL_SILENT		5
#define TM_CEIL_SPEED		65536

I64 SectorCeilMax(Sectors *tmps,I64 sector)
{
  Map *map=tmps->motion->world->map;
  SectorArea *area=tmps->area+sector;
  I64 i,n,res=-0x80000000;
  Bool found=FALSE;
  for (i=0;i<area->cnt;i++) {
    n=SectorOther(tmps,sector,tmps->lines[area->first+i]);
    if (n>=0) {res=MaxI64(res,map->sector[n].ceil); found=TRUE;}
  }
  if (!found) res=map->sector[sector].ceil;
  return res;
}

U0 CeilTick(Sectors *tmps,Mover *tmpm)
{
  I64 res;
  if (!tmpm->active || tmpm->kind!=TM_MOVER_CEIL || !tmpm->direction) return;
  if (tmpm->direction==1)
    res=SectorMove(tmps,tmpm->sector,tmpm->speed,tmpm->high,FALSE,TRUE,1);
  else
    res=SectorMove(tmps,tmpm->sector,tmpm->speed,tmpm->low,tmpm->crush,TRUE,-1);
  if (!(tmps->motion->world->tic&7) && tmpm->type!=TM_CEIL_SILENT)
    SectorSnd(tmps,tmpm->sector,TM_SFX_STNMOV);
  if (res==TM_PLANE_PAST) {
    if (tmpm->type<TM_CEIL_CRUSH_RAISE) MoverFinish(tmps,tmpm);
    else {
      if (tmpm->type==TM_CEIL_SILENT) SectorSnd(tmps,tmpm->sector,TM_SFX_PSTOP);
      if (tmpm->direction==-1 && tmpm->type!=TM_CEIL_FAST)
	tmpm->speed=TM_CEIL_SPEED;
      tmpm->direction=-tmpm->direction;
    }
  } else if (tmpm->direction==-1 && res==TM_PLANE_CRUSHED &&
	(tmpm->type==TM_CEIL_CRUSH_RAISE || tmpm->type==TM_CEIL_LOWER_CRUSH ||
	tmpm->type==TM_CEIL_SILENT)) tmpm->speed=TM_CEIL_SPEED/8;
}

Mover *CeilNew(Sectors *tmps,I64 sector,I64 type)
{
  Map *map=tmps->motion->world->map;
  Sector *tmps1;
  Mover *tmpm;
  if (!(0<=sector<map->sector_cnt) || !(0<=type<=TM_CEIL_SILENT))
    throw('Ceiling');
  if (tmps->area[sector].mover) return NULL;
  tmps1=map->sector+sector;
  tmpm=MoverNew(tmps,sector,TM_MOVER_CEIL);
  tmpm->type=type; tmpm->tag=tmps1->tag; tmpm->speed=TM_CEIL_SPEED;
  tmpm->low=tmps1->floor; tmpm->high=tmps1->ceil; tmpm->direction=-1;
  if (type!=TM_CEIL_LOWER_FLOOR) tmpm->low+=8*65536;
  tmpm->low=ClampI64(tmpm->low,-0x80000000,0x7FFFFFFF);
  if (type>=TM_CEIL_CRUSH_RAISE) tmpm->crush=TRUE;
  if (type==TM_CEIL_FAST) tmpm->speed*=2;
  if (type==TM_CEIL_RAISE_HIGHEST) {
    tmpm->high=SectorCeilMax(tmps,sector); tmpm->direction=1;
  }
  return tmpm;
}

Bool CeilStop(Sectors *tmps,I64 line)
{
  Map *map=tmps->motion->world->map;
  Mover *tmpm;
  Bool res=FALSE;
  if (!(0<=line<map->line_cnt)) return FALSE;
  for (tmpm=tmps->first;tmpm;tmpm=tmpm->next)
    if (tmpm->active && tmpm->kind==TM_MOVER_CEIL &&
	  tmpm->tag==map->line[line].tag && tmpm->direction) {
      tmpm->old_direction=tmpm->direction; tmpm->direction=0; res=TRUE;
    }
  return res;
}

Bool CeilTag(Sectors *tmps,I64 line,I64 type)
{
  Map *map=tmps->motion->world->map;
  Mover *tmpm;
  I64 i;
  Bool res=FALSE;
  if (!(0<=line<map->line_cnt)) return FALSE;
  if (TM_CEIL_CRUSH_RAISE<=type<=TM_CEIL_SILENT)
    for (tmpm=tmps->first;tmpm;tmpm=tmpm->next)
      if (tmpm->active && tmpm->kind==TM_MOVER_CEIL &&
	    tmpm->tag==map->line[line].tag && !tmpm->direction) {
	tmpm->direction=tmpm->old_direction; res=TRUE;
      }
  for (i=0;i<map->sector_cnt;i++)
    if (map->sector[i].tag==map->line[line].tag)
      if (CeilNew(tmps,i,type)) res=TRUE;
  return res;
}
