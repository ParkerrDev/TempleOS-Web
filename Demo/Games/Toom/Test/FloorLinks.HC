I64 tm_floor_links_cnt=0,tm_floor_links_done=0;

U0 TmFloorLinksChk(Bool res,U8 *name)
{
  if (!res) {"FLOOR LINKS FAIL %s\n",name; throw('Links');}
  tm_floor_links_cnt++;
}

Sectors *TmFloorLinksNew()
{//A directed three-sector graph; no actors need BSP lookup in this fixture.
  Map *map=RoomsNew(TRUE);
  Sector *sectors=CAlloc(3*sizeof(Sector));
  Side *sides=CAlloc(3*sizeof(Side));
  I64 i;
  MemCpy(sectors,map->sector,2*sizeof(Sector));
  MemCpy(sides,map->side,2*sizeof(Side));
  Free(map->sector); Free(map->side);
  map->sector=sectors; map->side=sides; map->sector_cnt=map->side_cnt=3;
  map->line[0].side[0]=map->line[4].side[0]=map->line[5].side[0]=1;
  map->line[6].side[0]=0; map->line[6].side[1]=1;
  map->line[7].side[0]=1; map->line[7].side[1]=2;
  map->line[8].side[0]=2; map->line[8].side[1]=1;
  for (i=0;i<3;i++) {
    sides[i].sector=i; sectors[i].ceil=128*65536;
    sectors[i].special=7+i; MemCpy(sectors[i].floor_name,"AFLAT",6);
  }
  map->line[0].tag=5; sectors[0].tag=5;
  return SectorsNew(MotionNew(WorldNew(map,NULL)));
}

U0 TmFloorLinksDel(Sectors *sectors)
{
  Motion *motion=sectors->motion;
  World *world=motion->world;
  Map *map=world->map;
  SectorsDel(sectors); MotionDel(motion); WorldDel(world); MapDel(map);
}

Sectors *TmFloorLinksIndex(Sectors *sectors)
{
  Motion *motion=sectors->motion;
  World *world=motion->world;
  Map *map=world->map;
  if (sectors->first) throw('Active');
  SectorsDel(sectors); MotionDel(motion); WorldDel(world);
  return SectorsNew(MotionNew(WorldNew(map,NULL)));
}

U0 TmFloorLinksTest()
{
  Sectors *sectors;
  Map *map;
  Mover *mover;
  I64 mode,i,j,base=-3*65536+17,step,speed,count,expected,used;
  Bool done;
  for (mode=0;mode<2;mode++) {
    sectors=TmFloorLinksNew; map=sectors->motion->world->map;
    for (i=0;i<3;i++) map->sector[i].floor=base;
    step=8*65536; speed=16384;
    if (mode) {step=16*65536; speed=4*65536;}
    used=Fs->data_heap->used_u8s;
    TmFloorLinksChk(FloorStairs(sectors,0,mode),"stairs start");
    TmFloorLinksChk(!FloorStairs(sectors,0,mode),"busy staircase");
    count=3*step/speed+1;
    for (j=0;j<count;j++) {
      sectors->motion->world->tic=j; MoversTick(sectors,&FloorTick);
      for (i=0;i<3;i++) {
	expected=base+MinI64((j+1)*speed,(i+1)*step);
	done=j>=(i+1)*step/speed;
	TmFloorLinksChk(map->sector[i].floor==expected &&
	      !sectors->area[i].mover==done && map->sector[i].special==7+i,
	      "stair tic");
      }
    }
    TmFloorLinksChk(Fs->data_heap->used_u8s==used && !sectors->first,
	  "stair ownership");
    TmFloorLinksDel(sectors);
  }
  sectors=TmFloorLinksNew; map=sectors->motion->world->map;
  map->line[8].side[0]=0; map->line[8].side[1]=2;
  sectors=TmFloorLinksIndex(sectors); MoverNew(sectors,1,99);
  TmFloorLinksChk(FloorStairs(sectors,0) &&
	sectors->area[0].mover->high==8*65536 &&
	sectors->area[1].mover->kind==99 &&
	sectors->area[2].mover->high==24*65536,
	"busy branch retains source step order");
  TmFloorLinksDel(sectors);
  for (mode=0;mode<3;mode++) {
    sectors=TmFloorLinksNew; map=sectors->motion->world->map;
    if (!mode) MemCpy(map->sector[1].floor_name,"BFLAT",6);
    if (mode==1) {map->line[6].side[0]=1; map->line[6].side[1]=0;}
    if (mode==2) map->line[6].flags=0;
    sectors=TmFloorLinksIndex(sectors);
    TmFloorLinksChk(FloorStairs(sectors,0) && sectors->area[0].mover &&
	  !sectors->area[1].mover && !sectors->area[2].mover,
	  "flat, direction and sidedness barriers");
    TmFloorLinksDel(sectors);
  }
  sectors=TmFloorLinksNew; map=sectors->motion->world->map;
  map->line[8].side[1]=0; sectors=TmFloorLinksIndex(sectors);
  TmFloorLinksChk(FloorStairs(sectors,0) &&
	sectors->area[2].mover->high==24*65536 &&
	sectors->last->sector==2 && !sectors->last->next,"stair cycle");
  TmFloorLinksDel(sectors);
  sectors=TmFloorLinksNew; map=sectors->motion->world->map;
  map->line[6].side[1]=2; map->sector[1].tag=5;
  MemCpy(map->sector[1].floor_name,"BFLAT",6);
  sectors=TmFloorLinksIndex(sectors);
  TmFloorLinksChk(FloorStairs(sectors,0) && sectors->area[0].mover &&
	sectors->area[1].mover && sectors->area[2].mover,
	"every tagged root is visited");
  TmFloorLinksDel(sectors);
  for (mode=0;mode<2;mode++) {
    sectors=TmFloorLinksNew; map=sectors->motion->world->map;
    map->sector[0].floor=64*65536+32; map->sector[1].floor=32;
    map->sector[2].floor=32*65536+32;
    MemCpy(map->sector[2].floor_name,"OUTSIDE",8);
    if (mode) {
      map->line[7].side[0]=2; map->line[7].side[1]=1;
      sectors=TmFloorLinksIndex(sectors);
    }
    used=Fs->data_heap->used_u8s;
    TmFloorLinksChk(FloorDonut(sectors,0) && sectors->first->sector==1 &&
	  sectors->last->sector==0 && !sectors->area[2].mover,"donut pair");
    for (j=0;j<65;j++) {
      sectors->motion->world->tic=j; MoversTick(sectors,&FloorTick);
      expected=MinI64((j+1)*32768,32*65536);
      TmFloorLinksChk(map->sector[0].floor==64*65536+32-expected &&
	    map->sector[1].floor==32+expected &&
	    map->sector[2].floor==32*65536+32,
	    "donut tic");
      if (j<64)
	TmFloorLinksChk(map->sector[1].special==8 &&
	      !MemCmp(map->sector[1].floor_name,"AFLAT",6),
	      "donut deferred flat");
    }
    TmFloorLinksChk(!map->sector[1].special &&
	  !MemCmp(map->sector[1].floor_name,"OUTSIDE",8) &&
	  !MemCmp(map->sector[0].floor_name,"AFLAT",6) &&
	  map->sector[0].special==7 &&
	  !sectors->first && Fs->data_heap->used_u8s==used,"donut completion");
    TmFloorLinksDel(sectors);
  }
  for (mode=0;mode<3;mode++) {
    sectors=TmFloorLinksNew; map=sectors->motion->world->map;
    mover=NULL;
    if (!mode) mover=MoverNew(sectors,1,99);
    if (mode==1) map->line[6].flags=0;
    if (mode==2) map->line[7].flags=map->line[8].flags=0;
    TmFloorLinksChk(!FloorDonut(sectors,0) && !sectors->area[0].mover &&
	  !sectors->area[2].mover && sectors->first==mover,
	  "busy or disconnected donut");
    TmFloorLinksDel(sectors);
  }
  tm_floor_links_done=1;
  "FLOOR LINKS %d CASES BAD 0\n",tm_floor_links_cnt;
}

TmFloorLinksTest;
