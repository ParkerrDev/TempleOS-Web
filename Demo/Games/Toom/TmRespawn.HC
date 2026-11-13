Bool ActorRespawnReady(Motion *tmpm,Actor *tmpa)
{//Permanent monster states retry after twelve seconds, on 32-tic boundaries.
  World *world=tmpm->world;
  if (tmpa->world!=world) throw('World');
  if (!tmpa->active || tmpa->tics!=-1 ||
	!(tmpa->flags&TM_MF_COUNTKILL) || world->skill!=4) return FALSE;
  tmpa->move_cnt++;
  if (tmpa->move_cnt<12*TM_TICK_HZ || world->tic&31) return FALSE;
  return WorldRand(world)<=4;
}

Bool ActorRespawn(Motion *tmpm,Actor *tmpa)
{//Fog precedes the replacement; the old thinker retires after it is linked.
  World *world=tmpm->world;
  Map *map=world->map;
  Thing *thing;
  Actor *actor,*fog;
  I64 x=0,y=0,angle=0,flags=0,z=TM_FLOOR_Z,sector;
  if (tmpa->world!=world) throw('World');
  if (!tmpa->active) return FALSE;
  if (!(-1<=tmpa->spawn<map->thing_cnt)) throw('Spawn');
  if (tmpa->spawn>=0) {
    thing=map->thing+tmpa->spawn;
    x=thing->x*65536; y=thing->y*65536;
    angle=thing->angle; flags=thing->flags;
  }
  if (!WorldPosition(world,tmpa,x,y,tmpm->touch,FALSE)) return FALSE;
  fog=WorldSpawn(world,TM_MT_TFOG,tmpa->x,tmpa->y,
	map->sector[tmpa->sector].floor);
  if (tmpm->sound) (*tmpm->sound)(fog,TM_SFX_TELEPT);
  sector=FixedSector(map,x,y);
  fog=WorldSpawn(world,TM_MT_TFOG,x,y,map->sector[sector].floor);
  if (tmpm->sound) (*tmpm->sound)(fog,TM_SFX_TELEPT);
  if (world->data->info[tmpa->type].flags&TM_MF_SPAWNCEILING)
    z=TM_CEIL_Z;
  actor=WorldSpawn(world,tmpa->type,x,y,z);
  actor->spawn=tmpa->spawn;
  actor->angle=536870912*(angle/45)&0xFFFFFFFF;
  if (flags&8) actor->flags|=TM_MF_AMBUSH;
  actor->reaction=18;
  tmpa->active=FALSE;
  return TRUE;
}

U0 ActorThink(Motion *tmpm,Actor *tmpa)
{
  if (!ActorMotion(tmpm,tmpa)) return;
  if (tmpa->tics==-1) {
    if (ActorRespawnReady(tmpm,tmpa)) ActorRespawn(tmpm,tmpa);
  } else ActorTick(tmpm->world->data,tmpa,tmpm->action);
}
