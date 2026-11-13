U0 TmVileDecisions()
{
  I64 *body=FileRead("C:/ORACLE/VILE.BIN"),*row,i,j,n,out[54],used,res;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Motion *motion=MotionNew(world);
  Sectors *sectors=SectorsNew(motion);
  Specials *specials=SpecialsNew(sectors);
  Enemies *enemies=EnemiesNew(specials);
  Actor *actor=WorldSpawn(world,TM_MT_VILE,-16*65536,-16*65536),
	*target=WorldSpawn(world,TM_MT_PLAYER,112*65536,112*65536),*corpse;
  ActorInfo *info;
  if (!body || !data) throw('Files');
  tm_vile_actor=actor;
  for (i=0;i<3;i++) tm_vile_bodies[i]=WorldSpawn(world,TM_MT_TROOP,0,0);
  used=Fs->data_heap->used_u8s;
  for (i=0,row=body+1;i<body[0];i++,row+=61) {
    actor->flags=TM_MF_AMBUSH; actor->state=100; actor->angle=999;
    actor->target=target->id; actor->movedir=row[2];
    for (j=0;j<3;j++) {
      corpse=tm_vile_bodies[j]; corpse->type=TM_MT_TROOP;
      if (!j) corpse->type=row[1]; info=data->info+corpse->type;
      WorldActorUnlink(world,corpse);
      corpse->x=row[4]; if (j==1) corpse->x=-corpse->x;
      corpse->y=row[5]; if (j==2) corpse->y=-corpse->y;
      corpse->radius=info->radius; corpse->height=info->height/4;
      if (row[3]==4) corpse->radius=corpse->height=0;
      corpse->vx=7; corpse->vy=9; corpse->health=-5; corpse->state=400;
      corpse->target=target->id; corpse->tics=-1;
      if (row[3]==1) corpse->tics=0;
      corpse->flags=0; if (row[3]) corpse->flags=TM_MF_CORPSE;
      if (row[3]==3) corpse->flags|=TM_MF_SHADOW;
      WorldActorLink(world,corpse);
    }
    tm_vile_cnt=0; tm_vile_allow=row[6];
    MemSet(tm_vile_trace,0xFF,sizeof(tm_vile_trace)); res=-1;
    if (!row[0]) res=EnemyCorpse(enemies,tm_vile_bodies[0],0,0);
    else EnemyVileChase(enemies,actor);
    out[0]=res; out[1]=actor->state; out[2]=actor->flags;
    out[3]=actor->angle; out[4]=actor->target==target->id; out[5]=tm_vile_cnt;
    for (j=0;j<3;j++) {
      corpse=tm_vile_bodies[j]; n=6+j*8;
      out[n]=corpse->height; out[n+1]=corpse->vx; out[n+2]=corpse->vy;
      out[n+3]=corpse->health; out[n+4]=corpse->flags;
      out[n+5]=corpse->target==target->id; out[n+6]=corpse->state;
      out[n+7]=corpse->tics;
    }
    MemCpy(out+30,tm_vile_trace,sizeof(tm_vile_trace));
    for (j=0;j<54;j++) if (out[j]!=row[7+j]) {
      "VILE %d FIELD %d GOT %d EXPECTED %d\n",i,j,out[j],row[7+j];
      throw('Vile');
    }
    if (Fs->data_heap->used_u8s!=used) throw('Alloc');
    tm_vile_cases++;
  }
  EnemiesDel(enemies); SpecialsDel(specials); SectorsDel(sectors);
  MotionDel(motion); WorldDel(world); MapDel(map); GameDataDel(data);
  Free(body); tm_vile_done=1;
  "VILE %d DECISIONS BAD 0\n",tm_vile_cases;
}

TmVileDecisions;
