U0 TmCubeTest()
{
  I64 *body=FileRead("C:/ORACLE/CUBE.BIN"),*row,i,j,out[87],used,action;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Motion *motion=MotionNew(world);
  Sectors *sectors=SectorsNew(motion);
  Specials *specials=SpecialsNew(sectors);
  Enemies *enemies=EnemiesNew(specials);
  Brain *brain=BrainNew(enemies);
  Actor *cube=tm_cube_actor=TmCubeRealSpawn(world,TM_MT_SPAWNSHOT,0,0),
	*target=tm_cube_target=TmCubeRealSpawn(world,TM_MT_BOSSTARGET,
	16*65536,-8*65536,3*65536),*monster,*fog;
  tm_cube_player=TmCubeRealSpawn(world,TM_MT_PLAYER,64*65536,0);
  if (!body || !data) throw('Files');
  motion->sound=&TmCubeSound; used=Fs->data_heap->used_u8s;
  for (i=0,row=body+1;i<body[0];i++,row+=93) {
    cube->target=target->id; cube->active=TRUE; cube->reaction=row[1];
    world->random=row[0]; tm_cube_visible=row[3]; tm_cube_shift=row[4];
    specials->monsters_stomp=row[5]; tm_cube_spawns=tm_cube_events=0;
    tm_cube_monster=tm_cube_fog=NULL;
    tm_cube_tx=tm_cube_ty=tm_cube_stomp=-1;
    MemSet(tm_cube_trace,0xFF,sizeof(tm_cube_trace));
    action=TM_A_SPAWN_FLY; if (row[2]) action=TM_A_SPAWN_SOUND;
    BrainSpawn(brain,cube,action);
    if (!cube->active) TmCubeRecord(6,cube,0);
    MemSet(out,0xFF,sizeof(out));
    out[0]=cube->reaction; out[1]=cube->active; out[2]=world->random;
    out[3]=tm_cube_spawns; out[4]=tm_cube_events;
    monster=tm_cube_monster; fog=tm_cube_fog;
    if (monster) {
      out[5]=monster->type; out[6]=monster->x; out[7]=monster->y;
      out[8]=monster->z; out[9]=monster->state; out[10]=monster->lastlook;
      if (monster->target) out[11]=TmCubeWho(WorldActorGet(world,
	    monster->target));
      out[12]=monster->tics;
    }
    if (fog) {
      out[13]=fog->type; out[14]=fog->x; out[15]=fog->y;
      out[16]=fog->z; out[17]=fog->state; out[18]=fog->lastlook;
      out[19]=fog->tics;
    }
    out[20]=tm_cube_tx; out[21]=tm_cube_ty; out[22]=tm_cube_stomp;
    MemCpy(out+23,tm_cube_trace,sizeof(tm_cube_trace));
    for (j=0;j<87;j++) if (out[j]!=row[6+j]) {
      "CUBE %d FIELD %d GOT %d EXPECTED %d\n",i,j,out[j],row[6+j];
      throw('Cube');
    }
    if (monster) WorldRemove(world,monster);
    if (fog) WorldRemove(world,fog);
    if (Fs->data_heap->used_u8s!=used) throw('Alloc');
    tm_cube_cases++;
  }
  BrainDel(brain); EnemiesDel(enemies); SpecialsDel(specials);
  SectorsDel(sectors); MotionDel(motion); WorldDel(world); MapDel(map);
  GameDataDel(data); Free(body); tm_cube_done=1;
  "CUBE %d DECISIONS BAD 0\n",tm_cube_cases;
}

TmCubeTest;
