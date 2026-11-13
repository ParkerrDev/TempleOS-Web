I64 tm_effect_cases=0,tm_effect_done=0,tm_effect_cnt,tm_effect_trace[8];
World *tm_effect_world;
Actor *tm_effect_actor,*tm_effect_target;

U0 TmEffectRecord(I64 event,I64 x,I64 y)
{
  I64 *out=tm_effect_trace+tm_effect_cnt*4;
  if (tm_effect_cnt>=2) throw('Trace');
  out[0]=event; out[1]=x; out[2]=y; out[3]=tm_effect_world->random;
  tm_effect_cnt++;
}

U0 TmEffectSound(Actor *actor,I64 sound)
{
  if (actor && actor!=tm_effect_actor) throw('Actor');
  TmEffectRecord(1,!!actor,sound);
}

U0 TmEffectChase(Enemies *enemies,Actor *actor)
{
  if (enemies->specials->sectors->motion->world!=tm_effect_world ||
	actor!=tm_effect_actor) throw('Actor');
  TmEffectRecord(2,0,0);
}

U0 TmEffectRadius(Motion *motion,Path *path,Actor *actor,Actor *source,
	I64 damage)
{
  if (motion->world!=tm_effect_world || path->world!=tm_effect_world ||
	actor!=tm_effect_actor || source && source!=tm_effect_target)
    throw('Actor');
  TmEffectRecord(3,!!source,damage);
}
