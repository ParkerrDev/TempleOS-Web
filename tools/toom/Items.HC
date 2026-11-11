I64 tm_items_cnt=0,tm_items_done=0,tm_items_sound=0;
Motion *tm_items_motion;

U0 TmItemSound(Actor *,I64 n)
{
  tm_items_sound=n;
}

U0 TmItemContact(Actor *tmpa,Actor *item,I64 kind)
{
  if (kind!=TM_CONTACT_PICKUP) throw('Contact');
  PlayerTouch(tm_items_motion,tmpa,item);
}

Actor *TmItemNew(Motion *tmpm,I64 sprite)
{
  GameData *data=tmpm->world->data;
  I64 i;
  for (i=0;i<TM_ACTOR_NUM;i++)
    if (data->info[i].flags&TM_MF_SPECIAL &&
	  data->state[data->info[i].spawn].sprite==sprite)
      return WorldSpawn(tmpm->world,i,0,0);
  throw('Sprite');
  return NULL;
}

U0 TmItemTake(Motion *tmpm,Actor *tmpa,I64 sprite,Bool expected=TRUE,
	Bool dropped=FALSE)
{
  Actor *item=TmItemNew(tmpm,sprite);
  Player *player=tmpm->player;
  I64 bonus=player->bonus_cnt,items=player->items;
  if (dropped) item->flags|=TM_MF_DROPPED;
  tm_items_sound=0;
  if (PlayerTouch(tmpm,tmpa,item)!=expected || item->active==expected)
    throw('Pickup');
  if (expected) {
    if (player->bonus_cnt!=bonus+6 || !tm_items_sound ||
	  player->pickup_sprite!=sprite || player->pickup_tics!=140 ||
	  player->items!=items+(item->flags&TM_MF_COUNTITEM!=0))
      throw('Effect');
  } else if (player->bonus_cnt!=bonus || player->items!=items || tm_items_sound)
    throw('NoEffect');
  tm_items_cnt++;
  WorldRemove(tmpm->world,item);
}

U0 TmAmmoCases(Motion *tmpm)
{
  I64 *data=FileRead("C:/ORACLE/AMMO.BIN"),*at=data,n,i,j;
  Player *player=tmpm->player;
  if (!data) throw('Files');
  n=*at++;
  for (i=0;i<n;i++,at+=10) {
    PlayerBorn(player);
    tmpm->world->skill=at[0]; player->ready_weapon=at[1];
    for (j=0;j<TM_WEAPON_NUM;j++) player->weapon[j]=Bt(at+2,j);
    player->ammo[at[3]]=at[4]; player->max_ammo[at[3]]=at[5];
    if (PlayerAmmoGive(tmpm,at[3],at[6])!=at[7] ||
	  player->ammo[at[3]]!=at[8] || player->pending_weapon!=at[9]) {
      "AMMO %d GOT %d/%d WANT %d/%d\n",i,player->ammo[at[3]],
	    player->pending_weapon,at[8],at[9];
      throw('Ammo');
    }
    tm_items_cnt++;
  }
  Free(data); tmpm->world->skill=2; PlayerBorn(player);
}

U0 TmItemCases(Motion *tmpm,Actor *tmpa)
{
  Player *player=tmpm->player;
  Actor *item;
  I64 i;
  PlayerBorn(player); tmpa->health=100;
  TmItemTake(tmpm,tmpa,TM_SPR_ARM1);
  if (player->armor!=100 || player->armor_type!=1) throw('Armor1');
  TmItemTake(tmpm,tmpa,TM_SPR_ARM1,FALSE);
  TmItemTake(tmpm,tmpa,TM_SPR_ARM2);
  if (player->armor!=200 || player->armor_type!=2) throw('Armor2');
  TmItemTake(tmpm,tmpa,TM_SPR_BON2);
  if (player->armor!=200 || player->armor_type!=2) throw('ArmorCap');
  player->armor=player->armor_type=0; TmItemTake(tmpm,tmpa,TM_SPR_BON2);
  if (player->armor!=1 || player->armor_type!=1) throw('Bonus');
  TmItemTake(tmpm,tmpa,TM_SPR_STIM,FALSE);
  player->health=tmpa->health=50; TmItemTake(tmpm,tmpa,TM_SPR_STIM);
  if (player->health!=60 || tmpa->health!=60) throw('Stim');
  TmItemTake(tmpm,tmpa,TM_SPR_MEDI);
  if (player->health!=85) throw('Medi');
  TmItemTake(tmpm,tmpa,TM_SPR_MEDI);
  if (player->health!=100) throw('Health');
  TmItemTake(tmpm,tmpa,TM_SPR_BON1);
  if (player->health!=101) throw('BonusHP');
  TmItemTake(tmpm,tmpa,TM_SPR_SOUL);
  if (player->health!=200 || tmpa->health!=200 || tm_items_sound!=TM_SFX_GETPOW)
    throw('Soul');
  TmItemTake(tmpm,tmpa,TM_SPR_BON1);
  if (player->health!=200) throw('HealthHi');
  TmItemTake(tmpm,tmpa,TM_SPR_MEGA);
  if (player->health!=200 || player->armor!=200 || player->armor_type!=2)
    throw('Mega');
  TmItemTake(tmpm,tmpa,TM_SPR_BKEY); TmItemTake(tmpm,tmpa,TM_SPR_YKEY);
  TmItemTake(tmpm,tmpa,TM_SPR_RKEY); TmItemTake(tmpm,tmpa,TM_SPR_BSKU);
  TmItemTake(tmpm,tmpa,TM_SPR_YSKU); TmItemTake(tmpm,tmpa,TM_SPR_RSKU);
  for (i=0;i<TM_CARD_NUM;i++) if (!player->card[i]) throw('Card');
  TmItemTake(tmpm,tmpa,TM_SPR_BKEY);
  TmItemTake(tmpm,tmpa,TM_SPR_PINV);
  if (player->power[TM_PW_INVULNERABILITY]!=1050) throw('Invul');
  player->power[TM_PW_INVULNERABILITY]=1;
  TmItemTake(tmpm,tmpa,TM_SPR_PINV);
  if (player->power[TM_PW_INVULNERABILITY]!=1050) throw('Refresh');
  TmItemTake(tmpm,tmpa,TM_SPR_PINS);
  if (player->power[TM_PW_INVISIBILITY]!=2100 || !(tmpa->flags&TM_MF_SHADOW))
    throw('Shadow');
  TmItemTake(tmpm,tmpa,TM_SPR_SUIT);
  if (player->power[TM_PW_IRONFEET]!=2100) throw('Suit');
  TmItemTake(tmpm,tmpa,TM_SPR_PMAP); TmItemTake(tmpm,tmpa,TM_SPR_PMAP,FALSE);
  TmItemTake(tmpm,tmpa,TM_SPR_PVIS);
  if (player->power[TM_PW_INFRARED]!=4200) throw('Infra');
  player->health=tmpa->health=1;
  TmItemTake(tmpm,tmpa,TM_SPR_PSTR);
  if (player->health!=100 || player->power[TM_PW_STRENGTH]!=1 ||
	player->pending_weapon!=TM_WP_FIST) throw('Strength');
  TmItemTake(tmpm,tmpa,TM_SPR_CLIP,TRUE,TRUE);
  if (player->ammo[TM_AM_CLIP]!=55) throw('Dropped');
  TmItemTake(tmpm,tmpa,TM_SPR_CLIP);
  if (player->ammo[TM_AM_CLIP]!=65) throw('Clip');
  TmItemTake(tmpm,tmpa,TM_SPR_AMMO);
  if (player->ammo[TM_AM_CLIP]!=115) throw('AmmoBox');
  TmItemTake(tmpm,tmpa,TM_SPR_ROCK); TmItemTake(tmpm,tmpa,TM_SPR_BROK);
  TmItemTake(tmpm,tmpa,TM_SPR_CELL); TmItemTake(tmpm,tmpa,TM_SPR_CELP);
  TmItemTake(tmpm,tmpa,TM_SPR_SHEL); TmItemTake(tmpm,tmpa,TM_SPR_SBOX);
  if (player->ammo[TM_AM_MISL]!=6 || player->ammo[TM_AM_CELL]!=120 ||
	player->ammo[TM_AM_SHELL]!=24) throw('AmmoAll');
  TmItemTake(tmpm,tmpa,TM_SPR_BPAK); TmItemTake(tmpm,tmpa,TM_SPR_BPAK);
  for (i=0;i<TM_AMMO_NUM;i++)
    if (player->max_ammo[i]!=tm_ammo_max[i]*2) throw('Pack');
  TmItemTake(tmpm,tmpa,TM_SPR_MGUN,TRUE,TRUE);
  if (!player->weapon[TM_WP_CHAINGUN] || player->ammo[TM_AM_CLIP]!=145 ||
	player->pending_weapon!=TM_WP_CHAINGUN) throw('GunDrop');
  TmItemTake(tmpm,tmpa,TM_SPR_SHOT,TRUE,TRUE);
  if (player->ammo[TM_AM_SHELL]!=36) throw('ShotDrop');
  TmItemTake(tmpm,tmpa,TM_SPR_SGN2);
  if (player->ammo[TM_AM_SHELL]!=44) throw('Double');
  TmItemTake(tmpm,tmpa,TM_SPR_BFUG); TmItemTake(tmpm,tmpa,TM_SPR_CSAW);
  TmItemTake(tmpm,tmpa,TM_SPR_LAUN); TmItemTake(tmpm,tmpa,TM_SPR_PLAS);
  for (i=0;i<TM_WEAPON_NUM;i++) if (!player->weapon[i]) throw('Weapon');
  TmItemTake(tmpm,tmpa,TM_SPR_CSAW,FALSE);
  player->ammo[TM_AM_CLIP]=player->max_ammo[TM_AM_CLIP];
  TmItemTake(tmpm,tmpa,TM_SPR_MGUN,FALSE);
  item=TmItemNew(tmpm,TM_SPR_STIM);
  item->z=tmpa->height+1;
  player->health=tmpa->health=50;
  if (PlayerTouch(tmpm,tmpa,item) || !item->active) throw('Above');
  item->z=-8*65536-1;
  if (PlayerTouch(tmpm,tmpa,item) || !item->active) throw('Below');
  item->z=-8*65536;
  if (!PlayerTouch(tmpm,tmpa,item) || player->health!=60) throw('Reach');
  tm_items_cnt++; WorldRemove(tmpm->world,item);
  tmpa->health=0; TmItemTake(tmpm,tmpa,TM_SPR_STIM,FALSE);
  tmpa->health=player->health=50;
  WorldTryMove(tmpm->world,tmpa,100*65536,0);
  item=TmItemNew(tmpm,TM_SPR_STIM);
  WorldActorUnlink(tmpm->world,item); item->x=120*65536;
  WorldActorLink(tmpm->world,item);
  tm_items_motion=tmpm;
  if (WorldTryMove(tmpm->world,tmpa,120*65536,0,&TmItemContact) ||
	item->active || tmpa->x!=100*65536 || player->health!=60)
    throw('Blocked');
  tm_items_cnt++; WorldSweep(tmpm->world);
}

U0 TmItemsTest()
{
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Player player;
  Motion *motion=MotionNew(world,&player);
  Actor *actor=WorldSpawn(world,TM_MT_PLAYER,0,0);
  if (!data) throw('Files');
  MemSet(&player,0,sizeof(Player)); world->player=actor->id;
  motion->sound=&TmItemSound;
  TmAmmoCases(motion); TmItemCases(motion,actor);
  player.kills=17; player.items=23; player.secrets=2; PlayerBorn(&player);
  if (player.kills!=17 || player.items!=23 || player.secrets!=2 ||
	player.health!=100 || player.backpack || player.dead ||
	player.ammo[TM_AM_CLIP]!=50 || player.max_ammo[TM_AM_CLIP]!=200)
    throw('Born');
  tm_items_cnt++;
  "ITEMS %d CASES BAD 0\n",tm_items_cnt;
  MotionDel(motion); WorldDel(world); MapDel(map); GameDataDel(data);
  tm_items_done=1;
}

TmItemsTest;
