I64 tm_chase_real_cases=0,tm_chase_real_done=0,tm_chase_mode,
	tm_chase_crosses,tm_chase_actions,tm_chase_last_action,
	tm_chase_door_sounds;
Specials *tm_chase_specials;

U0 TmChaseAction(Actor *,I64 action)
{
  tm_chase_actions++; tm_chase_last_action=action;
}

U0 TmChaseCross(Actor *actor,I64 line,I64 side)
{
  if (line!=6 || side) throw('Cross');
  tm_chase_crosses++;
  if (tm_chase_mode==10) throw('CrossCB',TRUE);
  LineCross(tm_chase_specials,actor,line,side);
}

U0 TmChaseDoorSnd(I64 sector,I64)
{
  if (sector!=1) throw('Sector');
  tm_chase_door_sounds++;
  if (tm_chase_mode==11) throw('DoorCB',TRUE);
}

U0 TmChaseTest()
{
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map;
  World *world;
  Motion *motion;
  Sectors *sectors;
  Specials *specials;
  Enemies *enemies;
  Actor *actor,*player;
  ActorInfo *info;
  I64 mode,x,used;
  Bool caught;
  if (!data) throw('Files');
  used=Fs->data_heap->used_u8s;
  for (mode=0;mode<20;mode++) {
    map=RoomsNew(FALSE);
    map->line[0].side[0]=map->line[4].side[0]=map->line[5].side[0]=1;
    world=WorldNew(map,data); motion=MotionNew(world);
    sectors=SectorsNew(motion); specials=SpecialsNew(sectors);
    enemies=EnemiesNew(specials); tm_chase_specials=specials;
    x=-64;
    if (mode==2) x=104;
    else if (mode==3 || mode==4) x=-24;
    else if (6<=mode<=11) x=24;
    actor=WorldSpawn(world,TM_MT_TROOP,x*65536,0);
    actor->movedir=0; actor->reaction=0; actor->lastlook=0;
    info=data->info+actor->type; info->speed=8;
    motion->action=&TmChaseAction; motion->cross=&TmChaseCross;
    sectors->sound=&TmChaseDoorSnd;
    tm_chase_mode=mode; tm_chase_crosses=tm_chase_actions=0;
    tm_chase_door_sounds=0; tm_chase_last_action=-1; world->random=0;
    switch (mode) {
      case 0:
	actor->movedir=1; actor->z=4*65536;
	actor->flags|=TM_MF_INFLOAT;
	if (!EnemyMove(enemies,actor) || actor->x!=-64*65536+8*47000 ||
	      actor->y!=8*47000 || actor->z ||
	      actor->flags&TM_MF_INFLOAT || world->random) throw('Move');
	break;
      case 1:
	actor->movedir=8;
	if (EnemyMove(enemies,actor) || actor->x!=-64*65536 ||
	      world->random) throw('NoDir');
	break;
      case 2:
	if (EnemyMove(enemies,actor) || actor->x!=104*65536 ||
	      actor->movedir || world->random) throw('Wall');
	break;
      case 3:
      case 4:
	actor->flags|=TM_MF_FLOAT;
	if (mode==3) map->sector[0].floor=32*65536;
	else {actor->z=80*65536; map->sector[0].ceil=64*65536;}
	if (!EnemyMove(enemies,actor) || actor->x!=-24*65536 ||
	      !(actor->flags&TM_MF_INFLOAT) ||
	      mode==3 && actor->z!=4*65536 ||
	      mode==4 && actor->z!=76*65536 || world->random)
	  throw('Float');
	break;
      case 5:
	actor->flags|=TM_MF_FLOAT|TM_MF_INFLOAT; actor->z=16*65536;
	if (!EnemyMove(enemies,actor) || actor->x!=-56*65536 ||
	      actor->z!=16*65536 || actor->flags&TM_MF_INFLOAT)
	  throw('FloatOK');
	break;
      case 6:
      case 7:
      case 8:
	actor->movedir=4; map->sector[1].ceil=0; map->line[6].special=1;
	if (mode==7) map->line[6].flags|=32;
	if (mode==8) map->line[6].special=26;
	if (mode==6) {
	  if (!EnemyWalk(enemies,actor) ||
		actor->move_cnt!=data->random[1]&15 ||
		world->random!=1 || tm_chase_door_sounds!=1 ||
		!sectors->area[1].mover) throw('Door');
	} else if (EnemyMove(enemies,actor) || world->random ||
	      tm_chase_door_sounds || sectors->area[1].mover) throw('Locked');
	if (actor->movedir!=8 || actor->x!=24*65536 || map->sector[1].ceil)
	  throw('Blocked');
	break;
      case 9:
      case 10:
	actor->movedir=4; info->speed=40; caught=FALSE;
	try {
	  if (!EnemyMove(enemies,actor)) throw('Move');
	} catch {
	  if (Fs->except_ch=='CrossCB') {caught=TRUE; Fs->catch_except=TRUE;}
	}
	if (caught!=!!(mode==10) || tm_chase_crosses!=1 ||
	      actor->x!=-16*65536 || actor->sector!=1) throw('Commit');
	break;
      case 11:
	actor->movedir=4; map->sector[1].ceil=0; map->line[6].special=1;
	caught=FALSE;
	try {
	  EnemyMove(enemies,actor);
	} catch {
	  if (Fs->except_ch=='DoorCB') {caught=TRUE; Fs->catch_except=TRUE;}
	}
	if (!caught || tm_chase_door_sounds!=1 || !sectors->area[1].mover ||
	      actor->x!=24*65536 || actor->movedir!=8) throw('DoorCB');
	break;
      case 12...15:
	x=64;
	if (mode==12) x=-16;
	player=WorldSpawn(world,TM_MT_PLAYER,x*65536,0);
	actor->target=player->id; world->random=0;
	if (mode==12 || mode==13) actor->movedir=8;
	if (mode==13) world->random=1;
	if (mode==14) {actor->flags|=TM_MF_JUSTATTACKED; world->skill=4;}
	if (mode==15) actor->move_cnt=1;
	EnemyChase(enemies,actor);
	if (mode==12 && (actor->state!=info->melee ||
	      tm_chase_actions!=1 || tm_chase_last_action!=TM_A_FACE_TARGET ||
	      world->random)) throw('Melee');
	if (mode==13 && (actor->state!=info->missile ||
	      !(actor->flags&TM_MF_JUSTATTACKED) || tm_chase_actions!=1 ||
	      tm_chase_last_action!=TM_A_FACE_TARGET || world->random!=2))
	  throw('Missile');
	if (mode==14 && (actor->flags&TM_MF_JUSTATTACKED ||
	      actor->x!=-64*65536 || world->random || tm_chase_actions))
	  throw('Fast');
	if (mode==15 && (actor->x!=-56*65536 || actor->move_cnt ||
	      world->random!=!!info->active_snd || tm_chase_actions))
	  throw('Chase');
	break;
      case 16:
	actor->active=FALSE;
	if (EnemyMove(enemies,actor) || world->random) throw('Inactive');
	break;
      case 17...19:
	caught=FALSE;
	try {
	  if (mode==17) {actor->world=NULL; EnemyMove(enemies,actor);}
	  else if (mode==18) {actor->movedir=9; EnemyMove(enemies,actor);}
	  else EnemyDir(enemies,actor);
	} catch {
	  if (mode==17 && Fs->except_ch=='World' ||
		mode==18 && Fs->except_ch=='MoveDir' ||
		mode==19 && Fs->except_ch=='Target') {
	    caught=TRUE; Fs->catch_except=TRUE;
	  }
	}
	actor->world=world;
	if (!caught) throw('Guard');
	break;
    }
    info->speed=8;
    EnemiesDel(enemies); SpecialsDel(specials); SectorsDel(sectors);
    MotionDel(motion); WorldDel(world); MapDel(map);
    if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
    tm_chase_real_cases++;
  }
  GameDataDel(data); tm_chase_real_done=1;
  "CHASE %d REAL CASES BAD 0\n",tm_chase_real_cases;
}

TmChaseTest;
