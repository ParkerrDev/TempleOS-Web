I64 tm_proj_real_cases=0,tm_proj_real_done=0,tm_proj_real_sound,
	tm_proj_real_sound_rng,tm_proj_real_sounds;
Bool tm_proj_real_fail=FALSE;
GameData *tm_proj_real_data;
Motion *tm_proj_real_motion;
Actor *tm_proj_real_source,*tm_proj_real_target,*tm_proj_real_origin;

U0 TmProjRealSound(Actor *actor,I64 sound)
{
  tm_proj_real_origin=actor; tm_proj_real_sound=sound;
  tm_proj_real_sounds++;
  tm_proj_real_sound_rng=tm_proj_real_motion->world->random;
  if (tm_proj_real_fail) throw('Sound',TRUE);
}

U0 TmProjRealNew()
{
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,tm_proj_real_data);
  tm_proj_real_motion=MotionNew(world);
  tm_proj_real_source=WorldSpawn(world,TM_MT_TROOP,-64*65536,0);
  tm_proj_real_target=WorldSpawn(world,TM_MT_PLAYER,64*65536,0);
  tm_proj_real_motion->sound=&TmProjRealSound;
  tm_proj_real_origin=NULL; tm_proj_real_sound=tm_proj_real_sound_rng=-1;
  tm_proj_real_sounds=0; world->random=0;
}

U0 TmProjRealDel()
{
  World *world=tm_proj_real_motion->world;
  Map *map=world->map;
  MotionDel(tm_proj_real_motion); WorldDel(world); MapDel(map);
}

U0 TmProjRealTest()
{
  I64 *body=FileRead("C:/ORACLE/PROJREAL.BIN"),*row,i,j,out[12],used,n,speed;
  World *world;
  Actor *actor,*source,*target;
  Bool caught;
  tm_proj_real_data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  if (!body || !tm_proj_real_data) throw('Files');
  used=Fs->data_heap->used_u8s;
  for (i=0,row=body+1;i<body[0];i++,row+=16) {
    TmProjRealNew; world=tm_proj_real_motion->world;
    source=tm_proj_real_source; target=tm_proj_real_target;
    target->flags|=row[1]; target->z=row[3]; world->random=row[2];
    actor=ActorMissileNew(tm_proj_real_motion,source,target,row[0]);
    if (!actor || !actor->active || actor->target!=source->id ||
	  actor->block!=-1 || !(actor->flags&TM_MF_NOBLOCKMAP) ||
	  world->actor_cnt!=3) throw('Spawn');
    out[0]=actor->angle; out[1]=actor->vx; out[2]=actor->vy; out[3]=actor->vz;
    out[4]=actor->x; out[5]=actor->y; out[6]=actor->z; out[7]=actor->tics;
    out[8]=actor->lastlook; out[9]=world->random;
    out[10]=tm_proj_real_sound; out[11]=tm_proj_real_sound_rng;
    for (j=0;j<12;j++) if (out[j]!=row[4+j]) {
      "PROJECTILE REAL %d FIELD %d GOT %d EXPECTED %d\n",
	    i,j,out[j],row[4+j];
      throw('Motion');
    }
    n=!!tm_proj_real_data->info[row[0]].see_snd;
    if (tm_proj_real_sounds!=n || n && tm_proj_real_origin!=actor)
      throw('Sound');
    TmProjRealDel;
    if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
    tm_proj_real_cases++;
  }
  for (i=0;i<9;i++) {
    TmProjRealNew; world=tm_proj_real_motion->world;
    source=tm_proj_real_source; target=tm_proj_real_target;
    speed=tm_proj_real_data->info[TM_MT_ROCKET].speed;
    n=TM_MT_ROCKET; caught=FALSE; actor=NULL;
    switch (i) {
      case 0: n=-1; break;
      case 1: n=TM_ACTOR_NUM; break;
      case 2: n=TM_MT_PLAYER; break;
      case 3: tm_proj_real_data->info[n].speed=0; break;
      case 4: source->world=NULL; break;
      case 5: target->world=NULL; break;
      case 6: source->active=FALSE; break;
      case 7: target->active=FALSE; break;
      case 8: tm_proj_real_fail=TRUE; break;
    }
    try {
      actor=ActorMissileNew(tm_proj_real_motion,source,target,n);
    } catch {
      if (i<=3 && Fs->except_ch=='Missile' ||
	    4<=i<=5 && Fs->except_ch=='World' ||
	    i==8 && Fs->except_ch=='Sound') {
	caught=TRUE; Fs->catch_except=TRUE;
      }
    }
    if (actor || caught!=!(6<=i<=7)) throw('Guard');
    if (i<8 && (world->actor_cnt!=2 || world->random ||
	  tm_proj_real_sounds)) throw('Atomic');
    if (i==8 && (world->actor_cnt!=3 || world->random!=1 ||
	  tm_proj_real_sounds!=1)) throw('Owned');
    source->world=target->world=world; tm_proj_real_fail=FALSE;
    tm_proj_real_data->info[TM_MT_ROCKET].speed=speed;
    TmProjRealDel;
    if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
    tm_proj_real_cases++;
  }
  GameDataDel(tm_proj_real_data); Free(body); tm_proj_real_done=1;
  "PROJECTILE %d REAL CASES BAD 0\n",tm_proj_real_cases;
}

TmProjRealTest;
