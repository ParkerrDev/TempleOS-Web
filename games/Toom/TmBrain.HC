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
