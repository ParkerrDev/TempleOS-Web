I64 tm_end_cases=0,tm_end_done=0,tm_end_cnt,tm_end_sound,tm_end_sounds,
	tm_end_sound_cnt,tm_end_sound_random;
Actor *tm_end_spawned[65];
World *tm_end_world;

Actor *TmEndRealSpawn(World *world,I64 type,I64 x,I64 y,I64 z=TM_FLOOR_Z)
{
  return WorldSpawn(world,type,x,y,z);
}

Actor *TmEndSpawn(World *world,I64 type,I64 x,I64 y,I64 z=TM_FLOOR_Z)
{
  Actor *actor;
  if (world!=tm_end_world || type!=TM_MT_ROCKET || tm_end_cnt>=65)
    throw('Spawn');
  actor=WorldSpawn(world,type,x,y,z);
  tm_end_spawned[tm_end_cnt++]=actor;
  return actor;
}

U0 TmEndSound(Actor *actor,I64 sound)
{
  if (actor) throw('Origin');
  tm_end_sound=sound; tm_end_sounds++;
  tm_end_sound_cnt=tm_end_cnt; tm_end_sound_random=tm_end_world->random;
}
