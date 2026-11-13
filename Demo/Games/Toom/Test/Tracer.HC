I64 tm_tracer_real_cases=0,tm_tracer_real_done=0,tm_tracer_real_sounds,
	tm_tracer_real_sound,tm_tracer_real_sound_rng;
Bool tm_tracer_real_fail;
GameData *tm_tracer_real_data;
Enemies *tm_tracer_real_enemies;
Actor *tm_tracer_real_source,*tm_tracer_real_target,*tm_tracer_real_origin;

U0 TmTracerRealSound(Actor *actor,I64 sound)
{
  tm_tracer_real_sounds++; tm_tracer_real_sound=sound;
  tm_tracer_real_sound_rng=actor->world->random;
  tm_tracer_real_origin=actor;
  if (tm_tracer_real_fail) throw('SoundCB',TRUE);
}

U0 TmTracerRealNew(I64 type,I64 x=-64*65536,I64 z=0,I64 target_z=0)
{
  Map *map=RoomsNew(FALSE);
  World *world;
  Motion *motion;
  Sectors *sectors;
  Specials *specials;
  map->line[0].side[0]=map->line[4].side[0]=map->line[5].side[0]=1;
  map->sector[0].floor=7*65536; map->sector[0].ceil=96*65536;
  map->sector[1].floor=-3*65536;
  world=WorldNew(map,tm_tracer_real_data); motion=MotionNew(world);
  sectors=SectorsNew(motion); specials=SpecialsNew(sectors);
  tm_tracer_real_enemies=EnemiesNew(specials);
  tm_tracer_real_source=WorldSpawn(world,type,x,0,z);
  tm_tracer_real_target=WorldSpawn(world,TM_MT_PLAYER,x+128*65536,0,target_z);
  tm_tracer_real_source->target=tm_tracer_real_target->id;
  tm_tracer_real_source->tracer=tm_tracer_real_target->id;
  motion->sound=&TmTracerRealSound; world->random=0;
  tm_tracer_real_sounds=0; tm_tracer_real_sound=tm_tracer_real_sound_rng=-1;
  tm_tracer_real_origin=NULL; tm_tracer_real_fail=FALSE;
}

U0 TmTracerRealDel()
{
  Enemies *enemies=tm_tracer_real_enemies;
  Specials *specials=enemies->specials;
  Sectors *sectors=specials->sectors;
  Motion *motion=sectors->motion;
  World *world=motion->world;
  Map *map=world->map;
  EnemiesDel(enemies); SpecialsDel(specials); SectorsDel(sectors);
  MotionDel(motion); WorldDel(world); MapDel(map);
}

U0 TmTracerRealTest()
{
  I64 *body=FileRead("C:/ORACLE/TRACREAL.BIN"),*row,i,j,out[17],used,type,
	tic,n,random,vx,vy,vz;
  Enemies *enemies;
  Motion *motion;
  World *world;
  Actor *source,*target,*missile,*puff,*smoke;
  Bool caught,pulse,aim;
  tm_tracer_real_data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  if (!body || !tm_tracer_real_data) throw('Files');
  used=Fs->data_heap->used_u8s;
  for (i=0,row=body+1;i<body[0];i++,row+=22) {
    TmTracerRealNew(TM_MT_UNDEAD,row[0],row[1],row[2]);
    enemies=tm_tracer_real_enemies; motion=enemies->specials->sectors->motion;
    world=motion->world; source=tm_tracer_real_source;
    target=tm_tracer_real_target; target->flags|=row[3]; world->random=row[4];
    EnemySkelMissile(enemies,source); missile=WorldActorGet(world,world->last);
    if (world->actor_cnt!=3 || !missile || missile->type!=TM_MT_TRACER ||
	  missile->target!=source->id || missile->tracer!=target->id ||
	  missile->block!=-1 || tm_tracer_real_sounds!=1 ||
	  tm_tracer_real_origin!=missile) throw('Missile');
    out[0]=source->angle; out[1]=source->z; out[2]=world->random;
    out[3]=missile->angle; out[4]=missile->vx; out[5]=missile->vy;
    out[6]=missile->vz; out[7]=missile->x; out[8]=missile->y; out[9]=missile->z;
    out[10]=missile->tics; out[11]=missile->lastlook; out[12]=missile->sector;
    out[13]=missile->floor; out[14]=missile->ceil;
    out[15]=tm_tracer_real_sound; out[16]=tm_tracer_real_sound_rng;
    for (j=0;j<17;j++) if (out[j]!=row[5+j]) {
      "TRACER REAL %d FIELD %d GOT %d EXPECTED %d\n",i,j,out[j],row[5+j];
      throw('Launch');
    }
    TmTracerRealDel;
    if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
    tm_tracer_real_cases++;
  }
  for (i=0;i<14;i++) {
    type=TM_MT_TRACER;
    if (8<=i<=11) type=TM_MT_UNDEAD;
    TmTracerRealNew(type,,32*65536);
    enemies=tm_tracer_real_enemies; motion=enemies->specials->sectors->motion;
    world=motion->world; source=tm_tracer_real_source;
    target=tm_tracer_real_target; caught=FALSE;
    source->vx=12345; source->vy=-54321; source->vz=0;
    tic=0; if (4<=i<=6) tic=i-3;
    if (i==7) tic=4;
    world->tic=1; if (tic&3) world->tic=0;
    switch (i) {
      case 1: target->health=0; break;
      case 2: source->tracer=0; break;
      case 3:
	WorldRemove(world,target);
	target=WorldSpawn(world,TM_MT_PLAYER,64*65536,0);
	world->random=0;
	break;
      case 8: tm_tracer_real_fail=TRUE; break;
      case 9: target->world=NULL; break;
      case 10: source->active=FALSE; break;
      case 11: source->target=0; break;
      case 12: source->world=NULL; break;
      case 13: source->active=FALSE; break;
    }
    try {
      if (8<=i<=11) EnemySkelMissile(enemies,source);
      else EnemyTracer(enemies,source,tic);
    } catch {
      if (i==8 && Fs->except_ch=='SoundCB' ||
	    (i==9 || i==12) && Fs->except_ch=='World') {
	caught=TRUE; Fs->catch_except=TRUE;
      }
    }
    if (caught!=!!(i==8 || i==9 || i==12)) throw('Guard');
    source->world=target->world=world;
    if (source->z!=32*65536) throw('Restore');
    pulse=i<4 || i==7; aim=i==0 || i==7;
    n=2; random=0; vx=12345; vy=-54321; vz=0;
    if (pulse) {n=4; random=6;}
    if (i==8) {n=3; random=1;}
    if (aim) {vx=TM_TRACER_VX; vy=TM_TRACER_VY; vz=8192;}
    if (world->actor_cnt!=n || world->random!=random ||
	  source->vx!=vx || source->vy!=vy || source->vz!=vz ||
	  tm_tracer_real_sounds!=!!(i==8)) throw('Tick');
    if (pulse) {
      smoke=WorldActorGet(world,world->last);
      puff=WorldActorGet(world,smoke->tick_last);
      if (smoke->type!=TM_MT_SMOKE || puff->type!=TM_MT_PUFF ||
	    smoke->x!=-64*65536-12345 || smoke->y!=54321 ||
	    smoke->z!=32*65536 || smoke->vz!=65536 ||
	    smoke->tics!=TM_TRACER_SMOKE_TICS || smoke->lastlook!=1 ||
	    puff->x!=-64*65536 || puff->y || puff->z!=TM_TRACER_PUFF_Z ||
	    puff->vz!=65536 || puff->tics!=TM_TRACER_PUFF_TICS ||
	    puff->lastlook) throw('Trail');
    }
    TmTracerRealDel;
    if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
    tm_tracer_real_cases++;
  }
  GameDataDel(tm_tracer_real_data); Free(body); tm_tracer_real_done=1;
  "TRACER %d REAL CASES BAD 0\n",tm_tracer_real_cases;
}

TmTracerRealTest;
