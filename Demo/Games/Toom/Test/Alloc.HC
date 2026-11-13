I64 tm_alloc_cases=0,tm_alloc_done=0,tm_alloc_clock=0,tm_alloc_faults=0;
Map *tm_alloc_map;
GameData *tm_alloc_data;
World *tm_alloc_world;
Motion *tm_alloc_motion;
Sectors *tm_alloc_sectors;
Specials *tm_alloc_specials;
Enemies *tm_alloc_enemies;
Brain *tm_alloc_brain;
Graphics *tm_alloc_graphics;

U0 TmAllocBuild(I64 mode)
{
  Collision *collision;
  World *world;
  Path *path;
  Attack *attack;
  Motion *motion;
  Sectors *sectors;
  Specials *specials;
  Enemies *enemies;
  Brain *brain;
  Actions *actions;
  Weapon *weapon;
  Surfaces *surfaces;
  Switches *switches;
  Lights *lights;
  Actor *actor;
  switch (mode) {
    case 0:
      collision=CollisionNew(tm_alloc_map); CollisionDel(collision);
      break;
    case 1: world=WorldNew(tm_alloc_map,tm_alloc_data); WorldDel(world); break;
    case 2: path=PathNew(tm_alloc_world); PathDel(path); break;
    case 3: attack=AttackNew(tm_alloc_world); AttackDel(attack); break;
    case 4: motion=MotionNew(tm_alloc_world); MotionDel(motion); break;
    case 5: sectors=SectorsNew(tm_alloc_motion); SectorsDel(sectors); break;
    case 6:
      specials=SpecialsNew(tm_alloc_sectors); SpecialsDel(specials);
      break;
    case 7: enemies=EnemiesNew(tm_alloc_specials); EnemiesDel(enemies); break;
    case 8: brain=BrainNew(tm_alloc_enemies); BrainDel(brain); break;
    case 9:
      actions=ActionsNew(tm_alloc_brain,&tm_alloc_clock); ActionsDel(actions);
      break;
    case 10: weapon=WeaponNew(tm_alloc_motion); WeaponDel(weapon); break;
    case 11:
      surfaces=SurfacesNew(tm_alloc_map,tm_alloc_graphics);
      if (!surfaces) throw('Surface');
      SurfacesDel(surfaces);
      break;
    case 12:
      switches=SwitchesNew(tm_alloc_sectors); SwitchesDel(switches);
      break;
    case 13: lights=LightsNew(tm_alloc_sectors); LightsDel(lights); break;
    case 14:
      actor=WorldSpawn(tm_alloc_world,TM_MT_TROOP,0,0);
      WorldRemove(tm_alloc_world,actor);
      break;
  }
}

U0 TmAllocTest()
{
  I64 i,j,n,used,total,heap,slot,random,cnt,cap,stamp,*seen,bytes;
  Bool caught;
  Player player;
  Graphics graphics;
  Wad wad;
  Lump lumps[3];
  Path *path;
  Attack *attack;
  Intercept *hits;
  ActorSlot *slots;
  tm_alloc_data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  if (!tm_alloc_data) throw('Files');
  used=Fs->data_heap->used_u8s;
  MemSet(&player,0,sizeof(player)); PlayerBorn(&player);
  MemSet(&graphics,0,sizeof(graphics)); MemSet(&wad,0,sizeof(wad));
  MemSet(lumps,0,sizeof(lumps)); wad.dir=lumps; wad.cnt=3;
  StrCpy(lumps[0].name,"F_START"); StrCpy(lumps[1].name,"FLAT");
  StrCpy(lumps[2].name,"F_END"); lumps[1].size=4096;
  graphics.wad=&wad; tm_alloc_graphics=&graphics;
  tm_alloc_map=RoomsNew(FALSE);
  tm_alloc_world=WorldNew(tm_alloc_map,tm_alloc_data);
  tm_alloc_world->player=WorldSpawn(tm_alloc_world,TM_MT_PLAYER,64*65536,0)->id;
  tm_alloc_motion=MotionNew(tm_alloc_world,&player);
  tm_alloc_sectors=SectorsNew(tm_alloc_motion);
  tm_alloc_specials=SpecialsNew(tm_alloc_sectors);
  tm_alloc_enemies=EnemiesNew(tm_alloc_specials);
  tm_alloc_brain=BrainNew(tm_alloc_enemies);
  heap=Fs->data_heap->used_u8s;
  for (i=0;i<15;i++) {
    tm_alloc_count=tm_alloc_fail=0; tm_alloc_armed=TRUE;
    TmAllocBuild(i); tm_alloc_armed=FALSE; total=tm_alloc_count;
    if (!total || Fs->data_heap->used_u8s!=heap) throw('Baseline');
    tm_alloc_cases++;
    for (j=1;j<=total;j++) {
      slot=tm_alloc_world->free_slot; random=tm_alloc_world->random;
      cnt=tm_alloc_world->actor_cnt; caught=FALSE;
      tm_alloc_count=0; tm_alloc_fail=j; tm_alloc_armed=TRUE;
      try {
	TmAllocBuild(i);
      } catch {
	if (Fs->except_ch=='Alloc') caught=Fs->catch_except=TRUE;
      }
      tm_alloc_armed=FALSE;
      if (!caught || tm_alloc_count!=j) throw('Fault');
      if (Fs->data_heap->used_u8s!=heap) {
	"ALLOC %d FAULT %d LEAK %d\n",i,j,Fs->data_heap->used_u8s-heap;
	throw('Leak');
      }
      if (tm_alloc_world->actions || tm_alloc_motion->action ||
	    tm_alloc_world->free_slot!=slot || tm_alloc_world->random!=random ||
	    tm_alloc_world->actor_cnt!=cnt) throw('Atomic');
      tm_alloc_faults++; tm_alloc_cases++;
    }
  }
  for (i=0;i<4;i++) for (j=0;j<2;j++) {
    n=4; if (i==1) n=5; else if (i==2) n=6; else if (i==3) n=10;
    tm_alloc_world->thinking=!j; tm_alloc_world->ticking=j;
    heap=Fs->data_heap->used_u8s; tm_alloc_count=tm_alloc_fail=0;
    tm_alloc_armed=TRUE; caught=FALSE;
    try {
      TmAllocBuild(n);
    } catch {
      if (!j && Fs->except_ch=='Thinking' ||
	    j && Fs->except_ch=='Ticking') caught=Fs->catch_except=TRUE;
    }
    tm_alloc_armed=FALSE;
    tm_alloc_world->thinking=tm_alloc_world->ticking=FALSE;
    if (!caught || tm_alloc_count || Fs->data_heap->used_u8s!=heap)
      throw('Busy');
    tm_alloc_cases++;
  }
  for (i=0;i<4;i++) {
    path=PathNew(tm_alloc_world); attack=AttackNew(tm_alloc_world);
    switch (i) {
      case 0:
	for (j=0;j<path->cap;j++) PathHitAdd(path,j,j);
	break;
      case 1:
	for (j=0;j<attack->special_cap;j++) AttackSpecial(attack,j);
	break;
      case 2:
	PathRun(path,-64*65536,64*65536,64*65536,64*65536);
	WorldSlotsGrow(tm_alloc_world);
	break;
    }
    hits=path->hit; cap=path->cap; cnt=path->cnt; seen=path->actor_seen;
    stamp=path->stamp; bytes=path->actor_cap; slots=tm_alloc_world->slot;
    n=tm_alloc_world->slot_cap; heap=Fs->data_heap->used_u8s;
    caught=FALSE; tm_alloc_count=0; tm_alloc_fail=1; tm_alloc_armed=TRUE;
    try {
      switch (i) {
	case 0: PathHitAdd(path,99,99); break;
	case 1: AttackSpecial(attack,99); break;
	case 2: PathRun(path,-64*65536,64*65536,64*65536,64*65536); break;
	case 3: WorldSlotsGrow(tm_alloc_world); break;
      }
    } catch {
      if (Fs->except_ch=='Alloc') caught=Fs->catch_except=TRUE;
    }
    tm_alloc_armed=FALSE;
    if (!caught || tm_alloc_count!=1 || Fs->data_heap->used_u8s!=heap ||
	path->hit!=hits || path->cap!=cap || path->actor_seen!=seen ||
	path->actor_cap!=bytes || path->stamp!=stamp ||
	tm_alloc_world->slot!=slots || tm_alloc_world->slot_cap!=n)
      throw('Growth');
    if (i==0 && path->cnt!=cnt ||
	i==1 && (attack->special_cap!=16 || attack->special_cnt!=16))
      throw('Capacity');
    switch (i) {
      case 0:
	PathHitAdd(path,99,99);
	if (path->cap!=cap*2 || path->cnt!=cnt+1) throw('Retry');
	for (j=0;j<cnt;j++) if (path->hit[j].line!=j) throw('Content');
	break;
      case 1:
	AttackSpecial(attack,99);
	if (attack->special_cap!=32 || attack->special_cnt!=17) throw('Retry');
	for (j=0;j<16;j++) if (attack->special[j]!=j) throw('Content');
	break;
      case 2:
	if (!PathRun(path,-64*65536,64*65536,64*65536,64*65536) ||
	      path->actor_cap!=tm_alloc_world->slot_cap) throw('Retry');
	break;
      case 3:
	WorldSlotsGrow(tm_alloc_world);
	if (tm_alloc_world->slot_cap!=n*2 ||
	      !WorldActorGet(tm_alloc_world,tm_alloc_world->player))
	  throw('Retry');
	break;
    }
    PathDel(path); AttackDel(attack); tm_alloc_faults++; tm_alloc_cases++;
  }
  BrainDel(tm_alloc_brain); EnemiesDel(tm_alloc_enemies);
  SpecialsDel(tm_alloc_specials); SectorsDel(tm_alloc_sectors);
  MotionDel(tm_alloc_motion); WorldDel(tm_alloc_world); MapDel(tm_alloc_map);
  if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
  if (tm_alloc_cases!=tm_alloc_faults+23) throw('Coverage');
  GameDataDel(tm_alloc_data); tm_alloc_done=1;
  "ALLOC %d CASES %d FAULTS BAD 0\n",tm_alloc_cases,tm_alloc_faults;
}

TmAllocTest;
