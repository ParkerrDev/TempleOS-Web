U0 TmTracerDecisions()
{
  I64 *body=FileRead("C:/ORACLE/TRACER.BIN"),*row,i,j,out[25],used;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Motion *motion=MotionNew(world);
  Sectors *sectors=SectorsNew(motion);
  Specials *specials=SpecialsNew(sectors);
  Enemies *enemies=EnemiesNew(specials);
  Actor *actor,*target,*smoke;
  if (!body || !data) throw('Files');
  tm_tracer_world=world;
  actor=tm_tracer_actor=TmTracerRealSpawn(world,TM_MT_TRACER,
	-64*65536,16*65536,32*65536);
  target=TmTracerRealSpawn(world,TM_MT_PLAYER,64*65536,0,0);
  used=Fs->data_heap->used_u8s;
  for (i=0,row=body+1;i<body[0];i++,row+=35) {
    actor->angle=row[1]; tm_tracer_angle=row[2];
    target->x=actor->x+row[3]; target->y=actor->y+row[4]; target->z=row[5];
    actor->vx=12345; actor->vy=-54321; actor->vz=row[6]; actor->tracer=0;
    if (row[7]) actor->tracer=target->id;
    target->health=row[8]; world->random=row[9];
    tm_tracer_spawns=tm_tracer_cnt=0; tm_tracer_smoke=NULL;
    MemSet(tm_tracer_trace,0xFF,sizeof(tm_tracer_trace));
    MemSet(out,0,sizeof(out)); EnemyTracer(enemies,actor,row[0]);
    out[0]=actor->angle; out[1]=actor->vx; out[2]=actor->vy;
    out[3]=actor->vz; out[4]=world->random; out[5]=tm_tracer_spawns;
    if (smoke=tm_tracer_smoke) {
      out[6]=smoke->x; out[7]=smoke->y; out[8]=smoke->z;
      out[9]=smoke->vz; out[10]=smoke->tics; out[11]=smoke->lastlook;
    }
    out[12]=tm_tracer_cnt; MemCpy(out+13,tm_tracer_trace,12*sizeof(I64));
    for (j=0;j<25;j++) if (out[j]!=row[10+j]) {
      "TRACER %d FIELD %d GOT %d EXPECTED %d\n",i,j,out[j],row[10+j];
      throw('Tracer');
    }
    if (smoke) WorldRemove(world,smoke);
    if (Fs->data_heap->used_u8s!=used) throw('Alloc');
    tm_tracer_cases++;
  }
  EnemiesDel(enemies); SpecialsDel(specials); SectorsDel(sectors);
  MotionDel(motion); WorldDel(world); MapDel(map); GameDataDel(data);
  Free(body); tm_tracer_done=1;
  "TRACER %d DECISIONS BAD 0\n",tm_tracer_cases;
}

TmTracerDecisions;
