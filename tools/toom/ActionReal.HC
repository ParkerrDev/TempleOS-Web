I64 tm_action_real_cases=0,tm_action_real_done=0,tm_action_real_sounds,
	tm_action_real_sound[4];
Actor *tm_action_real_first,*tm_action_real_second,
	*tm_action_real_origin[4];

U0 TmActionRealOther(Actor *,I64)
{
  throw('Other');
}

U0 TmActionRealSound(Actor *actor,I64 sound)
{
  I64 i=tm_action_real_sounds++;
  if (i>=4) throw('Sound');
  tm_action_real_origin[i]=actor; tm_action_real_sound[i]=sound;
  if (actor && actor==tm_action_real_first)
    ActorAction(tm_action_real_second,TM_A_FALL);
}

U0 TmActionRealTest()
{
  I64 mode,used,i,clock[2],expected,action,old_count[2],n,id;
  Bool caught,bound;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map[2];
  World *world[2],*old_world;
  Motion *motion[2];
  Sectors *sectors[2];
  Specials *specials[2];
  Enemies *enemies[2];
  Brain *brain[2];
  Actions *actions[2],*bad,*old_actions;
  Actor *actor[2],*source,*target,*cube;
  U0 (*old_callback)(Actor *actor,I64 n);
  if (!data) throw('Files');
  used=Fs->data_heap->used_u8s;
  for (mode=0;mode<50;mode++) {
    for (i=0;i<2;i++) {
      clock[i]=0; map[i]=RoomsNew(FALSE); world[i]=WorldNew(map[i],data);
      motion[i]=MotionNew(world[i]); sectors[i]=SectorsNew(motion[i]);
      specials[i]=SpecialsNew(sectors[i]); enemies[i]=EnemiesNew(specials[i]);
      brain[i]=BrainNew(enemies[i]);
      actor[i]=WorldSpawn(world[i],TM_MT_TROOP,0,0);
      actions[i]=NULL;
    }
    tm_action_real_first=tm_action_real_second=NULL;
    tm_action_real_sounds=0;
    bad=NULL; caught=FALSE; expected=0; action=TM_A_NULL;
    old_world=actor[0]->world; old_actions=NULL; old_callback=NULL;
    bound=mode==0 || mode>=13;
    if (bound) for (i=0;i<2;i++)
      actions[i]=ActionsNew(brain[i],clock+i,i+1,i+1,i);
    switch (mode) {
      case 1: motion[0]->action=&TmActionRealOther; expected='Actions'; break;
      case 2:
	actions[0]=ActionsNew(brain[0],clock);
	expected='Actions';
	break;
      case 3: expected='Clock'; break;
      case 4: clock[0]=-1; expected='Clock'; break;
      case 5:
      case 6:
      case 7:
      case 8:
      case 9: expected='Map'; break;
      case 11: world[0]->thinking=TRUE; expected='Thinking'; break;
      case 12: world[0]->ticking=TRUE; expected='Ticking'; break;
      case 13: world[0]->thinking=TRUE; expected='Thinking'; break;
      case 14: world[0]->ticking=TRUE; expected='Ticking'; break;
      case 15:
	old_actions=world[0]->actions; world[0]->actions=NULL;
	expected='Owner';
	break;
      case 16:
	old_callback=motion[0]->action; motion[0]->action=&TmActionRealOther;
	expected='Owner';
	break;
      case 17: expected='Actions'; break;
      case 18:
	old_actions=world[0]->actions; world[0]->actions=NULL;
	expected='Actions';
	break;
      case 19: actor[0]->world=NULL; expected='World'; break;
      case 20:
	old_actions=world[0]->actions; world[0]->actions=actions[1];
	expected='Owner';
	break;
      case 21: actor[0]->active=FALSE; action=-1; break;
      case 22: action=-1; expected='Action'; break;
      case 23: action=TM_ACTION_NUM; expected='Action'; break;
      case 24...45: action=mode-23; expected='Action'; break;
    }
    try {
      switch (mode) {
	case 0:
	  ActionsDel(actions[0]);
	  if (world[0]->actions || motion[0]->action) throw('Unbind');
	  actions[0]=ActionsNew(brain[0],clock);
	  break;
	case 1:
	case 2:
	case 4:
	case 11:
	case 12: bad=ActionsNew(brain[0],clock); break;
	case 3: bad=ActionsNew(brain[0],NULL); break;
	case 5: bad=ActionsNew(brain[0],clock,0); break;
	case 6: bad=ActionsNew(brain[0],clock,5); break;
	case 7: bad=ActionsNew(brain[0],clock,1,0); break;
	case 8: bad=ActionsNew(brain[0],clock,1,10); break;
	case 9: bad=ActionsNew(brain[0],clock,1,33,TRUE); break;
	case 10: actions[0]=ActionsNew(brain[0],clock,1,32,TRUE); break;
	case 13...16: ActionsDel(actions[0]); break;
	case 17: WorldDel(world[0]); break;
	case 18...45: ActorAction(actor[0],action); break;
	case 46:
	  tm_action_real_first=actor[0]; tm_action_real_second=actor[1];
	  tm_action_real_sounds=0; motion[0]->sound=&TmActionRealSound;
	  ActorAction(actor[0],TM_A_PAIN);
	  if (tm_action_real_sounds!=1 || !(actor[0]->flags&TM_MF_SOLID) ||
		actor[1]->flags&TM_MF_SOLID) throw('Nested');
	  break;
	case 47:
	  for (i=0;i<2;i++) {
	    actor[i]->type=TM_MT_TRACER; old_count[i]=world[i]->actor_cnt;
	    world[i]->tic=99;
	  }
	  clock[0]=1; ActorAction(actor[0],TM_A_TRACER);
	  ActorAction(actor[1],TM_A_TRACER);
	  if (world[0]->actor_cnt!=old_count[0] ||
		world[1]->actor_cnt!=old_count[1]+2) throw('Clock');
	  clock[0]=4; ActorAction(actor[0],TM_A_TRACER);
	  if (world[0]->actor_cnt!=old_count[0]+2) throw('Clock');
	  break;
	case 48:
	  motion[0]->sound=motion[1]->sound=&TmActionRealSound;
	  actor[0]->health=-100; actor[1]->health=-100;
	  ActorAction(actor[0],TM_A_PLAYER_SCREAM);
	  ActorAction(actor[1],TM_A_PLAYER_SCREAM);
	  if (tm_action_real_sounds!=2 || tm_action_real_origin[0]!=actor[0] ||
		 tm_action_real_origin[1]!=actor[1] ||
		 tm_action_real_sound[0]!=TM_SFX_PLDETH ||
		 tm_action_real_sound[1]!=TM_SFX_PDIEHI) throw('Sound');
	  if (world[0]->exit_rqst || world[1]->exit_rqst) throw('Exit');
	  ActorAction(actor[1],TM_A_BRAIN_DIE);
	  if (world[0]->exit_rqst || world[1]->exit_rqst!=TM_EXIT_NORMAL)
	    throw('Exit');
	  break;
	case 49:
	  actor[0]->active=FALSE; WorldSweep(world[0]); actor[0]=NULL;
	  source=WorldSpawn(world[0],TM_MT_BOSSSPIT,0,-64*65536);
	  source->tics=-1;
	  target=WorldSpawn(world[0],TM_MT_BOSSTARGET,0,64*65536);
	  ActorAction(source,TM_A_BRAIN_AWAKE);
	  ActorAction(source,TM_A_BRAIN_SPIT);
	  cube=WorldActorGet(world[0],world[0]->last); id=cube->id;
	  n=cube->tics+(cube->reaction-1)*3;
	  for (i=0;i<n;i++) ThinkersTick(specials[0]);
	  if (WorldActorGet(world[0],id,FALSE) || world[0]->actor_cnt!=4 ||
		WorldActorGet(world[0],world[0]->last)->x!=target->x ||
		WorldActorGet(world[0],world[0]->last)->y!=target->y)
	    throw('Cube');
	  break;
      }
    } catch {
      if (Fs->except_ch==expected) caught=Fs->catch_except=TRUE;
    }
    if (caught!=!!expected || bad) throw('Guard');
    world[0]->thinking=world[0]->ticking=FALSE;
    if (actor[0]) actor[0]->world=old_world;
    if (old_actions) world[0]->actions=old_actions;
    if (old_callback) motion[0]->action=old_callback;
    if (mode==1) motion[0]->action=NULL;
    for (i=0;i<2;i++) {
      ActionsDel(actions[i]); BrainDel(brain[i]); EnemiesDel(enemies[i]);
      SpecialsDel(specials[i]); SectorsDel(sectors[i]); MotionDel(motion[i]);
      WorldDel(world[i]); MapDel(map[i]);
    }
    if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
    tm_action_real_cases++;
  }
  GameDataDel(data); tm_action_real_done=1;
  "ACTION %d REAL CASES BAD 0\n",tm_action_real_cases;
}

TmActionRealTest;
