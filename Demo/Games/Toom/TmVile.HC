Bool EnemyCorpse(Enemies *tmpe,Actor *corpse,I64 x,I64 y)
{//The original raw query deliberately omits movement height and step tests.
  Motion *motion=tmpe->specials->sectors->motion;
  World *world=motion->world;
  ActorInfo *info;
  I64 distance,height;
  Bool res;
  if (corpse->world!=world) throw('World');
  if (!corpse->active || !(corpse->flags&TM_MF_CORPSE) ||
	corpse->tics!=-1) return FALSE;
  info=world->data->info+corpse->type;
  if (!info->raise) return FALSE;
  distance=info->radius+world->data->info[TM_MT_VILE].radius;
  if (AbsI64(corpse->x-x)>distance || AbsI64(corpse->y-y)>distance)
    return FALSE;
  corpse->vx=corpse->vy=0; height=corpse->height; corpse->height<<=2;
  try {
    res=WorldPosition(world,corpse,corpse->x,corpse->y,
	  motion->touch,FALSE);
  } catch {
    corpse->height=height;
  }
  corpse->height=height;
  return res;
}

U0 EnemyVileChase(Enemies *tmpe,Actor *actor)
{//Search block columns, then rows, keeping the original corpse chain order.
  Motion *motion=tmpe->specials->sectors->motion;
  World *world=motion->world;
  I16 *blocks=world->map->blockmap;
  I64 x,y,x1,x2,y1,y2,bx,by,w,h,n,id,next,target;
  Actor *corpse;
  ActorInfo *info;
  if (actor->world!=world) throw('World');
  if (!actor->active) return;
  if (!(0<=actor->movedir<=8)) throw('MoveDir');
  if (actor->movedir!=8) {
    n=world->data->info[actor->type].speed;
    x=actor->x+n*tm_walk_x[actor->movedir];
    y=actor->y+n*tm_walk_y[actor->movedir];
    w=blocks(U16 *)[2]; h=blocks(U16 *)[3];
    x1=MaxI64((x-blocks[0]*65536-64*65536)>>23,0);
    x2=MinI64((x-blocks[0]*65536+64*65536)>>23,w-1);
    y1=MaxI64((y-blocks[1]*65536-64*65536)>>23,0);
    y2=MinI64((y-blocks[1]*65536+64*65536)>>23,h-1);
    for (bx=x1;bx<=x2;bx++)
      for (by=y1;by<=y2;by++) {
	id=world->blocks[bx+by*w];
	while (corpse=WorldActorGet(world,id,FALSE)) {
	  next=corpse->block_next;
	  if (EnemyCorpse(tmpe,corpse,x,y)) {
	    target=actor->target; actor->target=corpse->id;
	    EnemyFace(tmpe,actor); actor->target=target;
	    ActorState(world->data,actor,TM_S_VILE_HEAL1,motion->action);
	    EnemySnd(tmpe,corpse,TM_SFX_SLOP);
	    info=world->data->info+corpse->type;
	    ActorState(world->data,corpse,info->raise,motion->action);
	    corpse->height<<=2; corpse->flags=info->flags;
	    corpse->health=info->health; corpse->target=0;
	    return;
	  }
	  id=next;
	}
      }
  }
  EnemyChase(tmpe,actor);
}

U0 EnemyFire(Enemies *tmpe,Actor *fire,I64 action=TM_A_FIRE)
{//Fire follows the target's facing only while its owner can see the target.
  World *world=tmpe->specials->sectors->motion->world;
  Actor *owner,*target;
  I64 x,y;
  if (fire->world!=world) throw('World');
  if (!fire->active) return;
  if (action==TM_A_START_FIRE) EnemySnd(tmpe,fire,TM_SFX_FLAMST);
  else if (action==TM_A_FIRE_CRACKLE) EnemySnd(tmpe,fire,TM_SFX_FLAME);
  else if (action!=TM_A_FIRE) throw('Action');
  if (!fire->active || !(target=WorldActorGet(world,fire->tracer)) ||
	!(owner=WorldActorGet(world,fire->target)) ||
	!ActorSight(tmpe->sight,owner,target)) return;
  x=target->x+FixedMul(24*65536,AngleCos(world->data,target->angle));
  y=target->y+FixedMul(24*65536,AngleSin(world->data,target->angle));
  WorldActorPlace(world,fire,x,y,target->z);
}

U0 EnemyVileStart(Enemies *tmpe,Actor *actor)
{
  World *world=tmpe->specials->sectors->motion->world;
  if (actor->world!=world) throw('World');
  if (actor->active) EnemySnd(tmpe,actor,TM_SFX_VILATK);
}

U0 EnemyVileTarget(Enemies *tmpe,Actor *actor)
{//Use the target's x/y; the original C spawn accidentally repeated x.
  World *world=tmpe->specials->sectors->motion->world;
  Actor *target=EnemyTarget(tmpe,actor),*fire;
  if (!target) return;
  EnemyFace(tmpe,actor);
  if (!(fire=WorldSpawn(world,TM_MT_FIRE,target->x,target->y,target->z)))
    return;
  actor->tracer=fire->id; fire->target=actor->id; fire->tracer=target->id;
  EnemyFire(tmpe,fire);
}

U0 EnemyVileAttack(Enemies *tmpe,Actor *actor)
{
  Motion *motion=tmpe->specials->sectors->motion;
  World *world=motion->world;
  Actor *target=EnemyTarget(tmpe,actor),*fire;
  I64 x,y;
  if (!target) return;
  EnemyFace(tmpe,actor);
  if (!ActorSight(tmpe->sight,actor,target)) return;
  EnemySnd(tmpe,actor,TM_SFX_BAREXP);
  if (!(target=EnemyTarget(tmpe,actor))) return;
  ActorDamage(motion,target,actor,actor,20);
  if (!(target=EnemyTarget(tmpe,actor))) return;
  target->vz=1000*65536/world->data->info[target->type].mass;
  if (!(fire=WorldActorGet(world,actor->tracer))) return;
  x=target->x-FixedMul(24*65536,AngleCos(world->data,actor->angle));
  y=target->y-FixedMul(24*65536,AngleSin(world->data,actor->angle));
  WorldActorPlace(world,fire,x,y,fire->z);
  ActorRadius(motion,tmpe->sight,fire,actor,70);
}
