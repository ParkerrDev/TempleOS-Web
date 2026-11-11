I64 tm_fire_real_cases=0,tm_fire_real_done=0,tm_fire_real_mode,
	tm_fire_real_sounds,tm_fire_real_sound,tm_fire_real_actions;
Actor *tm_fire_real_actor,*tm_fire_real_target,*tm_fire_real_other;

U0 TmFireRealSound(Actor *,I64 sound)
{
  tm_fire_real_sounds++; tm_fire_real_sound=sound;
  switch (tm_fire_real_mode) {
    case 13:
    case 26: throw('SoundCB',TRUE); break;
    case 14:
      WorldActorGet(tm_fire_real_actor->world,
	    tm_fire_real_actor->tracer)->active=FALSE;
      break;
    case 29: tm_fire_real_target->active=FALSE; break;
    case 30: tm_fire_real_actor->target=tm_fire_real_other->id; break;
    case 32: tm_fire_real_actor->target=0; break;
  }
}

U0 TmFireRealAction(Actor *actor,I64 action)
{
  if (actor!=tm_fire_real_target || action!=TM_A_PAIN) throw('Action');
  tm_fire_real_actions++;
  if (tm_fire_real_mode==27 ||
	tm_fire_real_mode==28 && tm_fire_real_actions==2)
    throw('PainCB',TRUE);
  if (tm_fire_real_mode==31) tm_fire_real_actor->target=tm_fire_real_other->id;
}

U0 TmFirePlaceCheck(World *world,Actor *fire)
{
  I64 i,n=0,id,sector=FixedSector(world->map,fire->x,fire->y);
  Actor *other;
  if (fire->sector!=sector || fire->floor!=world->map->sector[sector].floor ||
	fire->ceil!=world->map->sector[sector].ceil) throw('Sector');
  for (i=0;i<16;i++) {
    id=world->blocks[i];
    while (other=WorldActorGet(world,id,FALSE)) {
      if (other==fire) { if (fire->block!=i) throw('Block'); n++; }
      id=other->block_next;
    }
  }
  if (fire->flags&TM_MF_NOBLOCKMAP) {
    if (n || fire->block!=-1) throw('NoBlock');
  } else if (n!=1) throw('Block');
}

U0 TmFireRealTest()
{
  I64 mode,used,base,pain_action,x,y,z,health,vz,sounds,sound,random,
	angle,created;
  Bool caught,follow;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map;
  World *world;
  Motion *motion;
  Sectors *sectors;
  Specials *specials;
  Enemies *enemies;
  Actor *actor,*target,*fire,*other;
  if (!data) throw('Files');
  pain_action=data->state[data->info[TM_MT_PLAYER].pain].action;
  used=Fs->data_heap->used_u8s;
  for (mode=0;mode<36;mode++) {
    map=RoomsNew(FALSE); map->line[6].special=0;
    world=WorldNew(map,data); motion=MotionNew(world);
    sectors=SectorsNew(motion); specials=SpecialsNew(sectors);
    enemies=EnemiesNew(specials);
    actor=WorldSpawn(world,TM_MT_VILE,-64*65536,16*65536,32*65536);
    target=WorldSpawn(world,TM_MT_PLAYER,64*65536,16*65536,8*65536);
    fire=WorldSpawn(world,TM_MT_FIRE,-100*65536,-90*65536,7*65536);
    other=NULL; actor->target=target->id; actor->tracer=fire->id;
    fire->target=actor->id; fire->tracer=target->id; target->angle=0;
    actor->angle=0xC0000000; actor->flags|=TM_MF_AMBUSH;
    tm_fire_real_mode=mode; tm_fire_real_actor=actor;
    tm_fire_real_target=target; tm_fire_real_other=NULL;
    tm_fire_real_sound=tm_fire_real_sounds=tm_fire_real_actions=0;
    motion->sound=&TmFireRealSound;
    switch (mode) {
      case 1:
      case 8:
      case 22: map->sector[1].ceil=0; break;
      case 2: actor->target=0; break;
      case 3:
      case 10:
      case 23:
	WorldRemove(world,target);
	target=WorldSpawn(world,TM_MT_PLAYER,64*65536,16*65536,8*65536);
	break;
      case 5: target->angle=0x40000000; break;
      case 6: target->angle=0x80000000; break;
      case 7: target->angle=0xC0000000; break;
      case 9:
	fire->target+=1<<32;
	break;
      case 15: fire->world=NULL; break;
      case 16: fire->active=FALSE; break;
      case 19: actor->active=FALSE; break;
      case 21: actor->tracer=0; break;
      case 24: fire->active=FALSE; break;
      case 25: actor->world=NULL; break;
      case 27:
      case 28:
      case 31:
	data->state[data->info[TM_MT_PLAYER].pain].action=TM_A_PAIN;
	motion->action=&TmFireRealAction;
	break;
      case 33:
	target->type=TM_MT_CYBORG; target->health=4000;
	break;
      case 34: target->health=0; break;
      case 35: target->flags|=TM_MF_SHADOW; break;
    }
    if (mode==30 || mode==31) {
      other=WorldSpawn(world,TM_MT_PLAYER,80*65536,32*65536);
      tm_fire_real_other=other; actor->tracer=0;
    }
    if (4<=mode<=7) {
      fire->flags&=~TM_MF_NOBLOCKMAP;
      WorldActorPlace(world,fire,-100*65536,-90*65536,7*65536);
    }
    PathRun(enemies->sight,actor->x,actor->y,target->x,target->y,TM_PATH_LINES);
    world->random=0; base=world->actor_cnt; caught=FALSE;
    try {
      if (mode<=3 || mode==35) EnemyVileTarget(enemies,actor);
      else if (mode==11 || mode==13 || mode==14)
	EnemyFire(enemies,fire,TM_A_START_FIRE);
      else if (mode==12) EnemyFire(enemies,fire,TM_A_FIRE_CRACKLE);
      else if (mode==17) EnemyFire(enemies,fire,-1);
      else if (mode==18 || mode==19) EnemyVileStart(enemies,actor);
      else if (20<=mode<=33) EnemyVileAttack(enemies,actor);
      else EnemyFire(enemies,fire);
    } catch {
      if (mode==13 || mode==26) {
	if (Fs->except_ch=='SoundCB') caught=Fs->catch_except=TRUE;
      } else if (mode==15 || mode==25) {
	if (Fs->except_ch=='World') caught=Fs->catch_except=TRUE;
      } else if (mode==17 && Fs->except_ch=='Action' ||
	    (mode==27 || mode==28) && Fs->except_ch=='PainCB')
	caught=Fs->catch_except=TRUE;
    }
    actor->world=fire->world=world;
    data->state[data->info[TM_MT_PLAYER].pain].action=pain_action;
    if (caught!=!!(mode==13 || mode==15 || mode==17 || mode==25 ||
	  mode==26 || mode==27 || mode==28)) throw('Guard');
    x=-100*65536; y=-90*65536; z=7*65536;
    health=100; vz=0; sounds=sound=random=created=0; follow=FALSE;
    switch (mode) {
      case 0:
      case 1:
      case 35:
	fire=WorldActorGet(world,actor->tracer); created=1; random=1;
	if (!fire || fire->target!=actor->id || fire->tracer!=target->id ||
	      fire->type!=TM_MT_FIRE) throw('Spawn');
	x=target->x; y=target->y; z=target->z; follow=mode!=1;
	if (mode==35) random=3;
	break;
      case 4...7:
      case 34: follow=TRUE; break;
      case 11: follow=TRUE; sounds=1; sound=TM_SFX_FLAMST; break;
      case 12: follow=TRUE; sounds=1; sound=TM_SFX_FLAME; break;
      case 13:
      case 14: sounds=1; sound=TM_SFX_FLAMST; break;
      case 18: sounds=1; sound=TM_SFX_VILATK; break;
      case 20:
      case 28: health=17; vz=10*65536; random=2; break;
      case 21:
      case 24: health=80; vz=10*65536; random=1; break;
      case 27: health=80; random=1; break;
      case 30: random=1; break;
      case 31: health=80; random=1; break;
      case 33: health=3980; vz=65536; random=1; break;
    }
    if (mode==34) health=0;
    if (follow) {
      x=target->x+FixedMul(24*65536,AngleCos(data,target->angle));
      y=target->y+FixedMul(24*65536,AngleSin(data,target->angle)); z=target->z;
    }
    if (20<=mode<=33 && mode!=22 && mode!=23 && mode!=25) {
      sounds=1; sound=TM_SFX_BAREXP;
      if (mode==20 || mode==28 || mode==33) {
	x=target->x-FixedMul(24*65536,AngleCos(data,actor->angle));
	y=target->y-FixedMul(24*65536,AngleSin(data,actor->angle));
      }
    }
    angle=actor->angle;
    if (mode==35 && angle!=(0+(8-109)<<21)&0xFFFFFFFF) throw('Shadow');
    if (world->actor_cnt!=base+created || world->random!=random ||
	  target->health!=health || target->vz!=vz ||
	  tm_fire_real_sounds!=sounds || tm_fire_real_sound!=sound ||
	  fire->x!=x || fire->y!=y || fire->z!=z) {
      "FIRE REAL %d HEALTH %d/%d VZ %d/%d RNG %d/%d SOUND %d/%d:%d/%d\n",
	    mode,target->health,health,target->vz,vz,world->random,random,
	    tm_fire_real_sounds,sounds,tm_fire_real_sound,sound;
      "XYZ %d/%d %d/%d %d/%d\n",fire->x,x,fire->y,y,fire->z,z;
      throw('Result');
    }
    if (other && (other->health!=100-(mode==30)*20 ||
	  other->vz!=10*65536 || actor->target!=other->id)) throw('Retarget');
    if (mode==27 && tm_fire_real_actions!=1 ||
	  mode==28 && tm_fire_real_actions!=2) throw('Callback');
    if (follow || created || mode==20 || mode==28 || mode==33)
      TmFirePlaceCheck(world,fire);
    EnemiesDel(enemies); SpecialsDel(specials); SectorsDel(sectors);
    MotionDel(motion); WorldDel(world); MapDel(map);
    if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
    tm_fire_real_cases++;
  }
  GameDataDel(data); tm_fire_real_done=1;
  "FIRE 36 REAL CASES BAD 0\n";
}

TmFireRealTest;
