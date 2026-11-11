U0 TmEffectDecisions()
{
  I64 *body=FileRead("C:/ORACLE/EFFECT.BIN"),*row,i,j,out[12],used;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Motion *motion=MotionNew(world);
  Sectors *sectors=SectorsNew(motion);
  Specials *specials=SpecialsNew(sectors);
  Enemies *enemies=EnemiesNew(specials);
  Actor *actor,*target;
  if (!body || !data) throw('Files');
  tm_effect_world=world;
  actor=tm_effect_actor=WorldSpawn(world,TM_MT_TROOP,0,0);
  target=tm_effect_target=WorldSpawn(world,TM_MT_PLAYER,64*65536,0);
  motion->sound=&TmEffectSound; used=Fs->data_heap->used_u8s;
  for (i=0,row=body+1;i<body[0];i++,row+=20) {
    actor->type=row[1];
    data->info[actor->type].death_snd=data->info[actor->type].pain_snd=row[2];
    actor->health=row[3]; actor->flags=row[5]; actor->target=0;
    if (row[6]) actor->target=target->id;
    world->random=row[7]; tm_effect_cnt=0;
    MemSet(tm_effect_trace,0xFF,sizeof(tm_effect_trace));
    EnemyEffect(enemies,actor,row[0],row[4]);
    out[0]=actor->flags; out[1]=world->random;
    out[2]=(world->random-row[7])&255; out[3]=tm_effect_cnt;
    MemCpy(out+4,tm_effect_trace,8*sizeof(I64));
    for (j=0;j<12;j++) if (out[j]!=row[8+j]) {
      "EFFECT %d ACTION %d FIELD %d GOT %d EXPECTED %d\n",
	    i,row[0],j,out[j],row[8+j];
      throw('Effect');
    }
    if (Fs->data_heap->used_u8s!=used) throw('Alloc');
    tm_effect_cases++;
  }
  EnemiesDel(enemies); SpecialsDel(specials); SectorsDel(sectors);
  MotionDel(motion); WorldDel(world); MapDel(map); GameDataDel(data);
  Free(body); tm_effect_done=1;
  "EFFECT %d DECISIONS BAD 0\n",tm_effect_cases;
}

TmEffectDecisions;
