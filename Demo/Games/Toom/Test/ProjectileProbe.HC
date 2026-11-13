I64 tm_proj_cases=0,tm_proj_done=0,tm_proj_angle,tm_proj_spawns,
	tm_proj_sounds,tm_proj_sound,tm_proj_sound_rng,tm_proj_angles,
	tm_proj_angle_rng,tm_proj_dx,tm_proj_dy,tm_proj_starts,
	tm_proj_start_rng,tm_proj_spawn_rng;
World *tm_proj_world;
Actor *tm_proj_result;

Actor *TmProjSpawn(World *world,I64 type,I64 x,I64 y,I64 z=TM_FLOOR_Z)
{
  tm_proj_spawns++; tm_proj_spawn_rng=world->random;
  tm_proj_result=WorldSpawn(world,type,x,y,z);
  return tm_proj_result;
}

I64 TmProjAngle(GameData *,I64 x,I64 y)
{
  tm_proj_angles++; tm_proj_angle_rng=tm_proj_world->random;
  tm_proj_dx=x; tm_proj_dy=y;
  return tm_proj_angle;
}

U0 TmProjSound(Actor *actor,I64 sound)
{
  if (actor!=tm_proj_result) throw('Actor');
  tm_proj_sounds++; tm_proj_sound=sound;
  tm_proj_sound_rng=tm_proj_world->random;
}

U0 TmProjStart(Motion *motion,Actor *actor)
{
  if (actor!=tm_proj_result || motion->world!=tm_proj_world) throw('Actor');
  tm_proj_starts++; tm_proj_start_rng=tm_proj_world->random;
}
