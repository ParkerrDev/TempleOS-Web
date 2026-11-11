U0 TmActionTest()
{
  I64 *body=FileRead("C:/ORACLE/ACTION.BIN"),*row,i,j,k,clock[2],used;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map[2];
  World *world[2];
  Motion *motion[2];
  Sectors *sectors[2];
  Specials *specials[2];
  Enemies *enemies[2];
  Brain *brain[2];
  Actions *actions[2];
  Actor *actor[2];
  if (!body || !data) throw('Files');
  for (i=0;i<2;i++) {
    clock[i]=0; map[i]=RoomsNew(FALSE); world[i]=WorldNew(map[i],data);
    motion[i]=MotionNew(world[i]); sectors[i]=SectorsNew(motion[i]);
    specials[i]=SpecialsNew(sectors[i]); enemies[i]=EnemiesNew(specials[i]);
    brain[i]=BrainNew(enemies[i]); actor[i]=WorldSpawn(world[i],0,0,0);
    actions[i]=ActionsNew(brain[i],clock+i,i+1,i+6,i);
  }
  used=Fs->data_heap->used_u8s;
  for (i=0,row=body+1;i<body[0];i++,row+=7) {
    k=row[1]; clock[k]=row[2]; tm_action_actor=actor[k];
    tm_action_n=-1; tm_action_cnt=0;
    MemSet(tm_action_args,0xFF,sizeof(tm_action_args));
    (*motion[k]->action)(actor[k],row[0]);
    if (tm_action_cnt!=!!row[0] || row[0] && tm_action_n!=row[0])
      throw('Route');
    if (!row[0] && tm_action_n!= -1) throw('Null');
    for (j=0;j<3;j++) if (tm_action_args[j]!=row[4+j]) {
      "ACTION %d FIELD %d GOT %d EXPECTED %d\n",
	    i,j,tm_action_args[j],row[4+j];
      throw('Args');
    }
    if (world[k]->random!=row[3] || Fs->data_heap->used_u8s!=used)
      throw('Alloc');
    tm_action_cases++;
  }
  for (i=0;i<2;i++) {
    ActionsDel(actions[i]); BrainDel(brain[i]); EnemiesDel(enemies[i]);
    SpecialsDel(specials[i]); SectorsDel(sectors[i]); MotionDel(motion[i]);
    WorldDel(world[i]); MapDel(map[i]);
  }
  GameDataDel(data); Free(body); tm_action_done=1;
  "ACTION %d ROUTES BAD 0\n",tm_action_cases;
}

TmActionTest;
