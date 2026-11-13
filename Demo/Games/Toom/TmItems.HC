I64 tm_ammo_clip[TM_AMMO_NUM]={10,4,20,1},
      tm_ammo_max[TM_AMMO_NUM]={200,50,300,50};

U0 PlayerBorn(Player *tmpp)
{//A new life keeps this level's intermission counters.
  I64 i,kills=tmpp->kills,items=tmpp->items,secrets=tmpp->secrets;
  MemSet(tmpp,0,sizeof(Player));
  tmpp->kills=kills; tmpp->items=items; tmpp->secrets=secrets;
  tmpp->weapon_rqst=TM_WP_NOCHANGE;
  tmpp->health=100; tmpp->view_height=TM_EYE_HEIGHT;
  tmpp->ready_weapon=TM_WP_PISTOL; tmpp->pending_weapon=TM_WP_NOCHANGE;
  tmpp->weapon[TM_WP_FIST]=tmpp->weapon[TM_WP_PISTOL]=TRUE;
  tmpp->ammo[TM_AM_CLIP]=50;
  for (i=0;i<TM_AMMO_NUM;i++) tmpp->max_ammo[i]=tm_ammo_max[i];
}

Bool PlayerAmmoGive(Motion *tmpm,I64 type,I64 loads)
{
  Player *tmpp=tmpm->player;
  I64 n,old;
  if (type==TM_AM_NOAMMO) return FALSE;
  if (!(0<=type<TM_AMMO_NUM) || !(0<=loads<=5)) throw('Ammo');
  if (tmpp->ammo[type]>=tmpp->max_ammo[type]) return FALSE;
  n=loads*tm_ammo_clip[type];
  if (!loads) n=tm_ammo_clip[type]/2;
  if (!tmpm->world->skill || tmpm->world->skill==4) n*=2;
  old=tmpp->ammo[type];
  tmpp->ammo[type]=MinI64(old+n,tmpp->max_ammo[type]);
  if (!old)
    switch (type) {
      case TM_AM_CLIP:
	if (tmpp->ready_weapon==TM_WP_FIST) {
	  tmpp->pending_weapon=TM_WP_PISTOL;
	  if (tmpp->weapon[TM_WP_CHAINGUN])
	    tmpp->pending_weapon=TM_WP_CHAINGUN;
	}
	break;
      case TM_AM_SHELL:
	if (tmpp->ready_weapon<=TM_WP_PISTOL && tmpp->weapon[TM_WP_SHOTGUN])
	  tmpp->pending_weapon=TM_WP_SHOTGUN;
	break;
      case TM_AM_CELL:
	if (tmpp->ready_weapon<=TM_WP_PISTOL && tmpp->weapon[TM_WP_PLASMA])
	  tmpp->pending_weapon=TM_WP_PLASMA;
	break;
      case TM_AM_MISL:
	if (tmpp->ready_weapon==TM_WP_FIST && tmpp->weapon[TM_WP_MISSILE])
	  tmpp->pending_weapon=TM_WP_MISSILE;
    }
  return TRUE;
}

Bool PlayerWeaponGive(Motion *tmpm,I64 type,Bool dropped)
{
  Player *tmpp=tmpm->player;
  I64 loads=2;
  Bool res;
  if (!(0<=type<TM_WEAPON_NUM)) throw('Weapon');
  if (dropped) loads=1;
  res=PlayerAmmoGive(tmpm,tmpm->world->data->weapon[type].ammo,loads);
  if (!tmpp->weapon[type]) {
    tmpp->weapon[type]=TRUE; tmpp->pending_weapon=type; res=TRUE;
  }
  return res;
}

Bool PlayerBodyGive(Player *tmpp,Actor *tmpa,I64 amount)
{
  if (tmpp->health>=100) return FALSE;
  tmpp->health=tmpa->health=MinI64(tmpp->health+amount,100);
  return TRUE;
}

Bool PlayerArmorGive(Player *tmpp,I64 type)
{
  if (tmpp->armor>=type*100) return FALSE;
  tmpp->armor_type=type; tmpp->armor=type*100;
  return TRUE;
}

Bool PlayerPowerGive(Player *tmpp,Actor *tmpa,I64 type)
{
  switch (type) {
    case TM_PW_INVULNERABILITY:
      tmpp->power[type]=30*TM_TICK_HZ;
      break;
    case TM_PW_INVISIBILITY:
      tmpp->power[type]=60*TM_TICK_HZ; tmpa->flags|=TM_MF_SHADOW;
      break;
    case TM_PW_INFRARED:
      tmpp->power[type]=120*TM_TICK_HZ;
      break;
    case TM_PW_IRONFEET:
      tmpp->power[type]=60*TM_TICK_HZ;
      break;
    case TM_PW_STRENGTH:
      PlayerBodyGive(tmpp,tmpa,100); tmpp->power[type]=1;
      break;
    case TM_PW_ALLMAP:
      if (tmpp->power[type]) return FALSE;
      tmpp->power[type]=1;
      break;
    default:
      throw('Power');
  }
  return TRUE;
}

Bool PlayerTouch(Motion *tmpm,Actor *tmpa,Actor *item)
{//Successful pickups retire at the tic boundary, after contact iteration.
  Player *tmpp=MotionPlayer(tmpm,tmpa);
  I64 i,delta=item->z-tmpa->z,sound=TM_SFX_ITEMUP,type=-1;
  if (!tmpp || !tmpa->active || tmpa->health<=0 || !item->active ||
	!(item->flags&TM_MF_SPECIAL) || delta>tmpa->height || delta< -8*65536)
    return FALSE;
  switch (item->sprite) {
    case TM_SPR_ARM1:
      if (!PlayerArmorGive(tmpp,1)) return FALSE;
      break;
    case TM_SPR_ARM2:
      if (!PlayerArmorGive(tmpp,2)) return FALSE;
      break;
    case TM_SPR_BON1:
      tmpp->health=tmpa->health=MinI64(tmpp->health+1,200);
      break;
    case TM_SPR_BON2:
      tmpp->armor=MinI64(tmpp->armor+1,200);
      if (!tmpp->armor_type) tmpp->armor_type=1;
      break;
    case TM_SPR_SOUL:
      tmpp->health=tmpa->health=MinI64(tmpp->health+100,200);
      sound=TM_SFX_GETPOW;
      break;
    case TM_SPR_MEGA:
      tmpp->health=tmpa->health=200; PlayerArmorGive(tmpp,2);
      sound=TM_SFX_GETPOW;
      break;
    case TM_SPR_BKEY:
      tmpp->card[TM_IT_BLUECARD]=TRUE;
      break;
    case TM_SPR_YKEY:
      tmpp->card[TM_IT_YELLOWCARD]=TRUE;
      break;
    case TM_SPR_RKEY:
      tmpp->card[TM_IT_REDCARD]=TRUE;
      break;
    case TM_SPR_BSKU:
      tmpp->card[TM_IT_BLUESKULL]=TRUE;
      break;
    case TM_SPR_YSKU:
      tmpp->card[TM_IT_YELLOWSKULL]=TRUE;
      break;
    case TM_SPR_RSKU:
      tmpp->card[TM_IT_REDSKULL]=TRUE;
      break;
    case TM_SPR_STIM:
      if (!PlayerBodyGive(tmpp,tmpa,10)) return FALSE;
      break;
    case TM_SPR_MEDI:
      if (!PlayerBodyGive(tmpp,tmpa,25)) return FALSE;
      break;
    case TM_SPR_PINV:
      type=TM_PW_INVULNERABILITY;
      break;
    case TM_SPR_PSTR:
      type=TM_PW_STRENGTH;
      if (tmpp->ready_weapon!=TM_WP_FIST) tmpp->pending_weapon=TM_WP_FIST;
      break;
    case TM_SPR_PINS:
      type=TM_PW_INVISIBILITY;
      break;
    case TM_SPR_SUIT:
      type=TM_PW_IRONFEET;
      break;
    case TM_SPR_PMAP:
      type=TM_PW_ALLMAP;
      break;
    case TM_SPR_PVIS:
      type=TM_PW_INFRARED;
      break;
    case TM_SPR_CLIP:
      i=1;
      if (item->flags&TM_MF_DROPPED) i=0;
      if (!PlayerAmmoGive(tmpm,TM_AM_CLIP,i)) return FALSE;
      break;
    case TM_SPR_AMMO:
      if (!PlayerAmmoGive(tmpm,TM_AM_CLIP,5)) return FALSE;
      break;
    case TM_SPR_ROCK:
      if (!PlayerAmmoGive(tmpm,TM_AM_MISL,1)) return FALSE;
      break;
    case TM_SPR_BROK:
      if (!PlayerAmmoGive(tmpm,TM_AM_MISL,5)) return FALSE;
      break;
    case TM_SPR_CELL:
      if (!PlayerAmmoGive(tmpm,TM_AM_CELL,1)) return FALSE;
      break;
    case TM_SPR_CELP:
      if (!PlayerAmmoGive(tmpm,TM_AM_CELL,5)) return FALSE;
      break;
    case TM_SPR_SHEL:
      if (!PlayerAmmoGive(tmpm,TM_AM_SHELL,1)) return FALSE;
      break;
    case TM_SPR_SBOX:
      if (!PlayerAmmoGive(tmpm,TM_AM_SHELL,5)) return FALSE;
      break;
    case TM_SPR_BPAK:
      if (!tmpp->backpack) {
	for (i=0;i<TM_AMMO_NUM;i++) tmpp->max_ammo[i]*=2;
	tmpp->backpack=TRUE;
      }
      for (i=0;i<TM_AMMO_NUM;i++) PlayerAmmoGive(tmpm,i,1);
      break;
    case TM_SPR_BFUG:
      if (!PlayerWeaponGive(tmpm,TM_WP_BFG,FALSE)) return FALSE;
      sound=TM_SFX_WPNUP;
      break;
    case TM_SPR_MGUN:
      if (!PlayerWeaponGive(tmpm,TM_WP_CHAINGUN,item->flags&TM_MF_DROPPED!=0))
	return FALSE;
      sound=TM_SFX_WPNUP;
      break;
    case TM_SPR_CSAW:
      if (!PlayerWeaponGive(tmpm,TM_WP_CHAINSAW,FALSE)) return FALSE;
      sound=TM_SFX_WPNUP;
      break;
    case TM_SPR_LAUN:
      if (!PlayerWeaponGive(tmpm,TM_WP_MISSILE,FALSE)) return FALSE;
      sound=TM_SFX_WPNUP;
      break;
    case TM_SPR_PLAS:
      if (!PlayerWeaponGive(tmpm,TM_WP_PLASMA,FALSE)) return FALSE;
      sound=TM_SFX_WPNUP;
      break;
    case TM_SPR_SHOT:
      if (!PlayerWeaponGive(tmpm,TM_WP_SHOTGUN,item->flags&TM_MF_DROPPED!=0))
	return FALSE;
      sound=TM_SFX_WPNUP;
      break;
    case TM_SPR_SGN2:
      if (!PlayerWeaponGive(tmpm,TM_WP_SUPERSHOTGUN,
	    item->flags&TM_MF_DROPPED!=0))
	return FALSE;
      sound=TM_SFX_WPNUP;
      break;
    default:
      return FALSE;
  }
  if (type>=0) {
    if (!PlayerPowerGive(tmpp,tmpa,type)) return FALSE;
    sound=TM_SFX_GETPOW;
  }
  if (item->flags&TM_MF_COUNTITEM) tmpp->items++;
  item->active=FALSE; tmpp->bonus_cnt+=6;
  tmpp->pickup_sprite=item->sprite; tmpp->pickup_tics=4*TM_TICK_HZ;
  if (tmpm->sound) (*tmpm->sound)(tmpa,sound);
  return TRUE;
}
