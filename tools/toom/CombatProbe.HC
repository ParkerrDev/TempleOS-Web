I64 tm_combat_cases=0,tm_combat_done=0,tm_combat_cnt,tm_combat_trace[64],
	tm_combat_sight,tm_combat_angle,tm_combat_slope,
	tm_combat_shot_angle,tm_combat_shot_slope;
World *tm_combat_world;
Specials *tm_combat_specials;
Actor *tm_combat_actor,*tm_combat_target;

U0 TmCombatRecord(I64 event,I64 x,I64 y)
{
  I64 *out=tm_combat_trace+tm_combat_cnt*4;
  if (tm_combat_cnt>=16) throw('Trace');
  out[0]=event; out[1]=x; out[2]=y; out[3]=tm_combat_world->random;
  tm_combat_cnt++;
}

Bool TmCombatSight(Path *,Actor *source,Actor *target)
{
  if (source!=tm_combat_actor || target!=tm_combat_target) throw('Actor');
  TmCombatRecord(2,1,0);
  return tm_combat_sight;
}

I64 TmCombatAngle(GameData *,I64 x,I64 y)
{
  TmCombatRecord(1,x,y);
  return tm_combat_angle;
}

U0 TmCombatSound(Actor *actor,I64 sound)
{
  if (actor!=tm_combat_actor) throw('Actor');
  TmCombatRecord(3,sound,2);
}

Bool TmCombatState(GameData *,Actor *actor,I64 state,
	U0 (*)(Actor *,I64))
{
  if (actor!=tm_combat_actor) throw('Actor');
  actor->state=state; TmCombatRecord(8,state,0);
  return TRUE;
}

Bool TmCombatAim(Attack *trace,Actor *actor,I64 angle,I64 range)
{
  if (trace->world!=tm_combat_world || actor!=tm_combat_actor ||
	range!=2048*65536) throw('Args');
  trace->slope=tm_combat_slope; TmCombatRecord(4,angle,trace->slope);
  return TRUE;
}

I64 TmCombatFire(Attack *trace,Actor *actor,I64 angle,I64 range,I64 slope)
{
  if (trace->world!=tm_combat_world || actor!=tm_combat_actor ||
	range!=2048*65536 || slope!=tm_combat_slope) throw('Args');
  tm_combat_shot_angle=angle; tm_combat_shot_slope=slope;
  return 0;
}

U0 TmCombatApply(Motion *motion,Attack *trace,Actor *actor,I64 damage,
	U0 (*special)(Actor *,I64,U8 *),U8 *context)
{
  if (motion->world!=tm_combat_world || trace->world!=tm_combat_world ||
	actor!=tm_combat_actor || !special || context!=tm_combat_specials ||
	tm_combat_shot_slope!=tm_combat_slope) throw('Args');
  TmCombatRecord(5,tm_combat_shot_angle,damage);
}

U0 TmCombatDamage(Motion *motion,Actor *target,Actor *inflictor,
	Actor *source,I64 damage)
{
  if (motion->world!=tm_combat_world || target!=tm_combat_target ||
	inflictor!=tm_combat_actor || source!=tm_combat_actor) throw('Actor');
  TmCombatRecord(6,damage,2);
}

Actor *TmCombatMissile(Motion *motion,Actor *source,Actor *target,I64 type)
{
  if (motion->world!=tm_combat_world || source!=tm_combat_actor ||
	target!=tm_combat_target) throw('Actor');
  TmCombatRecord(7,type,1);
  return NULL;
}
