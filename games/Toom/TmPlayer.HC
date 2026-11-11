U0 PlayerCmd(Player *tmpp,I64 forward,I64 side,I64 turn,I64 buttons,
	I64 weapon=TM_WP_NOCHANGE)
{//A command is sampled once per 35 Hz tic, independently of drawing.
  tmpp->forward=ClampI64(forward,-50,50);
  tmpp->side=ClampI64(side,-50,50);
  tmpp->angle_turn=ClampI64(turn,-32768,32767);
  tmpp->buttons=buttons&(TM_BTF_ATTACK|TM_BTF_USE);
  tmpp->weapon_rqst=TM_WP_NOCHANGE;
  if (0<=weapon<TM_WEAPON_NUM) tmpp->weapon_rqst=weapon;
}

U0 PlayerThrust(Motion *tmpm,Actor *tmpa,I64 angle,I64 move)
{
  tmpa->vx+=FixedMul(move,AngleCos(tmpm->world->data,angle));
  tmpa->vy+=FixedMul(move,AngleSin(tmpm->world->data,angle));
}

U0 PlayerMove(Motion *tmpm,Actor *tmpa)
{
  Player *tmpp=tmpm->player;
  tmpa->angle+=tmpp->angle_turn*65536; tmpa->angle&=0xFFFFFFFF;
  if (tmpa->z<=tmpa->floor) {
    if (tmpp->forward)
      PlayerThrust(tmpm,tmpa,tmpa->angle,tmpp->forward*2048);
    if (tmpp->side)
      PlayerThrust(tmpm,tmpa,tmpa->angle-0x40000000,tmpp->side*2048);
  }
  if ((tmpp->forward || tmpp->side) && tmpa->state==TM_S_PLAY)
    ActorState(tmpm->world->data,tmpa,TM_S_PLAY_RUN1,tmpm->action);
}

U0 PlayerView(Motion *tmpm,Actor *tmpa,I64 tic)
{//Keep the eye below the ceiling, including airborne and dying players.
  Player *tmpp=tmpm->player;
  I64 bob=0,angle=409*tic&8191;
  tmpp->bob=MinI64((FixedMul(tmpa->vx,tmpa->vx)+
	FixedMul(tmpa->vy,tmpa->vy))>>2,16*65536);
  if (!tmpp->no_momentum && tmpa->z<=tmpa->floor) {
    bob=FixedMul(tmpp->bob/2,tmpm->world->data->sine[angle]);
    if (!tmpp->dead) {
      tmpp->view_height+=tmpp->delta_view_height;
      if (tmpp->view_height>TM_EYE_HEIGHT) {
	tmpp->view_height=TM_EYE_HEIGHT; tmpp->delta_view_height=0;
      }
      if (tmpp->view_height<TM_EYE_HEIGHT/2) {
	tmpp->view_height=TM_EYE_HEIGHT/2;
	if (tmpp->delta_view_height<=0) tmpp->delta_view_height=1;
      }
      if (tmpp->delta_view_height) {
	tmpp->delta_view_height+=65536/4;
	if (!tmpp->delta_view_height) tmpp->delta_view_height=1;
      }
    }
  }
  tmpp->view_z=MinI64(tmpa->z+tmpp->view_height+bob,tmpa->ceil-4*65536);
}

U0 PlayerWeaponRqst(Player *tmpp,I64 n)
{
  if (!(0<=n<TM_WEAPON_NUM)) return;
  if (n==TM_WP_FIST && tmpp->weapon[TM_WP_CHAINSAW] &&
	!(tmpp->ready_weapon==TM_WP_CHAINSAW && tmpp->power[TM_PW_STRENGTH]))
    n=TM_WP_CHAINSAW;
  if (n==TM_WP_SHOTGUN && tmpp->weapon[TM_WP_SUPERSHOTGUN] &&
	tmpp->ready_weapon!=TM_WP_SUPERSHOTGUN)
    n=TM_WP_SUPERSHOTGUN;
  if (tmpp->weapon[n] && n!=tmpp->ready_weapon) tmpp->pending_weapon=n;
}

U0 PlayerPowerTick(Player *tmpp,Actor *tmpa)
{
  I64 n;
  if (tmpp->power[TM_PW_STRENGTH]) tmpp->power[TM_PW_STRENGTH]++;
  if (tmpp->power[TM_PW_INVULNERABILITY]) tmpp->power[TM_PW_INVULNERABILITY]--;
  if (tmpp->power[TM_PW_INVISIBILITY] && !--tmpp->power[TM_PW_INVISIBILITY])
    tmpa->flags&=~TM_MF_SHADOW;
  if (tmpp->power[TM_PW_INFRARED]) tmpp->power[TM_PW_INFRARED]--;
  if (tmpp->power[TM_PW_IRONFEET]) tmpp->power[TM_PW_IRONFEET]--;
  if (tmpp->damage_cnt) tmpp->damage_cnt--;
  if (tmpp->bonus_cnt) tmpp->bonus_cnt--;
  if (tmpp->pickup_tics) tmpp->pickup_tics--;
  tmpp->fixed_colormap=0;
  if (n=tmpp->power[TM_PW_INVULNERABILITY]) {
    if (n>128 || n&8) tmpp->fixed_colormap=32;
  } else if (n=tmpp->power[TM_PW_INFRARED])
    if (n>128 || n&8) tmpp->fixed_colormap=1;
}

U0 PlayerDeath(Motion *tmpm,Actor *tmpa,I64 tic)
{
  Player *tmpp=tmpm->player;
  Actor *attacker=WorldActorGet(tmpm->world,tmpp->attacker);
  I64 angle,delta,step=0x40000000/18;
  tmpp->view_height=MaxI64(tmpp->view_height-65536,6*65536);
  tmpp->delta_view_height=0; PlayerView(tmpm,tmpa,tic);
  if (attacker && attacker!=tmpa) {
    angle=AngleFrom(tmpm->world->data,attacker->x-tmpa->x,attacker->y-tmpa->y);
    delta=angle-tmpa->angle; delta&=0xFFFFFFFF;
    if (delta<step || delta>0x100000000-step) {
      tmpa->angle=angle;
      if (tmpp->damage_cnt) tmpp->damage_cnt--;
    } else if (delta<0x80000000) tmpa->angle+=step;
    else tmpa->angle-=step;
    tmpa->angle&=0xFFFFFFFF;
  } else if (tmpp->damage_cnt)
    tmpp->damage_cnt--;
  if (tmpp->buttons&TM_BTF_USE) tmpp->reborn=TRUE;
}

U0 PlayerTick(Weapon *tmpw,U0 (*use)(Actor *actor,U8 *context)=NULL,
	U0 (*sector)(Actor *actor,U8 *context)=NULL,U8 *context=NULL)
{//Input, view, sector effects, overlays and powers precede actor thinkers.
  Motion *tmpm=tmpw->motion;
  Player *tmpp=tmpm->player;
  Actor *tmpa=WeaponActor(tmpw);
  I64 tic=tmpm->world->tic;
  if (!tmpa) return;
  if (tmpp->no_clip) tmpa->flags|=TM_MF_NOCLIP;
  else tmpa->flags&=~TM_MF_NOCLIP;
  if (tmpa->flags&TM_MF_JUSTATTACKED) {
    tmpp->angle_turn=tmpp->side=0; tmpp->forward=100;
    tmpa->flags&=~TM_MF_JUSTATTACKED;
  }
  if (tmpp->dead) {
    WeaponTick(tmpw); PlayerDeath(tmpm,tmpa,tic); return;
  }
  if (tmpa->reaction) tmpa->reaction--;
  else PlayerMove(tmpm,tmpa);
  PlayerView(tmpm,tmpa,tic);
  if (sector && tmpm->world->map->sector[tmpa->sector].special)
    (*sector)(tmpa,context);
  if (!tmpa->active) return;
  PlayerWeaponRqst(tmpp,tmpp->weapon_rqst);
  tmpp->weapon_rqst=TM_WP_NOCHANGE;
  if (tmpp->buttons&TM_BTF_USE) {
    if (!tmpp->use_down) {
      tmpp->use_down=TRUE;
      if (use) (*use)(tmpa,context);
    }
  } else
    tmpp->use_down=FALSE;
  if (!tmpa->active) return;
  WeaponTick(tmpw); PlayerPowerTick(tmpp,tmpa);
}
