I64 tm_cube_cases=0,tm_cube_done=0,tm_cube_visible,tm_cube_shift,
	tm_cube_spawns,tm_cube_events,tm_cube_trace[64],tm_cube_tx,tm_cube_ty,
	tm_cube_stomp;
Actor *tm_cube_actor,*tm_cube_target,*tm_cube_player,*tm_cube_fog,
	*tm_cube_monster;

I64 TmCubeWho(Actor *actor)
{
  if (actor==tm_cube_actor) return 0;
  if (actor==tm_cube_target) return 1;
  if (actor==tm_cube_player) return 2;
  if (actor==tm_cube_fog) return 3;
  if (actor==tm_cube_monster) return 4;
  throw('Actor');
}

U0 TmCubeRecord(I64 event,Actor *actor,I64 value)
{
  I64 n=tm_cube_events++*4;
  if (n>=64) throw('Trace');
  tm_cube_trace[n]=event; tm_cube_trace[n+1]=TmCubeWho(actor);
  tm_cube_trace[n+2]=value;
  tm_cube_trace[n+3]=tm_cube_actor->world->random;
}

Actor *TmCubeRealSpawn(World *world,I64 type,I64 x,I64 y,I64 z=TM_FLOOR_Z)
{
  return WorldSpawn(world,type,x,y,z);
}

Actor *TmCubeSpawn(World *world,I64 type,I64 x,I64 y,I64 z=TM_FLOOR_Z)
{
  Actor *actor=WorldSpawn(world,type,x,y,z);
  if (tm_cube_spawns++) tm_cube_monster=actor;
  else tm_cube_fog=actor;
  TmCubeRecord(2,actor,type); return actor;
}

U0 TmCubeSound(Actor *actor,I64 sound)
{
  TmCubeRecord(1,actor,sound);
}

Bool TmCubePlayer(Enemies *,Actor *actor,Bool all_around=FALSE)
{
  if (actor!=tm_cube_monster || !all_around) throw('Player');
  TmCubeRecord(3,actor,tm_cube_visible);
  if (tm_cube_visible) actor->target=tm_cube_player->id;
  return tm_cube_visible;
}

Bool TmCubeState(GameData *,Actor *actor,I64 state,
	U0 (*action)(Actor *actor,I64 n)=NULL)
{
  if (action) throw('Action');
  TmCubeRecord(4,actor,state); actor->state=state;
  if (tm_cube_shift) {actor->x+=31*65536; actor->y-=7*65536;}
  return TRUE;
}

Bool TmCubeTeleport(Motion *,Actor *actor,I64 x,I64 y,
	Bool monsters_stomp=FALSE)
{
  TmCubeRecord(5,actor,monsters_stomp);
  tm_cube_tx=x; tm_cube_ty=y; tm_cube_stomp=monsters_stomp;
  return monsters_stomp;
}
