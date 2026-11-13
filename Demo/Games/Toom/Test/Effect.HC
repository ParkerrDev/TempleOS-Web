I64 tm_effect_real_cases=0,tm_effect_real_done=0,tm_effect_mode,
	tm_effect_sounds,tm_effect_sound,tm_effect_x;
Actor *tm_effect_origin;
Enemies *tm_effect_enemies;

U0 TmEffectRealSound(Actor *actor,I64 sound)
{
  tm_effect_sounds++; tm_effect_sound=sound; tm_effect_origin=actor;
  tm_effect_x=0;
  if (actor) tm_effect_x=actor->x;
  if (tm_effect_mode==16) throw('SoundCB',TRUE);
}

U0 TmEffectRealAction(Actor *actor,I64 action)
{
  EnemyEffect(tm_effect_enemies,actor,action);
}

U0 TmEffectRealTest()
{
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map;
  World *world;
  Motion *motion;
  Sectors *sectors;
  Specials *specials;
  Enemies *enemies;
  Actor *actor,*target,*origin;
  ActorInfo old_info,*info;
  I64 mode,used,sound,random,type,i,health;
  Bool caught;
  if (!data) throw('Files');
  used=Fs->data_heap->used_u8s;
  for (mode=0;mode<19;mode++) {
    map=RoomsNew(FALSE);
    map->line[0].side[0]=map->line[4].side[0]=map->line[5].side[0]=1;
    world=WorldNew(map,data); motion=MotionNew(world);
    sectors=SectorsNew(motion); specials=SpecialsNew(sectors);
    enemies=tm_effect_enemies=EnemiesNew(specials);
    type=TM_MT_TROOP;
    if (mode==1) type=TM_MT_SPIDER;
    else if (mode==2) type=TM_MT_CYBORG;
    actor=WorldSpawn(world,type,-64*65536,0);
    target=WorldSpawn(world,TM_MT_TROOP,64*65536,0);
    info=data->info+type; MemCpy(&old_info,info,sizeof(ActorInfo));
    motion->sound=&TmEffectRealSound; world->random=0;
    tm_effect_mode=mode; tm_effect_sounds=0;
    tm_effect_sound=-1; tm_effect_origin=NULL; tm_effect_x=0;
    sound=-1; random=0; origin=actor; caught=FALSE;
    switch (mode) {
      case 0...2:
	info->death_snd=TM_SFX_PODTH2;
	sound=TM_SFX_PODTH3; random=1;
	if (mode) origin=NULL;
	if (mode==2) {
	  info->death_snd=TM_SFX_BGDTH2; sound=TM_SFX_BGDTH1;
	}
	EnemyEffect(enemies,actor,TM_A_SCREAM);
	break;
      case 3...4:
	info->pain_snd=0;
	if (mode==4) info->pain_snd=sound=TM_SFX_PLPAIN;
	EnemyEffect(enemies,actor,TM_A_PAIN);
	break;
      case 5:
	sound=TM_SFX_SLOP; EnemyEffect(enemies,actor,TM_A_XSCREAM); break;
      case 6...8:
	actor->health=-51; sound=TM_SFX_PLDETH;
	if (mode==7) actor->health=-50;
	if (mode==8) sound=TM_SFX_PDIEHI;
	EnemyEffect(enemies,actor,TM_A_PLAYER_SCREAM,mode!=6);
	break;
      case 9:
	actor->flags|=TM_MF_SOLID; health=actor->flags;
	EnemyEffect(enemies,actor,TM_A_FALL);
	if (actor->flags!=health&~TM_MF_SOLID ||
	      !WorldTryMove(world,target,actor->x,actor->y)) throw('Fall');
	break;
      case 10...12:
	actor->target=target->id; actor->movedir=0; actor->move_cnt=1;
	actor->reaction=actor->threshold=2;
	info->melee=info->missile=0; info->active_snd=TM_SFX_POSACT;
	sound=TM_SFX_HOOF; type=TM_A_HOOF;
	if (mode==11) {sound=TM_SFX_METAL; type=TM_A_METAL;}
	if (mode==12) {sound=TM_SFX_BSPWLK; type=TM_A_BABY_METAL;}
	EnemyEffect(enemies,actor,type); random=1;
	if (tm_effect_x!=-64*65536 ||
	      actor->x!=(-64+info->speed)*65536 ||
	      actor->reaction!=1 || actor->threshold!=1 || actor->move_cnt)
	  throw('Chase');
	break;
      case 13:
	actor->active=FALSE; EnemyEffect(enemies,actor,-1); break;
      case 14:
	actor->world=NULL;
	try {EnemyEffect(enemies,actor,TM_A_PAIN);} catch {
	  if (Fs->except_ch=='World') {caught=TRUE; Fs->catch_except=TRUE;}
	}
	actor->world=world;
	if (!caught) throw('Owner');
	break;
      case 15:
	try {EnemyEffect(enemies,actor,-1);} catch {
	  if (Fs->except_ch=='Action') {caught=TRUE; Fs->catch_except=TRUE;}
	}
	if (!caught) throw('Action');
	break;
      case 16:
	sound=TM_SFX_SLOP;
	try {EnemyEffect(enemies,actor,TM_A_XSCREAM);} catch {
	  if (Fs->except_ch=='SoundCB') {caught=TRUE; Fs->catch_except=TRUE;}
	}
	if (!caught) throw('Callback');
	break;
      case 17:
	motion->action=&TmEffectRealAction;
	ActorDamage(motion,target,actor,actor,target->health+1);
	for (i=0;i<100 && target->tics!=-1;i++)
	  ActorTick(data,target,motion->action);
	if (target->health!=-1 || !target->active || target->tics!=-1 ||
	      target->flags&TM_MF_SOLID || !(target->flags&TM_MF_CORPSE) ||
	      tm_effect_sounds!=1 || tm_effect_origin!=target)
	  throw('Death');
	sound=TM_SFX_BGDTH2; origin=target; random=2;
	break;
      case 18:
	motion->action=&TmEffectRealAction;
	info->pain_chance=256; health=target->health;
	ActorDamage(motion,target,actor,actor,1);
	for (i=0;i<10 && !tm_effect_sounds;i++)
	  ActorTick(data,target,motion->action);
	if (target->health!=health-1 || tm_effect_sounds!=1 ||
	      tm_effect_origin!=target || !(target->flags&TM_MF_SOLID))
	  throw('Pain');
	sound=info->pain_snd; origin=target; random=1;
	break;
    }
    i=0; if (sound>=0) i=1;
    if (tm_effect_sounds!=i || tm_effect_sound!=sound ||
	  i && tm_effect_origin!=origin || world->random!=random) {
      "EFFECT MODE %d SOUND %d EXPECTED %d RANDOM %d EXPECTED %d\n",
	    mode,tm_effect_sound,sound,world->random,random;
      throw('Effect');
    }
    MemCpy(info,&old_info,sizeof(ActorInfo));
    EnemiesDel(enemies); SpecialsDel(specials); SectorsDel(sectors);
    MotionDel(motion); WorldDel(world); MapDel(map);
    if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
    tm_effect_real_cases++;
  }
  GameDataDel(data); tm_effect_real_done=1;
  "EFFECT 19 REAL CASES BAD 0\n";
}

TmEffectRealTest;
