U0 TmFireDecisions()
{
  I64 *body=FileRead("C:/ORACLE/FIRE.BIN"),*row,i,j,out[50],used,mass;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Motion *motion=MotionNew(world);
  Sectors *sectors=SectorsNew(motion);
  Specials *specials=SpecialsNew(sectors);
  Enemies *enemies=EnemiesNew(specials);
  Actor *actor,*target,*fire,*spawn;
  if (!body || !data) throw('Files');
  actor=tm_fire_actor=TmFireRealSpawn(world,TM_MT_VILE,
	-64*65536,16*65536,32*65536);
  target=tm_fire_target=TmFireRealSpawn(world,TM_MT_PLAYER,
	64*65536,16*65536,8*65536);
  fire=tm_fire_fire=TmFireRealSpawn(world,TM_MT_FIRE,0,0);
  used=Fs->data_heap->used_u8s; mass=data->info[TM_MT_PLAYER].mass;
  for (i=0,row=body+1;i<body[0];i++,row+=57) {
    actor->angle=0xC0000000; actor->flags=TM_MF_AMBUSH;
    actor->target=actor->tracer=fire->target=fire->tracer=0;
    target->angle=row[3]; target->flags=row[4]; target->health=1000;
    target->vz=0; data->info[TM_MT_PLAYER].mass=row[6];
    WorldActorPlace(world,fire,-100*65536,-90*65536,7*65536);
    if (row[1]&1) actor->target=fire->tracer=target->id;
    if (row[1]&2) fire->target=actor->id;
    if (row[1]&4) actor->tracer=fire->id;
    tm_fire_visible=row[2]; world->random=row[5];
    tm_fire_spawn=NULL; tm_fire_cnt=0;
    MemSet(tm_fire_trace,0xFF,sizeof(tm_fire_trace));
    switch (row[0]) {
      case 0: EnemyVileStart(enemies,actor); break;
      case 1: EnemyFire(enemies,fire,TM_A_START_FIRE); break;
      case 2: EnemyFire(enemies,fire,TM_A_FIRE_CRACKLE); break;
      case 3: EnemyFire(enemies,fire); break;
      case 4: EnemyVileTarget(enemies,actor); break;
      case 5: EnemyVileAttack(enemies,actor); break;
    }
    MemSet(out,0,sizeof(out)); spawn=tm_fire_spawn;
    out[0]=actor->angle; out[1]=actor->flags;
    out[2]=TmFireWho(WorldActorGet(world,actor->tracer));
    out[3]=target->health; out[4]=target->vz; out[5]=world->random;
    out[6]=!!spawn; out[7]=tm_fire_cnt;
    out[8]=fire->x; out[9]=fire->y; out[10]=fire->z;
    out[14]=out[15]=-1;
    if (spawn) {
      out[11]=spawn->x; out[12]=spawn->y; out[13]=spawn->z;
      out[14]=TmFireWho(WorldActorGet(world,spawn->target));
      out[15]=TmFireWho(WorldActorGet(world,spawn->tracer));
      out[16]=spawn->lastlook;
    }
    out[17]=TmFireWho(WorldActorGet(world,actor->target));
    MemCpy(out+18,tm_fire_trace,sizeof(tm_fire_trace));
    for (j=0;j<50;j++) if (out[j]!=row[7+j]) {
      "FIRE %d FIELD %d GOT %d EXPECTED %d\n",i,j,out[j],row[7+j];
      throw('Fire');
    }
    if (spawn) WorldRemove(world,spawn);
    if (Fs->data_heap->used_u8s!=used) throw('Alloc');
    tm_fire_cases++;
  }
  data->info[TM_MT_PLAYER].mass=mass;
  EnemiesDel(enemies); SpecialsDel(specials); SectorsDel(sectors);
  MotionDel(motion); WorldDel(world); MapDel(map); GameDataDel(data);
  Free(body); tm_fire_done=1;
  "FIRE %d DECISIONS BAD 0\n",tm_fire_cases;
}

TmFireDecisions;
