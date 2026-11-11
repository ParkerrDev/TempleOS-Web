I64 tm_weapon_cnt=0,tm_weapon_done=0,tm_weapon_tic=0,
      tm_weapon_fire_cnt=0,tm_weapon_fire_tic[256],tm_weapon_sound[256],
      tm_weapon_sound_cnt=0,tm_weapon_noise=0,tm_weapon_actions=0;

U0 TmWeaponSound(Actor *,I64 n)
{
  if (tm_weapon_sound_cnt<256) tm_weapon_sound[tm_weapon_sound_cnt++]=n;
}

U0 TmWeaponNoise(Actor *)
{
  tm_weapon_noise++;
}

U0 TmWeaponAction(Weapon *tmpw,Psprite *sprite,I64 n)
{
  tm_weapon_actions|=1<<n;
  switch (n) {
    case TM_A_PUNCH:
    case TM_A_SAW:
    case TM_A_FIRE_PISTOL:
    case TM_A_FIRE_SHOTGUN:
    case TM_A_FIRE_SHOTGUN2:
    case TM_A_FIRE_CGUN:
    case TM_A_FIRE_MISSILE:
    case TM_A_FIRE_PLASMA:
    case TM_A_FIRE_BFG:
      if (tm_weapon_fire_cnt>=256) throw('FireCnt');
      tm_weapon_fire_tic[tm_weapon_fire_cnt++]=tm_weapon_tic;
      break;
  }
  WeaponAction(tmpw,sprite,n);
}

U0 TmWeaponMutate(Weapon *tmpw,Psprite *,I64)
{
  WeaponState(tmpw,0,TM_S_LIGHTDONE);
}

U0 TmWeaponThrow(Weapon *,Psprite *,I64)
{
  throw('WpError',TRUE);
}

I64 tm_weapon_first[9]={4,4,3,0,8,0,30,0,3},
      tm_weapon_period[9]={17,14,37,4,20,3,40,4,51};

U0 TmWeaponTest()
{
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Player player;
  Motion *motion=MotionNew(world,&player);
  Actor *source=WorldSpawn(world,TM_MT_PLAYER,-64*65536,0),*target;
  Weapon *weapon;
  State save1,save2;
  I64 *body,*row,size,n,i,j,ammo,expected,before,period,first,health;
  Bool caught;
  if (!data) throw('Files');
  MemSet(&player,0,sizeof(Player)); PlayerBorn(&player);
  world->player=source->id; weapon=WeaponNew(motion);
  motion->sound=&TmWeaponSound;
  weapon->action=&TmWeaponAction; weapon->noise=&TmWeaponNoise;
  for (n=0;n<9;n++) {
    PlayerBorn(&player); player.ready_weapon=n;
    for (i=0;i<9;i++) player.weapon[i]=TRUE;
    for (i=0;i<4;i++) player.ammo[i]=10000;
    WeaponStart(weapon);
    if (player.psprite[0].y!=122*65536) throw('Raise');
    for (i=0;i<15;i++) WeaponTick(weapon);
    if (player.psprite[0].state!=data->weapon[n].ready ||
	  player.psprite[0].y!=TM_WEAPON_TOP) throw('Ready');
    tm_weapon_cnt++;
    tm_weapon_tic=tm_weapon_fire_cnt=tm_weapon_noise=0;
    player.buttons=TM_BTF_ATTACK; WeaponFire(weapon);
    for (i=1;i<=200;i++) {
      tm_weapon_tic=i; WeaponTick(weapon);
      if (player.psprite[1].x!=player.psprite[0].x ||
	    player.psprite[1].y!=player.psprite[0].y) throw('FlashPos');
    }
    first=tm_weapon_first[n]; period=tm_weapon_period[n];
    expected=(200-first)/period+1;
    if (tm_weapon_fire_cnt!=expected) {
      "WEAPON %d COUNT %d EXPECTED %d\n",n,tm_weapon_fire_cnt,expected;
      throw('FireRate');
    }
    for (i=0;i<expected;i++)
      if (tm_weapon_fire_tic[i]!=first+i*period) throw('FireTic');
    ammo=data->weapon[n].ammo;
    if (ammo!=TM_AM_NOAMMO &&
	  player.ammo[ammo]!=10000-expected*WeaponAmmoNeed(n)) throw('AmmoUse');
    if (!tm_weapon_noise) throw('Noise');
    player.buttons=0;
    for (i=0;i<120;i++) WeaponTick(weapon);
    if (player.psprite[0].state!=data->weapon[n].ready &&
	  !(n==TM_WP_CHAINSAW && player.psprite[0].state==TM_S_SAWB))
      throw('Release');
    if (player.refire || player.extra_light || player.psprite[1].state)
      throw('FlashEnd');
    tm_weapon_cnt++;
  }
  body=FileRead("C:/ORACLE/WPAMMO.BIN",&size);
  if (!body || size!=8+body[0]*9*8) throw('AmmoFile');
  for (i=0,row=body+1;i<body[0];i++,row+=9) {
    PlayerBorn(&player); player.ready_weapon=row[0];
    for (j=0;j<9;j++) player.weapon[j]=Bt(row+1,j);
    for (j=0;j<4;j++) player.ammo[j]=row[j+2];
    player.psprite[0].y=0;
    if (WeaponAmmoCheck(weapon)!=row[6] || player.pending_weapon!=row[7] ||
	  player.psprite[0].state!=row[8]) throw('AmmoPick');
    tm_weapon_cnt++;
  }
  Free(body);
  PlayerBorn(&player); player.weapon[TM_WP_SHOTGUN]=TRUE;
  player.ammo[TM_AM_SHELL]=8; WeaponStart(weapon);
  for (i=0;i<15;i++) WeaponTick(weapon);
  player.pending_weapon=TM_WP_SHOTGUN;
  for (i=0;i<32;i++) WeaponTick(weapon);
  if (player.ready_weapon!=TM_WP_SHOTGUN ||
	player.pending_weapon!=TM_WP_NOCHANGE ||
	player.psprite[0].state!=TM_S_SGUN) throw('Switch');
  tm_weapon_cnt++;
  for (n=TM_WP_MISSILE;n<=TM_WP_BFG;n+=2) {
    PlayerBorn(&player); player.ready_weapon=n; player.weapon[n]=TRUE;
    for (i=0;i<4;i++) player.ammo[i]=100;
    player.buttons=TM_BTF_ATTACK; player.attack_down=TRUE;
    tm_weapon_fire_cnt=0; WeaponState(weapon,0,data->weapon[n].ready);
    for (i=0;i<100;i++) WeaponTick(weapon);
    if (tm_weapon_fire_cnt) throw('Edge');
    player.buttons=0; WeaponTick(weapon);
    player.buttons=TM_BTF_ATTACK; WeaponTick(weapon);
    if (player.psprite[0].state!=data->weapon[n].attack) throw('Rearm');
    tm_weapon_cnt++;
  }
  PlayerBorn(&player); WeaponStart(weapon);
  for (i=0;i<15;i++) WeaponTick(weapon);
  player.dead=TRUE; player.health=0;
  for (i=0;i<60;i++) WeaponTick(weapon);
  if (player.psprite[0].y!=TM_WEAPON_BOTTOM ||
	player.psprite[0].state!=TM_S_PISTOLDOWN) throw('Dead');
  tm_weapon_cnt++;
  PlayerBorn(&player); weapon->action=NULL;
  MemCpy(&save1,data->state+TM_S_PISTOL,sizeof(State));
  MemCpy(&save2,data->state+TM_S_LIGHTDONE,sizeof(State));
  data->state[TM_S_PISTOL].tics=0;
  data->state[TM_S_PISTOL].next=TM_S_LIGHTDONE;
  data->state[TM_S_PISTOL].misc1=3; data->state[TM_S_PISTOL].misc2=-7;
  data->state[TM_S_LIGHTDONE].tics=-1;
  WeaponState(weapon,0,TM_S_PISTOL);
  for (i=0;i<50;i++) WeaponTick(weapon);
  if (player.psprite[0].state!=TM_S_LIGHTDONE ||
	player.psprite[0].tics!= -1 || player.psprite[0].x!=3*65536 ||
	player.psprite[0].y!= -7*65536) throw('ZeroTic');
  tm_weapon_cnt++;
  weapon->action=&TmWeaponMutate; data->state[TM_S_LIGHTDONE].action=0;
  WeaponState(weapon,0,TM_S_PISTOL);
  if (player.psprite[0].state!=TM_S_LIGHTDONE) throw('Replace');
  tm_weapon_cnt++;
  weapon->action=&TmWeaponThrow; before=Fs->data_heap->used_u8s;
  caught=FALSE;
  try {
    WeaponState(weapon,0,TM_S_PISTOL);
  } catch {
    if (Fs->except_ch=='WpError') {caught=TRUE; Fs->catch_except=TRUE;}
  }
  if (!caught || weapon->state_depth || Fs->data_heap->used_u8s!=before)
    throw('WpClean');
  tm_weapon_cnt++;
  weapon->action=NULL; data->state[TM_S_PISTOL].next=TM_S_PISTOL;
  caught=FALSE;
  try {
    WeaponState(weapon,0,TM_S_PISTOL);
  } catch {
    if (Fs->except_ch=='WpState') {caught=TRUE; Fs->catch_except=TRUE;}
  }
  if (!caught || weapon->state_depth) throw('ZeroLoop');
  tm_weapon_cnt++;
  MemCpy(data->state+TM_S_PISTOL,&save1,sizeof(State));
  MemCpy(data->state+TM_S_LIGHTDONE,&save2,sizeof(State));
  weapon->action=&TmWeaponAction;
  PlayerBorn(&player); player.ready_weapon=TM_WP_CHAINGUN;
  player.weapon[TM_WP_CHAINGUN]=TRUE; player.ammo[TM_AM_CLIP]=1;
  WeaponFire(weapon);
  for (i=0;i<5;i++) WeaponTick(weapon);
  if (player.ammo[TM_AM_CLIP]) throw('LastShot');
  tm_weapon_cnt++;
  //The melee target is moved after old effects to exercise the shared trace.
  target=WorldSpawn(world,TM_MT_TROOP,-24*65536,0); target->health=1000;
  tm_weapon_sound_cnt=0;
  source->angle=0; PlayerBorn(&player); player.ready_weapon=TM_WP_FIST;
  world->random=0; health=target->health;
  WeaponMelee(weapon,FALSE);
  if (target->health!=health-18 ||
	tm_weapon_sound[tm_weapon_sound_cnt-1]!=TM_SFX_PUNCH) throw('Punch');
  tm_weapon_cnt++;
  source->angle=0; world->random=0; player.power[TM_PW_STRENGTH]=1;
  health=target->health; WeaponMelee(weapon,FALSE);
  if (target->health!=health-180) throw('Berserk');
  tm_weapon_cnt++;
  source->angle=0; world->random=0; health=target->health;
  WeaponMelee(weapon,TRUE);
  if (target->health!=health-18 || !(source->flags&TM_MF_JUSTATTACKED))
    throw('Saw');
  tm_weapon_cnt++;
  for (n=0;n<2;n++) {
    source->angle=0x08000000;
    expected=0x40000000/21;
    if (n) {source->angle=0xF8000000; expected=0x100000000-expected;}
    world->random=0; WeaponMelee(weapon,TRUE);
    if (source->angle!=expected) throw('SawTurn');
    tm_weapon_cnt++;
  }
  PlayerBorn(&player); player.ready_weapon=TM_WP_BFG;
  player.weapon[TM_WP_BFG]=TRUE; player.ammo[TM_AM_CELL]=100;
  player.psprite[0].y=TM_WEAPON_TOP;
  WeaponFire(weapon); player.dead=TRUE; player.health=0;
  for (i=0;i<60;i++) WeaponTick(weapon);
  if (player.psprite[0].state!=TM_S_BFGDOWN || player.ammo[TM_AM_CELL]!=100)
    throw('DeadFire');
  tm_weapon_cnt++;
  for (n=TM_WP_SHOTGUN;n<=TM_WP_SUPERSHOTGUN;n+=6) {
    PlayerBorn(&player); player.ready_weapon=n; player.weapon[n]=TRUE;
    player.ammo[TM_AM_SHELL]=20; source->angle=0x80000000;
    before=world->actor_cnt;
    WeaponFire(weapon);
    for (i=0;i<3;i++) WeaponTick(weapon);
    expected=7;
    if (n==TM_WP_SUPERSHOTGUN) expected=20;
    if (world->actor_cnt-before!=expected) throw('Pellets');
    tm_weapon_cnt++;
  }
  if (tm_weapon_actions!=1<<23-2) throw('Actions');
  WeaponDel(weapon); MotionDel(motion); WorldDel(world); MapDel(map);
  GameDataDel(data); tm_weapon_done=1;
  "WEAPON %d CASES BAD 0\n",tm_weapon_cnt;
}

TmWeaponTest;
