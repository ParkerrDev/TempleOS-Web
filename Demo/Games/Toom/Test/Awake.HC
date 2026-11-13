I64 tm_awake_cases=0,tm_awake_done=0,tm_awake_sounds,tm_awake_sound;
Brain *tm_awake_brain;

U0 TmAwakeSound(Actor *actor,I64 sound)
{
  if (actor || tm_awake_brain->on) throw('Sound');
  tm_awake_sounds++; tm_awake_sound=sound;
}

U0 TmAwakeTest()
{
  I64 *body=FileRead("C:/ORACLE/AWAKE.BIN"),*row,i,j,k,out[38],used;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Motion *motion=MotionNew(world);
  Sectors *sectors=SectorsNew(motion);
  Specials *specials=SpecialsNew(sectors);
  Enemies *enemies=EnemiesNew(specials);
  Actor *actor=WorldSpawn(world,TM_MT_BOSSSPIT,0,0),*objects[32],*other;
  Brain *brain;
  if (!body || !data) throw('Files');
  MoverNew(sectors,0,TM_MOVER_DOOR);
  motion->sound=&TmAwakeSound; used=Fs->data_heap->used_u8s;
  for (i=0,row=body+1;i<body[0];i++,row+=43) {
    for (j=0;j<row[0];j++) {
      other=objects[j]=WorldSpawn(world,TM_MT_BOSSTARGET,j*65536,0);
      if (row[1]==1 || row[1]==2 && j%2) other->type=TM_MT_TROOP;
      if (row[1]==3 && j%3==1) other->active=FALSE;
      if (row[1]==4) other->health=0;
      if (row[1]==5) {
	if (j%3==0) other->type=TM_MT_TROOP;
	if (j%3==1) other->active=FALSE;
      }
    }
    brain=tm_awake_brain=BrainNew(enemies,row[3]);
    brain->on=row[2]; brain->cnt=32; world->random=row[4];
    tm_awake_sounds=tm_awake_sound=0; BrainAwake(brain,actor);
    MemSet(out,0xFF,sizeof(out));
    out[0]=brain->cnt; out[1]=brain->on; out[2]=brain->easy;
    out[3]=world->random; out[4]=tm_awake_sounds; out[5]=tm_awake_sound;
    for (j=0;j<brain->cnt;j++) {
      k=0;
      while (k<row[0] && objects[k]->id!=brain->targets[j]) k++;
      if (k==row[0]) throw('Handle');
      out[6+j]=k;
    }
    for (j=0;j<38;j++) if (out[j]!=row[5+j]) {
      "AWAKE %d FIELD %d GOT %d EXPECTED %d\n",i,j,out[j],row[5+j];
      throw('Awake');
    }
    BrainDel(brain);
    for (j=0;j<row[0];j++) WorldRemove(world,objects[j]);
    if (Fs->data_heap->used_u8s!=used) throw('Alloc');
    tm_awake_cases++;
  }
  EnemiesDel(enemies); SpecialsDel(specials); SectorsDel(sectors);
  MotionDel(motion); WorldDel(world); MapDel(map); GameDataDel(data);
  Free(body); tm_awake_done=1;
  "AWAKE %d DECISIONS BAD 0\n",tm_awake_cases;
}

TmAwakeTest;
