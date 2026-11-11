U0 TmBossDecisions()
{
  I64 *body=FileRead("C:/ORACLE/BOSS.BIN"),*row,i,j,out[6],used;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Player player;
  Motion *motion=MotionNew(world);
  Sectors *sectors=SectorsNew(motion);
  Specials *specials=SpecialsNew(sectors);
  Actor *actor=WorldSpawn(world,TM_MT_BRUISER,-64*65536,0),
	*other=WorldSpawn(world,TM_MT_BRUISER,64*65536,0);
  if (!body || !data) throw('Files');
  MemSet(&player,0,sizeof(Player)); used=Fs->data_heap->used_u8s;
  for (i=0,row=body+1;i<body[0];i++,row+=14) {
    actor->type=row[4]; actor->health=0;
    actor->flags=TM_MF_SOLID|TM_MF_AMBUSH|TM_MF_SHADOW;
    other->type=actor->type;
    if (row[6]==4) other->type=(actor->type+1)%TM_ACTOR_NUM;
    other->health=100; if (row[6]==2) other->health=0;
    other->active=row[6]!=0 && row[6]!=3;
    motion->player=NULL; if (row[5]) motion->player=&player;
    player.health=0; if (row[5]==2) player.health=100;
    world->exit_rqst=row[7]; tm_boss_event=tm_boss_tag=tm_boss_kind=0;
    tm_boss_cnt=0;
    if (row[0]) BossKeen(specials,actor);
    else BossDeath(specials,actor,row[2],row[3],row[1]);
    out[0]=actor->flags; out[1]=world->exit_rqst; out[2]=tm_boss_event;
    out[3]=tm_boss_tag; out[4]=tm_boss_kind; out[5]=tm_boss_cnt;
    for (j=0;j<6;j++) if (out[j]!=row[8+j]) {
      "BOSS %d FIELD %d GOT %d EXPECTED %d\n",i,j,out[j],row[8+j];
      throw('Boss');
    }
    if (Fs->data_heap->used_u8s!=used) throw('Alloc');
    tm_boss_cases++;
  }
  SpecialsDel(specials); SectorsDel(sectors); MotionDel(motion);
  WorldDel(world); MapDel(map); GameDataDel(data); Free(body);
  tm_boss_done=1;
  "BOSS %d DECISIONS BAD 0\n",tm_boss_cases;
}

TmBossDecisions;
