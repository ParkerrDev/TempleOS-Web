I64 tm_respawn_cases=0,tm_respawn_done=0,tm_respawn_cnt,
	tm_respawn_spawns,tm_respawn_blocked,tm_respawn_trace[48];
Actor *tm_respawn_actor,tm_respawn_spawn[3];
World *tm_respawn_world;

U0 TmRespawnRecord(I64 event,I64 a,I64 b,I64 c,I64 d)
{
  I64 *out=tm_respawn_trace+tm_respawn_cnt*6;
  if (tm_respawn_cnt>=8) throw('Trace');
  out[0]=event; out[1]=a; out[2]=b; out[3]=c; out[4]=d;
  out[5]=tm_respawn_world->random; tm_respawn_cnt++;
}

Bool TmRespawnPosition(World *world,Actor *actor,I64 x,I64 y,
      U0 (*touch)(Actor *,Actor *,I64),Bool fit)
{
  if (world!=tm_respawn_world || actor!=tm_respawn_actor || touch || fit)
    throw('Owner');
  TmRespawnRecord(1,x,y,0,0);
  return !tm_respawn_blocked;
}

Actor *TmRespawnSpawn(World *world,I64 type,I64 x,I64 y,I64 z)
{
  Actor *actor;
  I64 shown_z=z;
  if (world!=tm_respawn_world || tm_respawn_spawns>=3 ||
	!tm_respawn_actor->active) throw('Owner');
  if (z==TM_FLOOR_Z) shown_z=I32_MIN;
  else if (z==TM_CEIL_Z) shown_z=I32_MAX;
  TmRespawnRecord(2,x,y,shown_z,type);
  actor=tm_respawn_spawn+tm_respawn_spawns++;
  actor->world=world; actor->type=type; actor->active=TRUE;
  actor->x=x; actor->y=y; actor->z=z;
  if (type!=TM_MT_TFOG) actor->flags=world->data->info[type].flags;
  WorldRand(world);
  return actor;
}

I64 TmRespawnSector(Map *map,I64 x,I64 y)
{
  if (map!=tm_respawn_world->map || !tm_respawn_actor->active)
    throw('Owner');
  TmRespawnRecord(4,x,y,0,0);
  return 1;
}

U0 TmRespawnSound(Actor *actor,I64 sound)
{
  if (!tm_respawn_actor->active) throw('Owner');
  TmRespawnRecord(3,actor-tm_respawn_spawn,sound,0,0);
}

Bool TmRespawnTick(GameData *data,Actor *actor,
      U0 (*action)(Actor *,I64))
{
  I64 tics=actor->tics;
  Bool res=ActorTick(data,actor,action);
  if (tics==1) TmRespawnRecord(6,7,0,0,0);
  return res;
}
