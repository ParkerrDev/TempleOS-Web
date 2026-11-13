I64 tm_enemy_cases=0,tm_enemy_done=0,tm_enemy_sight,tm_enemy_sight_calls,
	tm_enemy_angle,tm_enemy_angle_calls,tm_enemy_dx,tm_enemy_dy,
	tm_enemy_state_calls,tm_enemy_sound,tm_enemy_origin,tm_enemy_sounds;
Actor *tm_enemy_actor,*tm_enemy_player,*tm_enemy_heard;

I64 TmEnemyKind(Actor *actor)
{
  if (actor==tm_enemy_actor) return 3;
  if (actor==tm_enemy_player) return 1;
  if (actor==tm_enemy_heard) return 2;
  return 0;
}

Bool TmEnemySight(Path *,Actor *source,Actor *target)
{
  I64 n=TmEnemyKind(target);
  if (source!=tm_enemy_actor || !(1<=n<=2)) throw('Sight');
  tm_enemy_sight_calls++;
  return !!(tm_enemy_sight&1<<(n-1));
}

I64 TmEnemyAngle(GameData *,I64 x,I64 y)
{
  tm_enemy_angle_calls++; tm_enemy_dx=x; tm_enemy_dy=y;
  return tm_enemy_angle;
}

Bool TmEnemyState(GameData *,Actor *actor,I64 state,
	U0 (*)(Actor *,I64))
{
  tm_enemy_state_calls++; actor->state=state;
  return TRUE;
}

U0 TmEnemySound(Actor *actor,I64 n)
{
  tm_enemy_sounds++; tm_enemy_sound=n; tm_enemy_origin=TmEnemyKind(actor);
}
