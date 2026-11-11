#define TM_FLOOR_LOWER		0
#define TM_FLOOR_LOWEST		1
#define TM_FLOOR_TURBO_LOWER	2
#define TM_FLOOR_RAISE		3
#define TM_FLOOR_CRUSH		4
#define TM_FLOOR_TURBO_RAISE	5
#define TM_FLOOR_NEAREST		6
#define TM_FLOOR_RAISE_24	7
#define TM_FLOOR_RAISE_512	8
#define TM_FLOOR_RAISE_CHANGE	9
#define TM_FLOOR_TEXTURE	10
#define TM_FLOOR_LOWER_CHANGE	11
#define TM_FLOOR_DONUT		12
#define TM_FLOOR_SPEED		65536

I64 SectorFloorMin(Sectors *tmps,I64 sector)
{
  Map *map=tmps->motion->world->map;
  SectorArea *area=tmps->area+sector;
  I64 i,n,res=map->sector[sector].floor;
  for (i=0;i<area->cnt;i++) {
    n=SectorOther(tmps,sector,tmps->lines[area->first+i]);
    if (n>=0) res=MinI64(res,map->sector[n].floor);
  }
  return res;
}

I64 SectorFloorMax(Sectors *tmps,I64 sector)
{//All signed heights are valid; isolated sectors keep their own height.
  Map *map=tmps->motion->world->map;
  SectorArea *area=tmps->area+sector;
  I64 i,n,res=-0x80000000;
  Bool found=FALSE;
  for (i=0;i<area->cnt;i++) {
    n=SectorOther(tmps,sector,tmps->lines[area->first+i]);
    if (n>=0) {res=MaxI64(res,map->sector[n].floor); found=TRUE;}
  }
  if (!found) res=map->sector[sector].floor;
  return res;
}

I64 SectorFloorNext(Sectors *tmps,I64 sector)
{//Find the nearest higher floor without a fixed adjoining-sector array.
  Map *map=tmps->motion->world->map;
  SectorArea *area=tmps->area+sector;
  I64 i,n,old=map->sector[sector].floor,res=0x7FFFFFFF;
  Bool found=FALSE;
  for (i=0;i<area->cnt;i++) {
    n=SectorOther(tmps,sector,tmps->lines[area->first+i]);
    if (n>=0 && map->sector[n].floor>old) {
      res=MinI64(res,map->sector[n].floor); found=TRUE;
    }
  }
  if (!found) res=old;
  return res;
}

I64 SectorLowerTex(Sectors *tmps,I64 sector)
{//Only texture metadata is read; a floor trigger does not decode images.
  Map *map=tmps->motion->world->map;
  SectorArea *area=tmps->area+sector;
  Graphics *graphics=tmps->graphics;
  Line *line;
  U8 *name;
  I64 i,j,n,res=0x7FFFFFFF;
  Bool found=FALSE;
  if (!graphics || !graphics->tex_cnt) throw('Texture');
  for (i=0;i<area->cnt;i++) {
    line=map->line+tmps->lines[area->first+i];
    if (line->flags&4 && line->side[1]!=0xFFFF)
      for (j=0;j<2;j++) {
	name=map->side[line->side[j]].lower;
	n=0;
	if (*name!='-') n=TextureFind(graphics,name);
	if (n<0) throw('Texture');
	res=MinI64(res,graphics->texture[n].def->height*65536); found=TRUE;
      }
  }
  if (!found) res=0;
  return res;
}

Mover *FloorStart(Sectors *tmps,I64 sector,I64 direction,I64 speed,I64 dest,
	I64 type,Bool crush=FALSE)
{
  Mover *tmpm;
  if (!(direction==-1 || direction==1) || !(0<speed<=0x7FFFFFFF) ||
	!(0<=type<=TM_FLOOR_DONUT)) throw('Floor');
  if (!(tmpm=MoverNew(tmps,sector,TM_MOVER_FLOOR))) return NULL;
  tmpm->type=type; tmpm->direction=direction; tmpm->speed=speed;
  tmpm->high=ClampI64(dest,-0x80000000,0x7FFFFFFF); tmpm->crush=crush;
  return tmpm;
}

U0 FloorTick(Sectors *tmps,Mover *tmpm)
{
  Sector *sector=tmps->motion->world->map->sector+tmpm->sector;
  I64 res;
  if (!tmpm->active || tmpm->kind!=TM_MOVER_FLOOR) return;
  res=SectorMove(tmps,tmpm->sector,tmpm->speed,tmpm->high,
	tmpm->crush,FALSE,tmpm->direction);
  if (!(tmps->motion->world->tic&7)) SectorSnd(tmps,tmpm->sector,TM_SFX_STNMOV);
  if (res==TM_PLANE_PAST) {
    if (tmpm->type==TM_FLOOR_DONUT && tmpm->direction==1 ||
	  tmpm->type==TM_FLOOR_LOWER_CHANGE && tmpm->direction==-1) {
      MemCpy(sector->floor_name,tmpm->texture,8);
      sector->special=tmpm->new_special;
    }
    MoverFinish(tmps,tmpm); SectorSnd(tmps,tmpm->sector,TM_SFX_PSTOP);
  }
}

Mover *FloorNew(Sectors *tmps,I64 sector,I64 type,I64 line=-1)
{//Compute destinations before publishing the controller or changing textures.
  Map *map=tmps->motion->world->map;
  Sector *tmps1,*tmps2;
  SectorArea *area;
  Mover *tmpm;
  I64 i,n,source=sector,dir=1,speed=TM_FLOOR_SPEED,dest;
  Bool crush=FALSE;
  if (!(0<=sector<map->sector_cnt) || !(0<=type<=TM_FLOOR_LOWER_CHANGE))
    throw('Floor');
  if (tmps->area[sector].mover) return NULL;
  tmps1=map->sector+sector; area=tmps->area+sector; dest=tmps1->floor;
  switch (type) {
    case TM_FLOOR_LOWER:
    case TM_FLOOR_TURBO_LOWER:
      dir=-1; dest=SectorFloorMax(tmps,sector);
      if (type==TM_FLOOR_TURBO_LOWER) {
	speed*=4;
	if (dest!=tmps1->floor) dest+=8*65536;
      }
      break;
    case TM_FLOOR_LOWEST:
    case TM_FLOOR_LOWER_CHANGE:
      dir=-1; dest=SectorFloorMin(tmps,sector);
      if (type==TM_FLOOR_LOWER_CHANGE)
	for (i=0;i<area->cnt;i++) {
	  n=SectorOther(tmps,sector,tmps->lines[area->first+i]);
	  if (n>=0 && map->sector[n].floor==dest) {source=n; break;}
	}
      break;
    case TM_FLOOR_RAISE:
    case TM_FLOOR_CRUSH:
      dest=MinI64(SectorCeilMin(tmps,sector),tmps1->ceil);
      if (type==TM_FLOOR_CRUSH) {crush=TRUE; dest-=8*65536;}
      break;
    case TM_FLOOR_TURBO_RAISE:
    case TM_FLOOR_NEAREST:
      dest=SectorFloorNext(tmps,sector);
      if (type==TM_FLOOR_TURBO_RAISE) speed*=4;
      break;
    case TM_FLOOR_RAISE_24:
    case TM_FLOOR_RAISE_CHANGE:
      dest+=24*65536;
      if (type==TM_FLOOR_RAISE_CHANGE) {
	if (!(0<=line<map->line_cnt)) throw('Line');
	source=map->side[map->line[line].side[0]].sector;
      }
      break;
    case TM_FLOOR_RAISE_512:
      dest+=512*65536;
      break;
    case TM_FLOOR_TEXTURE:
      dest+=SectorLowerTex(tmps,sector);
      break;
  }
  tmpm=FloorStart(tmps,sector,dir,speed,dest,type,crush);
  tmps2=map->sector+source;
  if (type==TM_FLOOR_RAISE_CHANGE) {
    MemCpy(tmps1->floor_name,tmps2->floor_name,8);
    tmps1->special=tmps2->special;
  }
  if (type==TM_FLOOR_LOWER_CHANGE) {
    MemCpy(tmpm->texture,tmps2->floor_name,8);
    tmpm->new_special=tmps2->special;
  }
  return tmpm;
}

Bool FloorTag(Sectors *tmps,I64 line,I64 type)
{
  Map *map=tmps->motion->world->map;
  I64 i;
  Bool res=FALSE;
  if (!(0<=line<map->line_cnt)) return FALSE;
  for (i=0;i<map->sector_cnt;i++)
    if (map->sector[i].tag==map->line[line].tag)
      if (FloorNew(tmps,i,type,line)) res=TRUE;
  return res;
}

Bool FloorStairs(Sectors *tmps,I64 line,Bool turbo=FALSE)
{//Follow front-to-back edges with the same flat; ownership stops cycles.
  Map *map=tmps->motion->world->map;
  SectorArea *area;
  Line *tmpl;
  I64 i,j,n,back,height,speed=TM_FLOOR_SPEED/4,step=8*65536;
  U8 texture[8];
  Bool res=FALSE,found;
  if (!(0<=line<map->line_cnt)) return FALSE;
  if (turbo) {speed=TM_FLOOR_SPEED*4; step=16*65536;}
  for (i=0;i<map->sector_cnt;i++)
    if (map->sector[i].tag==map->line[line].tag && !tmps->area[i].mover) {
      n=i; height=map->sector[n].floor+step;
      MemCpy(texture,map->sector[n].floor_name,8);
      FloorStart(tmps,n,1,speed,height,TM_FLOOR_RAISE); res=TRUE;
      do {
	area=tmps->area+n; found=FALSE;
	for (j=0;j<area->cnt;j++) {
	  tmpl=map->line+tmps->lines[area->first+j];
	  if (tmpl->flags&4 && tmpl->side[1]!=0xFFFF &&
		map->side[tmpl->side[0]].sector==n) {
	    back=map->side[tmpl->side[1]].sector;
	    if (!MemCmp(map->sector[back].floor_name,texture,8)) {
	      height+=step;
	      if (!tmps->area[back].mover) {
		FloorStart(tmps,back,1,speed,height,TM_FLOOR_RAISE);
		n=back; found=TRUE; break;
	      }
	    }
	  }
	}
      } while (found);
    }
  return res;
}

Bool FloorDonut(Sectors *tmps,I64 line)
{//The hole and ring share the outer floor's height; busy rings stay owned.
  Map *map=tmps->motion->world->map;
  SectorArea *area;
  Mover *tmpm;
  I64 i,j,n,ring,outer;
  Bool res=FALSE;
  if (!(0<=line<map->line_cnt)) return FALSE;
  for (i=0;i<map->sector_cnt;i++)
    if (map->sector[i].tag==map->line[line].tag && !tmps->area[i].mover) {
      ring=-1; area=tmps->area+i;
      for (j=0;j<area->cnt;j++) {
	n=SectorOther(tmps,i,tmps->lines[area->first+j]);
	if (n>=0) {ring=n; break;}
      }
      if (ring>=0 && !tmps->area[ring].mover) {
	outer=-1; area=tmps->area+ring;
	for (j=0;j<area->cnt;j++) {
	  n=SectorOther(tmps,ring,tmps->lines[area->first+j]);
	  if (n>=0 && n!=i) {outer=n; break;}
	}
	if (outer>=0) {
	  tmpm=FloorStart(tmps,ring,1,TM_FLOOR_SPEED/2,
		map->sector[outer].floor,TM_FLOOR_DONUT);
	  MemCpy(tmpm->texture,map->sector[outer].floor_name,8);
	  tmpm->new_special=0;
	  try {
	    if (FloorStart(tmps,i,-1,TM_FLOOR_SPEED/2,
		  map->sector[outer].floor,TM_FLOOR_LOWER)) res=TRUE;
	    else MoverFinish(tmps,tmpm);
	  } catch {
	    MoverFinish(tmps,tmpm);
	  }
	}
      }
    }
  return res;
}
