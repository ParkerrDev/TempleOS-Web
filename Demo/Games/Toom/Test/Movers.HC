I64 tm_movers_done=0,tm_movers_tics=0,tm_movers_sounds=0,tm_movers_sound=0;

U0 TmMoversSnd(I64 sector,I64 n)
{
  if (sector || !(n==TM_SFX_STNMOV || n==TM_SFX_PSTART || n==TM_SFX_PSTOP))
    throw('Sound');
  tm_movers_sounds++; tm_movers_sound=n;
}

U0 TmMoversTick(Sectors *sectors,Mover *mover)
{
  if (mover->kind==TM_MOVER_PLAT) PlatTick(sectors,mover);
  else CeilTick(sectors,mover);
}

U0 TmMoversMany(GameData *data)
{
  Map *map=RoomsNew(FALSE);
  World *world;
  Motion *motion;
  Sectors *sectors;
  Mover *mover;
  I64 i,cnt,used;
  Free(map->sector); map->sector_cnt=64;
  map->sector=CAlloc(64*sizeof(Sector)); map->line[0].tag=7;
  for (i=0;i<64;i++) {map->sector[i].ceil=128*65536; map->sector[i].tag=7;}
  world=WorldNew(map,data); motion=MotionNew(world); sectors=SectorsNew(motion);
  used=Fs->data_heap->used_u8s;
  for (i=0;i<64;i++) {
    if (i&1) mover=CeilNew(sectors,i,TM_CEIL_CRUSH_RAISE);
    else mover=PlatNew(sectors,i,TM_PLAT_PERPETUAL);
    if (!mover || sectors->area[i].mover!=mover) throw('Many');
  }
  if (!PlatStop(sectors,0) || !CeilStop(sectors,0)) throw('ManyStop');
  for (i=0;i<64;i++) {
    mover=sectors->area[i].mover;
    if (i&1) {if (mover->direction) throw('ManyCeil');}
    else if (mover->direction!=TM_PLAT_STASIS) throw('ManyPlat');
  }
  if (!PlatTag(sectors,0,TM_PLAT_PERPETUAL) ||
	!CeilTag(sectors,0,TM_CEIL_CRUSH_RAISE)) throw('ManyRun');
  MoversTick(sectors,&TmMoversTick);
  cnt=0;
  for (mover=sectors->first;mover;mover=mover->next) {
    cnt++;
    if (mover->kind==TM_MOVER_PLAT) {
      if (mover->direction || mover->delay!=105) throw('ManyWait');
    } else if (map->sector[mover->sector].ceil!=127*65536) throw('ManyMove');
    MoverFinish(sectors,mover);
  }
  MoversSweep(sectors);
  if (cnt!=64 || sectors->first || Fs->data_heap->used_u8s!=used)
    throw('ManyFree');
  SectorsDel(sectors); MotionDel(motion); WorldDel(world); MapDel(map);
}

U0 TmMoversTest()
{
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world;
  Motion *motion;
  Sectors *sectors;
  Mover *mover;
  Actor *actor;
  I64 *rows,*q,size,i,j,kind,type,count,value,used,direction,speed,health;
  Bool res;
  map->line[0].side[0]=map->line[4].side[0]=map->line[5].side[0]=1;
  map->line[0].tag=map->sector[0].tag=5;
  world=WorldNew(map,data); motion=MotionNew(world);
  sectors=SectorsNew(motion); sectors->sound=&TmMoversSnd;
  rows=FileRead("C:/ORACLE/MOVERS.BIN",&size); q=rows;
  if (!rows) throw('Movers');
  for (i=0;i<11;i++) {
    kind=*q++; type=*q++; count=*q++;
    map->sector[0].floor=0; map->sector[1].floor=0;
    map->sector[0].ceil=128*65536; map->sector[1].ceil=192*65536;
    map->sector[0].special=7; world->random=0;
    MemCpy(map->sector[0].floor_name,"OWNFLR",7);
    MemCpy(map->sector[1].floor_name,"NBRFLR",7);
    tm_movers_sounds=tm_movers_sound=0; used=Fs->data_heap->used_u8s;
    if (kind==TM_MOVER_PLAT) {
      map->sector[0].floor=32*65536;
      if (type==TM_PLAT_NEAREST_CHANGE) map->sector[1].floor=64*65536;
      mover=PlatNew(sectors,0,type,0,24);
      if (type==TM_PLAT_RAISE_CHANGE || type==TM_PLAT_NEAREST_CHANGE)
	if (MemCmp(map->sector[0].floor_name,"NBRFLR",7)) throw('Flat');
      if (type==TM_PLAT_NEAREST_CHANGE && map->sector[0].special)
	throw('Special');
    } else mover=CeilNew(sectors,0,type);
    if (!mover) throw('Start');
    for (j=0;j<count;j++,q+=7) {
      world->tic=j; MoversTick(sectors,&TmMoversTick);
      mover=sectors->area[0].mover; value=map->sector[0].ceil;
      if (kind==TM_MOVER_PLAT) value=map->sector[0].floor;
      res=value==q[0] && !mover==!q[1] &&
	    tm_movers_sounds==q[5] && tm_movers_sound==q[6];
      if (mover) res=res && mover->direction==q[2] &&
	    mover->delay==q[3] && mover->speed==q[4];
      if (!res) {
	"MOVER %d TYPE %d TIC %d HEIGHT %d/%d SOUND %d/%d LAST %d/%d\n",
	      kind,type,j,value,q[0],tm_movers_sounds,q[5],tm_movers_sound,q[6];
	throw('Timeline');
      }
      tm_movers_tics++;
    }
    if (mover) {MoverFinish(sectors,mover); MoversSweep(sectors);}
    if (Fs->data_heap->used_u8s!=used) throw('Owner');
  }
  if (q(U8 *)-rows(U8 *)!=size) throw('Rows');
  map->sector[0].floor=32*65536; map->sector[1].floor=0;
  map->sector[0].ceil=map->sector[1].ceil=128*65536;
  world->random=0; mover=PlatNew(sectors,0,TM_PLAT_PERPETUAL);
  MoversTick(sectors,&TmMoversTick);
  if (mover->direction || mover->delay!=105 || world->random!=1)
    throw('Wait');
  if (!PlatStop(sectors,0) || PlatStop(sectors,0)) throw('Stop');
  value=map->sector[0].floor;
  for (i=0;i<100;i++) MoversTick(sectors,&TmMoversTick);
  if (map->sector[0].floor!=value || mover->delay!=105 ||
	mover->direction!=TM_PLAT_STASIS) throw('Stasis');
  if (!PlatTag(sectors,0,TM_PLAT_PERPETUAL) || mover->direction ||
	world->random!=1) throw('Resume');
  MoversTick(sectors,&TmMoversTick);
  if (mover->delay!=104 || map->sector[0].floor!=value) throw('WaitSave');
  MoverFinish(sectors,mover); MoversSweep(sectors);
  map->sector[0].floor=0; map->sector[0].ceil=56*65536;
  actor=WorldSpawn(world,TM_MT_TROOP,64*65536,0);
  actor->height=56*65536; actor->health=1000;
  mover=PlatNew(sectors,0,TM_PLAT_RAISE_CHANGE,0,24);
  for (i=0;i<3;i++) MoversTick(sectors,&TmMoversTick);
  if (mover->direction!=1 || mover->delay || map->sector[0].floor ||
	actor->health!=1000) throw('ZeroWait');
  WorldRemove(world,actor);
  for (i=0;i<49;i++) MoversTick(sectors,&TmMoversTick);
  if (sectors->area[0].mover || map->sector[0].floor!=24*65536)
    throw('ZeroRise');
  for (type=TM_CEIL_LOWER_CRUSH;type<=TM_CEIL_SILENT;type++) {
    map->sector[0].floor=0; map->sector[0].ceil=64*65536;
    actor=WorldSpawn(world,TM_MT_TROOP,64*65536,0);
    actor->height=56*65536; actor->health=1000;
    mover=CeilNew(sectors,0,type); count=9;
    if (type==TM_CEIL_FAST) count=5;
    for (i=0;i<count;i++) {world->tic=i; MoversTick(sectors,&TmMoversTick);}
    health=990; value=55*65536; speed=8192;
    if (type==TM_CEIL_LOWER_CRUSH) {health=1000; value=56*65536;}
    if (type==TM_CEIL_FAST) {value=54*65536; speed=2*65536;}
    if (actor->health!=health || map->sector[0].ceil!=value ||
	  mover->speed!=speed) throw('Crush');
    direction=mover->direction;
    if (!CeilStop(sectors,0) || CeilStop(sectors,0)) throw('CeilStop');
    for (i=0;i<30;i++) MoversTick(sectors,&TmMoversTick);
    if (map->sector[0].ceil!=value || actor->health!=health) throw('CeilWait');
    if (!CeilTag(sectors,0,TM_CEIL_CRUSH_RAISE) ||
	  mover->direction!=direction || mover->speed!=speed) throw('CeilRun');
    WorldRemove(world,actor);
    if (type==TM_CEIL_CRUSH_RAISE || type==TM_CEIL_SILENT) {
      for (i=0;i<377;i++) MoversTick(sectors,&TmMoversTick);
      if (mover->direction!=1 || mover->speed!=65536 ||
	    map->sector[0].ceil!=8*65536) throw('SpeedRst');
    }
    MoverFinish(sectors,mover); MoversSweep(sectors);
  }
  map->line[6].flags=0; map->sector[0].ceil=-64*65536;
  if (SectorCeilMax(sectors,0)!= -64*65536) throw('Isolated');
  map->line[6].flags=4; map->sector[1].ceil=-32*65536;
  if (SectorCeilMax(sectors,0)!= -32*65536) throw('Negative');
  Free(rows); SectorsDel(sectors); MotionDel(motion); WorldDel(world);
  MapDel(map); TmMoversMany(data); GameDataDel(data); tm_movers_done=1;
  "MOVERS %d TICS BAD 0\n",tm_movers_tics;
}

TmMoversTest;
