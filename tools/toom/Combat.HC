I64 tm_combat_real_cases=0,tm_combat_real_done=0,tm_combat_mode,
	tm_combat_sounds,tm_combat_last_sound,tm_combat_door_sounds;
GameData *tm_combat_real_data;
Enemies *tm_combat_real_enemies;
Actor *tm_combat_real_source,*tm_combat_real_target;
Player tm_combat_real_player;

U0 TmCombatRealSound(Actor *,I64 sound)
{
  tm_combat_sounds++; tm_combat_last_sound=sound;
}

U0 TmCombatDoorSound(I64 sector,I64)
{
  Enemies *enemies=tm_combat_real_enemies;
  if (sector!=1) throw('Sector');
  tm_combat_door_sounds++;
  if (tm_combat_mode==22) throw('DoorCB',TRUE);
  if (tm_combat_mode==23)
    AttackFire(enemies->trace,tm_combat_real_source,0,16*65536,0);
}

U0 TmCombatRealNew(I64 mode)
{
  Map *map=RoomsNew(FALSE);
  World *world;
  Motion *motion;
  Sectors *sectors;
  Specials *specials;
  I64 type=TM_MT_TROOP,x=-64,target_x=32;
  map->line[0].side[0]=map->line[4].side[0]=map->line[5].side[0]=1;
  world=WorldNew(map,tm_combat_real_data);
  if (mode==20 || mode==21) type=TM_MT_PLAYER;
  if (mode==21) x=-32;
  if (3<=mode<=7) target_x=0;
  else if (8<=mode<=14 || mode>=19) target_x=64;
  if (mode==21) target_x=16;
  tm_combat_real_source=WorldSpawn(world,type,x*65536,0);
  tm_combat_real_target=WorldSpawn(world,TM_MT_FATSO,target_x*65536,0);
  tm_combat_real_source->target=tm_combat_real_target->id;
  tm_combat_real_source->flags|=TM_MF_AMBUSH;
  MemSet(&tm_combat_real_player,0,sizeof(Player));
  PlayerBorn(&tm_combat_real_player);
  motion=MotionNew(world);
  if (type==TM_MT_PLAYER) {
    motion->player=&tm_combat_real_player;
    world->player=tm_combat_real_source->id;
  }
  motion->sound=&TmCombatRealSound;
  sectors=SectorsNew(motion); sectors->sound=&TmCombatDoorSound;
  specials=SpecialsNew(sectors);
  tm_combat_real_enemies=EnemiesNew(specials);
  tm_combat_mode=mode; tm_combat_sounds=tm_combat_door_sounds=0;
  tm_combat_last_sound=-1; world->random=0;
}

U0 TmCombatRealDel()
{
  Enemies *enemies=tm_combat_real_enemies;
  Specials *specials=enemies->specials;
  Sectors *sectors=specials->sectors;
  Motion *motion=sectors->motion;
  World *world=motion->world;
  Map *map=world->map;
  EnemiesDel(enemies); SpecialsDel(specials); SectorsDel(sectors);
  MotionDel(motion); WorldDel(world); MapDel(map);
}

U0 TmCombatRealTest()
{
  I64 mode,used,health,cnt,damage,sound,type,state;
  Enemies *enemies;
  Specials *specials;
  Sectors *sectors;
  Motion *motion;
  World *world;
  Map *map;
  Actor *actor,*target,*effect;
  Weapon *weapon;
  Bool caught;
  tm_combat_real_data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  if (!tm_combat_real_data) throw('Files');
  used=Fs->data_heap->used_u8s;
  for (mode=0;mode<24;mode++) {
    TmCombatRealNew(mode); enemies=tm_combat_real_enemies;
    specials=enemies->specials; sectors=specials->sectors;
    motion=sectors->motion; world=motion->world; map=world->map;
    actor=tm_combat_real_source; target=tm_combat_real_target;
    health=target->health; weapon=NULL;
    switch (mode) {
      case 0...2:
	cnt=1; type=TM_A_POS_ATTACK; sound=TM_SFX_PISTOL;
	if (mode) {type=TM_A_CPOS_ATTACK; sound=TM_SFX_SHOTGN;}
	if (mode==1) {type=TM_A_SPOS_ATTACK; cnt=3;}
	EnemyShot(enemies,actor,type); damage=health-target->health;
	effect=WorldActorGet(world,world->last);
	if (!(3*cnt<=damage<=15*cnt) || damage%3 ||
	      world->actor_cnt!=2+cnt || !effect ||
	      effect->type!=TM_MT_BLOOD || tm_combat_sounds!=1 ||
	      tm_combat_last_sound!=sound) throw('Shot');
	break;
      case 3...7:
	actor->angle=0x22222222; sound=-1;
	switch (mode) {
	  case 3:
	    EnemyTroop(enemies,actor); damage=3; sound=TM_SFX_CLAW; break;
	  case 4: EnemySarg(enemies,actor); damage=36; break;
	  case 5: EnemyHead(enemies,actor); damage=30; break;
	  case 6:
	    EnemyBruis(enemies,actor); damage=10; sound=TM_SFX_CLAW; break;
	  case 7:
	    EnemySkelFist(enemies,actor); damage=54; sound=TM_SFX_SKEPCH;
	    break;
	}
	cnt=0; if (sound>=0) cnt=1;
	if (target->health!=health-damage || world->actor_cnt!=2 ||
	      tm_combat_last_sound!=sound || tm_combat_sounds!=cnt)
	  throw('Melee');
	if (mode==6) {
	  if (actor->angle!=0x22222222 || !(actor->flags&TM_MF_AMBUSH))
	    throw('Facing');
	} else if (actor->angle || actor->flags&TM_MF_AMBUSH) throw('Facing');
	break;
      case 8...14:
	type=0;
	switch (mode) {
	  case 8: EnemyTroop(enemies,actor); type=TM_MT_TROOPSHOT; break;
	  case 9: EnemySarg(enemies,actor); break;
	  case 10: EnemyHead(enemies,actor); type=TM_MT_HEADSHOT; break;
	  case 11: EnemyBruis(enemies,actor); type=TM_MT_BRUISERSHOT; break;
	  case 12:
	    type=TM_MT_ARACHPLAZ; EnemyLaunch(enemies,actor,type); break;
	  case 13: type=TM_MT_ROCKET; EnemyLaunch(enemies,actor,type); break;
	  case 14: EnemyWhoosh(enemies,actor); break;
	}
	if (type) {
	  effect=WorldActorGet(world,world->last);
	  if (!effect || effect->type!=type || effect->target!=actor->id ||
		world->actor_cnt!=3 || world->random!=2) throw('Missile');
	} else if (world->actor_cnt!=2 || world->random) throw('NoShot');
	if (target->health!=health) throw('EarlyHit');
	if (mode==9 && tm_combat_sounds ||
	      mode==14 && (tm_combat_sounds!=1 ||
	      tm_combat_last_sound!=TM_SFX_SKESWG)) throw('Sound');
	break;
      case 15...18:
	state=actor->state; world->random=1; cnt=40;
	if (mode==16 || mode==18) target->health=0;
	if (mode==17) actor->target=0;
	if (mode==18) {world->random=0; cnt=10;}
	EnemyRefire(enemies,actor,cnt);
	if (mode==16 || mode==17)
	  state=world->data->info[actor->type].see;
	if (actor->state!=state || tm_combat_sounds || world->actor_cnt!=2 ||
	      world->random!=2-(mode==18)) throw('Refire');
	break;
      case 19...23:
	map->line[6].special=46; map->line[6].tag=map->sector[1].tag=9;
	map->sector[1].ceil=64*65536; caught=FALSE;
	if (mode==20 || mode==21) {
	  weapon=WeaponNew(motion); weapon->special=&EnemyShotLine;
	  weapon->special_context=specials;
	  if (mode==20) WeaponShot(weapon,actor,0,2048*65536,0,10);
	  else WeaponMelee(weapon,FALSE);
	} else {
	  try {
	    EnemyShot(enemies,actor,TM_A_POS_ATTACK);
	  } catch {
	    if (Fs->except_ch=='DoorCB') {
	      caught=TRUE; Fs->catch_except=TRUE;
	    }
	  }
	}
	if (caught!=!!(mode==22) || !sectors->area[1].mover ||
	      tm_combat_door_sounds!=1) throw('Trigger');
	if (mode==22) {
	  if (target->health!=health || world->actor_cnt!=2) throw('Order');
	} else if (target->health>=health) {
	  "TARGET MODE %d\n",mode;
	  throw('Target');
	}
	if (mode==23 && enemies->trace->kind!=TM_HIT_NONE) throw('Nested');
	break;
    }
    WeaponDel(weapon); TmCombatRealDel;
    if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
    tm_combat_real_cases++;
  }
  GameDataDel(tm_combat_real_data); tm_combat_real_done=1;
  "COMBAT %d REAL CASES BAD 0\n",tm_combat_real_cases;
}

TmCombatRealTest;
