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

U0 TickPlayerUse(Actor *actor,U8 *context)
{
  PlayerUse(context,actor);
}

U0 TickPlayerSector(Actor *actor,U8 *context)
{
  Specials *tmps=context;
  PlayerSector(tmps->sectors->motion,actor);
}

I64 LevelTick(Weapon *weapon,Specials *specials,Surfaces *surfaces,
	Bool paused=FALSE)
{//Single-player 35 Hz order. The caller handles exits after this returns.
  World *world=weapon->motion->world;
  WorldIdle(world);
  if (specials->sectors->motion!=weapon->motion ||
	surfaces->map!=world->map ||
	surfaces->graphics!=specials->sectors->graphics) throw('Owner');
  if (world->tic<0 || world->tic==I64_MAX) throw('Tic');
  if (world->exit_rqst || paused) return world->exit_rqst;
  world->ticking=TRUE;
  try {
    PlayerTick(weapon,&TickPlayerUse,&TickPlayerSector,specials);
    ThinkersTick(specials);
    SurfacesTick(surfaces,world->tic); ButtonsTick(specials->switches);
    world->tic++;
  } catch {
    world->ticking=FALSE;
  }
  world->ticking=FALSE;
  return world->exit_rqst;
}
