I64 tm_think_cases=0,tm_think_done=0,tm_think_mode=0,tm_think_calls=0;
GameData *tm_think_data;
Specials *tm_think_specials;
Actor *tm_think_other;
Mover *tm_think_mover;

U0 TmThinkNew()
{
  Map *map=RoomsNew(FALSE);
  World *world;
  map->line[0].side[0]=map->line[4].side[0]=map->line[5].side[0]=1;
  world=WorldNew(map,tm_think_data);
  tm_think_specials=SpecialsNew(SectorsNew(MotionNew(world)));
  tm_think_calls=0;
}

U0 TmThinkDel()
{
  Sectors *sectors=tm_think_specials->sectors;
  Motion *motion=sectors->motion;
  World *world=motion->world;
  Map *map=world->map;
  SpecialsDel(tm_think_specials); SectorsDel(sectors); MotionDel(motion);
  WorldDel(world); MapDel(map);
}

Actor *TmThinkActor(I64 n)
{
  Actor *actor=WorldSpawn(tm_think_specials->sectors->motion->world,
	TM_MT_TROOP,-64*65536,0);
  actor->spawn=n; actor->state=tm_think_data->info[TM_MT_TROOP].spawn;
  actor->tics=1;
  return actor;
}

U0 TmThinkAction(Actor *actor,I64)
{
  Specials *specials=tm_think_specials;
  Sectors *sectors=specials->sectors;
  Motion *motion=sectors->motion;
  World *world=motion->world;
  tm_think_calls++;
  switch (tm_think_mode) {
    case 0: actor->health=WorldRand(world); break;
    case 1: actor->health=world->map->sector[1].floor; break;
    case 2:
      if (!actor->spawn) {
	actor->spawn=99; FloorNew(sectors,1,TM_FLOOR_RAISE_24);
      }
      break;
    case 3:
      if (!actor->spawn) {
	actor->spawn=99; tm_think_other=TmThinkActor(1);
      }
      break;
    case 4:
      tm_think_other->active=FALSE;
      MoverFinish(sectors,tm_think_mover); actor->active=FALSE;
      break;
    case 5: ThinkersTick(specials); break;
    case 6: WorldRemove(world,actor); break;
    case 7: WorldSweep(world); break;
    case 8: MoversSweep(sectors); break;
    case 9: WorldDel(world); break;
    case 10: MotionDel(motion); break;
    case 11: SectorsDel(sectors); break;
    case 12: LightsDel(specials->lights); break;
    case 13: SpecialsDel(specials); break;
    case 14:
      actor->active=FALSE; MoverFinish(sectors,tm_think_mover);
      throw('Action',TRUE);
  }
}

U0 TmThinkTest()
{
  State *state;
  Actor *a,*b;
  Light *light;
  Thinker *tmpq;
  Mover *mover;
  Sectors *sectors;
  Motion *motion;
  World *world;
  I64 i,used,id;
  Bool caught;
  tm_think_data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  if (!tm_think_data) throw('Files');
  state=tm_think_data->state+tm_think_data->info[TM_MT_TROOP].spawn;
  state->tics=1; state->next=tm_think_data->info[TM_MT_TROOP].spawn;
  state->action=1;
  TmThinkNew; sectors=tm_think_specials->sectors; motion=sectors->motion;
  world=motion->world; motion->action=&TmThinkAction; tm_think_mode=0;
  a=TmThinkActor(0); light=LightNew(tm_think_specials->lights,1,TM_LIGHT_FLASH);
  b=TmThinkActor(1); light->tics=1; world->random=0;
  ThinkersTick(tm_think_specials);
  if (a->health!=tm_think_data->random[1] ||
	b->health!=tm_think_data->random[3] ||
	light->tics!=tm_think_data->random[2]&7+1 ||
	world->random!=3 || tm_think_calls!=2) throw('Random');
  TmThinkDel; tm_think_cases++;
  for (i=0;i<2;i++) {
    TmThinkNew; sectors=tm_think_specials->sectors; motion=sectors->motion;
    world=motion->world; motion->action=&TmThinkAction; tm_think_mode=1;
    if (i) FloorNew(sectors,1,TM_FLOOR_RAISE_24);
    a=TmThinkActor(0);
    if (!i) FloorNew(sectors,1,TM_FLOOR_RAISE_24);
    ThinkersTick(tm_think_specials);
    if (a->health!=i*65536 || a->z!=65536 || a->floor!=65536 ||
	  world->map->sector[1].floor!=65536) throw('Floor');
    TmThinkDel; tm_think_cases++;
  }
  for (i=2;i<=3;i++) {
    TmThinkNew; sectors=tm_think_specials->sectors; motion=sectors->motion;
    motion->action=&TmThinkAction; tm_think_mode=i; a=TmThinkActor(0);
    ThinkersTick(tm_think_specials);
    if (i==2) {
      if (motion->world->map->sector[1].floor!=65536 || a->z!=65536)
	throw('NewFloor');
    } else if (tm_think_calls!=2 || tm_think_other->tics!=1)
      throw('NewActor');
    TmThinkDel; tm_think_cases++;
  }
  TmThinkNew; sectors=tm_think_specials->sectors; motion=sectors->motion;
  world=motion->world; motion->action=&TmThinkAction; tm_think_mode=4;
  a=TmThinkActor(0); tm_think_other=TmThinkActor(1);
  tm_think_mover=FloorNew(sectors,1,TM_FLOOR_RAISE_24);
  ThinkersTick(tm_think_specials);
  if (tm_think_calls!=1 || world->actor_cnt || sectors->first ||
	world->map->sector[1].floor ||
	world->thinkers.next!=&world->thinkers) throw('Retired');
  TmThinkDel; tm_think_cases++;
  for (i=5;i<=13;i++) {
    TmThinkNew; sectors=tm_think_specials->sectors; motion=sectors->motion;
    world=motion->world; motion->action=&TmThinkAction; tm_think_mode=i;
    a=TmThinkActor(0); id=a->id; caught=FALSE;
    try {
      ThinkersTick(tm_think_specials);
    } catch {
      if (Fs->except_ch=='Thinking') {caught=TRUE; Fs->catch_except=TRUE;}
    }
    if (!caught || world->thinking || WorldActorGet(world,id)!=a ||
	  !tm_think_specials->switches || !tm_think_specials->lights)
      throw('Guard');
    tm_think_mode=1; ThinkersTick(tm_think_specials);
    if (tm_think_calls!=2) throw('Recovery');
    TmThinkDel; tm_think_cases++;
  }
  TmThinkNew; sectors=tm_think_specials->sectors; motion=sectors->motion;
  world=motion->world; motion->action=&TmThinkAction; tm_think_mode=14;
  used=Fs->data_heap->used_u8s;
  a=TmThinkActor(0); tm_think_mover=FloorNew(sectors,1,TM_FLOOR_RAISE_24);
  caught=FALSE;
  try {
    ThinkersTick(tm_think_specials);
  } catch {
    if (Fs->except_ch=='Action') {caught=TRUE; Fs->catch_except=TRUE;}
  }
  if (!caught || world->thinking || a->active || tm_think_mover->active)
    throw('Except');
  WorldSweep(world); MoversSweep(sectors);
  if (Fs->data_heap->used_u8s!=used) throw('Leak');
  TmThinkDel; tm_think_cases++;
  for (i=0;i<2;i++) {
    TmThinkNew; sectors=tm_think_specials->sectors;
    world=sectors->motion->world;
    a=TmThinkActor(0);
    if (i) {
      world->map->sector[0].special=14; world->map->sector[1].special=3;
    } else {
      world->map->sector[0].special=1; world->map->sector[1].special=10;
    }
    SpecialsInit(tm_think_specials); tmpq=a->thinker.next;
    if (i) {
      if (tmpq->kind!=TM_THINK_MOVER || tmpq->next->kind!=TM_THINK_LIGHT)
	throw('Init');
      mover=tmpq;
      if (mover->sector || mover->delay!=10500) throw('Timer');
    } else {
      if (tmpq->kind!=TM_THINK_LIGHT || tmpq->next->kind!=TM_THINK_MOVER)
	throw('Init');
      mover=tmpq->next;
      if (mover->sector!=1 || mover->delay!=1050) throw('Timer');
    }
    if (tmpq->next->next!=&world->thinkers || world->total_secrets ||
	  world->map->sector[0].special || world->map->sector[1].special)
      throw('InitEnd');
    caught=FALSE;
    try {
      SpecialsInit(tm_think_specials);
    } catch {
      if (Fs->except_ch=='Loaded') {caught=TRUE; Fs->catch_except=TRUE;}
    }
    if (!caught || tmpq->next->next!=&world->thinkers) throw('Twice');
    TmThinkDel; tm_think_cases++;
  }
  GameDataDel(tm_think_data); tm_think_done=1;
  "THINK %d REAL CASES BAD 0\n",tm_think_cases;
}

TmThinkTest;
