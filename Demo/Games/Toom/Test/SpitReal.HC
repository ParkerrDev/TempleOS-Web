I64 tm_spit_real_cases=0,tm_spit_real_done=0,tm_spit_real_mode,
	tm_spit_real_sounds,tm_spit_real_sound[2],tm_spit_real_rng[2];
Actor *tm_spit_real_cube;
Brain *tm_spit_real_brain;

U0 TmSpitRealSound(Actor *actor,I64 sound)
{
  World *world=tm_spit_real_brain->enemies->specials->sectors->motion->world;
  I64 i=tm_spit_real_sounds++;
  if (i>1) throw('Sound');
  tm_spit_real_sound[i]=sound; tm_spit_real_rng[i]=world->random;
  if (actor) {
    if (i || actor->type!=TM_MT_SPAWNSHOT || sound!=TM_SFX_BOSPIT)
      throw('Origin');
    tm_spit_real_cube=actor;
    if (tm_spit_real_mode==19) throw('SoundCB',TRUE);
    if (tm_spit_real_mode==20) actor->active=FALSE;
  } else {
    if (i!=1 || sound!=TM_SFX_BOSPIT) throw('Origin');
    if (tm_spit_real_mode==18) throw('SoundCB',TRUE);
  }
}

U0 TmSpitRealTest()
{
  I64 mode,used,old_tics,n,*saved,*targets,old_on,old_cnt,i,j,rng,phase,expect,
	seed,angle,vx,vy,distance,speed,*body=FileRead("C:/ORACLE/SPITMAP.BIN"),
	*row;
  Bool caught,spawn,step;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Wad *wad=WadNew("C:/ORACLE/SPITMAP.WAD");
  Map *map;
  World *world;
  Motion *motion;
  Sectors *sectors;
  Specials *specials;
  Enemies *enemies;
  Actor *actor,*target,*other,*cube;
  Brain *brain;
  if (!body || !data || !wad) throw('Files');
  used=Fs->data_heap->used_u8s;
  for (mode=0;mode<23;mode++) {
    map=RoomsNew(FALSE); world=WorldNew(map,data); motion=MotionNew(world);
    sectors=SectorsNew(motion); specials=SpecialsNew(sectors);
    enemies=EnemiesNew(specials); brain=BrainNew(enemies);
    actor=WorldSpawn(world,TM_MT_BOSSSPIT,0,0);
    target=WorldSpawn(world,TM_MT_BOSSTARGET,0,64*65536);
    switch (mode) {
      case 1: WorldActorPlace(world,target,0,-64*65536,0); break;
      case 2: WorldActorPlace(world,target,64*65536,0,0); break;
      case 3: WorldActorPlace(world,target,-64*65536,0,0); break;
      case 4: WorldActorPlace(world,target,0,0,0); break;
      case 5: WorldActorPlace(world,target,0,1,0); break;
      case 6: WorldActorPlace(world,target,45*65536,64*65536,0); break;
    }
    if (mode==7) WorldRemove(world,target);
    BrainAwake(brain,actor);
    if (mode==8 || mode==9) {
      WorldRemove(world,target);
      other=WorldSpawn(world,TM_MT_BOSSTARGET,0,64*65536);
      if (WorldActorGet(world,brain->targets[0])) throw('Handle');
      if (mode==8) {
	targets=MAlloc(2*sizeof(I64)); targets[0]=brain->targets[0];
	Free(brain->targets); brain->targets=targets;
	brain->targets[1]=other->id; brain->cnt=2; target=other;
      }
    }
    if (mode==10) actor->world=NULL;
    if (mode==11) actor->active=FALSE;
    if (mode==12 || mode==13) world->skill=1;
    if (mode==13) brain->easy=TRUE;
    old_cnt=brain->cnt; old_on=brain->on; saved=brain->targets;
    if (mode==14) brain->cnt=-1;
    if (mode==15) brain->on=brain->cnt;
    if (mode==16) brain->targets=NULL;
    old_tics=data->state[TM_S_SPAWN1].tics;
    if (mode==17) data->state[TM_S_SPAWN1].tics=0;
    if (mode==21) {brain->cnt=0; brain->on=99;}
    if (mode==22) target->active=FALSE;
    tm_spit_real_brain=brain; tm_spit_real_mode=mode;
    tm_spit_real_sounds=0; tm_spit_real_cube=NULL;
    motion->sound=&TmSpitRealSound; world->random=0; caught=FALSE;
    n=world->actor_cnt;
    try {
      BrainSpit(brain,actor);
    } catch {
      if (mode==10 && Fs->except_ch=='World' ||
	    14<=mode<=16 && Fs->except_ch=='BrainIdx' ||
	    mode==17 && Fs->except_ch=='CubeTics' ||
	    (mode==18 || mode==19) && Fs->except_ch=='SoundCB')
	caught=Fs->catch_except=TRUE;
    }
    actor->world=world;
    spawn=mode<=6 || mode==8 || mode==12 || 17<=mode<=20;
    step=spawn && mode!=19;
    if (caught!=!!(mode==10 || 14<=mode<=19)) throw('Guard');
    if (world->actor_cnt!=n+spawn || world->random!=spawn+step)
      throw('Random');
    if (tm_spit_real_sounds!=spawn+!!(step && mode!=17)) throw('Sound');
    phase=!(mode==10 || mode==11 || mode==13 || 14<=mode<=16);
    if (brain->easy!=phase) throw('Phase');
    cube=tm_spit_real_cube;
    if (spawn) {
      if (!cube || tm_spit_real_rng[0]!=1) throw('Spawn');
      if (mode!=19 && mode!=20) {
	if (!cube->active || cube->target!=target->id) throw('Target');
	if (mode!=17) {
	  expect=2;
	  if (mode==4 || mode==5) expect=1;
	  if (cube->reaction!=expect) throw('Timer');
	}
      }
      if (mode==20 && cube->active) throw('Retire');
    } else if (cube) throw('Spawn');
    if (mode==12) {
      rng=world->random; n=world->actor_cnt;
      tm_spit_real_sounds=0; tm_spit_real_cube=NULL;
      BrainSpit(brain,actor);
      if (brain->easy || world->actor_cnt!=n || world->random!=rng ||
	    tm_spit_real_sounds || tm_spit_real_cube) throw('Easy');
    }
    brain->cnt=old_cnt; brain->on=old_on; brain->targets=saved;
    data->state[TM_S_SPAWN1].tics=old_tics;
    BrainDel(brain); EnemiesDel(enemies); SpecialsDel(specials);
    SectorsDel(sectors); MotionDel(motion); WorldDel(world); MapDel(map);
    if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
    tm_spit_real_cases++;
  }
  for (i=0,row=body+1;i<body[0];i++,row+=4) for (j=0;j<4;j++) {
    map=MapNew(wad,"MAP30"); world=WorldNew(map,data);
    motion=MotionNew(world); sectors=SectorsNew(motion);
    specials=SpecialsNew(sectors); enemies=EnemiesNew(specials);
    brain=BrainNew(enemies);
    actor=WorldSpawn(world,TM_MT_BOSSSPIT,row[0]*65536,row[1]*65536);
    target=WorldSpawn(world,TM_MT_BOSSTARGET,row[2]*65536,row[3]*65536);
    BrainAwake(brain,actor); tm_spit_real_brain=brain;
    tm_spit_real_mode=-1; tm_spit_real_sounds=0; tm_spit_real_cube=NULL;
    motion->sound=&TmSpitRealSound; world->random=seed=j*85;
    angle=AngleFrom(data,target->x-actor->x,target->y-actor->y);
    speed=data->info[TM_MT_SPAWNSHOT].speed;
    vx=FixedMul(speed,AngleCos(data,angle));
    vy=FixedMul(speed,AngleSin(data,angle));
    distance=target->y-actor->y;
    if (!vy || !distance) throw('MapY');
    expect=distance/vy/data->state[TM_S_SPAWN1].tics;
    if (expect<=0) throw('MapY');
    BrainSpit(brain,actor); cube=tm_spit_real_cube;
    if (!cube || !cube->active || cube->target!=target->id ||
	cube->reaction!=expect || cube->vx!=vx || cube->vy!=vy ||
	cube->x!=actor->x+vx>>1 || cube->y!=actor->y+vy>>1 ||
	world->random!=(seed+2)&255 || tm_spit_real_sounds!=2 ||
	tm_spit_real_rng[0]!=(seed+1)&255 ||
	tm_spit_real_rng[1]!=(seed+2)&255) throw('MapPath');
    BrainDel(brain); EnemiesDel(enemies); SpecialsDel(specials);
    SectorsDel(sectors); MotionDel(motion); WorldDel(world); MapDel(map);
    if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
    tm_spit_real_cases++;
  }
  WadDel(wad); GameDataDel(data); Free(body); tm_spit_real_done=1;
  "SPIT %d REAL CASES BAD 0\n",tm_spit_real_cases;
}

TmSpitRealTest;
