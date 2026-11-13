I64 tm_boss_real_cases=0,tm_boss_real_done=0,tm_boss_real_sounds;
Bool tm_boss_real_fail;

U0 TmBossRealSound(I64 sector,I64 sound)
{
  if (sector!=1 || !(0<sound<TM_SND_NUM)) throw('Sound');
  tm_boss_real_sounds++;
  if (tm_boss_real_fail) throw('SoundCB',TRUE);
}

U0 TmBossRealTest()
{
  I64 mode,used,i,episode,map_num,kind,type,dest,speed,flags,heap,exit;
  Bool commercial,caught,keen,res;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Graphics *graphics=CAlloc(sizeof(Graphics));
  TexDef *defs=CAlloc(3*sizeof(TexDef));
  Map *map;
  Line *lines;
  World *world;
  Player player;
  Motion *motion;
  Sectors *sectors;
  Specials *specials;
  Actor *actor,*other;
  Mover *mover,*busy;
  if (!data) throw('Files');
  graphics->tex_cnt=3; graphics->texture=CAlloc(3*sizeof(Texture));
  for (i=0;i<3;i++) graphics->texture[i].def=defs+i;
  MemCpy(defs[0].name,"DEFAULT",8); defs[0].height=128;
  MemCpy(defs[1].name,"LOWONE",7); defs[1].height=24;
  MemCpy(defs[2].name,"LOWTWO",7); defs[2].height=64;
  used=Fs->data_heap->used_u8s;
  for (mode=0;mode<32;mode++) {
    map=RoomsNew(FALSE); map->line[6].special=0;
    map->sector[1].tag=666; map->sector[1].floor=32*65536;
    map->sector[1].ceil=64*65536;
    MemCpy(map->side[0].lower,"LOWONE",7);
    MemCpy(map->side[1].lower,"LOWTWO",7);
    MemCpy(map->sector[0].floor_name,"CHANGE",7);
    map->sector[0].special=9;
    world=WorldNew(map,data); MemSet(&player,0,sizeof(Player));
    player.health=100; motion=MotionNew(world,&player);
    sectors=SectorsNew(motion,graphics); specials=SpecialsNew(sectors);
    actor=WorldSpawn(world,TM_MT_BRUISER,64*65536,0);
    actor->health=0; actor->flags=TM_MF_SOLID|TM_MF_AMBUSH|TM_MF_SHADOW;
    other=WorldSpawn(world,TM_MT_BRUISER,64*65536,64*65536);
    other->active=FALSE; busy=NULL;
    episode=1; map_num=8; commercial=keen=caught=FALSE;
    kind=TM_MOVER_FLOOR; type=TM_FLOOR_LOWEST; dest=0; speed=65536; exit=0;
    tm_boss_real_fail=FALSE; tm_boss_real_sounds=0;
    switch (mode) {
      case 1: episode=2; actor->type=TM_MT_CYBORG; kind=0; exit=1; break;
      case 2: episode=3; actor->type=TM_MT_SPIDER; kind=0; exit=1; break;
      case 3:
	episode=4; map_num=6; actor->type=TM_MT_CYBORG;
	kind=TM_MOVER_DOOR; type=TM_DOOR_BLAZE_OPEN;
	dest=124*65536; speed=8*65536;
	break;
      case 4: episode=4; actor->type=TM_MT_SPIDER; break;
      case 5:
      case 6:
	commercial=TRUE; map_num=7; actor->type=TM_MT_FATSO;
	if (mode==6) {
	  actor->type=TM_MT_BABY; map->sector[1].tag=667;
	  type=TM_FLOOR_TEXTURE; dest=56*65536;
	}
	break;
      case 7:
      case 18:
      case 19:
      case 22:
      case 23:
      case 26:
	keen=TRUE; actor->type=TM_MT_KEEN;
	kind=TM_MOVER_DOOR; type=TM_DOOR_OPEN;
	dest=124*65536; speed=2*65536;
	if (mode==7) motion->player=NULL;
	if (mode==18) {
	  other->type=TM_MT_KEEN; other->active=TRUE; kind=0;
	}
	if (mode==19) {actor->active=FALSE; kind=0;}
	if (mode==22) {actor->world=NULL; kind=0;}
	if (mode==23) tm_boss_real_fail=TRUE;
	if (mode==26) MoverNew(sectors,0,TM_MOVER_PLAT);
	break;
      case 8: actor->type=TM_MT_TROOP; kind=0; break;
      case 9: map_num=7; kind=0; break;
      case 10: other->active=TRUE; kind=0; break;
      case 11: other->active=TRUE; other->health=0; break;
      case 12: other->health=100; break;
      case 13: other->active=TRUE; other->type=TM_MT_TROOP; break;
      case 14: motion->player=NULL; kind=0; break;
      case 15: player.health=0; kind=0; break;
      case 16:
	busy=DoorNew(sectors,1,TM_DOOR_CLOSE,FALSE); kind=0;
	break;
      case 17: map->sector[1].tag=665; kind=0; break;
      case 20: actor->world=NULL; kind=0; break;
      case 21: actor->active=FALSE; kind=0; break;
      case 24:
	episode=2; actor->type=TM_MT_CYBORG; actor->health=100;
	world->exit_rqst=TM_EXIT_SECRET; kind=0; exit=1;
	break;
      case 25: episode=5; actor->type=TM_MT_TROOP; kind=0; exit=1; break;
      case 27: map->line[0].tag=666; break;
      case 28:
	map->line[0].tag=666; kind=TM_MOVER_DOOR;
	type=TM_DOOR_OPEN; dest=124*65536; speed=2*65536;
	break;
      case 29:
      case 30: kind=0; break;
      case 31: type=TM_FLOOR_RAISE_CHANGE; dest=56*65536; break;
    }
    flags=actor->flags;
    if (keen && mode!=19 && mode!=22) flags&=~TM_MF_SOLID;
    lines=MAlloc(map->line_cnt*sizeof(Line));
    MemCpy(lines,map->line,map->line_cnt*sizeof(Line));
    sectors->sound=&TmBossRealSound;
    try {
      res=FALSE;
      if (mode==27) res=FloorTag(sectors,0,TM_FLOOR_LOWEST);
      else if (mode==28) res=DoorTag(sectors,0,TM_DOOR_OPEN);
      else if (mode==29) FloorTagNum(sectors,666,TM_FLOOR_RAISE_CHANGE);
      else if (mode==30) {
	if (DoorTag(sectors,-1,TM_DOOR_OPEN) ||
	      FloorTag(sectors,map->line_cnt,TM_FLOOR_LOWEST)) throw('Line');
      } else if (mode==31)
	res=FloorTagNum(sectors,666,TM_FLOOR_RAISE_CHANGE,0);
      else if (keen) BossKeen(specials,actor);
      else BossDeath(specials,actor,episode,map_num,commercial);
    } catch {
      if (mode==20 || mode==22) {
	if (Fs->except_ch=='World') caught=Fs->catch_except=TRUE;
      } else if (mode==23 && Fs->except_ch=='SoundCB' ||
	    mode==29 && Fs->except_ch=='Line')
	caught=Fs->catch_except=TRUE;
    }
    actor->world=world; tm_boss_real_fail=FALSE;
    if (caught!=!!(mode==20 || mode==22 || mode==23 || mode==29) ||
	  (mode==27 || mode==28 || mode==31) && !res) throw('Guard');
    mover=sectors->area[1].mover;
    if (actor->flags!=flags || world->exit_rqst!=exit ||
	  MemCmp(lines,map->line,map->line_cnt*sizeof(Line))) throw('Atomic');
    if (kind) {
      if (!mover || mover->kind!=kind || mover->type!=type ||
	    mover->high!=dest || mover->speed!=speed) throw('Mover');
      heap=Fs->data_heap->used_u8s;
      for (i=0;i<200 && mover->active;i++) {
	world->tic=i;
	if (kind==TM_MOVER_DOOR) DoorTick(sectors,mover);
	else FloorTick(sectors,mover);
	if (Fs->data_heap->used_u8s!=heap) throw('Alloc');
      }
      if (mover->active || sectors->area[1].mover ||
	    kind==TM_MOVER_DOOR && map->sector[1].ceil!=dest ||
	    kind==TM_MOVER_FLOOR && map->sector[1].floor!=dest) throw('Finish');
      if (mode==31 && (map->sector[1].special!=9 ||
	    MemCmp(map->sector[1].floor_name,"CHANGE",7))) throw('Change');
      MoversSweep(sectors);
    } else if (mover!=busy) throw('Busy');
    Free(lines); SpecialsDel(specials); SectorsDel(sectors);
    MotionDel(motion); WorldDel(world); MapDel(map);
    if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
    tm_boss_real_cases++;
  }
  GraphicsDel(graphics); Free(defs); GameDataDel(data); tm_boss_real_done=1;
  "BOSS 32 REAL CASES BAD 0\n";
}

TmBossRealTest;
