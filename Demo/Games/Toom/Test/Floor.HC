I64 tm_floor_cnt=0,tm_floor_tics=0,tm_floor_done=0,tm_floor_sounds=0,
	tm_floor_sound=0;

U0 TmFloorSnd(I64 sector,I64 n)
{
  if (sector || !(n==TM_SFX_STNMOV || n==TM_SFX_PSTOP)) throw('Sound');
  tm_floor_sounds++; tm_floor_sound=n;
}

U0 TmFloorTest()
{
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  Graphics *graphics=CAlloc(sizeof(Graphics));
  World *world;
  Motion *motion;
  Sectors *sectors;
  Mover *mover;
  Actor *actor;
  TexDef *defs=CAlloc(3*sizeof(TexDef));
  I64 *rows,*q,size,i,j,used,expected,travel,sounds;
  Bool caught,crush,done;
  map->line[0].side[0]=map->line[4].side[0]=map->line[5].side[0]=1;
  MemCpy(map->side[0].lower,"LOWONE",7);
  MemCpy(map->side[1].lower,"LOWTWO",7);
  graphics->tex_cnt=3; graphics->texture=CAlloc(3*sizeof(Texture));
  for (i=0;i<3;i++) graphics->texture[i].def=defs+i;
  MemCpy(defs[0].name,"DEFAULT",8); defs[0].height=128;
  MemCpy(defs[1].name,"LOWONE",7); defs[1].height=24;
  MemCpy(defs[2].name,"LOWTWO",7); defs[2].height=64;
  world=WorldNew(map,data); motion=MotionNew(world);
  sectors=SectorsNew(motion,graphics); sectors->sound=&TmFloorSnd;
  rows=FileRead("C:/ORACLE/FLOORS.BIN",&size);
  if (!rows || size!=8+rows[0]*10*8) throw('Floors');
  for (i=0,q=rows+1;i<rows[0];i++,q+=10) {
    map->sector[0].floor=q[1]; map->sector[1].floor=q[2];
    map->sector[0].ceil=q[3]; map->sector[1].ceil=q[4];
    map->sector[0].special=7; map->sector[1].special=9;
    MemCpy(map->sector[0].floor_name,"OWNFLR",7);
    MemCpy(map->sector[1].floor_name,"NBRFLR",7);
    used=Fs->data_heap->used_u8s; tm_floor_sounds=tm_floor_sound=0;
    mover=FloorNew(sectors,0,q[0],0); crush=q[0]==TM_FLOOR_CRUSH;
    if (!mover || mover->kind!=TM_MOVER_FLOOR || mover->type!=q[0] ||
	  mover->direction!=q[5] || mover->speed!=q[6] || mover->high!=q[7] ||
	  mover->crush!=crush) throw('Preset');
    expected=7;
    if (q[0]==TM_FLOOR_RAISE_CHANGE) expected=9;
    if (map->sector[0].special!=expected) throw('EarlyTex');
    travel=q[5]*(q[7]-q[1]);
    for (j=0;j<q[8];j++) {
      world->tic=j; MoversTick(sectors,&FloorTick); done=j+1==q[8];
      expected=q[1]+q[5]*MinI64((j+1)*q[6],travel);
      if (map->sector[0].floor!=expected ||
	    !sectors->area[0].mover!=done) throw('FloorTic');
      sounds=j/8+1;
      if (j+1==q[8]) sounds++;
      if (tm_floor_sounds!=sounds) throw('SoundTic');
      tm_floor_tics++;
    }
    expected=7;
    if (q[9]) expected=9;
    if (map->sector[0].special!=expected || tm_floor_sound!=TM_SFX_PSTOP ||
	  sectors->first || sectors->last || Fs->data_heap->used_u8s!=used)
      throw('Finish');
    if (q[9]) {
      if (MemCmp(map->sector[0].floor_name,"NBRFLR",7)) throw('Flat');
    } else if (MemCmp(map->sector[0].floor_name,"OWNFLR",7)) throw('Flat');
    tm_floor_cnt++;
  }
  map->line[6].flags=0; map->sector[0].floor=-1024*65536;
  if (SectorFloorMax(sectors,0)!=map->sector[0].floor ||
	SectorFloorNext(sectors,0)!=map->sector[0].floor ||
	SectorLowerTex(sectors,0)) throw('Isolated');
  map->line[6].flags=4; map->sector[1].floor=-800*65536;
  if (SectorFloorMax(sectors,0)!= -800*65536) throw('Negative');
  MemSet(map->side[0].lower,0,8); *map->side[0].lower='-';
  if (SectorLowerTex(sectors,0)!=64*65536) throw('Default');
  MemSet(map->side[1].lower,0,8); *map->side[1].lower='-';
  if (SectorLowerTex(sectors,0)!=128*65536) throw('Default');
  sectors->graphics=NULL; caught=FALSE;
  try {
    FloorNew(sectors,0,TM_FLOOR_TEXTURE);
  } catch {
    if (Fs->except_ch=='Texture') {caught=TRUE; Fs->catch_except=TRUE;}
  }
  if (!caught || sectors->first || sectors->area[0].mover) throw('Texture');
  sectors->graphics=graphics;
  map->line[0].tag=99; map->sector[0].tag=99; map->sector[1].tag=0;
  if (!FloorTag(sectors,0,TM_FLOOR_RAISE_24) || sectors->area[1].mover ||
	FloorTag(sectors,0,TM_FLOOR_LOWEST)) throw('Tag');
  MoverFinish(sectors,sectors->area[0].mover); MoversSweep(sectors);
  if (graphics->cache_size || graphics->texture[0].image ||
	graphics->texture[1].image ||
	graphics->texture[2].image) throw('Decode');
  map->sector[0].floor=map->sector[1].floor=0;
  map->sector[0].ceil=map->sector[1].ceil=64*65536;
  actor=WorldSpawn(world,TM_MT_TROOP,64*65536,0);
  actor->height=56*65536; actor->health=1000;
  mover=FloorNew(sectors,0,TM_FLOOR_CRUSH);
  for (i=0;i<9;i++) {world->tic=i; MoversTick(sectors,&FloorTick);}
  if (map->sector[0].floor!=9*65536 || actor->z!=9*65536 ||
	actor->health!=990 || world->actor_cnt!=2 || !mover->active)
    throw('Crush');
  world->tic=9; MoversTick(sectors,&FloorTick);
  if (actor->health!=990 || map->sector[0].floor!=10*65536) throw('Cadence');
  MoverFinish(sectors,mover); MoversSweep(sectors); WorldRemove(world,actor);
  map->sector[0].floor=0;
  actor=WorldSpawn(world,TM_MT_TROOP,64*65536,0);
  actor->height=56*65536; actor->health=1000;
  mover=FloorNew(sectors,0,TM_FLOOR_RAISE);
  for (i=0;i<10;i++) {world->tic=i; MoversTick(sectors,&FloorTick);}
  if (map->sector[0].floor!=8*65536 || actor->floor!=8*65536 ||
	actor->health!=1000 || !mover->active) throw('Block');
  WorldRemove(world,actor);
  for (i=0;i<57;i++) MoversTick(sectors,&FloorTick);
  if (sectors->area[0].mover || map->sector[0].floor!=64*65536)
    throw('Resume');
  Free(rows); SectorsDel(sectors); MotionDel(motion); WorldDel(world);
  MapDel(map); GraphicsDel(graphics); Free(defs); GameDataDel(data);
  tm_floor_done=1;
  "FLOOR %d CASES %d TICS BAD 0\n",tm_floor_cnt,tm_floor_tics;
}

TmFloorTest;
