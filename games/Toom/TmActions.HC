class Actions
{
  Brain *brain;
  I64 *game_tic,episode,map_num;
  Bool commercial;
};

U0 ActorAction(Actor *actor,I64 n)
{//Resolve each callback through its own world; clocks survive level changes.
  World *world=actor->world;
  Actions *tmpa;
  Enemies *enemies;
  Specials *specials;
  if (!world) throw('World');
  tmpa=world->actions;
  if (!tmpa) throw('Actions');
  enemies=tmpa->brain->enemies; specials=enemies->specials;
  if (specials->sectors->motion->world!=world) throw('Owner');
  if (!actor->active) return;
  switch (n) {
    case TM_A_NULL: break;
    case TM_A_BFGSPRAY:
    case TM_A_EXPLODE:
    case TM_A_PAIN:
    case TM_A_PLAYER_SCREAM:
    case TM_A_FALL:
    case TM_A_XSCREAM:
    case TM_A_SCREAM:
    case TM_A_METAL:
    case TM_A_BABY_METAL:
    case TM_A_HOOF:
      EnemyEffect(enemies,actor,n,tmpa->commercial);
      break;
    case TM_A_LOOK: EnemyLook(enemies,actor); break;
    case TM_A_CHASE: EnemyChase(enemies,actor); break;
    case TM_A_FACE_TARGET: EnemyFace(enemies,actor); break;
    case TM_A_POS_ATTACK:
    case TM_A_SPOS_ATTACK:
    case TM_A_CPOS_ATTACK:
      EnemyShot(enemies,actor,n);
      break;
    case TM_A_VILE_CHASE: EnemyVileChase(enemies,actor); break;
    case TM_A_VILE_START: EnemyVileStart(enemies,actor); break;
    case TM_A_VILE_TARGET: EnemyVileTarget(enemies,actor); break;
    case TM_A_VILE_ATTACK: EnemyVileAttack(enemies,actor); break;
    case TM_A_START_FIRE:
    case TM_A_FIRE:
    case TM_A_FIRE_CRACKLE:
      EnemyFire(enemies,actor,n);
      break;
    case TM_A_TRACER: EnemyTracer(enemies,actor,*tmpa->game_tic); break;
    case TM_A_SKEL_WHOOSH: EnemyWhoosh(enemies,actor); break;
    case TM_A_SKEL_FIST: EnemySkelFist(enemies,actor); break;
    case TM_A_SKEL_MISSILE: EnemySkelMissile(enemies,actor); break;
    case TM_A_FAT_RAISE: EnemyFatRaise(enemies,actor); break;
    case TM_A_FAT_ATTACK1...TM_A_FAT_ATTACK3:
      EnemyFatAttack(enemies,actor,n-TM_A_FAT_ATTACK1+1);
      break;
    case TM_A_BOSS_DEATH:
      BossDeath(specials,actor,tmpa->episode,tmpa->map_num,tmpa->commercial);
      break;
    case TM_A_CPOS_REFIRE: EnemyRefire(enemies,actor,40); break;
    case TM_A_SPID_REFIRE: EnemyRefire(enemies,actor,10); break;
    case TM_A_TROOP_ATTACK: EnemyTroop(enemies,actor); break;
    case TM_A_SARG_ATTACK: EnemySarg(enemies,actor); break;
    case TM_A_HEAD_ATTACK: EnemyHead(enemies,actor); break;
    case TM_A_BRUIS_ATTACK: EnemyBruis(enemies,actor); break;
    case TM_A_SKULL_ATTACK: EnemySkull(enemies,actor); break;
    case TM_A_BSPI_ATTACK: EnemyLaunch(enemies,actor,TM_MT_ARACHPLAZ); break;
    case TM_A_CYBER_ATTACK: EnemyLaunch(enemies,actor,TM_MT_ROCKET); break;
    case TM_A_PAIN_ATTACK: EnemyPainAttack(enemies,actor); break;
    case TM_A_PAIN_DIE: EnemyPainDie(enemies,actor); break;
    case TM_A_KEEN_DIE: BossKeen(specials,actor); break;
    case TM_A_BRAIN_PAIN:
    case TM_A_BRAIN_SCREAM:
    case TM_A_BRAIN_DIE:
    case TM_A_BRAIN_EXPLODE:
      BossFinal(specials,actor,n);
      break;
    case TM_A_BRAIN_AWAKE: BrainAwake(tmpa->brain,actor); break;
    case TM_A_BRAIN_SPIT: BrainSpit(tmpa->brain,actor); break;
    case TM_A_SPAWN_SOUND:
    case TM_A_SPAWN_FLY:
      BrainSpawn(tmpa->brain,actor,n);
      break;
    default: throw('Action');
  }
}

U0 ActionsDel(Actions *tmpa)
{
  World *world;
  Motion *motion;
  if (tmpa) {
    motion=tmpa->brain->enemies->specials->sectors->motion;
    world=motion->world; WorldIdle(world);
    if (world->actions!=tmpa || motion->action!=&ActorAction) throw('Owner');
    world->actions=NULL; motion->action=NULL; Free(tmpa);
  }
}

Actions *ActionsNew(Brain *brain,I64 *game_tic,I64 episode=1,I64 map_num=1,
	Bool commercial=FALSE)
{//The caller owns Brain and the persistent game clock until unbinding.
  Motion *motion=brain->enemies->specials->sectors->motion;
  World *world=motion->world;
  Actions *tmpa;
  WorldIdle(world);
  if (world->actions || motion->action) throw('Actions');
  if (!game_tic || *game_tic<0) throw('Clock');
  if (commercial) {
    if (!(1<=map_num<=32)) throw('Map');
  } else if (!(1<=episode<=4) || !(1<=map_num<=9)) throw('Map');
  tmpa=CAlloc(sizeof(Actions));
  tmpa->brain=brain; tmpa->game_tic=game_tic; tmpa->episode=episode;
  tmpa->map_num=map_num; tmpa->commercial=commercial;
  world->actions=tmpa; motion->action=&ActorAction;
  return tmpa;
}
