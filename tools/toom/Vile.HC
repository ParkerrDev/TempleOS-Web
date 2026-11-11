I64 tm_vile_real_cases=0,tm_vile_real_done=0,tm_vile_real_sounds;
Bool tm_vile_real_fail;
Actor *tm_vile_real_actor,*tm_vile_real_corpse;

U0 TmVileRealSound(Actor *actor,I64 sound)
{
  if (sound!=TM_SFX_SLOP || actor!=tm_vile_real_corpse ||
	tm_vile_real_actor->state!=TM_S_VILE_HEAL1 ||
	!(actor->flags&TM_MF_CORPSE) || actor->health!=-5 || actor->tics!=-1)
    throw('Sound');
  tm_vile_real_sounds++;
  if (tm_vile_real_fail) throw('SoundCB',TRUE);
}

U0 TmVileRealTouch(Actor *actor,Actor *,I64 kind)
{
  if (actor!=tm_vile_real_corpse || kind!=TM_CONTACT_SKULL ||
	actor->height!=56*65536) throw('Touch');
  throw('TouchCB',TRUE);
}

U0 TmVileBody(Actor *actor)
{
  ActorInfo *info=actor->world->data->info+actor->type;
  actor->height=info->height/4; actor->health=-5;
  actor->flags=TM_MF_CORPSE; actor->vx=7; actor->vy=9;
  actor->state=info->death; actor->tics=-1;
}

U0 TmVileRealTest()
{
  I64 mode,used,height,state,target_id,angle,random,sounds,death;
  Bool caught,raised;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map;
  World *world;
  Motion *motion;
  Sectors *sectors;
  Specials *specials;
  Enemies *enemies;
  Actor *actor,*target,*corpse,*other,*blocker;
  ActorInfo *info;
  if (!data) throw('Files');
  used=Fs->data_heap->used_u8s;
  for (mode=0;mode<25;mode++) {
    map=RoomsNew(FALSE); map->line[6].special=0;
    world=WorldNew(map,data); motion=MotionNew(world);
    sectors=SectorsNew(motion); specials=SpecialsNew(sectors);
    enemies=EnemiesNew(specials);
    actor=WorldSpawn(world,TM_MT_VILE,-48*65536,0);
    target=WorldSpawn(world,TM_MT_PLAYER,112*65536,112*65536);
    corpse=WorldSpawn(world,TM_MT_TROOP,0,0); TmVileBody(corpse);
    actor->movedir=0; actor->target=0; actor->state=100;
    actor->reaction=2; actor->flags|=TM_MF_AMBUSH;
    other=blocker=NULL; corpse->target=target->id;
    tm_vile_real_actor=actor; tm_vile_real_corpse=corpse;
    motion->sound=&TmVileRealSound; tm_vile_real_sounds=0;
    tm_vile_real_fail=FALSE; raised=TRUE; caught=FALSE;
    switch (mode) {
      case 1: map->sector[1].ceil=16*65536; break;
      case 2: map->sector[1].floor=64*65536; break;
      case 3:
      case 14:
	blocker=WorldSpawn(world,TM_MT_PLAYER,0,0); raised=FALSE;
	if (mode==14) {
	  corpse->flags|=TM_MF_SKULLFLY; motion->touch=&TmVileRealTouch;
	}
	break;
      case 4: world->collision->line[6].back=-1; raised=FALSE; break;
      case 5: corpse->tics=0; raised=FALSE; break;
      case 6: corpse->type=TM_MT_SKULL; raised=FALSE; break;
      case 7: WorldActorPlace(world,corpse,8*65536,0,0); raised=FALSE; break;
      case 8: corpse->height=corpse->radius=0; break;
      case 9: corpse->active=FALSE; raised=FALSE; break;
      case 10: actor->world=NULL; raised=FALSE; break;
      case 11: actor->active=FALSE; raised=FALSE; break;
      case 12: actor->movedir=9; raised=FALSE; break;
      case 13: tm_vile_real_fail=TRUE; raised=FALSE; break;
      case 15: corpse->world=NULL; raised=FALSE; break;
      case 16:
	actor->target=target->id; WorldRemove(world,target);
	target=WorldSpawn(world,TM_MT_PLAYER,112*65536,112*65536);
	break;
      case 17:
	other=WorldSpawn(world,TM_MT_TROOP,0,0); TmVileBody(other);
	tm_vile_real_corpse=other;
	break;
      case 18:
	WorldActorPlace(world,corpse,-65536,0,0);
	other=WorldSpawn(world,TM_MT_TROOP,65536,0); TmVileBody(other);
	break;
      case 19:
	WorldActorPlace(world,corpse,0,-65536,0);
	other=WorldSpawn(world,TM_MT_TROOP,0,65536); TmVileBody(other);
	break;
      case 20:
	WorldActorPlace(world,corpse,0,-30*65536,0);
	other=WorldSpawn(world,TM_MT_TROOP,0,30*65536); TmVileBody(other);
	blocker=WorldSpawn(world,TM_MT_PLAYER,0,-30*65536);
	tm_vile_real_corpse=other;
	break;
      case 21: actor->movedir=8; raised=FALSE; break;
      case 22:
	WorldActorUnlink(world,corpse); corpse->flags|=TM_MF_NOBLOCKMAP;
	WorldActorLink(world,corpse); raised=FALSE;
	break;
      case 23: corpse->flags|=TM_MF_SHADOW; break;
      case 24: corpse->flags&=~TM_MF_CORPSE; raised=FALSE; break;
    }
    target_id=actor->target; world->random=0;
    height=corpse->height; death=corpse->state;
    angle=AngleFrom(data,tm_vile_real_corpse->x-actor->x,
	  tm_vile_real_corpse->y-actor->y);
    if (mode==23) angle=(angle+(8-109)<<21)&0xFFFFFFFF;
    try {
      if (mode==15) EnemyCorpse(enemies,corpse,0,0);
      else EnemyVileChase(enemies,actor);
    } catch {
      if (mode==10 || mode==15) {
	if (Fs->except_ch=='World') caught=Fs->catch_except=TRUE;
      } else if (mode==12 && Fs->except_ch=='MoveDir' ||
	    mode==13 && Fs->except_ch=='SoundCB' ||
	    mode==14 && Fs->except_ch=='TouchCB')
	caught=Fs->catch_except=TRUE;
    }
    if (caught!=!!(mode==10 || mode==12 || mode==13 ||
	  mode==14 || mode==15)) throw('Guard');
    actor->world=corpse->world=world;
    sounds=0; random=0; state=data->info[TM_MT_VILE].spawn;
    if (raised || mode==13) { sounds=1; state=TM_S_VILE_HEAL1; }
    else if (10<=mode<=12 || mode==14 || mode==15) state=100;
    if (mode==23) random=2;
    if (actor->state!=state || tm_vile_real_sounds!=sounds ||
	  world->random!=random || actor->target!=target_id) {
      "VILE REAL %d STATE %d/%d SOUND %d/%d RNG %d/%d\n",mode,
	    actor->state,state,tm_vile_real_sounds,sounds,world->random,random;
      throw('Result');
    }
    if (raised) {
      info=data->info+tm_vile_real_corpse->type;
      if (actor->angle!=angle || actor->flags&TM_MF_AMBUSH ||
	    actor->reaction!=2 || tm_vile_real_corpse->health!=info->health ||
	    tm_vile_real_corpse->flags!=info->flags ||
	    tm_vile_real_corpse->state!=info->raise ||
	    tm_vile_real_corpse->tics!=data->state[info->raise].tics ||
	    tm_vile_real_corpse->target || tm_vile_real_corpse->vx ||
	    tm_vile_real_corpse->vy) throw('Raise');
      if (mode==8) {
	if (corpse->height || corpse->radius) throw('Crushed');
      } else if (tm_vile_real_corpse->height!=info->height)
	throw('Height');
      if (mode==17 || mode==20) {
	if (corpse->state!=death || corpse->height!=height) throw('Order');
	if (mode==17 && (corpse->vx!=7 || corpse->vy!=9) ||
	      mode==20 && (corpse->vx || corpse->vy)) throw('TouchOrd');
      } else if (other && (other->health!=-5 || other->vx!=7 ||
	    other->vy!=9)) throw('Search');
    } else if (corpse->height!=height || corpse->state!=death ||
	  corpse->health!=-5) throw('Restore');
    if ((mode==3 || mode==4 || mode==13 || mode==14) &&
	  (corpse->vx || corpse->vy)) throw('Stopped');
    EnemiesDel(enemies); SpecialsDel(specials); SectorsDel(sectors);
    MotionDel(motion); WorldDel(world); MapDel(map);
    if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
    tm_vile_real_cases++;
  }
  GameDataDel(data); tm_vile_real_done=1;
  "VILE 25 REAL CASES BAD 0\n";
}

TmVileRealTest;
