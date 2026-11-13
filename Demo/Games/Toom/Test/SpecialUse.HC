I64 tm_use_cases=0,tm_use_done=0,tm_use_keys=0,tm_use_sound=0;

U0 TmUseSound(Actor *,I64 n)
{
  tm_use_sound=n;
}

U0 TmUseKey(Actor *,I64 n)
{
  if (n!=TM_IT_BLUECARD) throw('Key');
  tm_use_keys++;
}

U0 TmUseClear(Sectors *sectors)
{
  Mover *mover;
  for (mover=sectors->first;mover;mover=mover->next) MoverFinish(sectors,mover);
  MoversSweep(sectors);
}

U0 TmUseTrace(GameData *data)
{
  Map *map=RoomsNew(TRUE);
  World *world=WorldNew(map,data);
  Player player;
  Motion *motion=MotionNew(world,&player);
  Sectors *sectors=SectorsNew(motion);
  Specials *specials=SpecialsNew(sectors);
  Actor *actor=WorldSpawn(world,TM_MT_PLAYER,48*65536,0);
  MemSet(&player,0,sizeof(Player)); world->player=actor->id;
  actor->angle=0x80000000; map->line[6].special=1;
  map->line[8].special=97;
  PlayerUse(specials,actor);
  if (sectors->first) throw('First');
  tm_use_cases++;
  map->line[8].special=0; map->line[8].flags=5;
  PlayerUse(specials,actor);
  if (!sectors->first || sectors->first->sector!=1) throw('Flags');
  TmUseClear(sectors); tm_use_cases++;
  map->sector[1].ceil=1;
  PlayerUse(specials,actor);
  if (!sectors->first || sectors->first->sector!=1) throw('Opening');
  TmUseClear(sectors); tm_use_cases++;
  motion->sound=&TmUseSound; map->sector[1].ceil=0; tm_use_sound=0;
  PlayerUse(specials,actor);
  if (sectors->first || tm_use_sound!=TM_SFX_NOWAY) throw('Wall');
  tm_use_cases++;
  SpecialsDel(specials); SectorsDel(sectors); MotionDel(motion);
  WorldDel(world); MapDel(map);
}

I64 tm_cross_cases=0;
Specials *tm_cross_specials;

U0 TmCrossHook(Actor *actor,I64 line,I64 side)
{
  LineCross(tm_cross_specials,actor,line,side);
}

U0 TmCrossTest(Specials *specials,Actor *actor)
{
  Sectors *sectors=specials->sectors;
  Motion *motion=sectors->motion;
  World *world=motion->world;
  Map *map=world->map;
  Mover *mover;
  Actor *dest,*other;
  I64 i,id,next,before,random,types[6];
  types[0]=TM_MT_ROCKET; types[1]=TM_MT_PLASMA; types[2]=TM_MT_BFG;
  types[3]=TM_MT_TROOPSHOT; types[4]=TM_MT_HEADSHOT;
  types[5]=TM_MT_BRUISERSHOT;
  actor->active=TRUE; world->player=actor->id;
  map->line[6].flags=4; map->line[6].tag=map->sector[1].tag=9;
  map->sector[0].ceil=map->sector[1].ceil=128*65536;
  map->line[6].special=2; LineCross(specials,actor,6,0);
  mover=sectors->area[1].mover;
  if (!mover || mover->type!=TM_DOOR_OPEN || map->line[6].special)
    throw('Cross');
  map->line[6].special=3; LineCross(specials,actor,6,0);
  if (sectors->area[1].mover!=mover || map->line[6].special) throw('OnceBusy');
  map->line[6].special=75; LineCross(specials,actor,6,0);
  if (sectors->area[1].mover!=mover || map->line[6].special!=75)
    throw('ReBusy');
  TmUseClear(sectors); LineCross(specials,actor,6,0);
  if (!sectors->first || sectors->first->type!=TM_DOOR_CLOSE ||
	map->line[6].special!=75) throw('Repeat');
  TmUseClear(sectors); tm_cross_cases+=4;
  world->player=0; map->line[6].special=4; map->line[6].flags|=32;
  LineCross(specials,actor,6,0);
  if (!sectors->first || map->line[6].special) throw('MonCross');
  TmUseClear(sectors); map->line[6].special=2; LineCross(specials,actor,6,0);
  if (sectors->first || map->line[6].special!=2) throw('MonDeny');
  tm_cross_cases+=2;
  for (i=0;i<6;i++) {
    other=WorldSpawn(world,types[i],64*65536,0);
    map->line[6].special=4; LineCross(specials,other,6,0);
    if (sectors->first || map->line[6].special!=4) throw('Missile');
    WorldRemove(world,other); tm_cross_cases++;
  }
  other=WorldSpawn(world,TM_MT_TRACER,64*65536,0);
  LineCross(specials,other,6,0);
  if (!sectors->first || map->line[6].special) throw('Tracer');
  WorldRemove(world,other); TmUseClear(sectors); tm_cross_cases++;
  world->player=actor->id; map->line[6].special=40;
  LineCross(specials,actor,6,0);
  if (!sectors->first || sectors->first!=sectors->last ||
	sectors->first->kind!=TM_MOVER_CEIL ||
	sectors->first->type!=TM_CEIL_RAISE_HIGHEST || map->line[6].special)
    throw('CeilOne');
  TmUseClear(sectors); tm_cross_cases++;
  map->line[6].special=13; LineCross(specials,actor,6,0);
  if (map->sector[1].light!=255 || map->line[6].special) throw('LightOn');
  map->line[6].special=79; LineCross(specials,actor,6,0);
  if (map->sector[1].light!=35 || map->line[6].special!=79) throw('LightLow');
  tm_cross_cases+=2;
  map->line[6].special=17; LineCross(specials,actor,6,0);
  if (!specials->lights->first || specials->lights->first->sector!=1 ||
	map->line[6].special) throw('Strobe');
  tm_cross_cases++;
  dest=WorldSpawn(world,TM_MT_TELEPORTMAN,-64*65536,0);
  before=actor->x; random=world->random;
  for (i=125;i<=126;i++) {
    map->line[6].special=i; LineCross(specials,actor,6,0);
    if (actor->x!=before || map->line[6].special!=i || world->random!=random)
      throw('MonOnly');
    tm_cross_cases++;
  }
  map->line[6].special=39; LineCross(specials,actor,6,1);
  if (actor->x!=before || map->line[6].special || world->random!=random)
    throw('BackOnce');
  map->line[6].special=97; LineCross(specials,actor,6,1);
  if (actor->x!=before || map->line[6].special!=97 || world->random!=random)
    throw('BackRe');
  tm_cross_cases+=2;
  map->line[6].special=39; LineCross(specials,actor,6,0);
  if (actor->x!=dest->x || map->line[6].special) throw('Teleport');
  tm_cross_cases++;
  world->player=0; actor->reaction=7;
  for (i=125;i<=126;i++) {
    ActorTeleportMove(motion,actor,48*65536,0);
    map->line[6].special=i; LineCross(specials,actor,6,0);
    before=0;
    if (i==126) before=126;
    if (actor->x!=dest->x || map->line[6].special!=before || actor->reaction!=7)
      throw('MonTele');
    tm_cross_cases++;
  }
  other=WorldSpawn(world,TM_MT_SERGEANT,dest->x,dest->y);
  ActorTeleportMove(motion,actor,48*65536,0);
  for (i=125;i<=126;i++) {
    map->line[6].special=i; LineCross(specials,actor,6,0);
    before=0;
    if (i==126) before=126;
    if (actor->x!=48*65536 || map->line[6].special!=before ||
	  other->health!=150)
      throw('TeleBusy');
    tm_cross_cases++;
  }
  WorldRemove(world,other); world->player=actor->id;
  map->line[6].flags=4; map->line[6].special=97; tm_cross_specials=specials;
  ActorTeleportMove(motion,actor,8*65536,0);
  if (!WorldTryMove(world,actor,-4*65536,0,NULL,&TmCrossHook) ||
	actor->x!=dest->x || actor->sector!=1 || map->line[6].special!=97)
    throw('MoveTele');
  tm_cross_cases++;
  world->player=0; map->line[6].special=24;
  LineShoot(specials,actor,6);
  if (sectors->first || map->line[6].special!=24) throw('MonShot');
  MemCpy(map->side[0].middle,"SW1BRCOM",8); map->line[6].special=46;
  LineShoot(specials,actor,6); mover=sectors->area[1].mover;
  if (!mover || mover->type!=TM_DOOR_OPEN || map->line[6].special!=46 ||
	!specials->switches->first ||
	MemCmp(map->side[0].middle,"SW2BRCOM",8)) throw('ShotDoor');
  LineShoot(specials,actor,6);
  if (sectors->area[1].mover!=mover || specials->switches->first->tics!=35 ||
	MemCmp(map->side[0].middle,"SW1BRCOM",8)) throw('ShotBusy');
  for (i=0;i<35;i++) ButtonsTick(specials->switches);
  tm_cross_cases+=3;
  world->player=actor->id; map->line[6].special=24;
  LineShoot(specials,actor,6);
  if (sectors->area[1].mover!=mover || map->line[6].special ||
	MemCmp(map->side[0].middle,"SW2BRCOM",8)) throw('ShotOnce');
  TmUseClear(sectors); map->line[6].special=47; LineShoot(specials,actor,6);
  if (!sectors->first || sectors->first->kind!=TM_MOVER_PLAT ||
	sectors->first->type!=TM_PLAT_NEAREST_CHANGE || map->line[6].special)
    throw('ShotPlat');
  TmUseClear(sectors); tm_cross_cases+=2;
  map->line[6].special=52; world->exit_rqst=0; LineCross(specials,actor,6,0);
  if (world->exit_rqst!=TM_EXIT_NORMAL || map->line[6].special!=52)
    throw('Exit');
  map->line[6].special=124; LineCross(specials,actor,6,0);
  if (world->exit_rqst!=TM_EXIT_SECRET || map->line[6].special!=124)
    throw('Secret');
  tm_cross_cases+=2;
  map->line[6].special=999; LineCross(specials,actor,6,0);
  if (sectors->first || map->line[6].special!=999) throw('Unknown');
  map->line[6].special=2;
  LineCross(specials,actor,-1,0); LineCross(specials,actor,7,0);
  LineShoot(specials,actor,-1); LineShoot(specials,actor,7);
  if (sectors->first || map->line[6].special!=2) throw('Index');
  actor->active=FALSE; LineCross(specials,actor,6,0);
  map->line[6].special=46; LineShoot(specials,actor,6);
  if (sectors->first || map->line[6].special!=46) throw('Retired');
  actor->active=TRUE; tm_cross_cases+=3;
  id=world->first;
  while (other=WorldActorGet(world,id,FALSE)) {
    next=other->tick_next;
    if (other!=actor) WorldRemove(world,other);
    id=next;
  }
  LightsDel(specials->lights); specials->lights=LightsNew(sectors);
}

U0 TmUseTest()
{
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Player player;
  Motion *motion=MotionNew(world,&player);
  Graphics graphics;
  Texture textures[2];
  TexDef defs[2];
  Sectors *sectors;
  Specials *specials;
  Actor *actor=WorldSpawn(world,TM_MT_PLAYER,48*65536,0);
  Mover *mover;
  I64 i,used;
  if (!data) throw('Files');
  MemSet(&player,0,sizeof(Player)); MemSet(&graphics,0,sizeof(Graphics));
  MemSet(textures,0,sizeof(textures)); MemSet(defs,0,sizeof(defs));
  graphics.texture=textures; graphics.tex_cnt=2;
  for (i=0;i<2;i++) textures[i].def=defs+i;
  MemCpy(defs[0].name,"SW1BRCOM",8); MemCpy(defs[1].name,"SW2BRCOM",8);
  sectors=SectorsNew(motion,&graphics); sectors->key_rqst=&TmUseKey;
  specials=SpecialsNew(sectors);
  motion->sound=&TmUseSound; world->player=actor->id;
  actor->angle=0x80000000; map->sector[1].ceil=0; map->line[6].special=1;
  PlayerUse(specials,actor); mover=sectors->area[1].mover;
  if (!mover || mover->kind!=TM_MOVER_DOOR || mover->type!=TM_DOOR_RAISE ||
	mover->direction!=1) throw('Manual');
  TmUseClear(sectors); tm_use_cases++;
  used=Fs->data_heap->used_u8s;
  if (LineUse(specials,actor,6,1) || sectors->first) throw('Back');
  tm_use_cases++;
  map->line[6].special=26; tm_use_sound=0;
  PlayerUse(specials,actor);
  if (sectors->first || tm_use_keys!=1 || tm_use_sound!=TM_SFX_OOF)
    throw('Locked');
  tm_use_cases++;
  player.card[TM_IT_BLUECARD]=TRUE; PlayerUse(specials,actor);
  if (!sectors->area[1].mover || tm_use_keys!=1) throw('Unlocked');
  TmUseClear(sectors); tm_use_cases++;
  map->line[6].tag=map->sector[1].tag=9; map->sector[1].ceil=128*65536;
  map->line[6].special=42; MemCpy(map->side[0].middle,defs[0].name,8);
  if (!LineUse(specials,actor,6,0) || !sectors->area[1].mover ||
	sectors->area[1].mover->type!=TM_DOOR_CLOSE ||
	!specials->switches->first || map->line[6].special!=42 ||
	MemCmp(map->side[0].middle,defs[1].name,8)) throw('Button');
  tm_use_cases++;
  ButtonsTick(specials->switches);
  LineUse(specials,actor,6,0);
  if (specials->switches->first->tics!=34 ||
	MemCmp(map->side[0].middle,defs[1].name,8)) throw('Busy');
  for (i=0;i<34;i++) ButtonsTick(specials->switches);
  TmUseClear(sectors); tm_use_cases++;
  map->line[6].special=103;
  LineUse(specials,actor,6,0);
  if (!sectors->area[1].mover ||
	sectors->area[1].mover->type!=TM_DOOR_OPEN || map->line[6].special ||
	specials->switches->first || MemCmp(map->side[0].middle,defs[1].name,8))
    throw('Once');
  TmUseClear(sectors); tm_use_cases++;
  map->line[6].special=55; LineUse(specials,actor,6,0);
  mover=sectors->area[1].mover;
  if (!mover || mover->kind!=TM_MOVER_FLOOR || !mover->crush ||
	mover->type!=TM_FLOOR_CRUSH || map->line[6].special) throw('Floor');
  TmUseClear(sectors); tm_use_cases++;
  map->line[6].special=15; LineUse(specials,actor,6,0);
  mover=sectors->area[1].mover;
  if (!mover || mover->kind!=TM_MOVER_PLAT ||
	mover->type!=TM_PLAT_RAISE_CHANGE || mover->high!=24*65536 ||
	map->line[6].special) throw('Plat');
  TmUseClear(sectors); tm_use_cases++;
  map->line[6].special=49; LineUse(specials,actor,6,0);
  mover=sectors->area[1].mover;
  if (!mover || mover->kind!=TM_MOVER_CEIL ||
	mover->type!=TM_CEIL_CRUSH_RAISE || map->line[6].special) throw('Ceil');
  TmUseClear(sectors); tm_use_cases++;
  map->line[6].special=138; LineUse(specials,actor,6,0);
  if (map->sector[1].light!=255 || map->line[6].special!=138 ||
	!specials->switches->first) throw('Light');
  for (i=0;i<35;i++) ButtonsTick(specials->switches);
  tm_use_cases++;
  for (i=0;i<2;i++) {
    map->line[6].special=11;
    if (i) map->line[6].special=51;
    world->exit_rqst=0; LineUse(specials,actor,6,0);
    if (world->exit_rqst!=TM_EXIT_NORMAL+i || map->line[6].special)
      throw('Exit');
    tm_use_cases++;
  }
  world->player=0; map->line[6].special=14;
  if (LineUse(specials,actor,6,0) || sectors->first) throw('Monster');
  map->line[6].special=1; map->line[6].flags|=32;
  if (LineUse(specials,actor,6,0) || sectors->first) throw('Secret');
  map->line[6].flags&=~32;
  if (!LineUse(specials,actor,6,0) || !sectors->first) throw('MonDoor');
  TmUseClear(sectors); tm_use_cases+=3;
  map->line[6].special=32;
  if (!LineUse(specials,actor,6,0) || sectors->first || tm_use_keys!=1)
    throw('MonKey');
  tm_use_cases++;
  world->player=actor->id; map->line[6].special=124;
  if (!LineUse(specials,actor,6,1) || sectors->first) throw('Unused');
  map->line[6].special=999;
  if (!LineUse(specials,actor,6,0) || sectors->first) throw('Unknown');
  if (LineUse(specials,actor,-1,0) || LineUse(specials,actor,7,0))
    throw('Index');
  actor->active=FALSE;
  if (LineUse(specials,actor,6,0)) throw('Retired');
  tm_use_cases+=4;
  if (Fs->data_heap->used_u8s!=used) throw('Leak');
  TmCrossTest(specials,actor);
  if (Fs->data_heap->used_u8s!=used) throw('CrossMem');
  SpecialsDel(specials); SectorsDel(sectors); MotionDel(motion);
  WorldDel(world); MapDel(map);
  TmUseTrace(data); GameDataDel(data);
  tm_use_done=1; "USE %d CROSS %d CASES BAD 0\n",tm_use_cases,tm_cross_cases;
}
TmUseTest;
