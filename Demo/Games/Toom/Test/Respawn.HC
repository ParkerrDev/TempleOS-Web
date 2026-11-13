I64 tm_respawn_real_cases=0,tm_respawn_real_done=0,tm_respawn_sound_cnt,
	tm_respawn_sound_mode,tm_respawn_sound_ids[2];
World *tm_respawn_sound_world;

U0 TmRespawnRealSound(Actor *actor,I64 sound)
{
  if (actor->world!=tm_respawn_sound_world || actor->type!=TM_MT_TFOG ||
	sound!=TM_SFX_TELEPT || tm_respawn_sound_cnt>=2) throw('Sound');
  tm_respawn_sound_ids[tm_respawn_sound_cnt++]=actor->id;
  if (tm_respawn_sound_mode==11) throw('SoundCB',TRUE);
}

U0 TmRespawnRealTest()
{
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map;
  World *world;
  Motion *motion;
  Sectors *sectors;
  Specials *specials;
  Actor *actor,*born,*fog1,*fog2,*blocker;
  Thing *thing;
  ActorInfo old_info,*info;
  I64 mode,used,id,expected_x,expected_y,expected_angle,expected_flags,
	spawn_tics,fog_tics;
  Bool caught;
  if (!data) throw('Files');
  used=Fs->data_heap->used_u8s;
  info=data->info+TM_MT_TROOP; MemCpy(&old_info,info,sizeof(ActorInfo));
  spawn_tics=data->state[info->spawn].tics;
  fog_tics=data->state[data->info[TM_MT_TFOG].spawn].tics;
  for (mode=0;mode<12;mode++) {
    map=RoomsNew(FALSE);
    map->line[0].side[0]=map->line[4].side[0]=map->line[5].side[0]=1;
    map->thing_cnt=1; map->thing=thing=CAlloc(sizeof(Thing));
    thing->x=64; thing->angle=90; thing->flags=8;
    map->sector[0].floor=3*65536; map->sector[1].floor=-5*65536;
    world=WorldNew(map,data,4); motion=MotionNew(world);
    sectors=SectorsNew(motion); specials=SpecialsNew(sectors);
    motion->sound=&TmRespawnRealSound;
    tm_respawn_sound_world=world; tm_respawn_sound_cnt=0;
    tm_respawn_sound_mode=mode;
    actor=WorldSpawn(world,TM_MT_TROOP,-64*65536,0); id=actor->id;
    actor->health=0; actor->flags=actor->flags&~(TM_MF_SOLID|
	  TM_MF_SHOOTABLE)|TM_MF_CORPSE;
    actor->height/=4; actor->tics=-1; actor->spawn=0;
    actor->move_cnt=419; world->tic=448; world->total_kills=1;
    expected_x=64*65536; expected_y=0; expected_angle=0x40000000;
    expected_flags=info->flags|TM_MF_AMBUSH;
    switch (mode) {
      case 1:
	blocker=WorldSpawn(world,TM_MT_TROOP,64*65536,0);
	blocker->tics=-1; blocker->flags&=~TM_MF_COUNTKILL;
	break;
      case 2: world->skill=3; break;
      case 3: actor->move_cnt=418; break;
      case 4: world->tic=447; break;
      case 5: actor->flags&=~TM_MF_COUNTKILL; break;
      case 6:
	info->flags|=TM_MF_SPAWNCEILING; expected_flags|=TM_MF_SPAWNCEILING;
	break;
      case 7:
	actor->spawn=-1; expected_x=expected_angle=0;
	expected_flags=info->flags;
	break;
      case 8:
	thing->angle=-45; expected_angle=0xE0000000;
	thing->flags=0; expected_flags=info->flags;
	break;
      case 9:
	map->sector[0].ceil=map->sector[0].floor+12*65536;
	break;
    }
    world->random=255;
    if (mode==10) world->random=0;
    caught=FALSE;
    try {ThinkersTick(specials);}
    catch {Fs->catch_except=TRUE; caught=Fs->except_ch=='SoundCB';}
    if (world->thinking || world->total_kills!=1) throw('Owner');
    if (mode==11) {
      if (!caught || !WorldActorGet(world,id) || world->actor_cnt!=2 ||
	    tm_respawn_sound_cnt!=1) throw('Failure');
    } else if (1<=mode<=5 || mode==10) {
      if (caught || !WorldActorGet(world,id) || tm_respawn_sound_cnt)
	throw('Gate');
      if (mode==1) {
	if (world->random || actor->move_cnt!=420) throw('Blocked');
      } else if (mode==10) {
	if (world->random!=1 || actor->move_cnt!=420) throw('Random');
      } else {
	if (world->random!=255) throw('Random');
	if (mode==2 || mode==5) {
	  if (actor->move_cnt!=419) throw('Wait');
	} else if (mode==3) {
	  if (actor->move_cnt!=419) throw('Wait');
	} else if (actor->move_cnt!=420) throw('Wait');
      }
    } else {
      if (caught || WorldActorGet(world,id,FALSE) || world->actor_cnt!=3 ||
	    world->random!=3 || tm_respawn_sound_cnt!=2) throw('Replace');
      fog1=WorldActorGet(world,world->first);
      fog2=WorldActorGet(world,fog1->tick_next);
      born=WorldActorGet(world,fog2->tick_next);
      if (!fog1 || !fog2 || !born || born->id!=world->last ||
	    fog1->type!=TM_MT_TFOG || fog2->type!=TM_MT_TFOG ||
	    born->type!=TM_MT_TROOP || born->tick_next ||
	    fog1->id!=tm_respawn_sound_ids[0] ||
	    fog2->id!=tm_respawn_sound_ids[1]) throw('Order');
      if (fog1->x!=-64*65536 || fog1->y || fog1->z!=-5*65536 ||
	    fog2->x!=expected_x || fog2->y!=expected_y ||
	    fog2->z!=map->sector[fog2->sector].floor) throw('Fog');
      if (born->x!=expected_x || born->y!=expected_y ||
	    born->angle!=expected_angle || born->flags!=expected_flags ||
	    born->reaction!=18 || born->health!=info->health ||
	    born->tics!=spawn_tics-1 || fog1->tics!=fog_tics-1 ||
	    fog2->tics!=fog_tics-1) throw('Born');
      if (mode==6) {
	if (born->z!=born->ceil-born->height) throw('Ceiling');
      } else if (born->z!=born->floor) throw('Floor');
      if (mode==7) {
	if (born->spawn!=-1) throw('Spawn');
      } else if (born->spawn) throw('Spawn');
    }
    SpecialsDel(specials); SectorsDel(sectors); MotionDel(motion);
    WorldDel(world); MapDel(map);
    MemCpy(info,&old_info,sizeof(ActorInfo));
    if (Fs->data_heap->used_u8s!=used) throw('Heap');
    tm_respawn_real_cases++;
  }
  GameDataDel(data); tm_respawn_real_done=1;
  "RESPAWN %d REAL CASES BAD 0\n",tm_respawn_real_cases;
}

TmRespawnRealTest;
