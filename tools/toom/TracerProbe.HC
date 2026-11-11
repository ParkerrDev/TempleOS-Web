I64 tm_tracer_cases=0,tm_tracer_done=0,tm_tracer_cnt,tm_tracer_trace[12],
	tm_tracer_angle,tm_tracer_spawns;
World *tm_tracer_world;
Actor *tm_tracer_actor,*tm_tracer_smoke;

U0 TmTracerRecord(I64 event,I64 x,I64 y)
{
  I64 *out=tm_tracer_trace+tm_tracer_cnt*4;
  if (tm_tracer_cnt>=3) throw('Trace');
  out[0]=event; out[1]=x; out[2]=y; out[3]=tm_tracer_world->random;
  tm_tracer_cnt++;
}

I64 TmTracerAngle(GameData *,I64 x,I64 y)
{
  TmTracerRecord(3,x,y);
  return tm_tracer_angle;
}

Actor *TmTracerPuff(Motion *motion,I64 x,I64 y,I64 z,I64 damage,
	Bool blood,Bool punch=FALSE)
{
  Actor *actor=tm_tracer_actor;
  if (motion->world!=tm_tracer_world || x!=actor->x || y!=actor->y ||
	z!=actor->z || damage || blood || punch) throw('Puff');
  TmTracerRecord(1,x,y);
  return NULL;
}

Actor *TmTracerRealSpawn(World *world,I64 type,I64 x,I64 y,I64 z)
{
  return WorldSpawn(world,type,x,y,z);
}

Actor *TmTracerSpawn(World *world,I64 type,I64 x,I64 y,I64 z)
{
  if (world!=tm_tracer_world || type!=TM_MT_SMOKE || tm_tracer_spawns++)
    throw('Smoke');
  tm_tracer_smoke=WorldSpawn(world,type,x,y,z); TmTracerRecord(2,x,y);
  return tm_tracer_smoke;
}
