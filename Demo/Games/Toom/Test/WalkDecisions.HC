U0 TmWalkDecisions()
{
  I64 *body=FileRead("C:/ORACLE/WALK.BIN"),*row,i,j,out[22],used;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Motion *motion=MotionNew(world);
  Sectors *sectors=SectorsNew(motion);
  Specials *specials=SpecialsNew(sectors);
  Enemies *enemies=EnemiesNew(specials);
  Actor *actor;
  Bool caught=FALSE;
  if (!body || !data) throw('Files');
  actor=tm_walk_actor=WorldSpawn(world,TM_MT_POSSESSED,31*65536,-17*65536);
  Free(world->collision->special);
  world->collision->special=MAlloc(12*sizeof(I64));
  used=Fs->data_heap->used_u8s;
  for (i=0,row=body+1;i<body[0];i++,row+=31) {
    actor->x=31*65536; actor->y=-17*65536;
    actor->movedir=row[0]; actor->flags=row[1];
    data->info[actor->type].speed=row[2]; actor->z=row[3]; actor->floor=0;
    tm_walk_floor=row[4]; tm_walk_ok=row[5]; tm_walk_float=row[6];
    tm_walk_specials=row[7]; tm_walk_mask=row[8];
    tm_walk_calls=tm_walk_tx=tm_walk_ty=tm_walk_used=0;
    MemSet(tm_walk_trace,0xFF,sizeof(tm_walk_trace));
    out[0]=EnemyMove(enemies,actor);
    out[1]=actor->x; out[2]=actor->y; out[3]=actor->z;
    out[4]=actor->flags; out[5]=actor->movedir; out[6]=tm_walk_calls;
    out[7]=tm_walk_tx; out[8]=tm_walk_ty; out[9]=tm_walk_used;
    MemCpy(out+10,tm_walk_trace,12*sizeof(I64));
    for (j=0;j<22;j++) if (out[j]!=row[9+j]) {
      "WALK %d FIELD %d GOT %d EXPECTED %d\n",i,j,out[j],row[9+j];
      throw('Walk');
    }
    if (Fs->data_heap->used_u8s!=used) throw('Alloc');
    tm_walk_cases++;
  }
  actor->movedir=0; actor->flags=0; tm_walk_ok=tm_walk_float=0;
  tm_walk_specials=12; tm_walk_mask=1; tm_walk_nested=TRUE;
  tm_walk_used=0;
  if (!EnemyMove(enemies,actor) || tm_walk_used!=12) throw('Nested');
  for (j=0;j<12;j++)
    if (tm_walk_trace[j]!=(11-j)*3+1) throw('Order');
  if (Fs->data_heap->used_u8s!=used) throw('Alloc');
  tm_walk_cases++; actor->movedir=0; tm_walk_used=0; tm_walk_fail=TRUE;
  try {
    EnemyMove(enemies,actor);
  } catch {
    if (Fs->except_ch=='Use') {caught=TRUE; Fs->catch_except=TRUE;}
  }
  if (!caught || tm_walk_used!=1 || Fs->data_heap->used_u8s!=used)
    throw('Cleanup');
  tm_walk_cases++;
  EnemiesDel(enemies); SpecialsDel(specials); SectorsDel(sectors);
  MotionDel(motion); WorldDel(world); MapDel(map); GameDataDel(data);
  Free(body); tm_walk_done=1;
  "WALK %d DECISIONS BAD 0\n",tm_walk_cases;
}

TmWalkDecisions;
