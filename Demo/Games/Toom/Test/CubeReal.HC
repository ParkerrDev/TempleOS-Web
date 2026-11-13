I64 tm_cube_real_cases=0,tm_cube_real_done=0,tm_cube_real_mode,
	tm_cube_real_sounds,tm_cube_real_actions;
Brain *tm_cube_real_brain;
Actor *tm_cube_real_actor,*tm_cube_real_target,*tm_cube_real_other,
	*tm_cube_real_fog,*tm_cube_real_monster;

U0 TmCubeRealSound(Actor *actor,I64 sound)
{
  tm_cube_real_sounds++;
  if (actor==tm_cube_real_actor) {
    if (sound!=TM_SFX_BOSCUB) throw('CubeSnd');
    if (tm_cube_real_mode==10) throw('SoundCB',TRUE);
    if (tm_cube_real_mode==11) actor->active=FALSE;
  } else if (actor->type==TM_MT_SPAWNFIRE) {
    if (sound!=TM_SFX_TELEPT) throw('FogSnd');
    tm_cube_real_fog=actor;
    switch (tm_cube_real_mode) {
      case 12: throw('SoundCB',TRUE); break;
      case 13: tm_cube_real_target->active=FALSE; break;
      case 14: tm_cube_real_actor->target=tm_cube_real_other->id; break;
      case 25: tm_cube_real_actor->active=FALSE; break;
    }
  }
}

U0 TmCubeRealAction(Actor *actor,I64 action)
{
  if (actor==tm_cube_real_actor) {
    BrainSpawn(tm_cube_real_brain,actor,action); return;
  }
  if (actor->type==TM_MT_SPAWNFIRE) return;
  tm_cube_real_actions++; tm_cube_real_monster=actor;
  switch (tm_cube_real_mode) {
    case 15: throw('StateCB',TRUE); break;
    case 16: WorldActorPlace(actor->world,actor,32*65536,8*65536,0); break;
    case 22:
      if (action==TM_A_CHASE) EnemyChase(tm_cube_real_brain->enemies,actor);
      break;
    case 24: actor->active=FALSE; break;
  }
}

U0 TmCubeRealTest()
{
  I64 mode,seed,used,i,r,expected,*types=FileRead("C:/ORACLE/CUBER.BIN"),
	id,initial,action;
  Bool caught,arrival,valid,has_player;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map;
  World *world;
  Player player;
  Motion *motion;
  Sectors *sectors;
  Specials *specials;
  Enemies *enemies;
  Brain *brain;
  Actor *cube,*target,*monster,*fog,*victim;
  if (!data || !types) throw('Files');
  used=Fs->data_heap->used_u8s;
  for (mode=-256;mode<26;mode++) {
    seed=0; if (mode<0) seed=mode+256;
    map=RoomsNew(FALSE); world=WorldNew(map,data);
    MemSet(&player,0,sizeof(player)); player.health=100;
    motion=MotionNew(world); sectors=SectorsNew(motion);
    specials=SpecialsNew(sectors); enemies=EnemiesNew(specials);
    brain=tm_cube_real_brain=BrainNew(enemies);
    cube=tm_cube_real_actor=WorldSpawn(world,TM_MT_SPAWNSHOT,-64*65536,0);
    target=tm_cube_real_target=WorldSpawn(world,TM_MT_BOSSTARGET,0,0);
    cube->target=target->id; cube->reaction=1; cube->vx=cube->vy=cube->vz=0;
    victim=NULL; tm_cube_real_other=NULL;
    tm_cube_real_monster=tm_cube_real_fog=NULL;
    tm_cube_real_mode=mode; tm_cube_real_sounds=tm_cube_real_actions=0;
    motion->sound=&TmCubeRealSound; motion->action=&TmCubeRealAction;
    action=TM_A_SPAWN_FLY;
    if (mode==10 || mode==11) action=TM_A_SPAWN_SOUND;
    has_player=mode==15 || mode==16 || mode==22 || mode==24;
    if (has_player) {
      motion->player=&player;
      world->player=WorldSpawn(world,TM_MT_PLAYER,96*65536,96*65536)->id;
    }
    switch (mode) {
      case 1: cube->reaction=2; break;
      case 2: cube->reaction=0; break;
      case 3: cube->reaction=-7; break;
      case 4: cube->active=FALSE; break;
      case 5: cube->world=NULL; break;
      case 6: action=-1; break;
      case 7: cube->target=0; break;
      case 8:
	WorldRemove(world,target);
	WorldSpawn(world,TM_MT_BOSSTARGET,0,0);
	if (WorldActorGet(world,cube->target)) throw('Handle');
	break;
      case 9: target->active=FALSE; break;
      case 14:
	tm_cube_real_other=WorldSpawn(world,TM_MT_BOSSTARGET,
	      32*65536,8*65536);
	break;
      case 17:
      case 18:
	victim=WorldSpawn(world,TM_MT_POSSESSED,0,0);
	specials->monsters_stomp=mode==17;
	break;
      case 19: cube->active=FALSE; action=-1; break;
      case 20: motion->sound=NULL; break;
      case 21: cube->reaction=2; cube->tics=1; break;
      case 23: target->health=0; break;
    }
    world->random=seed; id=cube->id; initial=world->actor_cnt; caught=FALSE;
    try {
      if (mode==21) for (i=0;i<4;i++) ThinkersTick(specials);
      else {
	world->thinking=TRUE; BrainSpawn(brain,cube,action);
	world->thinking=FALSE;
      }
    } catch {
      if (mode==5 && Fs->except_ch=='World' ||
	    mode==6 && Fs->except_ch=='Action' ||
	    (mode==10 || mode==12) && Fs->except_ch=='SoundCB' ||
	    mode==15 && Fs->except_ch=='StateCB')
	caught=Fs->catch_except=TRUE;
      world->thinking=FALSE;
    }
    if (caught!=!!(mode==5 || mode==6 || mode==10 || mode==12 || mode==15))
      throw('Guard');
    if (mode==21) {
      if (WorldActorGet(world,id,FALSE) || world->actor_cnt!=initial+1)
	throw('Clock');
    } else {
      cube->world=world;
      if (mode<0) {
	monster=WorldActorGet(world,world->last);
	fog=tm_cube_real_fog; expected=types[seed];
	if (cube->active || cube->reaction || !monster || !fog ||
	      monster->type!=expected || monster->x || monster->y ||
	      monster->z || monster->target ||
	      monster->state!=data->info[expected].spawn ||
	      monster->lastlook!=data->random[(seed+3)&255]&3 ||
	      fog->type!=TM_MT_SPAWNFIRE || fog->x || fog->y || fog->z ||
	      fog->lastlook!=data->random[(seed+1)&255]&3 ||
	      world->random!=(seed+3)&255 || world->actor_cnt!=initial+2 ||
	      tm_cube_real_sounds!=1 || tm_cube_real_actions) throw('Random');
      } else {
	arrival=mode==0 || mode==2 || mode==3 || 14<=mode<=18 ||
	      mode==20 || 22<=mode<=24;
	valid=arrival || mode==12 || mode==13 || mode==25;
	r=initial+arrival+valid; if (mode==17) r++;
	if (world->actor_cnt!=r) {
	  "CUBE REAL %d COUNT %d EXPECTED %d\n",mode,world->actor_cnt,
		r;
	  throw('Count');
	}
	if (arrival) {
	  if (tm_cube_real_fog)
	    monster=WorldActorGet(world,tm_cube_real_fog->tick_next,FALSE);
	  else monster=WorldActorGet(world,world->last,FALSE);
	  if (!monster || monster==cube || monster==target ||
		monster->type==TM_MT_SPAWNFIRE) throw('Spawn');
	  if (mode==15) {
	    if (!cube->active || cube->reaction || tm_cube_real_actions!=1)
	      throw('StateCB');
	  } else if (cube->active || cube->reaction) throw('Arrival');
	  if (mode==14 || mode==16) {
	    if (monster->x!=32*65536 || monster->y!=8*65536 ||
		  monster->sector!=FixedSector(map,monster->x,monster->y))
	      throw('Place');
	  }
	  if (has_player && (monster->target!=world->player ||
		!tm_cube_real_actions)) throw('Player');
	  if (mode==17 && victim->health>0 || mode==18 && victim->health<=0)
	    throw('Telefrag');
	  if (mode==17) {
	    fog=WorldActorGet(world,world->last);
	    if (!fog || fog->type!=TM_MT_CLIP ||
		  !(fog->flags&TM_MF_DROPPED)) throw('Drop');
	  }
	  if (mode==24 && monster->active) throw('Retire');
	} else {
	  if (mode==1 && (cube->reaction!=1 || !cube->active)) throw('Timer');
	  if (7<=mode<=9 || mode==11 || mode==13 || mode==25) {
	    if (cube->active) throw('Target');
	  }
	  if (mode==10 && (!cube->active || cube->reaction!=1))
	    throw('SoundCB');
	  if (mode==12 && (!cube->active || cube->reaction)) throw('SoundCB');
	}
      }
      r=world->actor_cnt; WorldSweep(world);
      if (!WorldActorGet(world,id,FALSE) && world->actor_cnt>=r)
	throw('Sweep');
    }
    BrainDel(brain); EnemiesDel(enemies); SpecialsDel(specials);
    SectorsDel(sectors); MotionDel(motion); WorldDel(world); MapDel(map);
    if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
    tm_cube_real_cases++;
  }
  GameDataDel(data); Free(types); tm_cube_real_done=1;
  "CUBE %d REAL CASES BAD 0\n",tm_cube_real_cases;
}

TmCubeRealTest;
