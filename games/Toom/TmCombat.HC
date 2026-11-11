U0 EnemySnd(Enemies *tmpe,Actor *actor,I64 n)
{
  Motion *motion=tmpe->specials->sectors->motion;
  if (motion->sound) (*motion->sound)(actor,n);
}

U0 EnemyShotLine(Actor *actor,I64 line,U8 *context)
{
  LineShoot(context,actor,line);
}

U0 EnemyShot(Enemies *tmpe,Actor *actor,I64 action)
{//Pistol sound follows aim; shotgun and chaingun sound precede facing.
  Motion *motion=tmpe->specials->sectors->motion;
  World *world=motion->world;
  Actor *target=EnemyTarget(tmpe,actor);
  I64 i,cnt=1,angle,base,slope,damage;
  if (!target) return;
  if (action==TM_A_SPOS_ATTACK) cnt=3;
  else if (action!=TM_A_POS_ATTACK && action!=TM_A_CPOS_ATTACK)
    throw('Attack');
  if (action!=TM_A_POS_ATTACK) EnemySnd(tmpe,actor,TM_SFX_SHOTGN);
  EnemyFace(tmpe,actor); base=actor->angle;
  AttackAim(tmpe->trace,actor,base,2048*65536); slope=tmpe->trace->slope;
  if (action==TM_A_POS_ATTACK) EnemySnd(tmpe,actor,TM_SFX_PISTOL);
  for (i=0;i<cnt;i++) {
    angle=base+WorldRandDiff(world)<<20; angle&=0xFFFFFFFF;
    damage=(WorldRand(world)%5+1)*3;
    AttackFire(tmpe->trace,actor,angle,2048*65536,slope);
    AttackApply(motion,tmpe->trace,actor,damage,&EnemyShotLine,tmpe->specials);
  }
}

U0 EnemyRefire(Enemies *tmpe,Actor *actor,I64 chance)
{
  Motion *motion=tmpe->specials->sectors->motion;
  World *world=motion->world;
  Actor *target;
  EnemyFace(tmpe,actor);
  if (WorldRand(world)<chance) return;
  target=EnemyTarget(tmpe,actor);
  if (!target || target->health<=0 || !ActorSight(tmpe->sight,actor,target))
    ActorState(world->data,actor,world->data->info[actor->type].see,
	  motion->action);
}

U0 EnemyTroop(Enemies *tmpe,Actor *actor)
{
  Motion *motion=tmpe->specials->sectors->motion;
  Actor *target=EnemyTarget(tmpe,actor);
  I64 damage;
  if (!target) return;
  EnemyFace(tmpe,actor);
  if (EnemyMelee(tmpe,actor)) {
    EnemySnd(tmpe,actor,TM_SFX_CLAW);
    damage=(WorldRand(motion->world)%8+1)*3;
    ActorDamage(motion,target,actor,actor,damage);
  } else
    ActorMissileNew(motion,actor,target,TM_MT_TROOPSHOT);
}

U0 EnemySarg(Enemies *tmpe,Actor *actor)
{
  Motion *motion=tmpe->specials->sectors->motion;
  Actor *target=EnemyTarget(tmpe,actor);
  I64 damage;
  if (!target) return;
  EnemyFace(tmpe,actor);
  if (EnemyMelee(tmpe,actor)) {
    damage=(WorldRand(motion->world)%10+1)*4;
    ActorDamage(motion,target,actor,actor,damage);
  }
}

U0 EnemyHead(Enemies *tmpe,Actor *actor)
{
  Motion *motion=tmpe->specials->sectors->motion;
  Actor *target=EnemyTarget(tmpe,actor);
  I64 damage;
  if (!target) return;
  EnemyFace(tmpe,actor);
  if (EnemyMelee(tmpe,actor)) {
    damage=(WorldRand(motion->world)%6+1)*10;
    ActorDamage(motion,target,actor,actor,damage);
  } else
    ActorMissileNew(motion,actor,target,TM_MT_HEADSHOT);
}

U0 EnemyBruis(Enemies *tmpe,Actor *actor)
{//This action intentionally leaves the actor's facing alone.
  Motion *motion=tmpe->specials->sectors->motion;
  Actor *target=EnemyTarget(tmpe,actor);
  I64 damage;
  if (!target) return;
  if (EnemyMelee(tmpe,actor)) {
    EnemySnd(tmpe,actor,TM_SFX_CLAW);
    damage=(WorldRand(motion->world)%8+1)*10;
    ActorDamage(motion,target,actor,actor,damage);
  } else
    ActorMissileNew(motion,actor,target,TM_MT_BRUISERSHOT);
}

U0 EnemySkelFist(Enemies *tmpe,Actor *actor)
{
  Motion *motion=tmpe->specials->sectors->motion;
  Actor *target=EnemyTarget(tmpe,actor);
  I64 damage;
  if (!target) return;
  EnemyFace(tmpe,actor);
  if (EnemyMelee(tmpe,actor)) {
    damage=(WorldRand(motion->world)%10+1)*6;
    EnemySnd(tmpe,actor,TM_SFX_SKEPCH);
    ActorDamage(motion,target,actor,actor,damage);
  }
}

U0 EnemyLaunch(Enemies *tmpe,Actor *actor,I64 type)
{
  Actor *target=EnemyTarget(tmpe,actor);
  if (!target) return;
  EnemyFace(tmpe,actor);
  ActorMissileNew(tmpe->specials->sectors->motion,actor,target,type);
}

U0 EnemyWhoosh(Enemies *tmpe,Actor *actor)
{
  if (!EnemyTarget(tmpe,actor)) return;
  EnemyFace(tmpe,actor); EnemySnd(tmpe,actor,TM_SFX_SKESWG);
}

U0 MissileTurn(Actor *actor,I64 delta)
{//Spread changes horizontal velocity after the original initial half-step.
  GameData *data=actor->world->data;
  I64 speed=data->info[actor->type].speed;
  actor->angle=(actor->angle+delta)&0xFFFFFFFF;
  actor->vx=FixedMul(speed,AngleCos(data,actor->angle));
  actor->vy=FixedMul(speed,AngleSin(data,actor->angle));
}

U0 EnemyFatRaise(Enemies *tmpe,Actor *actor)
{
  EnemyFace(tmpe,actor); EnemySnd(tmpe,actor,TM_SFX_MANATK);
}

U0 EnemyFatAttack(Enemies *tmpe,Actor *actor,I64 n)
{
  Motion *motion=tmpe->specials->sectors->motion;
  Actor *target=EnemyTarget(tmpe,actor),*missile;
  I64 first=0,second=0x08000000;
  if (!(1<=n<=3)) throw('Attack');
  if (!target) return;
  EnemyFace(tmpe,actor);
  switch (n) {
    case 1: actor->angle+=0x08000000; break;
    case 2: actor->angle-=0x08000000; second=-0x10000000; break;
    case 3: first=-0x04000000; second=0x04000000; break;
  }
  actor->angle&=0xFFFFFFFF;
  missile=ActorMissileNew(motion,actor,target,TM_MT_FATSHOT);
  if (missile && first) MissileTurn(missile,first);
  missile=ActorMissileNew(motion,actor,target,TM_MT_FATSHOT);
  if (missile) MissileTurn(missile,second);
}

U0 EnemySkull(Enemies *tmpe,Actor *actor)
{
  World *world=tmpe->specials->sectors->motion->world;
  Actor *target=EnemyTarget(tmpe,actor);
  I64 distance;
  if (!target) return;
  actor->flags|=TM_MF_SKULLFLY;
  EnemySnd(tmpe,actor,world->data->info[actor->type].attack_snd);
  EnemyFace(tmpe,actor);
  actor->vx=FixedMul(20*65536,AngleCos(world->data,actor->angle));
  actor->vy=FixedMul(20*65536,AngleSin(world->data,actor->angle));
  distance=MaxI64(DistanceApprox(target->x-actor->x,target->y-actor->y)/
	(20*65536),1);
  actor->vz=(target->z+target->height/2-actor->z)/distance;
}
