I64 tm_enemy_real_cases=0,tm_enemy_real_done=0,tm_enemy_mode,
	tm_enemy_actions,tm_enemy_sound_calls,tm_enemy_action_snd;
Actor *tm_enemy_origin;

U0 TmEnemyAction(Actor *,I64 action)
{
  if (action!=TM_A_CHASE) throw('ActionId');
  tm_enemy_actions++;
  if (tm_enemy_mode==20) throw('Action',TRUE);
}

U0 TmEnemyActionSnd(Actor *actor,I64 sound)
{
  tm_enemy_sound_calls++; tm_enemy_origin=actor; tm_enemy_action_snd=sound;
}

U0 TmEnemyTest()
{
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map;
  World *world;
  Motion *motion;
  Sectors *sectors;
  Specials *specials;
  Enemies *enemies;
  Actor *actor,*player,*other;
  ActorInfo *info;
  Player man;
  I64 mode,used,spawn,see,id;
  Bool res,caught;
  if (!data) throw('Files');
  used=Fs->data_heap->used_u8s;
  for (mode=0;mode<=20;mode++) {
    map=RoomsNew(FALSE);
    map->line[0].side[0]=map->line[4].side[0]=map->line[5].side[0]=1;
    world=WorldNew(map,data);
    MemSet(&man,0,sizeof(Player)); PlayerBorn(&man);
    motion=MotionNew(world,&man); sectors=SectorsNew(motion);
    specials=SpecialsNew(sectors); enemies=EnemiesNew(specials);
    actor=WorldSpawn(world,TM_MT_POSSESSED,-64*65536,0);
    player=WorldSpawn(world,TM_MT_PLAYER,64*65536,0);
    world->player=player->id; world->random=0;
    info=data->info+actor->type; spawn=info->spawn; see=info->see;
    actor->angle=0; actor->lastlook=0; actor->threshold=57;
    motion->action=&TmEnemyAction; motion->sound=&TmEnemyActionSnd;
    tm_enemy_mode=mode; tm_enemy_actions=tm_enemy_sound_calls=0;
    tm_enemy_origin=NULL; tm_enemy_action_snd=-1;
    switch (mode) {
      case 0:
	EnemyLook(enemies,actor);
	if (actor->state!=see || actor->target!=player->id ||
	      actor->threshold || tm_enemy_actions!=1 ||
	      tm_enemy_sound_calls!=1 || tm_enemy_origin!=actor ||
	      tm_enemy_action_snd!=TM_SFX_POSIT1+data->random[1]%3 ||
	      world->random!=1) throw('Look');
	break;
      case 1:
	actor->angle=0x80000000; EnemyLook(enemies,actor);
	if (actor->state!=spawn || actor->target || tm_enemy_actions ||
	      tm_enemy_sound_calls || world->random) throw('Behind');
	break;
      case 2:
	actor->angle=0x80000000;
	if (!EnemyPlayer(enemies,actor,TRUE) || actor->target!=player->id ||
	      actor->state!=spawn) throw('Around');
	break;
      case 3:
      case 4:
      case 5:
      case 6:
	if (mode==3) actor->flags|=TM_MF_AMBUSH;
	if (mode==5) map->sector[0].ceil=0;
	if (mode==6) map->line[6].flags|=64;
	EnemyNoise(enemies,player,player);
	if (mode==3 || mode==4) map->sector[0].ceil=0;
	EnemyLook(enemies,actor);
	res=mode==4 || mode==6;
	if (tm_enemy_actions!=res || tm_enemy_sound_calls!=res ||
	      world->random!=res) throw('Hearing');
	if (res && actor->state!=see || !res && actor->state!=spawn)
	  throw('State');
	if (mode==3 && actor->target!=player->id) throw('Ambush');
	if (mode==5 && enemies->sound[actor->sector]) throw('Closed');
	break;
      case 7:
      case 8:
	EnemyNoise(enemies,player,player); actor->target=player->id;
	man.health=0; id=player->id;
	if (mode==7) player->active=FALSE;
	else {
	  WorldRemove(world,player);
	  other=WorldSpawn(world,TM_MT_PLAYER,64*65536,0);
	  if (other->id.u32[0]!=id.u32[0] || other->id==id) throw('Reuse');
	}
	world->random=0;
	if (EnemyTarget(enemies,actor)) throw('Handle');
	EnemyLook(enemies,actor);
	if (actor->state!=spawn || tm_enemy_actions ||
	      tm_enemy_sound_calls || world->random) throw('Stale');
	break;
      case 9:
	actor->target=player->id; actor->flags|=TM_MF_AMBUSH;
	player->flags|=TM_MF_SHADOW; EnemyFace(enemies,actor);
	if (actor->flags&TM_MF_AMBUSH || world->random!=2 ||
	      actor->angle!=(data->random[1]-data->random[2])<<21&
	      0xFFFFFFFF) throw('Face');
	break;
      case 10:
      case 11:
	if (!WorldTryMove(world,player,(mode-15)*65536,0)) throw('Move');
	actor->target=player->id;
	if (EnemyMelee(enemies,actor)!=!(mode==11)) throw('Melee');
	break;
      case 12:
      case 13:
	actor->target=player->id; actor->flags|=TM_MF_JUSTHIT;
	if (mode==12) map->sector[0].ceil=0;
	res=EnemyMissile(enemies,actor);
	if (res!=!(mode==12) || !!(actor->flags&TM_MF_JUSTHIT)!=!res ||
	      world->random) throw('JustHit');
	break;
      case 14:
	actor->lastlook=1;
	if (EnemyPlayer(enemies,actor) || actor->lastlook || actor->target)
	  throw('Slots');
	break;
      case 15:
	man.health=0;
	if (EnemyPlayer(enemies,actor) || actor->target) throw('Dead');
	break;
      case 16...20:
	caught=FALSE;
	try {
	  switch (mode) {
	    case 16: actor->world=NULL; EnemyTarget(enemies,actor); break;
	    case 17: world->thinking=TRUE; EnemiesDel(enemies); break;
	    case 18: world->ticking=TRUE; EnemiesDel(enemies); break;
	    case 19: player->sector=-1; EnemyNoise(enemies,player,player);
	      break;
	    case 20: EnemyLook(enemies,actor); break;
	  }
	} catch {
	  if (mode==16 && Fs->except_ch=='World' ||
		mode==17 && Fs->except_ch=='Thinking' ||
		mode==18 && Fs->except_ch=='Ticking' ||
		mode==19 && Fs->except_ch=='Sector' ||
		mode==20 && Fs->except_ch=='Action') {
	    caught=TRUE; Fs->catch_except=TRUE;
	  }
	}
	actor->world=world; world->thinking=world->ticking=FALSE;
	if (!caught) throw('Guard');
	if (mode==20 && (actor->state!=see || tm_enemy_actions!=1 ||
	      tm_enemy_sound_calls!=1)) throw('Action');
	break;
    }
    EnemiesDel(enemies); SpecialsDel(specials); SectorsDel(sectors);
    MotionDel(motion); WorldDel(world); MapDel(map);
    if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
    tm_enemy_real_cases++;
  }
  GameDataDel(data); tm_enemy_real_done=1;
  "ENEMY %d REAL CASES BAD 0\n",tm_enemy_real_cases;
}

TmEnemyTest;
