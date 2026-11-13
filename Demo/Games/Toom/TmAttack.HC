#define TM_HIT_NONE	0
#define TM_HIT_WALL	1
#define TM_HIT_ACTOR	2
#define TM_HIT_SKY	3

class Attack
{
  World *world;
  Path *path;
  I64 x,y,z,dx,dy,range,slope,target,line,kind,special_cnt,special_cap,*special;
};

U0 AttackDel(Attack *tmpa)
{
  if (tmpa) {
    PathDel(tmpa->path); Free(tmpa->special); Free(tmpa);
  }
}

Attack *AttackNew(World *tmpw)
{//A reusable trace borrows its level; apply game effects after collecting.
  Attack *tmpa=CAlloc(sizeof(Attack));
  tmpa->world=tmpw;
  try {
    tmpa->path=PathNew(tmpw);
    tmpa->special_cap=16; tmpa->special=MAlloc(16*sizeof(I64));
  } catch {
    AttackDel(tmpa);
  }
  return tmpa;
}

Bool AttackRay(Attack *tmpa,Actor *source,I64 angle,I64 range)
{
  tmpa->target=tmpa->kind=tmpa->special_cnt=0; tmpa->line=-1;
  tmpa->x=source->x; tmpa->y=source->y;
  tmpa->z=source->z+source->height>>1+8*65536;
  tmpa->range=range; tmpa->dx=tmpa->dy=0;
  if (!source->active || !(0<range<=0x7FFFFFFF)) return FALSE;
  tmpa->dx=FixedMul(range,AngleCos(tmpa->world->data,angle));
  tmpa->dy=FixedMul(range,AngleSin(tmpa->world->data,angle));
  return PathRun(tmpa->path,tmpa->x,tmpa->y,tmpa->x+tmpa->dx,tmpa->y+tmpa->dy);
}

Bool AttackAim(Attack *tmpa,Actor *source,I64 angle,I64 range)
{//Portals narrow the vertical cone before selecting a shootable actor.
  World *tmpw=tmpa->world;
  Path *tmpp=tmpa->path;
  I64 i,top=40960,bottom=-40960,floor,ceil,distance,slope,lo,hi;
  Intercept *hit;
  ClipLine *line;
  Sector *front,*back;
  Actor *target;
  tmpa->slope=0;
  if (!AttackRay(tmpa,source,angle,range)) return FALSE;
  for (i=0;i<tmpp->cnt;i++) {
    hit=tmpp->hit+i; distance=FixedMul(range,hit->fraction);
    if (hit->line>=0) {
      line=tmpw->collision->line+hit->line;
      if (line->back<0) return FALSE;
      front=tmpw->map->sector+line->front;
      back=tmpw->map->sector+line->back;
      floor=MaxI64(front->floor,back->floor);
      ceil=MinI64(front->ceil,back->ceil);
      if (floor>=ceil) return FALSE;
      if (front->floor!=back->floor) {
	slope=FixedDiv(floor-tmpa->z,distance);
	bottom=MaxI64(bottom,slope);
      }
      if (front->ceil!=back->ceil) {
	slope=FixedDiv(ceil-tmpa->z,distance);
	top=MinI64(top,slope);
      }
      if (top<=bottom) return FALSE;
    } else if ((target=WorldActorGet(tmpw,hit->actor)) && target!=source &&
	  target->flags&TM_MF_SHOOTABLE) {
      hi=FixedDiv(target->z+target->height-tmpa->z,distance);
      lo=FixedDiv(target->z-tmpa->z,distance);
      if (hi>=bottom && lo<=top) {
	tmpa->slope=(MinI64(hi,top)+MaxI64(lo,bottom))/2;
	tmpa->target=target->id;
	return TRUE;
      }
    }
  }
  return FALSE;
}

U0 AttackSpecial(Attack *tmpa,I64 line)
{
  I64 *special;
  if (tmpa->special_cnt==tmpa->special_cap) {
    special=MAlloc(2*tmpa->special_cap*sizeof(I64));
    MemCpy(special,tmpa->special,tmpa->special_cnt*sizeof(I64));
    Free(tmpa->special); tmpa->special=special; tmpa->special_cap*=2;
  }
  tmpa->special[tmpa->special_cnt++]=line;
}

U0 AttackPoint(Attack *tmpa,I64 fraction,I64 backoff)
{
  fraction-=FixedDiv(backoff,tmpa->range);
  tmpa->x+=FixedMul(tmpa->dx,fraction);
  tmpa->y+=FixedMul(tmpa->dy,fraction);
  tmpa->z+=FixedMul(tmpa->slope,FixedMul(fraction,tmpa->range));
}

I64 AttackFire(Attack *tmpa,Actor *source,I64 angle,I64 range,I64 slope)
{//Return the first impact and ordered line triggers without changing the world.
  World *tmpw=tmpa->world;
  Path *tmpp=tmpa->path;
  I64 i,distance,floor,ceil;
  Intercept *hit;
  ClipLine *line;
  Sector *front,*back;
  Actor *target;
  tmpa->slope=slope;
  if (!AttackRay(tmpa,source,angle,range)) return TM_HIT_NONE;
  for (i=0;i<tmpp->cnt;i++) {
    hit=tmpp->hit+i; distance=FixedMul(range,hit->fraction);
    if (hit->line>=0) {
      line=tmpw->collision->line+hit->line;
      front=tmpw->map->sector+line->front;
      back=NULL;
      if (tmpw->map->line[hit->line].special) AttackSpecial(tmpa,hit->line);
      if (line->back>=0) {
	back=tmpw->map->sector+line->back;
	floor=MaxI64(front->floor,back->floor);
	ceil=MinI64(front->ceil,back->ceil);
	if (floor<ceil && (front->floor==back->floor ||
	      FixedDiv(floor-tmpa->z,distance)<=slope) &&
	      (front->ceil==back->ceil ||
	      FixedDiv(ceil-tmpa->z,distance)>=slope)) goto af_next;
      }
      tmpa->kind=TM_HIT_WALL; tmpa->line=hit->line;
      AttackPoint(tmpa,hit->fraction,4*65536);
      if (SectorSky(front) &&
	    (tmpa->z>front->ceil || back && SectorSky(back)))
	tmpa->kind=TM_HIT_SKY;
      return tmpa->kind;
    } else if ((target=WorldActorGet(tmpw,hit->actor)) && target!=source &&
	  target->flags&TM_MF_SHOOTABLE) {
      if (FixedDiv(target->z+target->height-tmpa->z,distance)>=slope &&
	    FixedDiv(target->z-tmpa->z,distance)<=slope) {
	tmpa->kind=TM_HIT_ACTOR; tmpa->target=target->id;
	AttackPoint(tmpa,hit->fraction,10*65536);
	return tmpa->kind;
      }
    }
af_next:
  }
  return TM_HIT_NONE;
}
