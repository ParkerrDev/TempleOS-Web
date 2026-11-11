I64 tm_end_real_cases=0,tm_end_real_done=0,tm_end_real_mode,
	tm_end_real_sounds,tm_end_real_actions;
Specials *tm_end_real_specials;

U0 TmEndRealSound(Actor *actor,I64 sound)
{
  if (actor || !(sound==TM_SFX_BOSPN || sound==TM_SFX_BOSDTH))
    throw('Sound');
  tm_end_real_sounds++;
  if (tm_end_real_mode<2) throw('SoundCB',TRUE);
}

U0 TmEndRealAction(Actor *actor,I64 action)
{
  if (actor->type!=TM_MT_ROCKET) throw('Actor');
  tm_end_real_actions++;
  if (tm_end_real_mode==2 && action==TM_A_PAIN) throw('StateCB',TRUE);
  if (action!=TM_A_BRAIN_EXPLODE) throw('Action');
  BossFinal(tm_end_real_specials,actor,action);
}

U0 TmEndRealTest()
{
  I64 mode,used,action,n,random,sounds,id,i,peak,old_action;
  Bool caught;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map;
  World *world;
  Motion *motion;
  Sectors *sectors;
  Specials *specials;
  Actor *actor,*other;
  if (!data) throw('Files');
  used=Fs->data_heap->used_u8s;
  old_action=data->state[TM_S_BRAINEXPLODE1].action;
  for (mode=0;mode<9;mode++) {
    map=RoomsNew(FALSE);
    map->sector[0].ceil=map->sector[1].ceil=1024*65536;
    world=WorldNew(map,data); motion=MotionNew(world);
    sectors=SectorsNew(motion); specials=SpecialsNew(sectors);
    actor=WorldSpawn(world,TM_MT_BOSSBRAIN,0,0);
    actor->tics=-1; world->random=0; world->exit_rqst=TM_EXIT_SECRET;
    motion->sound=&TmEndRealSound; motion->action=&TmEndRealAction;
    tm_end_real_specials=specials; tm_end_real_mode=mode;
    tm_end_real_sounds=tm_end_real_actions=0; caught=FALSE;
    action=TM_A_BRAIN_SCREAM; n=0; random=sounds=0;
    switch (mode) {
      case 0: n=65; random=4; sounds=1; break;
      case 1: action=TM_A_BRAIN_PAIN; sounds=1; break;
      case 2:
	data->state[TM_S_BRAINEXPLODE1].action=TM_A_PAIN;
	n=1; random=3;
	break;
      case 3: actor->world=NULL; break;
      case 4: actor->active=FALSE; break;
      case 5: action=-1; break;
      case 6: n=1; random=3; break;
      case 7: action=TM_A_BRAIN_DIE; break;
      case 8: n=65; random=4; sounds=1; break;
    }
    try {
      if (mode==6) BossExplosion(specials,10*65536,20*65536,30*65536);
      else BossFinal(specials,actor,action);
    } catch {
      if (mode<2) {
	if (Fs->except_ch=='SoundCB') caught=Fs->catch_except=TRUE;
      } else if (mode==2 && Fs->except_ch=='StateCB' ||
	    mode==3 && Fs->except_ch=='World' ||
	    mode==5 && Fs->except_ch=='Action')
	caught=Fs->catch_except=TRUE;
    }
    data->state[TM_S_BRAINEXPLODE1].action=old_action; actor->world=world;
    if (caught!=!!(mode<4 || mode==5) || world->actor_cnt!=n+1 ||
	  world->random!=random || tm_end_real_sounds!=sounds ||
	  world->exit_rqst!=TM_EXIT_SECRET-(mode==7)) throw('Result');
    id=actor->tick_next; i=0;
    while (other=WorldActorGet(world,id)) {
      if (other->type!=TM_MT_ROCKET || other->state!=TM_S_BRAINEXPLODE1 ||
	    !(3<=other->tics<=10) || other->target || other->tracer ||
	    other->vx || other->vy) throw('Spawn');
      if (mode==2 && (other->vz!=220*512 || other->tics!=10 ||
	    other->lastlook!=1 || tm_end_real_actions!=1)) throw('State');
      if (mode==6 && (other->x!=10*65536 || other->y!=20*65536 ||
	    other->z!=30*65536 || other->vz!=109*512 ||
	    other->tics!=6 || other->lastlook)) throw('Helper');
      id=other->tick_next; i++;
    }
    if (i!=n) throw('Count');
    if (mode==8) {
      peak=world->actor_cnt;
      for (i=0;i<80;i++) {
	world->tic=i; ThinkersTick(specials);
	peak=MaxI64(peak,world->actor_cnt);
	if (!(66<=world->actor_cnt<=131) || world->thinking ||
	      world->exit_rqst!=TM_EXIT_SECRET) throw('Chain');
	id=world->first;
	while (other=WorldActorGet(world,id)) {
	  if (other!=actor && (other->type!=TM_MT_ROCKET ||
		!(TM_S_BRAINEXPLODE1<=other->state<=TM_S_BRAINEXPLODE3)))
	    throw('Animate');
	  id=other->tick_next;
	}
      }
      if (peak<=66 || tm_end_real_actions<=65 || tm_end_real_sounds!=1)
	throw('Repeat');
    }
    SpecialsDel(specials); SectorsDel(sectors); MotionDel(motion);
    WorldDel(world); MapDel(map);
    if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
    tm_end_real_cases++;
  }
  GameDataDel(data); tm_end_real_done=1;
  "ENDING 9 REAL CASES BAD 0\n";
}

TmEndRealTest;
