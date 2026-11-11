I64 tm_cube_map_cases=0,tm_cube_map_done=0,tm_cube_map_sounds;
Brain *tm_cube_map_brain;
Actor *tm_cube_map_cube,*tm_cube_map_fog;

U0 TmCubeMapSound(Actor *actor,I64 sound)
{
  if (actor && actor->type==TM_MT_SPAWNFIRE) {
    if (sound!=TM_SFX_TELEPT) throw('Fog');
    tm_cube_map_fog=actor;
  }
  tm_cube_map_sounds++;
}

U0 TmCubeMapAction(Actor *actor,I64 action)
{
  if (actor==tm_cube_map_cube) BrainSpawn(tm_cube_map_brain,actor,action);
}

U0 TmCubeMapTest()
{
  I64 *body=FileRead("C:/ORACLE/CUBEMAP.BIN"),*row,i,j,used,seed,id,
	tics,expected,*types=FileRead("C:/ORACLE/CUBETYPE.BIN");
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Wad *wad=WadNew("C:/ORACLE/CUBEMAP.WAD");
  Map *map;
  World *world;
  Motion *motion;
  Sectors *sectors;
  Specials *specials;
  Enemies *enemies;
  Brain *brain;
  Actor *source,*target,*cube,*monster;
  if (!body || !data || !wad || !types) throw('Files');
  used=Fs->data_heap->used_u8s;
  for (i=0,row=body+1;i<body[0];i++,row+=4) for (j=0;j<4;j++) {
    map=MapNew(wad,"MAP30"); world=WorldNew(map,data);
    motion=MotionNew(world); sectors=SectorsNew(motion);
    specials=SpecialsNew(sectors); specials->monsters_stomp=TRUE;
    enemies=EnemiesNew(specials); brain=BrainNew(enemies);
    source=WorldSpawn(world,TM_MT_BOSSSPIT,row[0]*65536,row[1]*65536);
    target=WorldSpawn(world,TM_MT_BOSSTARGET,row[2]*65536,row[3]*65536);
    BrainAwake(brain,source);
    tm_cube_map_brain=brain; tm_cube_map_cube=tm_cube_map_fog=NULL;
    tm_cube_map_sounds=0; motion->sound=&TmCubeMapSound;
    motion->action=&TmCubeMapAction; world->random=seed=j*85;
    BrainSpit(brain,source);
    cube=tm_cube_map_cube=WorldActorGet(world,world->last);
    if (!cube || cube->type!=TM_MT_SPAWNSHOT || cube->reaction<=0)
      throw('Launch');
    id=cube->id; expected=cube->tics+(cube->reaction-1)*3; tics=0;
    while (WorldActorGet(world,id,FALSE) && tics<=expected) {
      ThinkersTick(specials); tics++;
    }
    if (tics!=expected || WorldActorGet(world,id,FALSE) ||
	world->actor_cnt!=4 || !tm_cube_map_fog) throw('Clock');
    monster=WorldActorGet(world,tm_cube_map_fog->tick_next);
    if (!monster || monster->type!=types[j] || monster->x!=target->x ||
	monster->y!=target->y || monster->z!=target->z || monster->target ||
	monster->sector!=target->sector || world->random!=(seed+5)&255 ||
	tm_cube_map_fog->x!=target->x || tm_cube_map_fog->y!=target->y ||
	tm_cube_map_fog->z!=target->z || tm_cube_map_sounds<3)
      throw('Arrival');
    BrainDel(brain); EnemiesDel(enemies); SpecialsDel(specials);
    SectorsDel(sectors); MotionDel(motion); WorldDel(world); MapDel(map);
    if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
    tm_cube_map_cases++;
  }
  WadDel(wad); GameDataDel(data); Free(body); Free(types); tm_cube_map_done=1;
  "CUBE %d MAP PATHS BAD 0\n",tm_cube_map_cases;
}

TmCubeMapTest;
