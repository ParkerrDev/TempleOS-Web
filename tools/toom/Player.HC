I64 tm_player_cnt=0,tm_player_done=0,tm_player_use=0,tm_player_sector=0;

U0 TmPlayerUse(Actor *)
{
  tm_player_use++;
}

U0 TmPlayerSector(Actor *)
{
  tm_player_sector++;
}

U0 TmPlayerTest()
{
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Player player;
  Motion *motion=MotionNew(world,&player);
  Actor *source=WorldSpawn(world,TM_MT_PLAYER,-64*65536,0),*target;
  Weapon *weapon;
  I64 *body,*row,size,i,n,old,step=0x40000000/18;
  if (!data) throw('Files');
  MemSet(&player,0,sizeof(Player)); PlayerBorn(&player);
  world->player=source->id; weapon=WeaponNew(motion);
  body=FileRead("C:/ORACLE/PLAYER.BIN",&size);
  if (!body || size!=8+body[0]*9*8) throw('CmdFile');
  for (i=0,row=body+1;i<body[0];i++,row+=9) {
    PlayerBorn(&player); source->angle=row[0];
    source->vx=source->vy=0; source->z=source->floor;
    if (row[4]) source->z+=65536;
    ActorState(data,source,TM_S_PLAY,NULL);
    PlayerCmd(&player,row[1],row[2],row[3],0);
    PlayerMove(motion,source);
    if (source->angle!=row[5] || source->vx!=row[6] ||
	  source->vy!=row[7] || source->state!=row[8]) {
      "COMMAND %d GOT %d %d %d %d EXPECT %d %d %d %d\n",i,
	    source->angle,source->vx,source->vy,source->state,
	    row[5],row[6],row[7],row[8];
      throw('Command');
    }
    tm_player_cnt++;
  }
  Free(body);
  for (n=0;n<=160;n++) {
    PlayerBorn(&player); source->flags|=TM_MF_SHADOW;
    player.power[TM_PW_INVULNERABILITY]=n;
    player.power[TM_PW_INVISIBILITY]=1;
    player.power[TM_PW_INFRARED]=150;
    player.power[TM_PW_IRONFEET]=2; player.power[TM_PW_STRENGTH]=1;
    player.power[TM_PW_ALLMAP]=1;
    player.damage_cnt=player.bonus_cnt=player.pickup_tics=1;
    PlayerPowerTick(&player,source);
    i=1; old=MaxI64(n-1,0);
    if (old) {
      i=0;
      if (old>128 || old&8) i=32;
    }
    if (player.fixed_colormap!=i || player.power[TM_PW_INVISIBILITY] ||
	  source->flags&TM_MF_SHADOW || player.power[TM_PW_INFRARED]!=149 ||
	  player.power[TM_PW_IRONFEET]!=1 || player.power[TM_PW_STRENGTH]!=2 ||
	  player.power[TM_PW_ALLMAP]!=1 || player.damage_cnt ||
	  player.bonus_cnt || player.pickup_tics) throw('Power');
    tm_player_cnt++;
  }
  for (n=0;n<5;n++) {
    PlayerBorn(&player); source->z=source->floor;
    source->vx=30*65536; source->vy=0; source->ceil=128*65536;
    player.view_height=40*65536; player.delta_view_height=2*65536;
    switch (n) {
      case 0:
	PlayerView(motion,source,0);
	if (player.view_height!=TM_VIEW_HEIGHT || player.delta_view_height ||
	      player.view_z!=41*65536+200) throw('ViewTop');
	break;
      case 1:
	player.view_height=10*65536; player.delta_view_height=-65536;
	PlayerView(motion,source,0);
	if (player.view_height!=TM_VIEW_HEIGHT/2 ||
	      player.delta_view_height!=1+65536/4) throw('ViewLow');
	break;
      case 2:
	source->z=100*65536;
	PlayerView(motion,source,10);
	if (player.view_z!=124*65536 || player.view_height!=40*65536)
	  throw('AirEye');
	break;
      case 3:
	player.no_momentum=TRUE; source->ceil=32*65536;
	PlayerView(motion,source,10);
	if (player.view_z!=28*65536) throw('CeilEye');
	break;
      case 4:
	player.dead=TRUE; player.view_height=6*65536;
	PlayerView(motion,source,0);
	if (player.view_height!=6*65536) throw('DeadEye');
    }
    if (player.bob!=16*65536) throw('Bob');
    tm_player_cnt++;
  }
  PlayerBorn(&player); source->z=source->floor; source->vx=source->vy=0;
  source->ceil=128*65536; source->angle=0; source->reaction=2;
  PlayerCmd(&player,50,0,1024,TM_BTF_USE);
  map->sector[source->sector].special=1;
  for (i=0;i<2;i++) PlayerTick(weapon,&TmPlayerUse,&TmPlayerSector);
  if (source->reaction || source->angle || source->vx || source->vy ||
	tm_player_use!=1 || tm_player_sector!=2) throw('Freeze');
  tm_player_cnt++;
  PlayerTick(weapon,&TmPlayerUse,&TmPlayerSector);
  if (!source->angle || !source->vx || tm_player_use!=1) throw('Unfreeze');
  tm_player_cnt++;
  PlayerCmd(&player,0,0,0,0); PlayerTick(weapon,&TmPlayerUse);
  PlayerCmd(&player,0,0,0,TM_BTF_USE); PlayerTick(weapon,&TmPlayerUse);
  if (tm_player_use!=2) throw('UseEdge');
  tm_player_cnt++;
  source->flags|=TM_MF_JUSTATTACKED; source->angle=0;
  source->vx=source->vy=0;
  PlayerCmd(&player,-50,50,100,0); PlayerTick(weapon);
  if (player.forward!=100 || player.side || player.angle_turn ||
	source->flags&TM_MF_JUSTATTACKED || source->angle ||
	source->vx!=FixedMul(100*2048,AngleCos(data,0))) throw('SawMove');
  tm_player_cnt++;
  player.no_clip=TRUE; PlayerCmd(&player,0,0,0,0); PlayerTick(weapon);
  if (!(source->flags&TM_MF_NOCLIP)) throw('NoClip');
  player.no_clip=FALSE; PlayerTick(weapon);
  if (source->flags&TM_MF_NOCLIP) throw('Clip');
  tm_player_cnt++;
  for (n=0;n<6;n++) {
    PlayerBorn(&player); player.weapon[TM_WP_CHAINSAW]=TRUE;
    player.weapon[TM_WP_SHOTGUN]=player.weapon[TM_WP_SUPERSHOTGUN]=TRUE;
    switch (n) {
      case 0:
	PlayerWeaponRqst(&player,TM_WP_FIST); i=TM_WP_CHAINSAW;
	break;
      case 1:
	player.ready_weapon=TM_WP_CHAINSAW; player.power[TM_PW_STRENGTH]=1;
	PlayerWeaponRqst(&player,TM_WP_FIST); i=TM_WP_FIST;
	break;
      case 2:
	PlayerWeaponRqst(&player,TM_WP_SHOTGUN); i=TM_WP_SUPERSHOTGUN;
	break;
      case 3:
	player.ready_weapon=TM_WP_SUPERSHOTGUN;
	PlayerWeaponRqst(&player,TM_WP_SHOTGUN); i=TM_WP_SHOTGUN;
	break;
      case 4:
	PlayerWeaponRqst(&player,TM_WP_PLASMA); i=TM_WP_NOCHANGE;
	break;
      default:
	PlayerWeaponRqst(&player,100); i=TM_WP_NOCHANGE;
    }
    if (player.pending_weapon!=i) throw('Request');
    tm_player_cnt++;
  }
  PlayerBorn(&player); player.dead=TRUE; player.health=0;
  player.damage_cnt=20; source->vx=source->vy=0; source->angle=0;
  target=WorldSpawn(world,TM_MT_TROOP,-64*65536,64*65536);
  player.attacker=target->id;
  old=player.damage_cnt; PlayerDeath(motion,source,0);
  if (source->angle!=step || player.damage_cnt!=old ||
	player.view_height!=40*65536) throw('DthTurn');
  for (i=0;i<50;i++) PlayerDeath(motion,source,i);
  if (player.view_height!=6*65536 || player.damage_cnt ||
	source->angle!=AngleFrom(data,0,64*65536)) throw('DthView');
  tm_player_cnt++;
  WorldRemove(world,target); player.damage_cnt=2;
  player.buttons=TM_BTF_USE; PlayerDeath(motion,source,0);
  if (!player.reborn || player.damage_cnt!=1) throw('Respawn');
  tm_player_cnt++;
  target=WorldSpawn(world,TM_MT_TROOP,-24*65536,0);
  player.attacker=target->id; source->angle=0x08000000;
  PlayerDeath(motion,source,0);
  if (source->angle!=0x08000000-step) throw('DthWrap');
  source->angle=0xF8000000; PlayerDeath(motion,source,0);
  if (source->angle!=0xF8000000+step) throw('DthWrap');
  WorldRemove(world,target); tm_player_cnt++;
  PlayerBorn(&player); source->angle=0; source->z=source->floor;
  source->vx=source->vy=0; source->ceil=128*65536;
  source->flags=data->info[TM_MT_PLAYER].flags;
  PlayerCmd(&player,50,0,0,0);
  for (i=0;i<100;i++) {
    PlayerTick(weapon); ActorMotion(motion,source); ActorTick(data,source,NULL);
  }
  if (!(105*65536<source->x<112*65536) || source->sector) {
    "WALK %d %d SECTOR %d VX %d VY %d\n",source->x,source->y,
	  source->sector,source->vx,source->vy;
    throw('WalkWall');
  }
  PlayerCmd(&player,0,0,0,0);
  for (i=0;i<40;i++) {
    PlayerTick(weapon); ActorMotion(motion,source); ActorTick(data,source,NULL);
  }
  if (source->vx || source->vy || source->state!=TM_S_PLAY) throw('WalkStop');
  tm_player_cnt++;
  WeaponDel(weapon); MotionDel(motion); WorldDel(world); MapDel(map);
  GameDataDel(data); tm_player_done=1;
  "PLAYER %d CASES BAD 0\n",tm_player_cnt;
}

TmPlayerTest;
