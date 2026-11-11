class Brain
{
  Enemies *enemies;
  I64 *targets,cnt,on;
  Bool easy;
};

U0 BrainDel(Brain *tmpb)
{
  if (tmpb) {
    WorldIdle(tmpb->enemies->specials->sectors->motion->world);
    Free(tmpb->targets); Free(tmpb);
  }
}

Brain *BrainNew(Enemies *enemies,Bool easy=FALSE)
{//The host retains the easy-mode phase when replacing a level.
  Brain *tmpb;
  WorldIdle(enemies->specials->sectors->motion->world);
  tmpb=CAlloc(sizeof(Brain)); tmpb->enemies=enemies; tmpb->easy=easy;
  return tmpb;
}

U0 BrainAwake(Brain *tmpb,Actor *actor)
{//Copy active target handles in thinker order without the 32-target limit.
  Specials *specials=tmpb->enemies->specials;
  World *world=specials->sectors->motion->world;
  I64 id,*targets=NULL,cnt=0;
  Actor *other;
  if (actor->world!=world) throw('World');
  if (!actor->active) return;
  if (world->actor_cnt) targets=MAlloc(world->actor_cnt*sizeof(I64));
  id=world->first;
  while (other=WorldActorGet(world,id,FALSE)) {
    if (other->active && other->type==TM_MT_BOSSTARGET)
      targets[cnt++]=other->id;
    id=other->tick_next;
  }
  Free(tmpb->targets); tmpb->targets=targets; tmpb->cnt=cnt; tmpb->on=0;
  BossSnd(specials,TM_SFX_BOSSIT);
}

U0 BrainSpit(Brain *tmpb,Actor *actor)
{//Keep positive y-travel counts; horizontal and short paths get a finite life.
  Specials *specials=tmpb->enemies->specials;
  Motion *motion=specials->sectors->motion;
  World *world=motion->world;
  Actor *target=NULL,*cube;
  I64 left=tmpb->cnt,distance,speed,period,tics=1;
  if (actor->world!=world) throw('World');
  if (!actor->active) return;
  if (left<0 || left && (!(0<=tmpb->on<left) || !tmpb->targets))
    throw('BrainIdx');
  tmpb->easy=!tmpb->easy;
  if (world->skill<=1 && !tmpb->easy) return;
  while (left--) {
    target=WorldActorGet(world,tmpb->targets[tmpb->on]);
    tmpb->on=(tmpb->on+1)%tmpb->cnt;
    if (target) break;
  }
  if (!target) return;
  cube=ActorMissileNew(motion,actor,target,TM_MT_SPAWNSHOT);
  if (cube && cube->active) {
    cube->target=target->id;
    period=world->data->state[cube->state].tics;
    if (period<=0) throw('CubeTics');
    distance=target->y-actor->y; speed=cube->vy;
    if (!distance || !speed) {
      distance=target->x-actor->x; speed=cube->vx;
    }
    if (speed) tics=distance/speed/period;
    cube->reaction=MaxI64(1,tics);
  }
  BossSnd(specials,TM_SFX_BOSPIT);
}

U0 BrainSpawn(Brain *tmpb,Actor *cube,I64 action=TM_A_SPAWN_FLY)
{
  Enemies *enemies=tmpb->enemies;
  Specials *specials=enemies->specials;
  Motion *motion=specials->sectors->motion;
  World *world=motion->world;
  Actor *target,*fog,*monster;
  I64 r,type;
  if (cube->world!=world) throw('World');
  if (!cube->active) return;
  if (action==TM_A_SPAWN_SOUND) {
    if (motion->sound) (*motion->sound)(cube,TM_SFX_BOSCUB);
  } else if (action!=TM_A_SPAWN_FLY) throw('Action');
  if (!cube->active) return;
  if (cube->reaction>1) {cube->reaction--; return;}
  cube->reaction=0;
  if (!(target=WorldActorGet(world,cube->target))) {
    cube->active=FALSE; return;
  }
  fog=WorldSpawn(world,TM_MT_SPAWNFIRE,target->x,target->y,target->z);
  if (motion->sound) (*motion->sound)(fog,TM_SFX_TELEPT);
  if (!cube->active) return;
  if (!(target=WorldActorGet(world,cube->target))) {
    cube->active=FALSE; return;
  }
  r=WorldRand(world);
  switch (r) {
    case 0...49: type=TM_MT_TROOP; break;
    case 50...89: type=TM_MT_SERGEANT; break;
    case 90...119: type=TM_MT_SHADOWS; break;
    case 120...129: type=TM_MT_PAIN; break;
    case 130...159: type=TM_MT_HEAD; break;
    case 160...161: type=TM_MT_VILE; break;
    case 162...171: type=TM_MT_UNDEAD; break;
    case 172...191: type=TM_MT_BABY; break;
    case 192...221: type=TM_MT_FATSO; break;
    case 222...245: type=TM_MT_KNIGHT; break;
    default: type=TM_MT_BRUISER;
  }
  monster=WorldSpawn(world,type,target->x,target->y,target->z);
  if (EnemyPlayer(enemies,monster,TRUE))
    ActorState(world->data,monster,world->data->info[type].see,motion->action);
  ActorTeleportMove(motion,monster,monster->x,monster->y,
	specials->monsters_stomp);
  cube->active=FALSE;
}
