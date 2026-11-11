U0 TmChaseDecisions()
{
  I64 *body=FileRead("C:/ORACLE/CHASE.BIN"),*row,i,j,out[49],used;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Motion *motion=MotionNew(world);
  Sectors *sectors=SectorsNew(motion);
  Specials *specials=SpecialsNew(sectors);
  Enemies *enemies=EnemiesNew(specials);
  Actor *actor,*target;
  ActorInfo *info=data->info+TM_MT_POSSESSED;
  if (!body || !data) throw('Files');
  actor=tm_chase_actor=WorldSpawn(world,TM_MT_POSSESSED,0,0);
  target=tm_chase_target=WorldSpawn(world,TM_MT_PLAYER,64*65536,0);
  tm_chase_man=WorldSpawn(world,TM_MT_PLAYER,-64*65536,0);
  motion->sound=&TmChaseSound; used=Fs->data_heap->used_u8s;
  for (i=0,row=body+1;i<body[0];i++,row+=72) {
    target->x=row[1]; target->y=row[2];
    actor->movedir=row[3]; actor->angle=row[4]; actor->move_cnt=row[5];
    actor->reaction=row[6]; actor->threshold=row[7]; actor->flags=row[8];
    actor->target=0;
    if (row[9]) actor->target=target->id;
    target->health=row[10]; target->flags=row[11];
    info->spawn=88; info->melee=row[12]; info->missile=row[13];
    info->attack_snd=row[14]; info->active_snd=row[15]; actor->state=77;
    world->skill=row[16]; world->fast=row[17];
    tm_chase_melee=row[18]; tm_chase_missile=row[19];
    tm_chase_player=row[20]; tm_chase_mask=row[21]; world->random=row[22];
    tm_chase_melee_calls=tm_chase_missile_calls=tm_chase_player_calls=0;
    tm_chase_state_calls=tm_chase_sound_calls=tm_chase_cnt=0;
    tm_chase_sound=-1; MemSet(tm_chase_trace,0xFF,sizeof(tm_chase_trace));
    if (row[0]) EnemyChase(enemies,actor);
    else EnemyDir(enemies,actor);
    out[0]=0;
    if (actor->target==target->id) out[0]=1;
    else if (actor->target==tm_chase_man->id) out[0]=2;
    out[1]=actor->flags; out[2]=actor->angle; out[3]=actor->move_cnt;
    out[4]=actor->reaction; out[5]=actor->threshold; out[6]=actor->movedir;
    out[7]=actor->state; out[8]=tm_chase_sound; out[9]=tm_chase_sound_calls;
    out[10]=world->random; out[11]=(world->random-row[22])&255;
    out[12]=tm_chase_melee_calls; out[13]=tm_chase_missile_calls;
    out[14]=tm_chase_player_calls; out[15]=tm_chase_state_calls;
    out[16]=tm_chase_cnt; MemCpy(out+17,tm_chase_trace,32*sizeof(I64));
    for (j=0;j<49;j++) if (out[j]!=row[23+j]) {
      "CHASE %d OP %d FIELD %d GOT %d EXPECTED %d\n",
	    i,row[0],j,out[j],row[23+j];
      throw('Chase');
    }
    tm_chase_cases++;
  }
  if (Fs->data_heap->used_u8s!=used) throw('Alloc');
  EnemiesDel(enemies); SpecialsDel(specials); SectorsDel(sectors);
  MotionDel(motion); WorldDel(world); MapDel(map); GameDataDel(data);
  Free(body); tm_chase_done=1;
  "CHASE %d DECISIONS BAD 0\n",tm_chase_cases;
}

TmChaseDecisions;
