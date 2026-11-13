U0 EnemyScream(Enemies *tmpe,Actor *actor)
{
  World *world=tmpe->specials->sectors->motion->world;
  I64 sound=world->data->info[actor->type].death_snd;
  switch (sound) {
    case 0: return;
    case TM_SFX_PODTH1...TM_SFX_PODTH3:
      sound=TM_SFX_PODTH1+WorldRand(world)%3;
      break;
    case TM_SFX_BGDTH1...TM_SFX_BGDTH2:
      sound=TM_SFX_BGDTH1+WorldRand(world)%2;
      break;
  }
  if (actor->type==TM_MT_SPIDER || actor->type==TM_MT_CYBORG) actor=NULL;
  EnemySnd(tmpe,actor,sound);
}

U0 EnemyEffect(Enemies *tmpe,Actor *actor,I64 action,Bool commercial=FALSE)
{//The host supplies the episode rule; sound origins retain boss full volume.
  Motion *motion=tmpe->specials->sectors->motion;
  World *world=motion->world;
  I64 sound;
  if (actor->world!=world) throw('World');
  if (!actor->active) return;
  switch (action) {
    case TM_A_SCREAM: EnemyScream(tmpe,actor); break;
    case TM_A_XSCREAM: EnemySnd(tmpe,actor,TM_SFX_SLOP); break;
    case TM_A_PAIN:
      if (sound=world->data->info[actor->type].pain_snd)
	EnemySnd(tmpe,actor,sound);
      break;
    case TM_A_FALL: actor->flags&=~TM_MF_SOLID; break;
    case TM_A_PLAYER_SCREAM:
      sound=TM_SFX_PLDETH;
      if (commercial && actor->health< -50) sound=TM_SFX_PDIEHI;
      EnemySnd(tmpe,actor,sound);
      break;
    case TM_A_HOOF:
    case TM_A_METAL:
    case TM_A_BABY_METAL:
      sound=TM_SFX_HOOF;
      if (action==TM_A_METAL) sound=TM_SFX_METAL;
      else if (action==TM_A_BABY_METAL) sound=TM_SFX_BSPWLK;
      EnemySnd(tmpe,actor,sound); EnemyChase(tmpe,actor);
      break;
    case TM_A_EXPLODE:
      ActorRadius(motion,tmpe->sight,actor,
	    WorldActorGet(world,actor->target),128);
      break;
    case TM_A_BFGSPRAY: ActorBfg(motion,tmpe->trace,actor); break;
    default: throw('Action');
  }
}
