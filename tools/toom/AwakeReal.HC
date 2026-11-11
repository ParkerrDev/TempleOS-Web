I64 tm_awake_real_cases=0,tm_awake_real_done=0,tm_awake_real_sounds,
	tm_awake_real_mode;
Brain *tm_awake_real_brain;
Actor *tm_awake_real_remove;

U0 TmAwakeRealSound(Actor *actor,I64 sound)
{
  if (actor || sound!=TM_SFX_BOSSIT || tm_awake_real_brain->on)
    throw('Sound');
  tm_awake_real_sounds++;
  if (tm_awake_real_mode==7) throw('SoundCB',TRUE);
  if (tm_awake_real_mode==12)
    WorldRemove(tm_awake_real_remove->world,tm_awake_real_remove);
}

U0 TmAwakeRealTest()
{
  I64 mode,used,i,j,n,cnt,old_cnt,old_on,*old_targets,*expected,*ids,
	rng,sounds,old_heap;
  Bool caught;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map;
  World *world;
  Motion *motion;
  Sectors *sectors;
  Specials *specials;
  Enemies *enemies;
  Actor *actor,*other;
  Brain *brain,*bad;
  if (!data) throw('Files');
  used=Fs->data_heap->used_u8s;
  for (mode=0;mode<13;mode++) {
    map=RoomsNew(FALSE); world=WorldNew(map,data); motion=MotionNew(world);
    sectors=SectorsNew(motion); specials=SpecialsNew(sectors);
    enemies=EnemiesNew(specials);
    actor=WorldSpawn(world,TM_MT_BOSSSPIT,0,0);
    brain=tm_awake_real_brain=BrainNew(enemies,TRUE);
    n=3;
    switch (mode) {
      case 0: n=0; break;
      case 1: n=33; break;
      case 2: n=129; break;
      case 3: n=257; break;
      case 4: n=65; break;
    }
    ids=MAlloc((n+2)*sizeof(I64)); expected=MAlloc((n+2)*sizeof(I64)); cnt=0;
    for (i=0;i<n;i++) {
      other=WorldSpawn(world,TM_MT_BOSSTARGET,i*65536,0); ids[i]=other->id;
      if (mode==4) {
	if (i%3==1) other->active=FALSE;
	if (i%3==2) other->health=0;
      }
      if (other->active) expected[cnt++]=other->id;
    }
    MoverNew(sectors,0,TM_MOVER_DOOR);
    motion->sound=&TmAwakeRealSound; tm_awake_real_mode=-1;
    BrainAwake(brain,actor); brain->on=1;
    old_targets=brain->targets; old_cnt=brain->cnt; old_on=brain->on;
    tm_awake_real_sounds=0; tm_awake_real_mode=mode; caught=FALSE;
    world->random=rng=71; sounds=1;
    if (mode==5) {actor->world=NULL; sounds=0;}
    if (mode==6) {actor->active=FALSE; sounds=0;}
    if (mode==7) {
      other=WorldActorGet(world,ids[0]); WorldRemove(world,other);
      if (WorldActorGet(world,ids[0],FALSE)) throw('Handle');
      cnt=0; for (i=1;i<n;i++) expected[cnt++]=ids[i];
      for (i=0;i<2;i++) {
	other=WorldSpawn(world,TM_MT_BOSSTARGET,-i*65536,0);
	expected[cnt++]=other->id;
      }
      rng=world->random;
    }
    if (mode==8 || mode==9 || mode==10) world->thinking=TRUE;
    if (mode==9 || mode==10) sounds=0;
    if (mode==11) {actor->active=FALSE; sounds=0;}
    if (mode==12) tm_awake_real_remove=WorldActorGet(world,expected[0]);
    old_heap=Fs->data_heap->used_u8s; bad=NULL;
    try {
      if (mode==9) bad=BrainNew(enemies);
      else if (mode==10) BrainDel(brain);
      else BrainAwake(brain,actor);
    } catch {
      if (mode==5 && Fs->except_ch=='World' ||
	    mode==7 && Fs->except_ch=='SoundCB' ||
	    (mode==9 || mode==10) && Fs->except_ch=='Thinking')
	caught=Fs->catch_except=TRUE;
    }
    actor->world=world; world->thinking=FALSE;
    if (caught!=!!(mode==5 || mode==7 || mode==9 || mode==10) || bad ||
	  tm_awake_real_sounds!=sounds || world->random!=rng || !brain->easy)
      throw('Guard');
    if (mode==5 || mode==6 || mode==9 || mode==10 || mode==11) {
      if (brain->targets!=old_targets || brain->cnt!=old_cnt ||
	    brain->on!=old_on || Fs->data_heap->used_u8s!=old_heap)
	throw('Atomic');
    } else {
      if (brain->cnt!=cnt || brain->on) throw('Count');
      for (j=0;j<cnt;j++) {
	if (brain->targets[j]!=expected[j]) throw('Order');
	other=WorldActorGet(world,expected[j]);
	if (mode==12 && !j) {
	  if (other) throw('Stale');
	} else if (!other || other->type!=TM_MT_BOSSTARGET) throw('Target');
      }
    }
    if (mode<5) {
      tm_awake_real_mode=-1; old_heap=Fs->data_heap->used_u8s;
      for (i=0;i<8;i++) {
	brain->on=99; BrainAwake(brain,actor);
	if (brain->cnt!=cnt || brain->on || !brain->easy ||
	      Fs->data_heap->used_u8s!=old_heap) throw('Refresh');
      }
    }
    Free(ids); Free(expected); BrainDel(brain);
    EnemiesDel(enemies); SpecialsDel(specials); SectorsDel(sectors);
    MotionDel(motion); WorldDel(world); MapDel(map);
    if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
    tm_awake_real_cases++;
  }
  GameDataDel(data); tm_awake_real_done=1;
  "AWAKE 13 REAL CASES BAD 0\n";
}

TmAwakeRealTest;
