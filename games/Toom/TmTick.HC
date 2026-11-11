U0 ThinkersTick(Specials *tmps)
{//Read the next link after each action so appended thinkers run this tic.
  Sectors *sectors=tmps->sectors;
  Motion *motion=sectors->motion;
  World *world=motion->world;
  Thinker *tmpq;
  Actor *actor;
  Mover *mover;
  if (world->thinking) throw('Thinking');
  world->thinking=TRUE;
  try {
    tmpq=world->thinkers.next;
    while (tmpq!=&world->thinkers) {
      switch (tmpq->kind) {
	case TM_THINK_ACTOR:
	  actor=tmpq;
	  if (ActorMotion(motion,actor))
	    ActorTick(world->data,actor,motion->action);
	  break;
	case TM_THINK_MOVER:
	  mover=tmpq;
	  if (mover->active)
	    switch (mover->kind) {
	      case TM_MOVER_DOOR: DoorTick(sectors,mover); break;
	      case TM_MOVER_FLOOR: FloorTick(sectors,mover); break;
	      case TM_MOVER_PLAT: PlatTick(sectors,mover); break;
	      case TM_MOVER_CEIL: CeilTick(sectors,mover); break;
	      default: throw('Mover');
	    }
	  break;
	case TM_THINK_LIGHT:
	  LightTick(tmps->lights,tmpq);
	  break;
	default:
	  throw('Thinker');
      }
      tmpq=tmpq->next;
    }
  } catch {
    world->thinking=FALSE;
  }
  world->thinking=FALSE;
  WorldSweep(world); MoversSweep(sectors);
}
