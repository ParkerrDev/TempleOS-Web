I64 tm_spit_cases=0,tm_spit_done=0,tm_spit_spawns,tm_spit_selected,
	tm_spit_sounds,tm_spit_sound;
Actor *tm_spit_source,*tm_spit_cube,*tm_spit_targets[32];

Actor *TmSpitMissile(Motion *motion,Actor *actor,Actor *target,I64 type)
{
  I64 i;
  if (actor!=tm_spit_source || type!=TM_MT_SPAWNSHOT ||
	motion->world!=actor->world) throw('Spawn');
  for (i=0;i<32;i++) if (target==tm_spit_targets[i]) tm_spit_selected=i;
  tm_spit_spawns++;
  return tm_spit_cube;
}

U0 TmSpitSound(Actor *actor,I64 sound)
{
  if (actor) throw('Sound');
  tm_spit_sounds++; tm_spit_sound=sound;
}
