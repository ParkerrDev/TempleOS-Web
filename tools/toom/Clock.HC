I64 tm_clock_cases=0,tm_clock_done=0,tm_clock_mode=-1,tm_clock_calls=0;
Wad *tm_clock_wad;
GameData *tm_clock_data;
Graphics *tm_clock_graphics;
World *tm_clock_world;
Weapon *tm_clock_weapon;
Specials *tm_clock_specials;
Surfaces *tm_clock_surfaces;
Player tm_clock_player;

U0 TmClockSound(Actor *,I64)
{
  Motion *motion=tm_clock_weapon->motion;
  Sectors *sectors=tm_clock_specials->sectors;
  switch (tm_clock_mode) {
    case 10: WorldDel(tm_clock_world); break;
    case 11: MotionDel(motion); break;
    case 12: WeaponDel(tm_clock_weapon); break;
    case 13: SectorsDel(sectors); break;
    case 14: LightsDel(tm_clock_specials->lights); break;
    case 15: SpecialsDel(tm_clock_specials); break;
  }
}

U0 TmClockButtonSound(I64,I64)
{
  if (tm_clock_mode==20) {
    if (tm_clock_world->map->side[0].x!=2 ||
	  tm_clock_specials->switches->first) throw('Order');
    WorldDel(tm_clock_world);
  }
}

U0 TmClockAction(Actor *,I64)
{
  World *world=tm_clock_world;
  Map *map=world->map;
  tm_clock_calls++;
  switch (tm_clock_mode) {
    case 0:
      if (world->tic || !world->ticking || !world->thinking ||
	    tm_clock_player.secrets!=1 || map->sector[0].special ||
	    !tm_clock_specials->sectors->area[1].mover ||
	    map->sector[1].ceil || map->side[0].x ||
	    !tm_clock_specials->switches->first ||
	    tm_clock_specials->switches->first->tics!=35) throw('Order');
      break;
    case 1:
      map->line[6].special=52;
      LineCross(tm_clock_specials,WorldActorGet(world,world->player),6,0);
      break;
    case 2:
    case 3:
      map->line[6].special=52;
      if (tm_clock_mode==3) map->line[6].special=124;
      LineCross(tm_clock_specials,WorldActorGet(world,world->player),6,0);
      map->line[6].special=124;
      if (tm_clock_mode==3) map->line[6].special=52;
      LineCross(tm_clock_specials,WorldActorGet(world,world->player),6,0);
      break;
    case 4:
      LevelTick(tm_clock_weapon,tm_clock_specials,tm_clock_surfaces);
      break;
    case 5:
      throw('ClockErr',TRUE);
  }
}

U0 TmClockNew()
{
  Map *map=RoomsNew(FALSE);
  Motion *motion;
  Actor *actor;
  Sectors *sectors;
  map->line[0].side[0]=map->line[4].side[0]=map->line[5].side[0]=1;
  map->line[1].special=48;
  map->line[6].special=61; map->line[6].tag=map->sector[1].tag=9;
  map->sector[0].special=9; map->sector[1].ceil=0;
  MemCpy(map->side[0].middle,"SW1BRCOM",8);
  MemSet(&tm_clock_player,0,sizeof(Player)); PlayerBorn(&tm_clock_player);
  tm_clock_world=WorldNew(map,tm_clock_data);
  actor=WorldSpawn(tm_clock_world,TM_MT_PLAYER,32*65536,0);
  tm_clock_world->player=actor->id; actor->angle=0x80000000;
  motion=MotionNew(tm_clock_world,&tm_clock_player);
  motion->action=&TmClockAction; motion->sound=&TmClockSound;
  tm_clock_weapon=WeaponNew(motion); WeaponStart(tm_clock_weapon);
  sectors=SectorsNew(motion,tm_clock_graphics);
  sectors->sound=&TmClockButtonSound;
  tm_clock_specials=SpecialsNew(sectors); SpecialsInit(tm_clock_specials);
  tm_clock_surfaces=SurfacesNew(map,tm_clock_graphics);
  if (!tm_clock_surfaces) throw('Surfaces');
  actor=WorldSpawn(tm_clock_world,TM_MT_TROOP,96*65536,64*65536);
  actor->tics=1; tm_clock_calls=0;
  PlayerCmd(&tm_clock_player,0,0,0,TM_BTF_USE);
}

U0 TmClockDel()
{
  Motion *motion=tm_clock_weapon->motion;
  Sectors *sectors=tm_clock_specials->sectors;
  Map *map=tm_clock_world->map;
  WeaponDel(tm_clock_weapon); SpecialsDel(tm_clock_specials);
  SectorsDel(sectors); MotionDel(motion); SurfacesDel(tm_clock_surfaces);
  WorldDel(tm_clock_world); MapDel(map);
}

U0 TmClockTest()
{
  I64 i,n,used,read,tic,angle,bob;
  Bool caught;
  World *world;
  Map *map;
  Actor *player;
  State *state;
  tm_clock_wad=WadNew("C:/ORACLE/FREEDOOM.WAD");
  tm_clock_data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  if (!tm_clock_wad || !tm_clock_data) throw('Files');
  tm_clock_graphics=GraphicsNew(tm_clock_wad);
  if (!tm_clock_graphics) throw('Graphics');
  state=tm_clock_data->state+tm_clock_data->info[TM_MT_TROOP].spawn;
  state->tics=1; state->next=tm_clock_data->info[TM_MT_TROOP].spawn;
  state->action=1;
  TmClockNew; TmClockDel;
  used=Fs->data_heap->used_u8s; read=tm_clock_wad->read_bytes;
  TmClockNew; world=tm_clock_world; map=world->map;
  for (i=0;i<10;i++)
    if (LevelTick(tm_clock_weapon,tm_clock_specials,tm_clock_surfaces,TRUE))
      throw('Paused');
  if (world->tic || tm_clock_player.use_down || tm_clock_player.secrets ||
	map->side[0].x || tm_clock_calls) throw('Paused');
  tm_clock_cases++;
  tm_clock_mode=0;
  if (LevelTick(tm_clock_weapon,tm_clock_specials,tm_clock_surfaces))
    throw('Exit');
  if (world->tic!=1 || map->sector[1].ceil!=2*65536 ||
	map->side[0].x!=1 || tm_clock_specials->switches->first->tics!=34 ||
	tm_clock_calls!=1 || world->thinking || world->ticking) throw('Phase');
  tm_clock_cases++;
  tm_clock_mode=-1;
  for (i=1;i<35;i++)
    LevelTick(tm_clock_weapon,tm_clock_specials,tm_clock_surfaces);
  if (world->tic!=35 || map->side[0].x!=35 ||
	tm_clock_specials->switches->first ||
	MemCmp(map->side[0].middle,"SW1BRCOM",8)) throw('Button');
  TmClockDel; tm_clock_cases++;
  for (n=1;n<=3;n++) {
    TmClockNew; world=tm_clock_world; map=world->map; tm_clock_mode=n;
    i=TM_EXIT_NORMAL;
    if (n==2) i=TM_EXIT_SECRET;
    if (LevelTick(tm_clock_weapon,tm_clock_specials,tm_clock_surfaces)!=i ||
	  world->tic!=1 || map->side[0].x!=1 ||
	  tm_clock_specials->switches->first->tics!=34) throw('Deferred');
    if (LevelTick(tm_clock_weapon,tm_clock_specials,tm_clock_surfaces)!=i ||
	  world->tic!=1 || map->side[0].x!=1 || tm_clock_calls!=1)
      throw('Pending');
    TmClockDel; tm_clock_cases++;
  }
  tm_clock_mode=-1; TmClockNew; world=tm_clock_world;
  player=WorldActorGet(world,world->player);
  world->tic=17; player->vx=8*65536;
  PlayerCmd(&tm_clock_player,0,0,0,0);
  WeaponState(tm_clock_weapon,0,tm_clock_data->weapon[TM_WP_PISTOL].ready);
  LevelTick(tm_clock_weapon,tm_clock_specials,tm_clock_surfaces);
  bob=FixedMul(8*65536,tm_clock_data->sine[409*17&8191]);
  angle=128*17&8191;
  if (world->tic!=18 || tm_clock_player.bob!=16*65536 ||
	tm_clock_player.view_z!=TM_EYE_HEIGHT+bob ||
	tm_clock_player.psprite[0].x!=65536+
	FixedMul(16*65536,tm_clock_data->sine[angle+2048]) ||
	tm_clock_player.psprite[0].y!=TM_WEAPON_TOP+
	FixedMul(16*65536,tm_clock_data->sine[angle&4095])) throw('BobClock');
  TmClockDel; tm_clock_cases++;
  for (i=0;i<4;i++) {
    TmClockNew; world=tm_clock_world; caught=FALSE;
    if (!i) tm_clock_surfaces->map=NULL;
    else if (i==1) tm_clock_surfaces->graphics=NULL;
    else if (i==2) world->tic=-1;
    else world->tic=I64_MAX;
    try {
      LevelTick(tm_clock_weapon,tm_clock_specials,tm_clock_surfaces);
    } catch {
      if (Fs->except_ch=='Owner' || Fs->except_ch=='Tic') {
	caught=TRUE; Fs->catch_except=TRUE;
      }
    }
    if (!caught || world->ticking || tm_clock_calls ||
	  tm_clock_player.use_down) throw('Guard');
    tm_clock_surfaces->map=world->map;
    tm_clock_surfaces->graphics=tm_clock_graphics;
    TmClockDel; tm_clock_cases++;
  }
  for (i=4;i<=15;i++) if (i<=5 || i>=10) {
    TmClockNew; world=tm_clock_world; tm_clock_mode=i; caught=FALSE;
    if (i>=10) world->map->line[6].special=26;
    try {
      LevelTick(tm_clock_weapon,tm_clock_specials,tm_clock_surfaces);
    } catch {
      if (Fs->except_ch=='Thinking' || Fs->except_ch=='Ticking' ||
	    Fs->except_ch=='ClockErr') {caught=TRUE; Fs->catch_except=TRUE;}
    }
    if (!caught || world->thinking || world->ticking || world->tic)
      throw('Active');
    TmClockDel; tm_clock_cases++;
  }
  tm_clock_mode=-1; TmClockNew; world=tm_clock_world;
  LevelTick(tm_clock_weapon,tm_clock_specials,tm_clock_surfaces);
  tm_clock_specials->switches->first->tics=1;
  tic=world->tic; tm_clock_mode=20; caught=FALSE;
  try {
    LevelTick(tm_clock_weapon,tm_clock_specials,tm_clock_surfaces);
  } catch {
    if (Fs->except_ch=='Ticking') {caught=TRUE; Fs->catch_except=TRUE;}
  }
  if (!caught || world->tic!=tic || world->ticking || world->thinking)
    throw('ButtonCB');
  TmClockDel; tm_clock_cases++;
  if (Fs->data_heap->used_u8s!=used || tm_clock_wad->read_bytes!=read ||
	tm_clock_graphics->cache_size) throw('Alloc');
  GraphicsDel(tm_clock_graphics); GameDataDel(tm_clock_data);
  WadDel(tm_clock_wad); tm_clock_done=1;
  "CLOCK %d REAL CASES BAD 0\n",tm_clock_cases;
}

TmClockTest;
