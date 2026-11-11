I64 tm_fat_cases=0,tm_fat_done=0,tm_fat_cnt,tm_fat_trace[24],
	tm_fat_angle,tm_fat_angles[2],tm_fat_spawns;
World *tm_fat_world;
Actor *tm_fat_actor,*tm_fat_target,*tm_fat_missiles[2];

U0 TmFatRecord(I64 event,I64 x,I64 y)
{
  I64 *out=tm_fat_trace+tm_fat_cnt*4;
  if (tm_fat_cnt>=6) throw('Trace');
  out[0]=event; out[1]=x; out[2]=y; out[3]=tm_fat_world->random;
  tm_fat_cnt++;
}

I64 TmFatAngle(GameData *,I64 x,I64 y)
{
  TmFatRecord(1,x,y);
  return tm_fat_angle;
}

U0 TmFatSound(Actor *actor,I64 sound)
{
  if (actor!=tm_fat_actor) throw('Actor');
  TmFatRecord(2,sound,actor->flags);
}

Actor *TmFatMissile(Motion *motion,Actor *source,Actor *target,I64 type)
{
  Actor *actor;
  I64 n=tm_fat_spawns;
  if (motion->world!=tm_fat_world || source!=tm_fat_actor ||
	target!=tm_fat_target || type!=TM_MT_FATSHOT || n>=2) throw('Actor');
  actor=WorldSpawn(tm_fat_world,type,(n+1)*65536,-65536,2*65536);
  actor->angle=tm_fat_angles[n];
  actor->vx=111; actor->vy=222; actor->vz=333;
  WorldRand(tm_fat_world); TmFatRecord(3,source->angle,n);
  tm_fat_missiles[n]=actor; tm_fat_spawns++;
  return actor;
}
