I64 tm_hazard_cases=0,tm_hazard_tics=0,tm_hazard_done=0,tm_hazard_exits=0;

U0 TmHazardExit(Bool secret)
{
  if (secret) throw('Secret');
  tm_hazard_exits++;
}

U0 TmHazardTest()
{
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Player player;
  Motion *motion=MotionNew(world,&player);
  Actor *actor=WorldSpawn(world,TM_MT_PLAYER,64*65536,0);
  I64 *body,*row,size,i,j,n,random;
  world->player=actor->id;
  body=FileRead("C:/ORACLE/HAZARD.BIN",&size); row=body+1;
  if (!data || !body) throw('Files');
  for (i=0;i<body[0];i++) {
    MemSet(&player,0,sizeof(Player));
    map->sector[0].special=row[0]; player.power[TM_PW_IRONFEET]=row[1];
    player.god_mode=row[2]; actor->z=row[3]; world->random=row[4];
    world->skill=row[5]; n=row[6]; player.health=actor->health=row[7]; row+=8;
    actor->flags=data->info[TM_MT_PLAYER].flags;
    player.secrets=3; tm_hazard_exits=0;
    for (j=0;j<n;j++,row+=7) {
      world->tic=j; PlayerSector(motion,actor,&TmHazardExit);
      if (player.health!=row[0] || actor->health!=row[0] ||
	    world->random!=row[1] || map->sector[0].special!=row[2] ||
	    player.god_mode!=row[3] || player.secrets!=row[4] ||
	    tm_hazard_exits!=row[5] || player.damage_cnt!=row[6]) {
	"HAZARD CASE %d TIC %d GOT %d %d %d EXPECT %d %d %d\n",i,j,
	      player.health,world->random,tm_hazard_exits,row[0],row[1],row[5];
	throw('Sector');
      }
      tm_hazard_tics++;
    }
    tm_hazard_cases++;
  }
  if (row(U8 *)-body(U8 *)!=size) throw('Rows');
  MemSet(&player,0,sizeof(Player)); player.health=actor->health=100;
  actor->z=0; actor->floor=16*65536; world->skill=2; world->tic=0;
  map->sector[0].special=5;
  PlayerSector(motion,actor);
  if (player.health!=90) throw('MapFloor');
  map->sector[0].floor=16*65536; actor->floor=0;
  PlayerSector(motion,actor);
  if (player.health!=90) throw('Airborne');
  actor->z=16*65536; PlayerSector(motion,actor);
  if (player.health!=80) throw('Landed');
  map->sector[0].special=11; player.power[TM_PW_INVULNERABILITY]=1;
  player.god_mode=TRUE; player.health=actor->health=100;
  random=world->random; tm_hazard_exits=0;
  PlayerSector(motion,actor,&TmHazardExit);
  if (player.health!=100 || player.god_mode || world->random!=random ||
	tm_hazard_exits) throw('Invul');
  player.health=actor->health=10; PlayerSector(motion,actor,&TmHazardExit);
  if (player.health!=10 || world->random!=random || tm_hazard_exits!=1)
    throw('Exit');
  world->player=0; map->sector[0].special=5;
  player.power[TM_PW_INVULNERABILITY]=0;
  PlayerSector(motion,actor,&TmHazardExit);
  if (player.health!=10 || world->random!=random || tm_hazard_exits!=1)
    throw('Other');
  world->player=actor->id; actor->active=FALSE;
  PlayerSector(motion,actor,&TmHazardExit);
  if (player.health!=10 || world->random!=random || tm_hazard_exits!=1)
    throw('Retired');
  tm_hazard_cases+=7;
  Free(body); MotionDel(motion); WorldDel(world); MapDel(map);
  GameDataDel(data);
  tm_hazard_done=1;
  "HAZARD %d CASES %d TICS BAD 0\n",tm_hazard_cases,tm_hazard_tics;
}
TmHazardTest;
