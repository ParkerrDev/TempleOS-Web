class Enemies
{
  Specials *specials;
  Path *sight;
  Attack *trace;
  I64 *sound,*queue;
  U8 *depth;
};

U0 EnemiesDel(Enemies *tmpe)
{
  if (tmpe) {
    WorldIdle(tmpe->specials->sectors->motion->world);
    AttackDel(tmpe->trace); PathDel(tmpe->sight); Free(tmpe);
  }
}

Enemies *EnemiesNew(Specials *specials)
{//One hearing table per level; sight queries reuse their own path.
  World *world=specials->sectors->motion->world;
  I64 cnt=world->map->sector_cnt;
  Enemies *tmpe;
  WorldIdle(world);
  if (cnt<=0) return NULL;
  tmpe=CAlloc(sizeof(Enemies)+cnt*(3*sizeof(I64)+1));
  tmpe->specials=specials; tmpe->sound=tmpe+1;
  tmpe->queue=tmpe->sound+cnt; tmpe->depth=tmpe->queue+cnt*2;
  MemSet(tmpe->depth,255,cnt);
  try {
    tmpe->sight=PathNew(world); tmpe->trace=AttackNew(world);
  } catch {
    EnemiesDel(tmpe);
  }
  return tmpe;
}

U0 EnemyNoise(Enemies *tmpe,Actor *target,Actor *emitter)
{//A later unblocked route can improve a sector first heard through a block.
  Sectors *sectors=tmpe->specials->sectors;
  World *world=sectors->motion->world;
  Map *map=world->map;
  SectorArea *area;
  Sector *front,*back;
  I64 head=0,tail=0,sector,i,line,other,depth;
  if (!target || !emitter || target->world!=world || emitter->world!=world)
    throw('World');
  if (!target->active || !emitter->active) return;
  if (!(0<=emitter->sector<map->sector_cnt)) throw('Sector');
  MemSet(tmpe->depth,255,map->sector_cnt);
  tmpe->depth[emitter->sector]=0; tmpe->queue[tail++]=emitter->sector;
  while (head<tail) {
    sector=tmpe->queue[head++]; tmpe->sound[sector]=target->id;
    area=sectors->area+sector; front=map->sector+sector;
    for (i=0;i<area->cnt;i++) {
      line=sectors->lines[area->first+i];
      if (map->line[line].flags&4) {
	other=SectorOther(sectors,sector,line);
	if (other>=0) {
	  back=map->sector+other;
	  depth=tmpe->depth[sector];
	  if (map->line[line].flags&64) depth++;
	  if (depth<=1 && depth<tmpe->depth[other] &&
		MinI64(front->ceil,back->ceil)>
		MaxI64(front->floor,back->floor)) {
	    if (tail>=map->sector_cnt*2) throw('SoundQue');
	    tmpe->depth[other]=depth; tmpe->queue[tail++]=other;
	  }
	}
      }
    }
  }
}

Actor *EnemyTarget(Enemies *tmpe,Actor *actor)
{
  World *world=tmpe->specials->sectors->motion->world;
  if (actor->world!=world) throw('World');
  if (!actor->active) return NULL;
  return WorldActorGet(world,actor->target);
}

Bool EnemyMelee(Enemies *tmpe,Actor *actor)
{
  Actor *target=EnemyTarget(tmpe,actor);
  I64 distance;
  if (!target) return FALSE;
  distance=DistanceApprox(target->x-actor->x,target->y-actor->y);
  if (distance>=44*65536+actor->world->data->info[target->type].radius)
    return FALSE;
  return ActorSight(tmpe->sight,actor,target);
}

Bool EnemyMissile(Enemies *tmpe,Actor *actor)
{
  Actor *target=EnemyTarget(tmpe,actor);
  World *world=actor->world;
  I64 distance;
  if (!target || !ActorSight(tmpe->sight,actor,target)) return FALSE;
  if (actor->flags&TM_MF_JUSTHIT) {
    actor->flags&=~TM_MF_JUSTHIT;
    return TRUE;
  }
  if (actor->reaction) return FALSE;
  distance=DistanceApprox(actor->x-target->x,actor->y-target->y)-64*65536;
  if (!world->data->info[actor->type].melee) distance-=128*65536;
  distance>>=16;
  if (actor->type==TM_MT_VILE && distance>14*64) return FALSE;
  if (actor->type==TM_MT_UNDEAD) {
    if (distance<196) return FALSE;
    distance>>=1;
  }
  if (actor->type==TM_MT_CYBORG || actor->type==TM_MT_SPIDER ||
	actor->type==TM_MT_SKULL) distance>>=1;
  distance=MinI64(distance,200);
  if (actor->type==TM_MT_CYBORG) distance=MinI64(distance,160);
  return WorldRand(world)>=distance;
}

Bool EnemyPlayer(Enemies *tmpe,Actor *actor,Bool all_around=FALSE)
{//Retain the four-slot search order even with only player zero present.
  Motion *motion=tmpe->specials->sectors->motion;
  World *world=motion->world;
  Actor *player;
  I64 cnt=0,stop=(actor->lastlook-1)&3,angle;
  Bool res;
  if (actor->world!=world) throw('World');
  if (!actor->active || !motion->player) return FALSE;
  if (!(0<=actor->lastlook<4)) throw('Look');
  player=WorldActorGet(world,world->player);
  while (TRUE) {
    if (!actor->lastlook) {
      if (cnt++==2 || actor->lastlook==stop) return FALSE;

      if (player && motion->player->health>0 &&
	    ActorSight(tmpe->sight,actor,player)) {
	res=all_around;
	if (!res) {
	  angle=AngleFrom(world->data,player->x-actor->x,player->y-actor->y)-
		actor->angle; angle&=0xFFFFFFFF;
	  res=!(0x40000000<angle<0xC0000000) ||
		DistanceApprox(player->x-actor->x,player->y-actor->y)<=64*65536;
	}
	if (res) {
	  actor->target=player->id; return TRUE;
	}
      }
    }
    actor->lastlook=(actor->lastlook+1)&3;
  }
}

U0 EnemyFace(Enemies *tmpe,Actor *actor)
{
  Actor *target=EnemyTarget(tmpe,actor);
  World *world=actor->world;
  if (!target) return;
  actor->flags&=~TM_MF_AMBUSH;
  actor->angle=AngleFrom(world->data,target->x-actor->x,target->y-actor->y);
  if (target->flags&TM_MF_SHADOW) actor->angle+=WorldRandDiff(world)<<21;
  actor->angle&=0xFFFFFFFF;
}

U0 EnemyLook(Enemies *tmpe,Actor *actor)
{
  Motion *motion=tmpe->specials->sectors->motion;
  World *world=motion->world;
  ActorInfo *info;
  Actor *target,*origin=actor;
  I64 sound;
  if (actor->world!=world) throw('World');
  if (!actor->active) return;
  if (!(0<=actor->sector<world->map->sector_cnt)) throw('Sector');
  info=world->data->info+actor->type; sound=info->see_snd;
  actor->threshold=0; target=WorldActorGet(world,tmpe->sound[actor->sector]);
  if (target && target->flags&TM_MF_SHOOTABLE) {
    actor->target=target->id;
    if (!(actor->flags&TM_MF_AMBUSH) || ActorSight(tmpe->sight,actor,target))
      goto el_seen;
  }
  if (!EnemyPlayer(tmpe,actor)) return;
el_seen:
  if (sound) {
    if (TM_SFX_POSIT1<=sound<=TM_SFX_POSIT3)
      sound=TM_SFX_POSIT1+WorldRand(world)%3;
    else if (TM_SFX_BGSIT1<=sound<=TM_SFX_BGSIT2)
      sound=TM_SFX_BGSIT1+WorldRand(world)%2;
    if (actor->type==TM_MT_SPIDER || actor->type==TM_MT_CYBORG) origin=NULL;
    if (motion->sound) (*motion->sound)(origin,sound);
  }
  ActorState(world->data,actor,info->see,motion->action);
}
