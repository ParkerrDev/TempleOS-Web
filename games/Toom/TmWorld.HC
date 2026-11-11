#define TM_FLOOR_Z	(-I64_MAX-1)
#define TM_CEIL_Z	I64_MAX

class ActorSlot
{
  Actor *actor;
  I64 next,generation;
};

class World
{
  Thinker thinkers;
  Map *map;
  GameData *data;
  Collision *collision;
  ActorSlot *slot;
  I64 slot_cap,free_slot,actor_cnt,*blocks,skill,random,tic,player,
	player_start,total_kills,total_items,total_secrets,max_radius,
	first,last,hit_actor,hit_kind;
  Bool thinking;
};

I64 WorldRand(World *tmpw)
{
  return GameRand(tmpw->data,&tmpw->random);
}

I64 WorldRandDiff(World *tmpw)
{//Explicit order keeps random spreads independent of expression evaluation.
  I64 first=WorldRand(tmpw);
  return first-WorldRand(tmpw);
}

Actor *WorldActorGet(World *tmpw,I64 id,Bool active=TRUE)
{//Generation handles survive slot reuse and serialize without pointers.
  I64 n=id.u32[0]-1;
  ActorSlot *slot;
  if (0<=n<tmpw->slot_cap) {
    slot=tmpw->slot+n;
    if (slot->generation==id.u32[1] && slot->actor &&
	  (!active || slot->actor->active)) return slot->actor;
  }
  return NULL;
}

U0 WorldActorUnlink(World *tmpw,Actor *tmpa)
{
  Actor *prev,*next;
  if (tmpa->block>=0) {
    if (prev=WorldActorGet(tmpw,tmpa->block_last,FALSE))
      prev->block_next=tmpa->block_next;
    else
      tmpw->blocks[tmpa->block]=tmpa->block_next;
    if (next=WorldActorGet(tmpw,tmpa->block_next,FALSE))
      next->block_last=tmpa->block_last;
  }
  tmpa->block=-1; tmpa->block_next=tmpa->block_last=0;
}

U0 WorldActorLink(World *tmpw,Actor *tmpa)
{
  I64 x,y,w,h,n;
  I16 *blocks=tmpw->map->blockmap;
  Actor *next;
  w=blocks(U16 *)[2]; h=blocks(U16 *)[3];
  x=(tmpa->x-blocks[0]*65536)>>23;
  y=(tmpa->y-blocks[1]*65536)>>23;
  tmpa->block=-1; tmpa->block_next=tmpa->block_last=0;
  if (0<=x<w && 0<=y<h && !(tmpa->flags&TM_MF_NOBLOCKMAP)) {
    n=x+y*w;
    tmpa->block=n; tmpa->block_next=tmpw->blocks[n];
    if (next=WorldActorGet(tmpw,tmpa->block_next,FALSE))
      next->block_last=tmpa->id;
    tmpw->blocks[n]=tmpa->id;
  }
}

U0 WorldSlotsGrow(World *tmpw)
{//Actor allocations stay stable when the compact handle table grows.
  I64 i,old=tmpw->slot_cap,n=MaxI64(256,old*2);
  ActorSlot *slots=CAlloc(n*sizeof(ActorSlot));
  if (old) MemCpy(slots,tmpw->slot,old*sizeof(ActorSlot));
  Free(tmpw->slot); tmpw->slot=slots; tmpw->slot_cap=n;
  for (i=old;i<n;i++) {
    slots[i].generation=1;
    slots[i].next=i+1;
  }
  slots[n-1].next=tmpw->free_slot;
  tmpw->free_slot=old;
}

U0 WorldDel(World *tmpw)
{
  I64 i;
  if (tmpw) {
    if (tmpw->thinking) throw('Thinking');
    for (i=0;i<tmpw->slot_cap;i++) Free(tmpw->slot[i].actor);
    Free(tmpw->slot); Free(tmpw->blocks);
    CollisionDel(tmpw->collision); Free(tmpw);
  }
}

World *WorldNew(Map *tmpm,GameData *tmpd,I64 skill=2)
{//The level and immutable data are borrowed; world objects are owned here.
  World *tmpw=CAlloc(sizeof(World));
  QueInit(&tmpw->thinkers);
  tmpw->map=tmpm; tmpw->data=tmpd; tmpw->skill=ClampI64(skill,0,4);
  tmpw->free_slot=tmpw->player_start=-1;
  tmpw->blocks=CAlloc(tmpm->blockmap(U16 *)[2]*
	tmpm->blockmap(U16 *)[3]*sizeof(I64));
  tmpw->collision=CollisionNew(tmpm);
  WorldSlotsGrow(tmpw);
  return tmpw;
}

Actor *WorldSpawn(World *tmpw,I64 type,I64 x,I64 y,I64 z=TM_FLOOR_Z)
{//Spawn-state actions wait for the normal state clock, as in the original.
  I64 n;
  ActorSlot *slot;
  ActorInfo *info;
  State *state;
  Sector *sector;
  Actor *tmpa,*last;
  if (!(0<=type<TM_ACTOR_NUM)) return NULL;
  if (tmpw->free_slot<0) WorldSlotsGrow(tmpw);
  n=tmpw->free_slot; slot=tmpw->slot+n; tmpw->free_slot=slot->next;
  tmpa=CAlloc(sizeof(Actor)); slot->actor=tmpa; tmpa->world=tmpw;
  info=tmpw->data->info+type;
  tmpa->id=slot->generation<<32|(n+1);
  tmpa->type=type; tmpa->active=TRUE;
  tmpa->x=x; tmpa->y=y; tmpa->radius=info->radius; tmpa->height=info->height;
  tmpa->flags=info->flags; tmpa->health=info->health;
  tmpa->reaction=info->reaction;
  if (tmpw->skill==4) tmpa->reaction=0;
  tmpa->lastlook=GameRand(tmpw->data,&tmpw->random)&3;
  tmpa->state=info->spawn; state=tmpw->data->state+tmpa->state;
  tmpa->tics=state->tics; tmpa->sprite=state->sprite; tmpa->frame=state->frame;
  tmpa->sector=FixedSector(tmpw->map,x,y);
  sector=tmpw->map->sector+tmpa->sector;
  tmpa->floor=sector->floor; tmpa->ceil=sector->ceil;
  if (z==TM_FLOOR_Z) z=tmpa->floor;
  else if (z==TM_CEIL_Z) z=tmpa->ceil-tmpa->height;
  tmpa->z=z; tmpa->spawn=-1; tmpa->movedir=8;
  WorldActorLink(tmpw,tmpa);
  tmpa->tick_last=tmpw->last;
  if (last=WorldActorGet(tmpw,tmpw->last,FALSE)) last->tick_next=tmpa->id;
  else tmpw->first=tmpa->id;
  tmpw->last=tmpa->id;
  tmpw->max_radius=MaxI64(tmpw->max_radius,tmpa->radius);
  tmpa->thinker.kind=TM_THINK_ACTOR;
  QueIns(&tmpa->thinker,tmpw->thinkers.last);
  tmpw->actor_cnt++;
  return tmpa;
}

U0 WorldRemove(World *tmpw,Actor *tmpa)
{//Remove at a tic boundary; stale target handles cannot name a new actor.
  I64 n=tmpa->id.u32[0]-1;
  ActorSlot *slot=tmpw->slot+n;
  Actor *prev,*next;
  if (tmpw->thinking) throw('Thinking');
  QueRem(&tmpa->thinker);
  WorldActorUnlink(tmpw,tmpa);
  if (prev=WorldActorGet(tmpw,tmpa->tick_last,FALSE))
    prev->tick_next=tmpa->tick_next;
  else tmpw->first=tmpa->tick_next;
  if (next=WorldActorGet(tmpw,tmpa->tick_next,FALSE))
    next->tick_last=tmpa->tick_last;
  else tmpw->last=tmpa->tick_last;
  slot->actor=NULL;
  slot->generation=(slot->generation+1)&0xFFFFFFFF;
  if (!slot->generation) slot->generation=1;
  slot->next=tmpw->free_slot; tmpw->free_slot=n;
  tmpw->actor_cnt--;
  Free(tmpa);
}

U0 WorldSweep(World *tmpw)
{
  I64 id=tmpw->first,next;
  Actor *tmpa;
  if (tmpw->thinking) throw('Thinking');
  while (tmpa=WorldActorGet(tmpw,id,FALSE)) {
    next=tmpa->tick_next;
    if (!tmpa->active) WorldRemove(tmpw,tmpa);
    id=next;
  }
}

U0 WorldLoadThings(World *tmpw)
{//Skill and single-player flags select the map's actual actor definitions.
  I64 i,j,bit=1,z;
  Thing *thing;
  Actor *tmpa;
  ActorInfo *info;
  if (tmpw->actor_cnt) throw('Loaded');
  if (tmpw->skill==2) bit=2;
  else if (tmpw->skill>2) bit=4;
  for (i=0;i<tmpw->map->thing_cnt;i++) {
    thing=tmpw->map->thing+i;
    if (thing->type==1) {
      tmpw->player_start=i;
      if (tmpa=WorldActorGet(tmpw,tmpw->player)) WorldRemove(tmpw,tmpa);
      tmpa=WorldSpawn(tmpw,TM_MT_PLAYER,thing->x*65536,thing->y*65536);
      tmpw->player=tmpa->id;
      tmpa->angle=536870912*(thing->angle/45)&0xFFFFFFFF;
    } else if (thing->flags&bit && !(thing->flags&16) &&
	  !(2<=thing->type<=4) && thing->type!=11) {
      j=0;
      while (j<TM_ACTOR_NUM && tmpw->data->info[j].number!=thing->type) j++;
      if (j==TM_ACTOR_NUM) throw('Thing');
      info=tmpw->data->info+j;
      z=TM_FLOOR_Z;
      if (info->flags&TM_MF_SPAWNCEILING) z=TM_CEIL_Z;
      tmpa=WorldSpawn(tmpw,j,thing->x*65536,thing->y*65536,z);
      tmpa->spawn=i;
      if (tmpa->tics>0)
	tmpa->tics=1+GameRand(tmpw->data,&tmpw->random)%tmpa->tics;
      tmpa->angle=536870912*(thing->angle/45)&0xFFFFFFFF;
      if (thing->flags&8) tmpa->flags|=TM_MF_AMBUSH;
      if (info->flags&TM_MF_COUNTKILL) tmpw->total_kills++;
      if (info->flags&TM_MF_COUNTITEM) tmpw->total_items++;
    }
  }
}
