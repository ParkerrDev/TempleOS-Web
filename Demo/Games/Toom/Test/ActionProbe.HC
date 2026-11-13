I64 tm_action_cases=0,tm_action_done=0,tm_action_n,tm_action_cnt,
	tm_action_args[3];
Actor *tm_action_actor;

U0 TmActionRecord(Enemies *enemies,Actor *actor,I64 n)
{
  if (actor!=tm_action_actor ||
	enemies!=actor->world->actions->brain->enemies) throw('Owner');
  tm_action_n=n; tm_action_cnt++;
}

U0 TmActionEffect(Enemies *enemies,Actor *actor,I64 n,Bool commercial=FALSE)
{
  switch (n) {
    case TM_A_BFGSPRAY:
    case TM_A_EXPLODE:
    case TM_A_PAIN:
    case TM_A_PLAYER_SCREAM:
    case TM_A_FALL:
    case TM_A_XSCREAM:
    case TM_A_SCREAM:
    case TM_A_METAL:
    case TM_A_BABY_METAL:
    case TM_A_HOOF: break;
    default: throw('Route');
  }
  TmActionRecord(enemies,actor,n); tm_action_args[0]=commercial;
}

U0 TmActionShot(Enemies *enemies,Actor *actor,I64 n)
{
  if (n!=TM_A_POS_ATTACK && n!=TM_A_SPOS_ATTACK && n!=TM_A_CPOS_ATTACK)
    throw('Route');
  TmActionRecord(enemies,actor,n);
}

U0 TmActionFire(Enemies *enemies,Actor *actor,I64 n=TM_A_FIRE)
{
  if (n!=TM_A_START_FIRE && n!=TM_A_FIRE && n!=TM_A_FIRE_CRACKLE)
    throw('Route');
  TmActionRecord(enemies,actor,n);
}

U0 TmActionTracer(Enemies *enemies,Actor *actor,I64 game_tic)
{
  TmActionRecord(enemies,actor,TM_A_TRACER); tm_action_args[0]=game_tic;
}

U0 TmActionFat(Enemies *enemies,Actor *actor,I64 n)
{
  if (!(1<=n<=3)) throw('Route');
  TmActionRecord(enemies,actor,TM_A_FAT_ATTACK1+n-1);
}

U0 TmActionRefire(Enemies *enemies,Actor *actor,I64 chance)
{
  if (chance==40) TmActionRecord(enemies,actor,TM_A_CPOS_REFIRE);
  else if (chance==10) TmActionRecord(enemies,actor,TM_A_SPID_REFIRE);
  else throw('Route');
  tm_action_args[0]=chance;
}

U0 TmActionLaunch(Enemies *enemies,Actor *actor,I64 type)
{
  if (type==TM_MT_ARACHPLAZ) TmActionRecord(enemies,actor,TM_A_BSPI_ATTACK);
  else if (type==TM_MT_ROCKET) TmActionRecord(enemies,actor,TM_A_CYBER_ATTACK);
  else throw('Route');
  tm_action_args[0]=type;
}

U0 TmActionBoss(Specials *specials,Actor *actor,I64 episode,I64 map_num,
	Bool commercial=FALSE)
{
  Enemies *enemies=actor->world->actions->brain->enemies;
  if (specials!=enemies->specials) throw('Owner');
  TmActionRecord(enemies,actor,TM_A_BOSS_DEATH);
  tm_action_args[0]=episode; tm_action_args[1]=map_num;
  tm_action_args[2]=commercial;
}

U0 TmActionKeen(Specials *specials,Actor *actor)
{
  Enemies *enemies=actor->world->actions->brain->enemies;
  if (specials!=enemies->specials) throw('Owner');
  TmActionRecord(enemies,actor,TM_A_KEEN_DIE);
}

U0 TmActionFinal(Specials *specials,Actor *actor,I64 n)
{
  Enemies *enemies=actor->world->actions->brain->enemies;
  if (specials!=enemies->specials) throw('Owner');
  switch (n) {
    case TM_A_BRAIN_PAIN:
    case TM_A_BRAIN_SCREAM:
    case TM_A_BRAIN_DIE:
    case TM_A_BRAIN_EXPLODE: break;
    default: throw('Route');
  }
  TmActionRecord(enemies,actor,n);
}

U0 TmActionAwake(Brain *brain,Actor *actor)
{
  if (brain!=actor->world->actions->brain) throw('Owner');
  TmActionRecord(brain->enemies,actor,TM_A_BRAIN_AWAKE);
}

U0 TmActionSpit(Brain *brain,Actor *actor)
{
  if (brain!=actor->world->actions->brain) throw('Owner');
  TmActionRecord(brain->enemies,actor,TM_A_BRAIN_SPIT);
}

U0 TmActionSpawn(Brain *brain,Actor *actor,I64 n=TM_A_SPAWN_FLY)
{
  if (brain!=actor->world->actions->brain) throw('Owner');
  if (n!=TM_A_SPAWN_SOUND && n!=TM_A_SPAWN_FLY) throw('Route');
  TmActionRecord(brain->enemies,actor,n);
}

U0 TmActionEnemyLook(Enemies *enemies,Actor *actor)
{
  TmActionRecord(enemies,actor,TM_A_LOOK);
}

U0 TmActionEnemyChase(Enemies *enemies,Actor *actor)
{
  TmActionRecord(enemies,actor,TM_A_CHASE);
}

U0 TmActionEnemyFace(Enemies *enemies,Actor *actor)
{
  TmActionRecord(enemies,actor,TM_A_FACE_TARGET);
}

U0 TmActionEnemyVileChase(Enemies *enemies,Actor *actor)
{
  TmActionRecord(enemies,actor,TM_A_VILE_CHASE);
}

U0 TmActionEnemyVileStart(Enemies *enemies,Actor *actor)
{
  TmActionRecord(enemies,actor,TM_A_VILE_START);
}

U0 TmActionEnemyVileTarget(Enemies *enemies,Actor *actor)
{
  TmActionRecord(enemies,actor,TM_A_VILE_TARGET);
}

U0 TmActionEnemyVileAttack(Enemies *enemies,Actor *actor)
{
  TmActionRecord(enemies,actor,TM_A_VILE_ATTACK);
}

U0 TmActionEnemyWhoosh(Enemies *enemies,Actor *actor)
{
  TmActionRecord(enemies,actor,TM_A_SKEL_WHOOSH);
}

U0 TmActionEnemySkelFist(Enemies *enemies,Actor *actor)
{
  TmActionRecord(enemies,actor,TM_A_SKEL_FIST);
}

U0 TmActionEnemySkelMissile(Enemies *enemies,Actor *actor)
{
  TmActionRecord(enemies,actor,TM_A_SKEL_MISSILE);
}

U0 TmActionEnemyFatRaise(Enemies *enemies,Actor *actor)
{
  TmActionRecord(enemies,actor,TM_A_FAT_RAISE);
}

U0 TmActionEnemyTroop(Enemies *enemies,Actor *actor)
{
  TmActionRecord(enemies,actor,TM_A_TROOP_ATTACK);
}

U0 TmActionEnemySarg(Enemies *enemies,Actor *actor)
{
  TmActionRecord(enemies,actor,TM_A_SARG_ATTACK);
}

U0 TmActionEnemyHead(Enemies *enemies,Actor *actor)
{
  TmActionRecord(enemies,actor,TM_A_HEAD_ATTACK);
}

U0 TmActionEnemyBruis(Enemies *enemies,Actor *actor)
{
  TmActionRecord(enemies,actor,TM_A_BRUIS_ATTACK);
}

U0 TmActionEnemySkull(Enemies *enemies,Actor *actor)
{
  TmActionRecord(enemies,actor,TM_A_SKULL_ATTACK);
}

U0 TmActionEnemyPainAttack(Enemies *enemies,Actor *actor)
{
  TmActionRecord(enemies,actor,TM_A_PAIN_ATTACK);
}

U0 TmActionEnemyPainDie(Enemies *enemies,Actor *actor)
{
  TmActionRecord(enemies,actor,TM_A_PAIN_DIE);
}
