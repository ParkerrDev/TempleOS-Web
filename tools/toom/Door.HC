I64 tm_door_cnt=0,tm_door_done=0,tm_door_sounds=0,tm_door_sound=0,
	tm_door_key=-1,tm_door_oof=0,tm_door_actions=0,tm_door_mode=0;
I64 tm_door_special[10]={1,26,27,28,31,32,33,34,117,118};
I64 tm_door_keys[10]={-1,0,1,2,-1,0,2,1,-1,-1};
I64 tm_door_locked[6]={99,133,134,135,136,137};
I64 tm_door_locked_keys[6]={0,0,2,2,1,1};

U0 TmDoorChk(Bool res,U8 *name)
{
  if (!res) {"DOOR FAIL %s\n",name; throw('Door');}
  tm_door_cnt++;
}

U0 TmDoorSnd(I64 sector,I64 n)
{
  if (!(0<=sector<2)) throw('Sound');
  tm_door_sounds++; tm_door_sound=n;
}

U0 TmDoorKey(Actor *actor,I64 key)
{
  if (actor->type!=TM_MT_PLAYER) throw('KeyActor');
  tm_door_key=key;
}

U0 TmDoorOof(Actor *,I64 n)
{
  if (n!=TM_SFX_OOF) throw('Oof');
  tm_door_oof++;
}

U0 TmDoorQueue(Sectors *sectors,Mover *mover)
{
  I64 sector=mover->sector;
  tm_door_actions++;
  if (tm_door_mode==2) MoverFinish(sectors,sectors->last);
  MoverFinish(sectors,mover);
  if (!tm_door_mode && !sector) DoorNew(sectors,0,TM_DOOR_OPEN);
  if (tm_door_mode==3) throw('QueueErr',TRUE);
}

U0 TmDoorTest()
{
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world;
  Player *player=CAlloc(sizeof(Player));
  Motion *motion;
  Sectors *sectors;
  Mover *mover;
  Actor *actor,*monster;
  I64 i,j,type,count,used,size,*rows,*q,mask,key,stay,expected,high;
  Bool res,caught;
  map->line[0].side[0]=map->line[4].side[0]=map->line[5].side[0]=1;
  world=WorldNew(map,data); motion=MotionNew(world,player);
  sectors=SectorsNew(motion); sectors->sound=&TmDoorSnd;
  sectors->key_rqst=&TmDoorKey; motion->sound=&TmDoorOof;
  rows=FileRead("C:/ORACLE/DOORS.BIN",&size); q=rows;
  if (!rows) throw('Doors');
  for (i=0;i<8;i++) {
    type=*q++; map->sector[0].ceil=*q++; count=*q++;
    map->sector[1].ceil=132*65536;
    tm_door_sounds=tm_door_sound=0;
    used=Fs->data_heap->used_u8s;
    mover=DoorNew(sectors,0,type);
    if (!mover) throw('Start');
    for (j=0;j<count;j++,q+=7) {
      MoversTick(sectors,&DoorTick); mover=sectors->area[0].mover;
      res=map->sector[0].ceil==q[0] && !mover==!q[1] &&
	    tm_door_sounds==q[5] && tm_door_sound==q[6];
      if (mover)
	res=res && mover->type==q[2] && mover->direction==q[3] &&
	      mover->delay==q[4];
      if (!res) {
	"TYPE %d TIC %d HEIGHT %d/%d SOUNDS %d/%d LAST %d/%d\n",
	      type,j,map->sector[0].ceil,q[0],tm_door_sounds,q[5],
	      tm_door_sound,q[6];
	if (mover) "MOVE %d/%d %d/%d %d/%d\n",mover->type,q[2],
	      mover->direction,q[3],mover->delay,q[4];
      }
      TmDoorChk(res,"timeline");
    }
    TmDoorChk(!sectors->first && !sectors->last &&
	  Fs->data_heap->used_u8s==used,"completed ownership");
  }
  TmDoorChk(q(U8 *)-rows(U8 *)==size,"timeline file"); Free(rows);
  map->sector[0].ceil=128*65536; map->sector[1].ceil=0;
  actor=WorldSpawn(world,TM_MT_PLAYER,64*65536,0); world->player=actor->id;
  monster=WorldSpawn(world,TM_MT_TROOP,64*65536,64*65536);
  for (i=0;i<10;i++)
    for (mask=0;mask<64;mask++) {
      map->line[6].special=tm_door_special[i]; key=tm_door_keys[i];
      stay=31<=tm_door_special[i]<=34 || tm_door_special[i]==118;
      for (j=0;j<6;j++) player->card[j]=Bt(&mask,j);
      expected=key<0 || Bt(&mask,key) || Bt(&mask,key+3);
      tm_door_sounds=tm_door_oof=0; tm_door_key=-1;
      res=DoorUse(sectors,actor,6,0); mover=sectors->area[1].mover;
      TmDoorChk(res==expected && !mover==!expected,"manual key matrix");
      if (expected) {
	type=TM_DOOR_RAISE;
	if (stay) type=TM_DOOR_OPEN;
	if (i==8) type=TM_DOOR_BLAZE_RAISE;
	if (i==9) type=TM_DOOR_BLAZE_OPEN;
	TmDoorChk(mover->type==type && mover->high==124*65536 &&
	      tm_door_sounds==1 && !tm_door_oof && tm_door_key==-1 &&
	      !map->line[6].special==stay,"manual key success");
	MoverFinish(sectors,mover); MoversSweep(sectors);
      } else
	TmDoorChk(!tm_door_sounds && tm_door_oof==1 && tm_door_key==key &&
	      map->line[6].special==tm_door_special[i],"manual key refusal");
    }
  MemSet(player->card,0,TM_CARD_NUM);
  map->line[6].special=1;
  TmDoorChk(!DoorUse(sectors,actor,6,1) && !sectors->first,"back side");
  TmDoorChk(DoorUse(sectors,monster,6,0),"monster opens");
  mover=sectors->area[1].mover;
  TmDoorChk(!DoorUse(sectors,monster,6,0) && mover->direction==1,
	"monster cannot close");
  TmDoorChk(DoorUse(sectors,actor,6,0) && mover->direction==-1,
	"player closes");
  TmDoorChk(DoorUse(sectors,monster,6,0) && mover->direction==1,
	"monster reopens");
  MoverFinish(sectors,mover); MoversSweep(sectors);
  for (i=1;i<8;i++)
    if (tm_door_keys[i]>=0) {
      map->line[6].special=tm_door_special[i];
      TmDoorChk(!DoorUse(sectors,monster,6,0) && !sectors->first,
	    "monster locked");
    }
  for (i=0;i<3;i++) {
    map->line[6].special=31;
    if (i) map->line[6].special=116+i;
    TmDoorChk(!DoorUse(sectors,monster,6,0) && !sectors->first,
	  "monster manual restrictions");
  }
  map->line[6].special=1; map->line[6].flags|=32;
  TmDoorChk(!DoorUse(sectors,monster,6,0),"monster secret door");
  TmDoorChk(DoorUse(sectors,actor,6,0),"player secret door");
  MoverFinish(sectors,sectors->area[1].mover); MoversSweep(sectors);
  map->line[6].flags&=~32;
  map->line[6].special=1; mover=MoverNew(sectors,1,99);
  TmDoorChk(!DoorUse(sectors,actor,6,0) && mover->kind==99,"busy non-door");
  MoverFinish(sectors,mover); MoversSweep(sectors);
  map->line[6].tag=7; map->sector[0].tag=map->sector[1].tag=7;
  TmDoorChk(DoorTag(sectors,6,TM_DOOR_OPEN) && sectors->area[0].mover &&
	sectors->area[1].mover && !DoorTag(sectors,6,TM_DOOR_CLOSE),
	"tagged doors");
  MoverFinish(sectors,sectors->area[0].mover);
  MoverFinish(sectors,sectors->area[1].mover); MoversSweep(sectors);
  map->sector[0].tag=0;
  for (i=0;i<6;i++)
    for (mask=0;mask<64;mask++) {
      map->line[6].special=tm_door_locked[i]; key=tm_door_locked_keys[i];
      for (j=0;j<6;j++) player->card[j]=Bt(&mask,j);
      expected=Bt(&mask,key) || Bt(&mask,key+3);
      tm_door_key=-1; tm_door_oof=0;
      res=DoorLocked(sectors,actor,6,TM_DOOR_BLAZE_OPEN);
      mover=sectors->area[1].mover;
      TmDoorChk(res==expected && !mover==!expected,
	    "remote key matrix");
      if (mover) {
	TmDoorChk(mover->type==TM_DOOR_BLAZE_OPEN && !sectors->area[0].mover &&
	      !tm_door_oof && tm_door_key==-1,"remote target");
	MoverFinish(sectors,mover); MoversSweep(sectors);
      } else
	TmDoorChk(tm_door_key==key && tm_door_oof==1,"remote key refusal");
    }
  TmDoorChk(!DoorLocked(sectors,monster,6,TM_DOOR_BLAZE_OPEN),
	"monster remote key");
  WorldRemove(world,actor); WorldRemove(world,monster);
  for (i=0;i<4;i++) {
    type=TM_DOOR_RAISE;
    if (i==1) type=TM_DOOR_CLOSE;
    if (i==2) type=TM_DOOR_BLAZE_RAISE;
    if (i==3) type=TM_DOOR_BLAZE_CLOSE;
    map->sector[1].ceil=64*65536;
    monster=WorldSpawn(world,TM_MT_TROOP,-64*65536,0);
    monster->height=56*65536; high=monster->health;
    mover=DoorNew(sectors,1,type); mover->direction=-1;
    count=5;
    if (i>=2) count=2;
    for (j=0;j<count;j++) MoversTick(sectors,&DoorTick);
    expected=1;
    if (i&1) expected=-1;
    TmDoorChk(mover->direction==expected && map->sector[1].ceil==56*65536 &&
	  monster->health==high,"closing obstruction");
    if (!(i&1)) TmDoorChk(tm_door_sound==TM_SFX_DOROPN,"reopening sound");
    WorldRemove(world,monster); MoverFinish(sectors,mover);
    MoversSweep(sectors);
  }
  map->sector[1].ceil=128*65536; map->sector[1].special=10;
  tm_door_sounds=0; DoorTimersInit(sectors); mover=sectors->area[1].mover;
  TmDoorChk(mover && !mover->direction && mover->delay==1050 &&
	mover->high==128*65536 && mover->wait==150 &&
	!map->sector[1].special && !tm_door_sounds,"thirty second timer");
  for (i=0;i<1049;i++) MoversTick(sectors,&DoorTick);
  TmDoorChk(mover->direction==0 && map->sector[1].ceil==128*65536 &&
	!tm_door_sounds,"timer before boundary");
  MoversTick(sectors,&DoorTick);
  TmDoorChk(mover->direction==-1 && tm_door_sounds==1 &&
	map->sector[1].ceil==128*65536,"timer boundary");
  MoversTick(sectors,&DoorTick);
  TmDoorChk(map->sector[1].ceil==126*65536,"timer starts motion next tic");
  monster=WorldSpawn(world,TM_MT_TROOP,-64*65536,0);
  monster->height=56*65536;
  for (i=0;i<36;i++) MoversTick(sectors,&DoorTick);
  TmDoorChk(mover->direction==1 && map->sector[1].ceil==56*65536 &&
	mover->high==128*65536,"delayed door obstruction");
  WorldRemove(world,monster);
  for (i=0;i<37;i++) MoversTick(sectors,&DoorTick);
  TmDoorChk(mover->direction==0 && mover->delay==150 &&
	map->sector[1].ceil==128*65536,"delayed door returns to top");
  MoverFinish(sectors,mover); MoversSweep(sectors);
  map->sector[1].ceil=0; map->sector[1].special=14;
  DoorTimersInit(sectors); mover=sectors->area[1].mover;
  TmDoorChk(mover && mover->direction==2 && mover->delay==10500 &&
	mover->high==124*65536 && !map->sector[1].special,"five minute timer");
  MoverFinish(sectors,mover); MoversSweep(sectors);
  map->line[6].flags=0; map->sector[1].ceil=80*65536;
  mover=DoorNew(sectors,1,TM_DOOR_OPEN);
  TmDoorChk(mover->high==80*65536,"isolated sector height");
  MoversTick(sectors,&DoorTick);
  TmDoorChk(!sectors->area[1].mover && map->sector[1].ceil==80*65536,
	"isolated door completes");
  map->line[6].flags=4; used=Fs->data_heap->used_u8s;
  DoorNew(sectors,0,TM_DOOR_OPEN); DoorNew(sectors,1,TM_DOOR_OPEN);
  tm_door_mode=0; tm_door_actions=0; MoversTick(sectors,&TmDoorQueue);
  TmDoorChk(tm_door_actions==2 && sectors->first==sectors->last &&
	sectors->area[0].mover==sectors->first && !sectors->area[1].mover,
	"new controller waits");
  tm_door_mode=1; MoversTick(sectors,&TmDoorQueue);
  TmDoorChk(tm_door_actions==3 && !sectors->first &&
	Fs->data_heap->used_u8s==used,"new controller next tic");
  DoorNew(sectors,0,TM_DOOR_OPEN); DoorNew(sectors,1,TM_DOOR_OPEN);
  tm_door_mode=2; tm_door_actions=0; MoversTick(sectors,&TmDoorQueue);
  TmDoorChk(tm_door_actions==1 && !sectors->first &&
	Fs->data_heap->used_u8s==used,"retired controller skipped");
  DoorNew(sectors,0,TM_DOOR_OPEN); tm_door_mode=3; caught=FALSE;
  try {
    MoversTick(sectors,&TmDoorQueue);
  } catch {
    if (Fs->except_ch=='QueueErr') {caught=TRUE; Fs->catch_except=TRUE;}
  }
  TmDoorChk(caught && !sectors->first && !sectors->area[0].mover &&
	Fs->data_heap->used_u8s==used,"controller exception cleanup");
  DoorNew(sectors,0,TM_DOOR_OPEN); DoorNew(sectors,1,TM_DOOR_OPEN);
  SectorsDel(sectors); MotionDel(motion); WorldDel(world); MapDel(map);
  Free(player); GameDataDel(data); tm_door_done=1;
  "DOOR %d CASES BAD 0\n",tm_door_cnt;
}

TmDoorTest;
