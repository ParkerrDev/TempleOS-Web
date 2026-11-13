I64 tm_touch_damage_cnt,tm_touch_damage,tm_touch_source,tm_touch_pickups,
      tm_touch_states,tm_touch_cases=0,tm_touch_done=0;
Actor *tm_touch_mover,*tm_touch_other,*tm_touch_owner;
Motion *tm_touch_motion;

U0 TmTouchDamage(Motion *motion,Actor *other,Actor *inflictor,Actor *source,
	I64 damage)
{
  if (motion!=tm_touch_motion || other!=tm_touch_other ||
	inflictor!=tm_touch_mover) throw('Args');
  tm_touch_damage_cnt++; tm_touch_damage=damage;
  tm_touch_source=0;
  if (source==tm_touch_mover) tm_touch_source=1;
  else if (source==tm_touch_other) tm_touch_source=2;
  else if (source==tm_touch_owner) tm_touch_source=3;
}

Bool TmTouchPickup(Motion *motion,Actor *mover,Actor *other)
{
  if (motion!=tm_touch_motion || mover!=tm_touch_mover ||
	other!=tm_touch_other) throw('Args');
  tm_touch_pickups++;
  return TRUE;
}

Bool TmTouchState(GameData *data,Actor *actor,I64 state,
	U0 (*)(Actor *,I64))
{
  if (data!=tm_touch_motion->world->data || actor!=tm_touch_mover)
    throw('Args');
  tm_touch_states++; actor->state=state;
  return TRUE;
}
