I64 tm_pain_real_cases=0,tm_pain_real_done=0,tm_pain_real_sounds;
Bool tm_pain_real_fail;
GameData *tm_pain_real_data;

U0 TmPainRealSound(Actor *actor,I64 sound)
{
  if (actor->type!=TM_MT_SKULL || sound!=TM_SFX_SKLATK) throw('Sound');
  tm_pain_real_sounds++;
  if (tm_pain_real_fail) throw('SoundCB',TRUE);
}

U0 TmPainRealTest()
{
  I64 mode,used,count,base,n,i,id,first,health,random,charged,sounds;
  Map *map;
  World *world;
  Motion *motion;
  Sectors *sectors;
  Specials *specials;
  Enemies *enemies;
  Actor *actor,*target,*skull;
  Bool caught,dead;
  tm_pain_real_data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  if (!tm_pain_real_data) throw('Files');
  used=Fs->data_heap->used_u8s;
  for (mode=0;mode<16;mode++) {
    map=RoomsNew(FALSE);
    map->line[0].side[0]=map->line[4].side[0]=map->line[5].side[0]=1;
    world=WorldNew(map,tm_pain_real_data); motion=MotionNew(world);
    sectors=SectorsNew(motion); specials=SpecialsNew(sectors);
    enemies=EnemiesNew(specials);
    actor=WorldSpawn(world,TM_MT_PAIN,0,0);
    target=WorldSpawn(world,TM_MT_PLAYER,112*65536,0);
    actor->target=target->id; actor->flags|=TM_MF_AMBUSH;
    count=0; caught=dead=FALSE;
    if (mode==4 || mode==7) count=19;
    else if (mode==5) count=20;
    else if (mode==6) count=21;
    for (i=0;i<count+2;i++) {
      skull=WorldSpawn(world,TM_MT_SKULL,-100*65536,-100*65536);
      skull->health=0; skull->flags|=TM_MF_CORPSE;
      if (i>=count) skull->active=FALSE;
    }
    motion->sound=&TmPainRealSound; tm_pain_real_sounds=0;
    tm_pain_real_fail=FALSE; world->random=0;
    switch (mode) {
      case 1:
      case 3: actor->target=0; break;
      case 7: map->sector[0].ceil=map->sector[1].ceil=16*65536; break;
      case 8:
	WorldActorUnlink(world,target); target->x=75*65536;
	WorldActorLink(world,target);
	break;
      case 9: map->sector[0].ceil=16*65536; break;
      case 10: actor->active=FALSE; break;
      case 11: actor->world=NULL; break;
      case 12:
      case 13:
	WorldRemove(world,target);
	target=WorldSpawn(world,TM_MT_PLAYER,112*65536,0);
	world->random=0;
	break;
      case 14: tm_pain_real_fail=TRUE; break;
      case 15: target->flags|=TM_MF_SHADOW; break;
    }
    base=world->actor_cnt; first=world->last; health=target->health;
    try {
      if (mode==0 || mode==8 || mode==9)
	EnemyPainSpawn(enemies,actor,0);
      else if (2<=mode<=7 || mode==10 || mode==11 ||
	    mode==13 || mode==14) EnemyPainDie(enemies,actor);
      else EnemyPainAttack(enemies,actor);
    } catch {
      if (mode==11 && Fs->except_ch=='World' ||
	    mode==14 && Fs->except_ch=='SoundCB') {
	caught=TRUE; Fs->catch_except=TRUE;
      }
    }
    if (caught!=!!(mode==11 || mode==14)) throw('Guard');
    actor->world=world;
    n=1; charged=1; random=1; sounds=1;
    switch (mode) {
      case 1:
      case 6:
      case 10:
      case 11:
      case 12: n=charged=random=sounds=0; break;
      case 2: n=charged=random=sounds=3; break;
      case 3:
      case 13: n=random=3; charged=sounds=0; break;
      case 4: n=charged=random=sounds=2; break;
      case 7: n=2; charged=sounds=0; random=4; dead=TRUE; break;
      case 8:
      case 9: charged=sounds=0; random=2; dead=TRUE; break;
      case 15: random=5; break;
    }
    if (world->actor_cnt!=base+n || tm_pain_real_sounds!=sounds ||
	  world->random!=random || target->health!=health) {
      "PAIN REAL %d NEW %d SOUND %d RANDOM %d\n",mode,
	    world->actor_cnt-base,tm_pain_real_sounds,world->random;
      throw('Spawn');
    }
    skull=WorldActorGet(world,first,FALSE); id=skull->tick_next;
    for (i=0;i<n;i++) {
      skull=WorldActorGet(world,id);
      if (!skull || skull->type!=TM_MT_SKULL || skull->block<0)
	throw('Actor');
      if (dead) {
	if (skull->health!=tm_pain_real_data->info[TM_MT_SKULL].health-10000 ||
	      !(skull->flags&TM_MF_CORPSE) ||
	      skull->flags&(TM_MF_SHOOTABLE|TM_MF_SKULLFLY)) throw('Death');
      } else if (!!(skull->flags&TM_MF_SKULLFLY)!=!!charged ||
	    skull->target!=actor->target) throw('Charge');
      if (!dead && mode!=15) {
	if (skull->z!=8*65536) throw('Height');
	if (mode==2 || mode==3 || mode==13) {
	  if (!i && skull->y<=0 || i==1 && skull->x>=0 ||
		i==2 && skull->y>=0) throw('Order');
	}
      }
      id=skull->tick_next;
    }
    if (id) throw('Tail');
    EnemiesDel(enemies); SpecialsDel(specials); SectorsDel(sectors);
    MotionDel(motion); WorldDel(world); MapDel(map);
    if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
    tm_pain_real_cases++;
  }
  GameDataDel(tm_pain_real_data); tm_pain_real_done=1;
  "PAIN 16 REAL CASES BAD 0\n";
}

TmPainRealTest;
