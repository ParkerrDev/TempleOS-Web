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
