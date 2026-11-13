U0 TmEndDecisions()
{
  I64 *body=FileRead("C:/ORACLE/ENDING.BIN"),*row,i,j,n,out[592],used;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Motion *motion=MotionNew(world);
  Sectors *sectors=SectorsNew(motion);
  Specials *specials=SpecialsNew(sectors);
  Actor *actor=TmEndRealSpawn(world,TM_MT_BOSSBRAIN,0,0),*spawn;
  if (!body || !data) throw('Files');
  tm_end_world=world; motion->sound=&TmEndSound;
  used=Fs->data_heap->used_u8s;
  for (i=0,row=body+1;i<body[0];i++,row+=597) {
    WorldActorPlace(world,actor,row[2],row[3],0);
    world->random=row[1]; world->exit_rqst=row[4];
    tm_end_cnt=tm_end_sound=tm_end_sounds=0;
    tm_end_sound_cnt=tm_end_sound_random=0;
    switch (row[0]) {
      case 0: BossFinal(specials,actor,TM_A_BRAIN_PAIN); break;
      case 1: BossFinal(specials,actor,TM_A_BRAIN_SCREAM); break;
      case 2: BossFinal(specials,actor,TM_A_BRAIN_EXPLODE); break;
      case 3: BossFinal(specials,actor,TM_A_BRAIN_DIE); break;
    }
    MemSet(out,0,sizeof(out)); out[0]=tm_end_cnt; out[1]=world->random;
    out[2]=tm_end_sound; out[3]=tm_end_sounds; out[4]=tm_end_sound_cnt;
    out[5]=tm_end_sound_random; out[6]=world->exit_rqst;
    for (j=0;j<tm_end_cnt;j++) {
      n=7+j*9; spawn=tm_end_spawned[j];
      out[n]=spawn->x; out[n+1]=spawn->y; out[n+2]=spawn->z;
      out[n+3]=spawn->vz; out[n+4]=spawn->tics; out[n+5]=spawn->lastlook;
      out[n+6]=spawn->state; out[n+7]=spawn->sprite; out[n+8]=spawn->frame;
    }
    for (j=0;j<592;j++) if (out[j]!=row[5+j]) {
      "ENDING %d FIELD %d GOT %d EXPECTED %d\n",i,j,out[j],row[5+j];
      throw('Ending');
    }
    for (j=0;j<tm_end_cnt;j++) WorldRemove(world,tm_end_spawned[j]);
    if (Fs->data_heap->used_u8s!=used) throw('Alloc');
    tm_end_cases++;
  }
  SpecialsDel(specials); SectorsDel(sectors); MotionDel(motion);
  WorldDel(world); MapDel(map); GameDataDel(data); Free(body);
  tm_end_done=1;
  "ENDING %d DECISIONS BAD 0\n",tm_end_cases;
}

TmEndDecisions;
