U0 TmPainDecisions()
{
  I64 *body=FileRead("C:/ORACLE/PAIN.BIN"),*row,i,j,n,id,next,out[66],used;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Motion *motion=MotionNew(world);
  Sectors *sectors=SectorsNew(motion);
  Specials *specials=SpecialsNew(sectors);
  Enemies *enemies=EnemiesNew(specials);
  Actor *actor,*target,*skull;
  if (!body || !data) throw('Files');
  tm_pain_world=world;
  actor=tm_pain_actor=TmPainRealSpawn(world,TM_MT_PAIN,
	-20*65536,10*65536,3*65536);
  target=tm_pain_target=TmPainRealSpawn(world,TM_MT_PLAYER,108*65536,10*65536);
  used=Fs->data_heap->used_u8s;
  for (i=0,row=body+1;i<body[0];i++,row+=73) {
    for (j=0;j<row[1]+4;j++) {
      n=TM_MT_SKULL; if (j>=row[1]+2) n=TM_MT_POSSESSED;
      skull=TmPainRealSpawn(world,n,0,0); skull->health=0;
      if (row[1]<=j<row[1]+2) skull->active=FALSE;
      else skull->flags|=TM_MF_CORPSE;
    }
    actor->target=0; if (row[3]) actor->target=target->id;
    target->flags=row[4]; actor->angle=row[5];
    actor->flags=TM_MF_SOLID|TM_MF_AMBUSH; world->random=row[6];
    tm_pain_allow=row[2]; tm_pain_spawns=tm_pain_cnt=0;
    MemSet(tm_pain_skulls,0,sizeof(tm_pain_skulls));
    MemSet(tm_pain_damage,0,sizeof(tm_pain_damage));
    MemSet(tm_pain_charged,0,sizeof(tm_pain_charged));
    MemSet(tm_pain_trace,0xFF,sizeof(tm_pain_trace)); MemSet(out,0,sizeof(out));
    switch (row[0]) {
      case 0: EnemyPainSpawn(enemies,actor,actor->angle); break;
      case 1: EnemyPainAttack(enemies,actor); break;
      case 2: EnemyPainDie(enemies,actor); break;
      default: throw('Action');
    }
    out[0]=actor->flags; out[1]=actor->angle; out[2]=world->random;
    out[3]=tm_pain_spawns; out[4]=tm_pain_cnt;
    for (j=0;j<3;j++) if (skull=tm_pain_skulls[j]) {
      n=5+j*7; out[n]=skull->x; out[n+1]=skull->y; out[n+2]=skull->z;
      out[n+3]=skull->target==target->id; out[n+4]=tm_pain_charged[j];
      out[n+5]=tm_pain_damage[j]; out[n+6]=skull->lastlook;
    }
    MemCpy(out+26,tm_pain_trace,40*sizeof(I64));
    for (j=0;j<66;j++) if (out[j]!=row[7+j]) {
      "PAIN %d ACTION %d FIELD %d GOT %d EXPECTED %d\n",
	    i,row[0],j,out[j],row[7+j];
      throw('Pain');
    }
    id=world->first;
    while (skull=WorldActorGet(world,id,FALSE)) {
      next=skull->tick_next;
      if (skull!=actor && skull!=target) WorldRemove(world,skull);
      id=next;
    }
    if (Fs->data_heap->used_u8s!=used) throw('Alloc');
    tm_pain_cases++;
  }
  EnemiesDel(enemies); SpecialsDel(specials); SectorsDel(sectors);
  MotionDel(motion); WorldDel(world); MapDel(map); GameDataDel(data);
  Free(body); tm_pain_done=1;
  "PAIN %d DECISIONS BAD 0\n",tm_pain_cases;
}

TmPainDecisions;
