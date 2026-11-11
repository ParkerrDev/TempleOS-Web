Bool BossLast(World *world,Actor *actor)
{
  I64 id=world->first;
  Actor *other;
  while (other=WorldActorGet(world,id,FALSE)) {
    if (other!=actor && other->active && other->type==actor->type &&
	  other->health>0) return FALSE;
    id=other->tick_next;
  }
  return TRUE;
}

U0 BossKeen(Specials *specials,Actor *actor)
{
  World *world=specials->sectors->motion->world;
  if (actor->world!=world) throw('World');
  if (!actor->active) return;
  actor->flags&=~TM_MF_SOLID;
  if (BossLast(world,actor)) DoorTagNum(specials->sectors,666,TM_DOOR_OPEN);
}

U0 BossDeath(Specials *specials,Actor *actor,I64 episode,I64 map_num,
	Bool commercial=FALSE)
{//The host supplies the map identity; only a living single player can win.
  Sectors *sectors=specials->sectors;
  Motion *motion=sectors->motion;
  World *world=motion->world;
  if (actor->world!=world) throw('World');
  if (!actor->active) return;
  if (commercial) {
    if (map_num!=7 || actor->type!=TM_MT_FATSO && actor->type!=TM_MT_BABY)
      return;
  } else
    switch (episode) {
      case 1:
	if (map_num!=8 || actor->type!=TM_MT_BRUISER) return;
	break;
      case 2:
	if (map_num!=8 || actor->type!=TM_MT_CYBORG) return;
	break;
      case 3:
	if (map_num!=8 || actor->type!=TM_MT_SPIDER) return;
	break;
      case 4:
	if (map_num==6) {
	  if (actor->type!=TM_MT_CYBORG) return;
	} else if (map_num!=8 || actor->type!=TM_MT_SPIDER) return;
	break;
      default:
	if (map_num!=8) return;
    }
  if (!motion->player || motion->player->health<=0 || !BossLast(world,actor))
    return;
  if (commercial) {
    if (actor->type==TM_MT_FATSO)
      FloorTagNum(sectors,666,TM_FLOOR_LOWEST);
    else FloorTagNum(sectors,667,TM_FLOOR_TEXTURE);
  } else if (episode==1 || episode==4 && map_num==8)
    FloorTagNum(sectors,666,TM_FLOOR_LOWEST);
  else if (episode==4 && map_num==6)
    DoorTagNum(sectors,666,TM_DOOR_BLAZE_OPEN);
  else world->exit_rqst=TM_EXIT_NORMAL;
}

U0 BossSnd(Specials *specials,I64 sound)
{
  Motion *motion=specials->sectors->motion;
  if (motion->sound) (*motion->sound)(NULL,sound);
}

Actor *BossExplosion(Specials *specials,I64 x,I64 y,I64 z)
{
  Motion *motion=specials->sectors->motion;
  World *world=motion->world;
  Actor *actor=WorldSpawn(world,TM_MT_ROCKET,x,y,z);
  actor->vz=WorldRand(world)*512;
  ActorState(world->data,actor,TM_S_BRAINEXPLODE1,motion->action);
  actor->tics-=WorldRand(world)&7;
  if (actor->tics<1) actor->tics=1;
  return actor;
}

U0 BossFinal(Specials *specials,Actor *actor,I64 action)
{//The original explosion height has a 128/65536-unit base, not 128 units.
  World *world=specials->sectors->motion->world;
  I64 x,y,z;
  if (actor->world!=world) throw('World');
  if (!actor->active) return;
  switch (action) {
    case TM_A_BRAIN_PAIN: BossSnd(specials,TM_SFX_BOSPN); break;
    case TM_A_BRAIN_DIE: world->exit_rqst=TM_EXIT_NORMAL; break;
    case TM_A_BRAIN_SCREAM:
      for (x=actor->x-196*65536;x<actor->x+320*65536;x+=8*65536) {
	y=actor->y-320*65536; z=128+WorldRand(world)*2*65536;
	BossExplosion(specials,x,y,z);
      }
      BossSnd(specials,TM_SFX_BOSDTH);
      break;
    case TM_A_BRAIN_EXPLODE:
      x=actor->x+WorldRandDiff(world)*2048;
      z=128+WorldRand(world)*2*65536;
      BossExplosion(specials,x,actor->y,z);
      break;
    default: throw('Action');
  }
}
