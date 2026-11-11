#define TM_LIGHT_FLASH	0
#define TM_LIGHT_STROBE	1
#define TM_LIGHT_GLOW	2
#define TM_LIGHT_FIRE	3

class Light
{
  Thinker thinker;
  Light *next;
  I64 sector,kind,low,high,tics,dark,direction;
};

class Lights
{
  Sectors *sectors;
  Light *first,*last;
  Bool initialized;
};

I64 SectorLightMin(Sectors *tmps,I64 sector)
{
  Map *map=tmps->motion->world->map;
  SectorArea *area=tmps->area+sector;
  I64 i,other,res=map->sector[sector].light;
  for (i=0;i<area->cnt;i++)
    if ((other=SectorOther(tmps,sector,tmps->lines[area->first+i]))>=0)
      res=MinI64(res,map->sector[other].light);
  return res;
}

I64 SectorLightMax(Sectors *tmps,I64 sector)
{
  Map *map=tmps->motion->world->map;
  SectorArea *area=tmps->area+sector;
  I64 i,other,res=0;
  for (i=0;i<area->cnt;i++)
    if ((other=SectorOther(tmps,sector,tmps->lines[area->first+i]))>=0)
      res=MaxI64(res,map->sector[other].light);
  return res;
}

U0 LightsDel(Lights *tmpl)
{
  Light *light,*next;
  if (tmpl) {
    if (tmpl->sectors->motion->world->thinking) throw('Thinking');
    for (light=tmpl->first;light;light=next) {
      next=light->next; QueRem(&light->thinker); Free(light);
    }
    Free(tmpl);
  }
}

Lights *LightsNew(Sectors *sectors)
{
  Lights *tmpl=CAlloc(sizeof(Lights));
  tmpl->sectors=sectors;
  return tmpl;
}

Light *LightNew(Lights *tmpl,I64 sector,I64 kind,I64 dark=35,Bool sync=FALSE)
{//Lights can coexist with plane movers and keep creation order.
  Sectors *sectors=tmpl->sectors;
  World *world=sectors->motion->world;
  Light *light;
  if (!(0<=sector<world->map->sector_cnt) || !(0<=kind<=TM_LIGHT_FIRE) ||
	!(1<=dark<=I32_MAX)) throw('Light');
  light=CAlloc(sizeof(Light)); light->sector=sector; light->kind=kind;
  light->high=world->map->sector[sector].light;
  light->low=SectorLightMin(sectors,sector); light->direction=-1;
  switch (kind) {
    case TM_LIGHT_FLASH:
      light->tics=WorldRand(world)&64+1;
      break;
    case TM_LIGHT_STROBE:
      if (light->low==light->high) light->low=0;
      light->dark=dark; light->tics=1;
      if (!sync) light->tics=WorldRand(world)&7+1;
      break;
    case TM_LIGHT_FIRE:
      light->low+=16; light->tics=4;
      break;
  }
  if (tmpl->last) tmpl->last->next=light;
  else tmpl->first=light;
  tmpl->last=light; world->map->sector[sector].special=0;
  light->thinker.kind=TM_THINK_LIGHT;
  QueIns(&light->thinker,world->thinkers.last);
  return light;
}

U0 LightTick(Lights *tmpl,Light *light)
{
  World *world=tmpl->sectors->motion->world;
  Sector *sector=world->map->sector+light->sector;
  I64 amount;
  if (light->kind!=TM_LIGHT_GLOW && --light->tics) return;
  switch (light->kind) {
    case TM_LIGHT_FLASH:
      if (sector->light==light->high) {
	sector->light=light->low; light->tics=WorldRand(world)&7+1;
      } else {
	sector->light=light->high; light->tics=WorldRand(world)&64+1;
      }
      break;
    case TM_LIGHT_STROBE:
      if (sector->light==light->low) {
	sector->light=light->high; light->tics=5;
      } else {
	sector->light=light->low; light->tics=light->dark;
      }
      break;
    case TM_LIGHT_GLOW:
      sector->light+=8*light->direction;
      if (light->direction<0 && sector->light<=light->low ||
	    light->direction>0 && sector->light>=light->high) {
	sector->light-=8*light->direction; light->direction=-light->direction;
      }
      break;
    case TM_LIGHT_FIRE:
      amount=(WorldRand(world)&3)*16;
      if (sector->light-amount<light->low) sector->light=light->low;
      else sector->light=light->high-amount;
      light->tics=4;
      break;
  }
}

U0 LightsTick(Lights *tmpl)
{
  Light *light;
  for (light=tmpl->first;light;light=light->next) LightTick(tmpl,light);
}

U0 LightSectorInit(Lights *tmpl,I64 sector)
{//Sector four keeps its damage attribute after creating the fast strobe.
  Map *map=tmpl->sectors->motion->world->map;
  switch (map->sector[sector].special) {
    case 1: LightNew(tmpl,sector,TM_LIGHT_FLASH); break;
    case 2: LightNew(tmpl,sector,TM_LIGHT_STROBE,15); break;
    case 3: LightNew(tmpl,sector,TM_LIGHT_STROBE); break;
    case 4:
      LightNew(tmpl,sector,TM_LIGHT_STROBE,15); map->sector[sector].special=4;
      break;
    case 8: LightNew(tmpl,sector,TM_LIGHT_GLOW); break;
    case 12: LightNew(tmpl,sector,TM_LIGHT_STROBE,35,TRUE); break;
    case 13: LightNew(tmpl,sector,TM_LIGHT_STROBE,15,TRUE); break;
    case 17: LightNew(tmpl,sector,TM_LIGHT_FIRE); break;
  }
}

U0 LightsInit(Lights *tmpl)
{
  I64 i;
  if (tmpl->initialized) throw('Loaded');
  tmpl->initialized=TRUE;
  for (i=0;i<tmpl->sectors->motion->world->map->sector_cnt;i++)
    LightSectorInit(tmpl,i);
}

Bool LightStrobeTag(Lights *tmpl,I64 line)
{
  Sectors *sectors=tmpl->sectors;
  Map *map=sectors->motion->world->map;
  I64 i,tag;
  Bool res=FALSE;
  if (!(0<=line<map->line_cnt)) return FALSE;
  tag=map->line[line].tag;
  for (i=0;i<map->sector_cnt;i++)
    if (map->sector[i].tag==tag && !sectors->area[i].mover) {
      LightNew(tmpl,i,TM_LIGHT_STROBE); res=TRUE;
    }
  return res;
}

U0 LightTagOn(Sectors *tmps,I64 line,I64 bright)
{//A zero request reuses the first nonzero surrounding maximum, as originally.
  Map *map=tmps->motion->world->map;
  I64 i;
  if (!(0<=line<map->line_cnt) || !(0<=bright<=255)) return;
  for (i=0;i<map->sector_cnt;i++)
    if (map->sector[i].tag==map->line[line].tag) {
      if (!bright) bright=SectorLightMax(tmps,i);
      map->sector[i].light=bright;
    }
}

U0 LightTagOff(Sectors *tmps,I64 line)
{
  Map *map=tmps->motion->world->map;
  I64 i;
  if (!(0<=line<map->line_cnt)) return;
  for (i=0;i<map->sector_cnt;i++)
    if (map->sector[i].tag==map->line[line].tag)
      map->sector[i].light=SectorLightMin(tmps,i);
}
