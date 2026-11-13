I64 tm_fire_cases=0,tm_fire_done=0,tm_fire_visible,tm_fire_cnt,
	tm_fire_trace[32];
Actor *tm_fire_actor,*tm_fire_target,*tm_fire_fire,*tm_fire_spawn;

I64 TmFireWho(Actor *actor)
{
  if (!actor) return -1;
  if (actor==tm_fire_actor) return 0;
  if (actor==tm_fire_target) return 1;
  if (actor==tm_fire_fire) return 2;
  if (actor==tm_fire_spawn) return 3;
  throw('Actor');
}

U0 TmFireRecord(I64 event,I64 actor,I64 value)
{
  I64 n=tm_fire_cnt++*4;
  if (n>=32) throw('Trace');
  tm_fire_trace[n]=event; tm_fire_trace[n+1]=actor;
  tm_fire_trace[n+2]=value; tm_fire_trace[n+3]=tm_fire_actor->world->random;
}

U0 TmFireFace(Enemies *enemies,Actor *actor)
{
  if (actor!=tm_fire_actor || !actor->target) throw('Face');
  TmFireRecord(2,1,0); EnemyFace(enemies,actor);
}

Bool TmFireSight(Path *,Actor *actor,Actor *target)
{
  if (actor!=tm_fire_actor || target!=tm_fire_target) throw('Sight');
  TmFireRecord(1,0,tm_fire_visible); return tm_fire_visible;
}

U0 TmFireSound(Enemies *,Actor *actor,I64 n)
{
  TmFireRecord(3,TmFireWho(actor),n);
}

Actor *TmFireRealSpawn(World *world,I64 type,I64 x,I64 y,I64 z=TM_FLOOR_Z)
{
  return WorldSpawn(world,type,x,y,z);
}

Actor *TmFireSpawn(World *world,I64 type,I64 x,I64 y,I64 z=TM_FLOOR_Z)
{
  Actor *fire;
  if (type!=TM_MT_FIRE || x!=tm_fire_target->x || y!=tm_fire_target->y ||
	z!=tm_fire_target->z) throw('Spawn');
  fire=tm_fire_spawn=WorldSpawn(world,type,x,y,z);
  TmFireRecord(4,3,fire->lastlook); return fire;
}

U0 TmFireDamage(Motion *,Actor *target,Actor *inflictor,Actor *source,
	I64 damage)
{
  if (target!=tm_fire_target || inflictor!=tm_fire_actor ||
	source!=tm_fire_actor || damage!=20) throw('Damage');
  TmFireRecord(5,1,damage); target->health-=damage;
}

U0 TmFireRadius(Motion *,Path *,Actor *spot,Actor *source,I64 damage)
{
  if (source!=tm_fire_actor || damage!=70) throw('Radius');
  TmFireRecord(6,TmFireWho(spot),damage);
}
