U0 TmProjDecisions()
{
  I64 *body=FileRead("C:/ORACLE/PROJECT.BIN"),*row,i,j,out[22],used;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Motion *motion=MotionNew(world);
  Actor *source,*target,*actor;
  if (!body || !data) throw('Files');
  tm_proj_world=world;
  source=WorldSpawn(world,TM_MT_TROOP,-64*65536,16*65536);
  target=WorldSpawn(world,TM_MT_PLAYER,64*65536,16*65536);
  motion->sound=&TmProjSound; used=Fs->data_heap->used_u8s;
  for (i=0,row=body+1;i<body[0];i++,row+=30) {
    source->z=row[3]; target->x=source->x+row[1];
    target->y=source->y+row[2]; target->z=row[4]; target->flags=row[5];
    tm_proj_angle=row[6]; world->random=row[7];
    tm_proj_spawns=tm_proj_sounds=tm_proj_angles=tm_proj_starts=0;
    tm_proj_sound=tm_proj_sound_rng=tm_proj_angle_rng=tm_proj_start_rng=-1;
    tm_proj_spawn_rng=-1;
    actor=ActorMissileNew(motion,source,target,row[0]);
    if (actor!=tm_proj_result) throw('Result');
    out[0]=actor->x; out[1]=actor->y; out[2]=actor->z;
    out[3]=actor->vx; out[4]=actor->vy; out[5]=actor->vz;
    out[6]=actor->angle; out[7]=actor->target==source->id;
    out[8]=actor->lastlook; out[9]=world->random; out[10]=tm_proj_spawns;
    out[11]=tm_proj_sounds; out[12]=tm_proj_sound; out[13]=tm_proj_sound_rng;
    out[14]=tm_proj_angles; out[15]=tm_proj_angle_rng;
    out[16]=tm_proj_start_rng; out[17]=tm_proj_starts;
    out[18]=tm_proj_dx; out[19]=tm_proj_dy; out[20]=actor->type;
    out[21]=tm_proj_spawn_rng;
    for (j=0;j<22;j++) if (out[j]!=row[8+j]) {
      "PROJECTILE %d FIELD %d GOT %d EXPECTED %d\n",i,j,out[j],row[8+j];
      throw('Aim');
    }
    WorldRemove(world,actor);
    if (Fs->data_heap->used_u8s!=used || world->actor_cnt!=2) throw('Alloc');
    tm_proj_cases++;
  }
  MotionDel(motion); WorldDel(world); MapDel(map); GameDataDel(data);
  Free(body); tm_proj_done=1;
  "PROJECTILE %d DECISIONS BAD 0\n",tm_proj_cases;
}

TmProjDecisions;
