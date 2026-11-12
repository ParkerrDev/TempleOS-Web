U0 TmRespawnDecisions()
{
  I64 *body=FileRead("C:/ORACLE/RESPAWN.BIN"),*row,i,j,out[61],used;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Motion *motion=MotionNew(world);
  Actor *actor,*born;
  Thing *thing;
  if (!body || !data) throw('Files');
  map->thing_cnt=1; map->thing=thing=CAlloc(sizeof(Thing));
  map->sector[0].floor=3*65536; map->sector[1].floor=-5*65536;
  actor=tm_respawn_actor=WorldSpawn(world,TM_MT_TROOP,-70*65536,11*65536);
  tm_respawn_world=world; motion->sound=&TmRespawnSound;
  data->state[5].next=7; data->state[7].tics=3; data->state[7].action=0;
  used=Fs->data_heap->used_u8s;
  for (i=0,row=body+1;i<body[0];i++,row+=75) {
    actor->active=TRUE; actor->type=11; actor->state=5; actor->sector=0;
    actor->z=actor->floor=3*65536; actor->flags=row[2];
    actor->tics=row[3]; actor->move_cnt=row[4]; actor->spawn=-1;
    if (row[13]) actor->spawn=0;
    world->skill=row[1]; world->tic=row[5]; world->random=row[6];
    tm_respawn_blocked=row[7];
    thing->x=row[8]; thing->y=row[9]; thing->angle=row[10];
    thing->flags=row[11]; data->info[11].flags=row[12];
    tm_respawn_cnt=tm_respawn_spawns=0;
    MemSet(tm_respawn_trace,0xFF,sizeof(tm_respawn_trace));
    MemSet(tm_respawn_spawn,0,sizeof(tm_respawn_spawn));
    if (row[0]) ActorRespawn(motion,actor);
    else ActorThink(motion,actor);
    if (!actor->active) TmRespawnRecord(5,0,0,0,0);
    out[0]=actor->tics; out[1]=actor->move_cnt; out[2]=world->random;
    out[3]=actor->active; out[4]=tm_respawn_spawns; out[5]=tm_respawn_cnt;
    born=tm_respawn_spawn+2;
    out[6]=born->angle; out[7]=born->reaction; out[8]=born->flags;
    out[9]=out[10]=out[11]=out[12]=0;
    if (tm_respawn_spawns==3 && born->spawn>=0) {
      out[9]=map->thing[born->spawn].x; out[10]=map->thing[born->spawn].y;
      out[11]=map->thing[born->spawn].angle;
      out[12]=map->thing[born->spawn].flags;
    }
    MemCpy(out+13,tm_respawn_trace,sizeof(tm_respawn_trace));
    for (j=0;j<61;j++) if (out[j]!=row[14+j]) {
      "RESPAWN %d FIELD %d GOT %d EXPECTED %d\n",i,j,out[j],row[14+j];
      throw('Respawn');
    }
    if (Fs->data_heap->used_u8s!=used) throw('Heap');
    tm_respawn_cases++;
  }
  MotionDel(motion); WorldDel(world); MapDel(map); GameDataDel(data);
  Free(body); tm_respawn_done=1;
  "RESPAWN %d DECISIONS BAD 0\n",tm_respawn_cases;
}

TmRespawnDecisions;
