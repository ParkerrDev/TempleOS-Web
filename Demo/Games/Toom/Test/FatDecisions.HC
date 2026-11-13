U0 TmFatDecisions()
{
  I64 *body=FileRead("C:/ORACLE/FAT.BIN"),*row,i,j,n,out[46],used;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Motion *motion=MotionNew(world);
  Sectors *sectors=SectorsNew(motion);
  Specials *specials=SpecialsNew(sectors);
  Enemies *enemies=EnemiesNew(specials);
  Actor *actor,*target,*missile;
  if (!body || !data) throw('Files');
  tm_fat_world=world;
  actor=tm_fat_actor=WorldSpawn(world,TM_MT_FATSO,-64*65536,16*65536);
  target=tm_fat_target=WorldSpawn(world,TM_MT_PLAYER,64*65536,0);
  data->info[TM_MT_FATSO].attack_snd=7;
  motion->sound=&TmFatSound; used=Fs->data_heap->used_u8s;
  for (i=0,row=body+1;i<body[0];i++,row+=58) {
    actor->target=0; if (row[1]) actor->target=target->id;
    actor->flags=TM_MF_AMBUSH; actor->angle=0x11223344;
    actor->vx=actor->vy=actor->vz=0; actor->z=row[8];
    target->flags=row[2]; tm_fat_angle=row[3];
    tm_fat_angles[0]=row[4]; tm_fat_angles[1]=row[5];
    target->x=actor->x+row[6]; target->y=actor->y+row[7];
    target->z=row[9]; target->height=row[10]; world->random=row[11];
    tm_fat_spawns=tm_fat_cnt=0;
    MemSet(tm_fat_missiles,0,sizeof(tm_fat_missiles));
    MemSet(tm_fat_trace,0xFF,sizeof(tm_fat_trace)); MemSet(out,0,sizeof(out));
    switch (row[0]) {
      case TM_A_FAT_RAISE: EnemyFatRaise(enemies,actor); break;
      case TM_A_FAT_ATTACK1: EnemyFatAttack(enemies,actor,1); break;
      case TM_A_FAT_ATTACK2: EnemyFatAttack(enemies,actor,2); break;
      case TM_A_FAT_ATTACK3: EnemyFatAttack(enemies,actor,3); break;
      case TM_A_SKULL_ATTACK: EnemySkull(enemies,actor); break;
      default: throw('Action');
    }
    out[0]=actor->flags; out[1]=actor->angle; out[2]=actor->vx;
    out[3]=actor->vy; out[4]=actor->vz; out[5]=world->random;
    out[6]=tm_fat_spawns; out[7]=tm_fat_cnt;
    for (j=0;j<2;j++) if (missile=tm_fat_missiles[j]) {
      n=8+j*7; out[n]=missile->angle; out[n+1]=missile->vx;
      out[n+2]=missile->vy; out[n+3]=missile->vz;
      out[n+4]=missile->x; out[n+5]=missile->y; out[n+6]=missile->z;
    }
    MemCpy(out+22,tm_fat_trace,24*sizeof(I64));
    for (j=0;j<46;j++) if (out[j]!=row[12+j]) {
      "FAT %d ACTION %d FIELD %d GOT %d EXPECTED %d\n",
	    i,row[0],j,out[j],row[12+j];
      throw('Fat');
    }
    for (j=0;j<2;j++) if (missile=tm_fat_missiles[j])
      WorldRemove(world,missile);
    if (Fs->data_heap->used_u8s!=used) throw('Alloc');
    tm_fat_cases++;
  }
  EnemiesDel(enemies); SpecialsDel(specials); SectorsDel(sectors);
  MotionDel(motion); WorldDel(world); MapDel(map); GameDataDel(data);
  Free(body); tm_fat_done=1;
  "FAT %d DECISIONS BAD 0\n",tm_fat_cases;
}

TmFatDecisions;
