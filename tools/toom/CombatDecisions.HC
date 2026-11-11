U0 TmCombatDecisions()
{
  I64 *body=FileRead("C:/ORACLE/COMBAT.BIN"),*row,i,j,out[70],used;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Motion *motion=MotionNew(world);
  Sectors *sectors=SectorsNew(motion);
  Specials *specials=SpecialsNew(sectors);
  Enemies *enemies=EnemiesNew(specials);
  Actor *actor,*target;
  if (!body || !data) throw('Files');
  tm_combat_world=world; tm_combat_specials=specials;
  actor=tm_combat_actor=WorldSpawn(world,TM_MT_TROOP,0,0);
  target=tm_combat_target=WorldSpawn(world,TM_MT_PLAYER,64*65536,0);
  data->info[TM_MT_TROOP].see=99; data->info[TM_MT_PLAYER].radius=16*65536;
  motion->sound=&TmCombatSound; used=Fs->data_heap->used_u8s;
  for (i=0,row=body+1;i<body[0];i++,row+=80) {
    target->x=row[1]; target->y=0; actor->target=0;
    if (row[2]) actor->target=target->id;
    target->health=row[3]; target->flags=row[4]; tm_combat_sight=row[5];
    tm_combat_angle=row[6]; actor->angle=row[7]; actor->flags=TM_MF_AMBUSH;
    actor->state=77; tm_combat_slope=row[8]; world->random=row[9];
    tm_combat_cnt=0; MemSet(tm_combat_trace,0xFF,sizeof(tm_combat_trace));
    switch (row[0]) {
      case TM_A_POS_ATTACK:
      case TM_A_SPOS_ATTACK:
      case TM_A_CPOS_ATTACK: EnemyShot(enemies,actor,row[0]); break;
      case TM_A_CPOS_REFIRE: EnemyRefire(enemies,actor,40); break;
      case TM_A_SPID_REFIRE: EnemyRefire(enemies,actor,10); break;
      case TM_A_TROOP_ATTACK: EnemyTroop(enemies,actor); break;
      case TM_A_SARG_ATTACK: EnemySarg(enemies,actor); break;
      case TM_A_HEAD_ATTACK: EnemyHead(enemies,actor); break;
      case TM_A_BRUIS_ATTACK: EnemyBruis(enemies,actor); break;
      case TM_A_SKEL_FIST: EnemySkelFist(enemies,actor); break;
      case TM_A_BSPI_ATTACK: EnemyLaunch(enemies,actor,TM_MT_ARACHPLAZ); break;
      case TM_A_CYBER_ATTACK: EnemyLaunch(enemies,actor,TM_MT_ROCKET); break;
      case TM_A_SKEL_WHOOSH: EnemyWhoosh(enemies,actor); break;
      default: throw('Action');
    }
    out[0]=actor->flags; out[1]=actor->angle; out[2]=actor->state;
    out[3]=world->random; out[4]=(world->random-row[9])&255;
    out[5]=tm_combat_cnt; MemCpy(out+6,tm_combat_trace,64*sizeof(I64));
    for (j=0;j<70;j++) if (out[j]!=row[10+j]) {
      "COMBAT %d ACTION %d FIELD %d GOT %d EXPECTED %d\n",
	    i,row[0],j,out[j],row[10+j];
      throw('Combat');
    }
    if (Fs->data_heap->used_u8s!=used) throw('Alloc');
    tm_combat_cases++;
  }
  EnemiesDel(enemies); SpecialsDel(specials); SectorsDel(sectors);
  MotionDel(motion); WorldDel(world); MapDel(map); GameDataDel(data);
  Free(body); tm_combat_done=1;
  "COMBAT %d DECISIONS BAD 0\n",tm_combat_cases;
}

TmCombatDecisions;
