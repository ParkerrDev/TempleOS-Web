I64 tm_chase_cases=0,tm_chase_done=0,tm_chase_cnt,tm_chase_trace[32],
	tm_chase_mask,tm_chase_melee,tm_chase_missile,tm_chase_player,
	tm_chase_melee_calls,tm_chase_missile_calls,tm_chase_player_calls,
	tm_chase_state_calls,tm_chase_sound_calls,tm_chase_sound;
Actor *tm_chase_actor,*tm_chase_target,*tm_chase_man;

U0 TmChaseRecord(I64 n)
{
  if (tm_chase_cnt>=32) throw('Trace');
  tm_chase_trace[tm_chase_cnt++]=n;
}

Bool TmChaseMove(Enemies *,Actor *actor)
{
  TmChaseRecord(actor->movedir);
  return !!(tm_chase_mask&1<<actor->movedir);
}

Bool TmChaseMelee(Enemies *,Actor *)
{
  tm_chase_melee_calls++; TmChaseRecord(3001);
  return tm_chase_melee;
}

Bool TmChaseMissile(Enemies *,Actor *)
{
  tm_chase_missile_calls++; TmChaseRecord(3002);
  return tm_chase_missile;
}

Bool TmChasePlayer(Enemies *,Actor *actor,Bool around)
{
  if (!around) throw('Around');
  tm_chase_player_calls++; TmChaseRecord(3000);
  if (tm_chase_player) actor->target=tm_chase_man->id;
  return tm_chase_player;
}

Bool TmChaseState(GameData *,Actor *actor,I64 state,
	U0 (*)(Actor *,I64))
{
  tm_chase_state_calls++; actor->state=state; TmChaseRecord(2000+state);
  return TRUE;
}

U0 TmChaseSound(Actor *actor,I64 n)
{
  if (actor!=tm_chase_actor) throw('Actor');
  tm_chase_sound_calls++; tm_chase_sound=n; TmChaseRecord(1000+n);
}
