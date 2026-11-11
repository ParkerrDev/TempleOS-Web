#define TM_MOVER_DOOR 1
#define TM_MOVER_FLOOR 2
#define TM_MOVER_PLAT 3
#define TM_MOVER_CEIL 4

class Mover
{
  Thinker thinker;
  Mover *next,*last;
  I64 sector,kind,type,direction,speed,high,wait,delay;
  I64 new_special,low,old_direction,tag;
  U8 texture[8];
  Bool active,crush;
};

class SectorArea
{
  I64 first,cnt,left,right,bottom,top;
  Mover *mover;
};

class Sectors
{
  Motion *motion;
  Graphics *graphics;
  SectorArea *area;
  I64 *lines;
  Mover *first,*last;
  U0 (*sound)(I64 sector,I64 n);
  U0 (*key_rqst)(Actor *actor,I64 key);
};

U0 SectorsDel(Sectors *tmps)
{
  Mover *tmpm,*next;
  if (tmps) {
    WorldIdle(tmps->motion->world);
    for (tmpm=tmps->first;tmpm;tmpm=next) {
      next=tmpm->next; QueRem(&tmpm->thinker); Free(tmpm);
    }
    Free(tmps->area); Free(tmps->lines); Free(tmps);
  }
}

Sectors *SectorsNew(Motion *tmpm,Graphics *graphics=NULL)
{//An immutable sector edge index is shared by movers and sound propagation.
  Map *map=tmpm->world->map;
  Sectors *tmps=CAlloc(sizeof(Sectors));
  SectorArea *area;
  Line *line;
  Vertex *a,*b;
  I64 i,j,n,last,total=0;
  tmps->motion=tmpm; tmps->graphics=graphics;
  tmps->area=CAlloc(map->sector_cnt*sizeof(SectorArea));
  for (i=0;i<map->line_cnt;i++) {
    line=map->line+i; last=-1;
    for (j=0;j<2;j++)
      if (line->side[j]!=0xFFFF) {
	n=map->side[line->side[j]].sector;
	if (n!=last) tmps->area[n].cnt++;
	last=n;
      }
  }
  for (i=0;i<map->sector_cnt;i++) {
    area=tmps->area+i; area->first=total; total+=area->cnt; area->cnt=0;
    area->left=area->bottom=I64_MAX; area->right=area->top=-I64_MAX-1;
  }
  tmps->lines=MAlloc(total*sizeof(I64));
  for (i=0;i<map->line_cnt;i++) {
    line=map->line+i; a=map->vertex+line->v1; b=map->vertex+line->v2;
    last=-1;
    for (j=0;j<2;j++)
      if (line->side[j]!=0xFFFF) {
	n=map->side[line->side[j]].sector;
	if (n!=last) {
	  area=tmps->area+n; tmps->lines[area->first+area->cnt++]=i;
	  area->left=MinI64(area->left,MinI64(a->x,b->x)*65536);
	  area->right=MaxI64(area->right,MaxI64(a->x,b->x)*65536);
	  area->bottom=MinI64(area->bottom,MinI64(a->y,b->y)*65536);
	  area->top=MaxI64(area->top,MaxI64(a->y,b->y)*65536);
	}
	last=n;
      }
  }
  return tmps;
}

Mover *MoverNew(Sectors *tmps,I64 sector,I64 kind)
{//One floor or ceiling controller owns a sector at a time.
  Mover *tmpm;
  if (!(0<=sector<tmps->motion->world->map->sector_cnt)) throw('Sector');
  if (tmps->area[sector].mover) return NULL;
  tmpm=CAlloc(sizeof(Mover));
  tmpm->sector=sector; tmpm->kind=kind; tmpm->active=TRUE;
  tmpm->last=tmps->last;
  if (tmps->last) tmps->last->next=tmpm;
  else tmps->first=tmpm;
  tmps->last=tmps->area[sector].mover=tmpm;
  tmpm->thinker.kind=TM_THINK_MOVER;
  QueIns(&tmpm->thinker,tmps->motion->world->thinkers.last);
  return tmpm;
}

U0 MoverFinish(Sectors *tmps,Mover *tmpm)
{//Reclamation waits until no controller callback holds the node.
  if (tmps->area[tmpm->sector].mover==tmpm)
    tmps->area[tmpm->sector].mover=NULL;
  tmpm->active=FALSE;
}

U0 MoversSweep(Sectors *tmps)
{
  Mover *tmpm=tmps->first,*next;
  if (tmps->motion->world->thinking) throw('Thinking');
  while (tmpm) {
    next=tmpm->next;
    if (!tmpm->active) {
      if (tmpm->last) tmpm->last->next=next;
      else tmps->first=next;
      if (next) next->last=tmpm->last;
      else tmps->last=tmpm->last;
      QueRem(&tmpm->thinker); Free(tmpm);
    }
    tmpm=next;
  }
}

U0 MoversTick(Sectors *tmps,U0 (*action)(Sectors *sectors,Mover *mover))
{//An appended controller participates later in the same pass.
  Mover *tmpm=tmps->first;
  try {
    while (tmpm) {
      if (tmpm->active) (*action)(tmps,tmpm);
      tmpm=tmpm->next;
    }
  } catch {
    MoversSweep(tmps);
  }
  MoversSweep(tmps);
}

U0 SectorSnd(Sectors *tmps,I64 sector,I64 n)
{
  if (tmps->sound) (*tmps->sound)(sector,n);
}

I64 SectorOther(Sectors *tmps,I64 sector,I64 line)
{
  Map *map=tmps->motion->world->map;
  Line *tmpl=map->line+line;
  I64 front,back;
  if (!(tmpl->flags&4) || tmpl->side[1]==0xFFFF) return -1;
  front=map->side[tmpl->side[0]].sector;
  back=map->side[tmpl->side[1]].sector;
  if (front==sector && back!=sector) return back;
  if (back==sector && front!=sector) return front;
  return -1;
}

I64 SectorCeilMin(Sectors *tmps,I64 sector,Bool *_found=NULL)
{//An isolated sector keeps its ceiling instead of using an unbounded sentinel.
  Map *map=tmps->motion->world->map;
  SectorArea *area=tmps->area+sector;
  I64 i,n,res=0x7FFFFFFF;
  Bool found=FALSE;
  for (i=0;i<area->cnt;i++) {
    n=SectorOther(tmps,sector,tmps->lines[area->first+i]);
    if (n>=0) {res=MinI64(res,map->sector[n].ceil); found=TRUE;}
  }
  if (!found) res=map->sector[sector].ceil;
  if (_found) *_found=found;
  return res;
}

Bool ActorHeightClip(Motion *tmpm,Actor *tmpa,Bool contacts=TRUE)
{//Grounded actors follow the floor; floating actors move only when forced.
  Collision *tmpc=tmpm->world->collision;
  Bool on_floor=tmpa->z==tmpa->floor;
  if (contacts)
    WorldPosition(tmpm->world,tmpa,tmpa->x,tmpa->y,tmpm->touch);
  else {
    CollisionBegin(tmpc,tmpa->x,tmpa->y,tmpa->radius,
	  tmpa->flags|TM_MF_TELEPORT|TM_MF_DROPOFF,
	  tmpa->id==tmpm->world->player);
    CollisionLines(tmpc,tmpa->z,tmpa->height);
  }
  if (!tmpa->active) return TRUE;
  tmpa->floor=tmpc->floor; tmpa->ceil=tmpc->ceil;
  if (on_floor) tmpa->z=tmpa->floor;
  else if (tmpa->z+tmpa->height>tmpa->ceil) tmpa->z=tmpa->ceil-tmpa->height;
  return tmpa->ceil-tmpa->floor>=tmpa->height;
}

Bool SectorChange(Sectors *tmps,I64 n,Bool crush,Bool effects=TRUE)
{//Stop at the old thinker tail; callback spawns wait for the next query.
  Motion *tmpm=tmps->motion;
  World *world=tmpm->world;
  SectorArea *area;
  Actor *tmpa,*blood;
  I64 id=world->first,last=world->last,next;
  Bool res=FALSE;
  if (!(0<=n<world->map->sector_cnt)) throw('Sector');
  area=tmps->area+n;
  while (tmpa=WorldActorGet(world,id,FALSE)) {
    next=tmpa->tick_next;
    if (tmpa->active && !(tmpa->flags&TM_MF_NOBLOCKMAP) &&
	  tmpa->x+tmpa->radius>=area->left &&
	  tmpa->x-tmpa->radius<=area->right &&
	  tmpa->y+tmpa->radius>=area->bottom &&
	  tmpa->y-tmpa->radius<=area->top)
      if (!ActorHeightClip(tmpm,tmpa,effects)) {
	if (!effects) res=TRUE;
	else if (tmpa->health<=0) {
	  ActorState(world->data,tmpa,TM_S_GIBS,tmpm->action);
	  tmpa->flags&=~TM_MF_SOLID; tmpa->height=tmpa->radius=0;
	} else if (tmpa->flags&TM_MF_DROPPED) tmpa->active=FALSE;
	else if (tmpa->flags&TM_MF_SHOOTABLE) {
	  res=TRUE;
	  if (crush && !(world->tic&3)) {
	    ActorDamage(tmpm,tmpa,NULL,NULL,10);
	    if (tmpa->active) {
	      blood=WorldSpawn(world,TM_MT_BLOOD,tmpa->x,tmpa->y,
		    tmpa->z+tmpa->height/2);
	      blood->vx=WorldRandDiff(world)<<12;
	      blood->vy=WorldRandDiff(world)<<12;
	    }
	  }
	}
      }
    if (id==last) break;
    id=next;
  }
  return res;
}

#define TM_PLANE_OK	0
#define TM_PLANE_CRUSHED	1
#define TM_PLANE_PAST	2

I64 SectorMove(Sectors *tmps,I64 n,I64 speed,I64 dest,
	Bool crush,Bool ceiling,I64 direction)
{//Preserve the original plane completion and crushing order at 35 Hz.
  Sector *sector;
  I64 *height,old,next;
  Bool past=FALSE,blocked=FALSE,restore=FALSE;
  if (!(0<=n<tmps->motion->world->map->sector_cnt) || !(0<speed<=0x7FFFFFFF) ||
	!(direction==1 || direction==-1) ||
	!(-0x80000000<=dest<=0x7FFFFFFF)) throw('Plane');
  sector=tmps->motion->world->map->sector+n; height=&sector->floor;
  if (ceiling) height=&sector->ceil;
  old=*height; next=old+direction*speed;
  if (direction>0 && next>dest || direction<0 && next<dest) {
    next=dest; past=TRUE;
  }
  *height=next;
  try {
    blocked=SectorChange(tmps,n,crush);
    if (blocked) {
      restore=past || !ceiling && direction<0;
      if (!crush && (!ceiling && direction>0 || ceiling && direction<0))
	restore=TRUE;
      if (restore) {
	*height=old; SectorChange(tmps,n,crush);
      }
    }
  } catch {
    *height=old; SectorChange(tmps,n,FALSE,FALSE);
  }
  if (past) return TM_PLANE_PAST;
  if (blocked && !(ceiling && direction>0)) return TM_PLANE_CRUSHED;
  return TM_PLANE_OK;
}
