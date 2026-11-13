I64 tm_pain_cases=0,tm_pain_done=0,tm_pain_cnt,tm_pain_trace[40],
	tm_pain_spawns,tm_pain_allow,
	tm_pain_charged[3],tm_pain_damage[3];
World *tm_pain_world;
Actor *tm_pain_actor,*tm_pain_target,*tm_pain_skulls[3];

U0 TmPainRecord(I64 event,I64 x,I64 y)
{
  I64 *out=tm_pain_trace+tm_pain_cnt*4;
  if (tm_pain_cnt>=10) throw('Trace');
  out[0]=event; out[1]=x; out[2]=y; out[3]=tm_pain_world->random;
  tm_pain_cnt++;
}

I64 TmPainIndex(Actor *actor)
{
  I64 i;
  for (i=0;i<tm_pain_spawns;i++) if (tm_pain_skulls[i]==actor) return i;
  throw('Actor');
  return -1;
}

Actor *TmPainRealSpawn(World *world,I64 type,I64 x,I64 y,
	I64 z=TM_FLOOR_Z)
{
  return WorldSpawn(world,type,x,y,z);
}

Actor *TmPainSpawn(World *world,I64 type,I64 x,I64 y,I64 z)
{
  Actor *actor;
  I64 n=tm_pain_spawns;
  if (world!=tm_pain_world || type!=TM_MT_SKULL || n>=3) throw('Actor');
  actor=WorldSpawn(world,type,x,y,z);
  tm_pain_skulls[n]=actor; tm_pain_spawns++;
  TmPainRecord(1,n,tm_pain_actor->flags);
  return actor;
}

Bool TmPainMove(World *world,Actor *actor,I64 x,I64 y,
	U0 (*)(Actor *,Actor *,I64),U0 (*)(Actor *,I64,I64))
{
  I64 n=TmPainIndex(actor),ok=tm_pain_allow>>n&1;
  if (world!=tm_pain_world || x!=actor->x || y!=actor->y) throw('Actor');
  TmPainRecord(2,n,ok);
  return ok;
}

U0 TmPainDamage(Motion *motion,Actor *actor,Actor *inflictor,Actor *source,
	I64 damage)
{
  I64 n=TmPainIndex(actor);
  if (motion->world!=tm_pain_world || inflictor!=tm_pain_actor ||
	source!=tm_pain_actor) throw('Actor');
  tm_pain_damage[n]=damage; TmPainRecord(3,n,damage);
}

U0 TmPainSkull(Enemies *enemies,Actor *actor)
{
  I64 n=TmPainIndex(actor),target=0;
  if (enemies->specials->sectors->motion->world!=tm_pain_world)
    throw('Actor');
  if (actor->target==tm_pain_target->id) target=1;
  tm_pain_charged[n]=1; TmPainRecord(4,n,target);
}
