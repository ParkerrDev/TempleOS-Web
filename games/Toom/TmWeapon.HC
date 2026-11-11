#define TM_BTF_ATTACK	(1<<0)
#define TM_BTF_USE	(1<<1)
#define TM_WEAPON_TOP	(32*65536)
#define TM_WEAPON_BOTTOM	(128*65536)

class Weapon
{
  Motion *motion;
  Attack *trace;
  I64 state_depth;
  U0 (*action)(Weapon *weapon,Psprite *sprite,I64 n);
  U0 (*special)(Actor *source,I64 line,U8 *context);
  U8 *special_context;
  U0 (*noise)(Actor *source);
};

U0 WeaponDel(Weapon *tmpw)
{
  if (tmpw) {
    WorldIdle(tmpw->motion->world);
    AttackDel(tmpw->trace); Free(tmpw);
  }
}

Actor *WeaponActor(Weapon *tmpw)
{
  World *world=tmpw->motion->world;
  return WorldActorGet(world,world->player);
}

U0 WeaponSound(Weapon *tmpw,I64 n)
{
  Actor *tmpa=WeaponActor(tmpw);
  if (tmpa && tmpw->motion->sound) (*tmpw->motion->sound)(tmpa,n);
}

U0 WeaponState(Weapon *tmpw,I64 slot,I64 n)
{//Actions may replace this overlay; follow its current state afterward.
  GameData *data=tmpw->motion->world->data;
  Psprite *tmpp;
  State *tmps;
  I64 left=TM_STATE_NUM;
  if (!(0<=slot<2) || tmpw->state_depth>=64) throw('WpState');
  tmpp=tmpw->motion->player->psprite+slot; tmpw->state_depth++;
  try {
    do {
      if (!left-- || !StateValid(n)) throw('WpState');
      tmpp->state=n;
      if (!n) break;
      tmps=data->state+n; tmpp->tics=tmps->tics;
      if (tmps->misc1) {
	tmpp->x=tmps->misc1*65536; tmpp->y=tmps->misc2*65536;
      }
      if (tmps->action && tmpw->action)
	(*tmpw->action)(tmpw,tmpp,tmps->action);
      if (!tmpp->state) break;
      if (!StateValid(tmpp->state)) throw('WpState');
      n=data->state[tmpp->state].next;
    } while (!tmpp->tics);
  } catch {
    tmpw->state_depth--;
  }
  tmpw->state_depth--;
}

U0 WeaponRaise(Weapon *tmpw)
{
  Player *tmpp=tmpw->motion->player;
  I64 n=tmpp->pending_weapon;
  if (n==TM_WP_NOCHANGE) n=tmpp->ready_weapon;
  if (!(0<=n<TM_WEAPON_NUM)) throw('Weapon');
  if (n==TM_WP_CHAINSAW) WeaponSound(tmpw,TM_SFX_SAWUP);
  tmpp->pending_weapon=TM_WP_NOCHANGE;
  tmpp->psprite[0].y=TM_WEAPON_BOTTOM;
  WeaponState(tmpw,0,tmpw->motion->world->data->weapon[n].up);
}

I64 WeaponAmmoNeed(I64 n)
{
  if (n==TM_WP_BFG) return 40;
  if (n==TM_WP_SUPERSHOTGUN) return 2;
  return 1;
}

I64 tm_weapon_order[TM_WEAPON_NUM]={TM_WP_PLASMA,TM_WP_SUPERSHOTGUN,
      TM_WP_CHAINGUN,TM_WP_SHOTGUN,TM_WP_PISTOL,TM_WP_CHAINSAW,
      TM_WP_MISSILE,TM_WP_BFG,TM_WP_FIST};

Bool WeaponAmmoCheck(Weapon *tmpw)
{//Select an owned weapon with enough ammunition for one complete shot.
  Player *tmpp=tmpw->motion->player;
  GameData *data=tmpw->motion->world->data;
  I64 n=tmpp->ready_weapon,ammo,i;
  if (!(0<=n<TM_WEAPON_NUM)) throw('Weapon');
  ammo=data->weapon[n].ammo;
  if (ammo==TM_AM_NOAMMO || tmpp->ammo[ammo]>=WeaponAmmoNeed(n)) return TRUE;
  for (i=0;i<TM_WEAPON_NUM;i++) {
    n=tm_weapon_order[i]; ammo=data->weapon[n].ammo;
    if (tmpp->weapon[n] &&
	  (ammo==TM_AM_NOAMMO || tmpp->ammo[ammo]>=WeaponAmmoNeed(n))) {
      tmpp->pending_weapon=n;
      WeaponState(tmpw,0,data->weapon[tmpp->ready_weapon].down);
      return FALSE;
    }
  }
  throw('NoWeapon');
}

U0 WeaponFire(Weapon *tmpw)
{
  Motion *tmpm=tmpw->motion;
  Player *tmpp=tmpm->player;
  Actor *tmpa=WeaponActor(tmpw);
  if (!tmpa || tmpp->dead || tmpp->health<=0 || !WeaponAmmoCheck(tmpw)) return;
  ActorState(tmpm->world->data,tmpa,TM_S_PLAY_ATK1,tmpm->action);
  WeaponState(tmpw,0,tmpm->world->data->weapon[tmpp->ready_weapon].attack);
  if (tmpw->noise) (*tmpw->noise)(tmpa);
}

U0 WeaponRefire(Weapon *tmpw)
{
  Player *tmpp=tmpw->motion->player;
  if (tmpp->buttons&TM_BTF_ATTACK && tmpp->pending_weapon==TM_WP_NOCHANGE &&
	tmpp->health>0 && !tmpp->dead) {
    tmpp->refire++; WeaponFire(tmpw);
  } else {
    tmpp->refire=0; WeaponAmmoCheck(tmpw);
  }
}

U0 WeaponReady(Weapon *tmpw,Psprite *sprite)
{
  Motion *tmpm=tmpw->motion;
  Player *tmpp=tmpm->player;
  GameData *data=tmpm->world->data;
  Actor *tmpa=WeaponActor(tmpw);
  I64 angle,n=tmpp->ready_weapon;
  if (!tmpa) return;
  if (tmpa->state==TM_S_PLAY_ATK1 || tmpa->state==TM_S_PLAY_ATK2)
    ActorState(data,tmpa,TM_S_PLAY,tmpm->action);
  if (n==TM_WP_CHAINSAW && sprite->state==TM_S_SAW)
    WeaponSound(tmpw,TM_SFX_SAWIDL);
  if (tmpp->pending_weapon!=TM_WP_NOCHANGE || tmpp->dead || tmpp->health<=0) {
    WeaponState(tmpw,0,data->weapon[n].down); return;
  }
  if (tmpp->buttons&TM_BTF_ATTACK) {
    if (!tmpp->attack_down || n!=TM_WP_MISSILE && n!=TM_WP_BFG) {
      tmpp->attack_down=TRUE; WeaponFire(tmpw); return;
    }
  } else
    tmpp->attack_down=FALSE;
  angle=128*tmpw->motion->world->tic&8191;
  sprite->x=65536+FixedMul(tmpp->bob,data->sine[angle+2048]);
  sprite->y=TM_WEAPON_TOP+FixedMul(tmpp->bob,data->sine[angle&4095]);
}

U0 WeaponLower(Weapon *tmpw,Psprite *sprite)
{
  Player *tmpp=tmpw->motion->player;
  sprite->y+=6*65536;
  if (sprite->y<TM_WEAPON_BOTTOM) return;
  if (tmpp->dead) {
    sprite->y=TM_WEAPON_BOTTOM; return;
  }
  if (tmpp->health<=0) {
    WeaponState(tmpw,0,0); return;
  }
  if (tmpp->pending_weapon!=TM_WP_NOCHANGE)
    tmpp->ready_weapon=tmpp->pending_weapon;
  WeaponRaise(tmpw);
}

U0 WeaponFlash(Weapon *tmpw,I64 offset=0,Bool actor_state=TRUE)
{
  Motion *tmpm=tmpw->motion;
  Actor *tmpa=WeaponActor(tmpw);
  if (tmpa && actor_state)
    ActorState(tmpm->world->data,tmpa,TM_S_PLAY_ATK2,tmpm->action);
  WeaponState(tmpw,1,
	tmpm->world->data->weapon[tmpm->player->ready_weapon].flash+offset);
}

I64 WeaponSlope(Weapon *tmpw,Actor *tmpa)
{
  Attack *trace=tmpw->trace;
  I64 angle=tmpa->angle;
  if (!AttackAim(trace,tmpa,angle,1024*65536)) {
    angle+=1<<26;
    if (!AttackAim(trace,tmpa,angle,1024*65536))
      AttackAim(trace,tmpa,angle-2<<26,1024*65536);
  }
  return trace->slope;
}

U0 WeaponShot(Weapon *tmpw,Actor *tmpa,I64 angle,I64 range,
	I64 slope,I64 damage)
{
  AttackFire(tmpw->trace,tmpa,angle,range,slope);
  AttackApply(tmpw->motion,tmpw->trace,tmpa,damage,tmpw->special,
	tmpw->special_context);
}

U0 WeaponBullet(Weapon *tmpw,Actor *tmpa,I64 slope,Bool accurate)
{
  World *world=tmpw->motion->world;
  I64 damage=5*(WorldRand(world)%3+1),angle=tmpa->angle;
  if (!accurate) angle+=WorldRandDiff(world)<<18;
  WeaponShot(tmpw,tmpa,angle,2048*65536,slope,damage);
}

U0 WeaponMelee(Weapon *tmpw,Bool saw)
{
  Motion *tmpm=tmpw->motion;
  World *world=tmpm->world;
  Actor *tmpa=WeaponActor(tmpw),*target;
  I64 damage=2*(WorldRand(world)%10+1),angle,range=64*65536,slope,id,delta;
  if (!tmpa) return;
  if (saw) range++;
  else if (tmpm->player->power[TM_PW_STRENGTH]) damage*=10;
  angle=tmpa->angle+WorldRandDiff(world)<<18;
  AttackAim(tmpw->trace,tmpa,angle,range); slope=tmpw->trace->slope;
  AttackFire(tmpw->trace,tmpa,angle,range,slope); id=tmpw->trace->target;
  AttackApply(tmpm,tmpw->trace,tmpa,damage,tmpw->special,tmpw->special_context);
  if (!(target=WorldActorGet(world,id))) {
    if (saw) WeaponSound(tmpw,TM_SFX_SAWFUL);
    return;
  }
  angle=AngleFrom(world->data,target->x-tmpa->x,target->y-tmpa->y);
  if (!saw) {
    WeaponSound(tmpw,TM_SFX_PUNCH); tmpa->angle=angle; return;
  }
  WeaponSound(tmpw,TM_SFX_SAWHIT);
  delta=angle-tmpa->angle; delta&=0xFFFFFFFF;
  if (delta>0x80000000) {
    if (delta<0x100000000-0x40000000/20)
      tmpa->angle=angle+0x40000000/21;
    else tmpa->angle-=0x40000000/20;
  } else {
    if (delta>0x40000000/20) tmpa->angle=angle-0x40000000/21;
    else tmpa->angle+=0x40000000/20;
  }
  tmpa->angle&=0xFFFFFFFF; tmpa->flags|=TM_MF_JUSTATTACKED;
}

U0 WeaponGun(Weapon *tmpw,Psprite *sprite,I64 n)
{
  Motion *tmpm=tmpw->motion;
  Player *tmpp=tmpm->player;
  World *world=tmpm->world;
  Actor *tmpa=WeaponActor(tmpw);
  I64 ammo=world->data->weapon[tmpp->ready_weapon].ammo,i,slope,
	angle,damage,cost=1,offset=0,sound=TM_SFX_PISTOL;
  if (!tmpa) return;
  if (n==TM_A_FIRE_SHOTGUN) sound=TM_SFX_SHOTGN;
  if (n==TM_A_FIRE_SHOTGUN2) {sound=TM_SFX_DSHTGN; cost=2;}
  WeaponSound(tmpw,sound);
  if (tmpp->ammo[ammo]<cost) return;
  tmpp->ammo[ammo]-=cost;
  if (n==TM_A_FIRE_CGUN) offset=sprite->state-TM_S_CHAIN1;
  WeaponFlash(tmpw,offset); slope=WeaponSlope(tmpw,tmpa);
  switch (n) {
    case TM_A_FIRE_SHOTGUN:
      for (i=0;i<7;i++) WeaponBullet(tmpw,tmpa,slope,FALSE);
      break;
    case TM_A_FIRE_SHOTGUN2:
      for (i=0;i<20;i++) {
	damage=5*(WorldRand(world)%3+1);
	angle=tmpa->angle+WorldRandDiff(world)<<19;
	WeaponShot(tmpw,tmpa,angle,2048*65536,
	      slope+WorldRandDiff(world)<<5,damage);
      }
      break;
    default:
      WeaponBullet(tmpw,tmpa,slope,!tmpp->refire);
  }
}

U0 WeaponMissile(Weapon *tmpw,I64 n)
{
  Motion *tmpm=tmpw->motion;
  Player *tmpp=tmpm->player;
  World *world=tmpm->world;
  Actor *tmpa=WeaponActor(tmpw);
  I64 ammo=world->data->weapon[tmpp->ready_weapon].ammo,cost=1,
	type=TM_MT_ROCKET;
  if (!tmpa) return;
  if (n==TM_A_FIRE_BFG) {type=TM_MT_BFG; cost=40;}
  if (n==TM_A_FIRE_PLASMA) type=TM_MT_PLASMA;
  if (tmpp->ammo[ammo]<cost) return;
  tmpp->ammo[ammo]-=cost;
  if (n==TM_A_FIRE_PLASMA) WeaponFlash(tmpw,WorldRand(world)&1,FALSE);
  PlayerMissileNew(tmpm,tmpw->trace,tmpa,type);
}

U0 WeaponAction(Weapon *tmpw,Psprite *sprite,I64 n)
{
  Player *tmpp=tmpw->motion->player;
  switch (n) {
    case TM_A_LIGHT0:
      tmpp->extra_light=0;
      break;
    case TM_A_LIGHT1:
      tmpp->extra_light=1;
      break;
    case TM_A_LIGHT2:
      tmpp->extra_light=2;
      break;
    case TM_A_WEAPON_READY:
      WeaponReady(tmpw,sprite);
      break;
    case TM_A_LOWER:
      WeaponLower(tmpw,sprite);
      break;
    case TM_A_RAISE:
      sprite->y-=6*65536;
      if (sprite->y<=TM_WEAPON_TOP) {
	sprite->y=TM_WEAPON_TOP;
	WeaponState(tmpw,0,
	      tmpw->motion->world->data->weapon[tmpp->ready_weapon].ready);
      }
      break;
    case TM_A_RE_FIRE:
      WeaponRefire(tmpw);
      break;
    case TM_A_CHECK_RELOAD:
      WeaponAmmoCheck(tmpw);
      break;
    case TM_A_OPEN_SHOTGUN2:
      WeaponSound(tmpw,TM_SFX_DBOPN);
      break;
    case TM_A_LOAD_SHOTGUN2:
      WeaponSound(tmpw,TM_SFX_DBLOAD);
      break;
    case TM_A_CLOSE_SHOTGUN2:
      WeaponSound(tmpw,TM_SFX_DBCLS); WeaponRefire(tmpw);
      break;
    case TM_A_GUN_FLASH:
      WeaponFlash(tmpw);
      break;
    case TM_A_PUNCH:
      WeaponMelee(tmpw,FALSE);
      break;
    case TM_A_SAW:
      WeaponMelee(tmpw,TRUE);
      break;
    case TM_A_FIRE_PISTOL:
    case TM_A_FIRE_SHOTGUN:
    case TM_A_FIRE_SHOTGUN2:
    case TM_A_FIRE_CGUN:
      WeaponGun(tmpw,sprite,n);
      break;
    case TM_A_FIRE_MISSILE:
    case TM_A_FIRE_PLASMA:
    case TM_A_FIRE_BFG:
      WeaponMissile(tmpw,n);
      break;
    case TM_A_BFGSOUND:
      WeaponSound(tmpw,TM_SFX_BFG);
      break;
    default:
      throw('WpAction');
  }
}

Weapon *WeaponNew(Motion *tmpm)
{//The weapon owns its trace and borrows the level's motion context.
  Weapon *tmpw;
  if (!tmpm->player || !WorldActorGet(tmpm->world,tmpm->world->player))
    throw('Player');
  tmpw=CAlloc(sizeof(Weapon));
  tmpw->motion=tmpm; tmpw->trace=AttackNew(tmpm->world);
  tmpw->action=&WeaponAction;
  return tmpw;
}

U0 WeaponStart(Weapon *tmpw)
{
  Player *tmpp=tmpw->motion->player;
  if (!(0<=tmpp->ready_weapon<TM_WEAPON_NUM)) throw('Weapon');
  MemSet(tmpp->psprite,0,2*sizeof(Psprite));
  tmpp->pending_weapon=tmpp->ready_weapon;
  WeaponRaise(tmpw);
}

U0 WeaponTick(Weapon *tmpw)
{//Two overlay clocks advance once per simulation tic, independently of draw.
  Player *tmpp=tmpw->motion->player;
  Psprite *sprite=tmpp->psprite;
  I64 i,down=tmpw->motion->world->data->weapon[tmpp->ready_weapon].down;
  if (tmpp->dead && sprite->state && sprite->state!=down)
    WeaponState(tmpw,0,down);
  for (i=0;i<2;i++,sprite++)
    if (sprite->state && sprite->tics!= -1 && !--sprite->tics)
      WeaponState(tmpw,i,tmpw->motion->world->data->state[sprite->state].next);
  tmpp->psprite[1].x=tmpp->psprite[0].x;
  tmpp->psprite[1].y=tmpp->psprite[0].y;
}
