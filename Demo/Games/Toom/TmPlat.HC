#define TM_PLAT_PERPETUAL	0
#define TM_PLAT_DOWN_WAIT_UP	1
#define TM_PLAT_RAISE_CHANGE	2
#define TM_PLAT_NEAREST_CHANGE	3
#define TM_PLAT_BLAZE		4
#define TM_PLAT_SPEED		65536
#define TM_PLAT_WAIT		(3*TM_TICK_HZ)
#define TM_PLAT_STASIS		2

U0 PlatTick(Sectors *tmps,Mover *tmpm)
{
  Sector *sector=tmps->motion->world->map->sector+tmpm->sector;
  I64 res;
  if (!tmpm->active || tmpm->kind!=TM_MOVER_PLAT) return;
  switch (tmpm->direction) {
    case 1:
      res=SectorMove(tmps,tmpm->sector,tmpm->speed,tmpm->high,
	    tmpm->crush,FALSE,1);
      if ((tmpm->type==TM_PLAT_RAISE_CHANGE ||
	    tmpm->type==TM_PLAT_NEAREST_CHANGE) &&
	  !(tmps->motion->world->tic&7))
	SectorSnd(tmps,tmpm->sector,TM_SFX_STNMOV);
      if (res==TM_PLANE_CRUSHED && !tmpm->crush) {
	tmpm->delay=tmpm->wait; tmpm->direction=-1;
	SectorSnd(tmps,tmpm->sector,TM_SFX_PSTART);
      } else if (res==TM_PLANE_PAST) {
	tmpm->delay=tmpm->wait; tmpm->direction=0;
	SectorSnd(tmps,tmpm->sector,TM_SFX_PSTOP);
	if (tmpm->type!=TM_PLAT_PERPETUAL) MoverFinish(tmps,tmpm);
      }
      break;
    case -1:
      res=SectorMove(tmps,tmpm->sector,tmpm->speed,tmpm->low,FALSE,FALSE,-1);
      if (res==TM_PLANE_PAST) {
	tmpm->delay=tmpm->wait; tmpm->direction=0;
	SectorSnd(tmps,tmpm->sector,TM_SFX_PSTOP);
      }
      break;
    case 0:
      //A blocked zero-wait raise must not count down from zero forever.
      if (tmpm->delay>0) tmpm->delay--;
      if (!tmpm->delay) {
	tmpm->direction=-1;
	if (sector->floor==tmpm->low) tmpm->direction=1;
	SectorSnd(tmps,tmpm->sector,TM_SFX_PSTART);
      }
      break;
  }
}

Mover *PlatNew(Sectors *tmps,I64 sector,I64 type,I64 line=-1,I64 amount=0)
{//Even one-shot raises have a defined lower endpoint when obstructed.
  Map *map=tmps->motion->world->map;
  Sector *tmps1,*source=NULL;
  Mover *tmpm;
  I64 speed=TM_PLAT_SPEED,low,high,wait=TM_PLAT_WAIT,direction=-1,
	sound=TM_SFX_PSTART;
  if (!(0<=sector<map->sector_cnt) || !(0<=type<=TM_PLAT_BLAZE) ||
	!(0<=amount<=32767)) throw('Plat');
  if (tmps->area[sector].mover) return NULL;
  tmps1=map->sector+sector; low=high=tmps1->floor;
  switch (type) {
    case TM_PLAT_RAISE_CHANGE:
    case TM_PLAT_NEAREST_CHANGE:
      if (!(0<=line<map->line_cnt)) throw('Line');
      source=map->sector+map->side[map->line[line].side[0]].sector;
      speed/=2; wait=0; direction=1; sound=TM_SFX_STNMOV;
      high=tmps1->floor+amount*65536;
      if (type==TM_PLAT_NEAREST_CHANGE) high=SectorFloorNext(tmps,sector);
      break;
    case TM_PLAT_DOWN_WAIT_UP:
    case TM_PLAT_BLAZE:
      speed*=4;
      if (type==TM_PLAT_BLAZE) speed*=2;
      low=SectorFloorMin(tmps,sector);
      break;
    case TM_PLAT_PERPETUAL:
      low=SectorFloorMin(tmps,sector);
      high=MaxI64(SectorFloorMax(tmps,sector),tmps1->floor);
      break;
  }
  tmpm=MoverNew(tmps,sector,TM_MOVER_PLAT);
  tmpm->type=type; tmpm->speed=speed; tmpm->low=low;
  tmpm->high=ClampI64(high,-0x80000000,0x7FFFFFFF);
  tmpm->wait=wait; tmpm->direction=direction; tmpm->tag=tmps1->tag;
  if (type==TM_PLAT_PERPETUAL) {
    tmpm->direction=1;
    if (WorldRand(tmps->motion->world)&1) tmpm->direction=-1;
  }
  if (source) MemCpy(tmps1->floor_name,source->floor_name,8);
  if (type==TM_PLAT_NEAREST_CHANGE) tmps1->special=0;
  SectorSnd(tmps,sector,sound);
  return tmpm;
}

Bool PlatStop(Sectors *tmps,I64 line)
{
  Map *map=tmps->motion->world->map;
  Mover *tmpm;
  Bool res=FALSE;
  if (!(0<=line<map->line_cnt)) return FALSE;
  for (tmpm=tmps->first;tmpm;tmpm=tmpm->next)
    if (tmpm->active && tmpm->kind==TM_MOVER_PLAT &&
	  tmpm->tag==map->line[line].tag && tmpm->direction!=TM_PLAT_STASIS) {
      tmpm->old_direction=tmpm->direction; tmpm->direction=TM_PLAT_STASIS;
      res=TRUE;
    }
  return res;
}

Bool PlatTag(Sectors *tmps,I64 line,I64 type,I64 amount=0)
{
  Map *map=tmps->motion->world->map;
  Mover *tmpm;
  I64 i;
  Bool res=FALSE;
  if (!(0<=line<map->line_cnt)) return FALSE;
  if (type==TM_PLAT_PERPETUAL)
    for (tmpm=tmps->first;tmpm;tmpm=tmpm->next)
      if (tmpm->active && tmpm->kind==TM_MOVER_PLAT &&
	    tmpm->tag==map->line[line].tag && tmpm->direction==TM_PLAT_STASIS) {
	tmpm->direction=tmpm->old_direction; res=TRUE;
      }
  for (i=0;i<map->sector_cnt;i++)
    if (map->sector[i].tag==map->line[line].tag)
      if (PlatNew(tmps,i,type,line,amount)) res=TRUE;
  return res;
}
