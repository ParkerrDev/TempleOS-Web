I64 tm_sector_cnt=0,tm_sector_done=0,tm_sector_touches=0,
	tm_sector_touch_mode=0;

U0 TmSectorChk(Bool res,U8 *name)
{
  if (!res) {"SECTOR FAIL %s\n",name; throw('Sector');}
  tm_sector_cnt++;
}

U0 TmSectorTouch(Actor *mover,Actor *other,I64 kind)
{
  World *world=mover->world;
  if (kind!=TM_CONTACT_PICKUP) throw('Touch');
  tm_sector_touches++; other->active=FALSE;
  CollisionCheck(world->collision,-64*65536,0,0,0,0,TM_MF_NOCLIP);
  world->hit_actor=123; world->hit_kind=TM_CONTACT_SOLID;
  if (tm_sector_touch_mode==1) mover->active=FALSE;
  if (tm_sector_touch_mode==2) throw('TouchErr',TRUE);
}

U0 TmSectorThrow(Actor *,I64)
{
  throw('PlaneErr',TRUE);
}

U0 TmSectorSpawn(Actor *actor,I64)
{
  Actor *other=WorldSpawn(actor->world,TM_MT_TROOP,actor->x,actor->y);
  other->height=56*65536; other->health=1000;
}

U0 TmSectorTest()
{
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Motion *motion=MotionNew(world);
  Sectors *sectors;
  Actor *actor,*other,*blood;
  I64 *rows,*q,i,size,old,id,cnt,health,pain,used,mode,expected;
  Bool caught;
  map->line[0].side[0]=map->line[4].side[0]=map->line[5].side[0]=1;
  sectors=SectorsNew(motion);
  TmSectorChk(sectors->area[0].cnt==4 && sectors->area[1].cnt==4 &&
	sectors->area[0].left==0 && sectors->area[1].right==0,"edge index");
  TmSectorChk(SectorOther(sectors,0,6)==1 && SectorOther(sectors,1,6)==0 &&
	SectorOther(sectors,0,1)==-1,"adjacency");
  map->line[6].flags=0;
  TmSectorChk(SectorOther(sectors,0,6)==-1,"one-sided flags");
  map->line[6].flags=4;
  map->side[1].sector=0;
  TmSectorChk(SectorOther(sectors,0,6)==-1,"self reference");
  map->side[1].sector=1;
  rows=FileRead("C:/ORACLE/PLANES.BIN",&size);
  if (!rows || size!=8+rows[0]*7*8) throw('Planes');
  for (i=0,q=rows+1;i<rows[0];i++,q+=7) {
    map->sector[0].floor=0; map->sector[0].ceil=128*65536;
    if (q[0]) map->sector[0].ceil=q[2];
    else map->sector[0].floor=q[2];
    old=SectorMove(sectors,0,q[3],q[4],FALSE,q[0],q[1]);
    expected=map->sector[0].floor;
    if (q[0]) expected=map->sector[0].ceil;
    TmSectorChk(old==q[5] && expected==q[6],"fractional plane");
  }
  Free(rows); map->sector[0].floor=0; map->sector[0].ceil=128*65536;
  actor=WorldSpawn(world,TM_MT_TROOP,64*65536,0);
  actor->height=56*65536; actor->health=1000;
  TmSectorChk(SectorMove(sectors,0,32768,65536,FALSE,FALSE,1)==TM_PLANE_OK &&
	actor->z==32768 && actor->floor==32768,"ground follows floor");
  TmSectorChk(SectorMove(sectors,0,32768,65536,FALSE,FALSE,1)==TM_PLANE_OK &&
	actor->z==65536,"exact destination waits");
  TmSectorChk(SectorMove(sectors,0,32768,65536,FALSE,FALSE,1)==TM_PLANE_PAST &&
	actor->z==65536,"next tic completes");
  actor->z=32*65536;
  TmSectorChk(SectorMove(sectors,0,32768,2*65536,FALSE,FALSE,1)==TM_PLANE_OK &&
	actor->z==32*65536 && actor->floor==98304,"floating floor");
  TmSectorChk(SectorMove(sectors,0,64*65536,64*65536,FALSE,TRUE,-1)==
	TM_PLANE_OK && actor->z==8*65536 && actor->ceil==64*65536,
	"floating ceiling");
  actor->z=actor->floor;
  TmSectorChk(SectorMove(sectors,0,16*65536,0,FALSE,TRUE,-1)==
	TM_PLANE_CRUSHED && map->sector[0].ceil==64*65536 &&
	actor->ceil==64*65536 && actor->health==1000,
	"blocked ceiling rollback");
  TmSectorChk(SectorMove(sectors,0,64*65536,0,FALSE,FALSE,1)==
	TM_PLANE_PAST && map->sector[0].floor==0 && actor->z==0,
	"destination behind direction");
  TmSectorChk(SectorMove(sectors,0,16*65536,64*65536,FALSE,FALSE,1)==
	TM_PLANE_CRUSHED && map->sector[0].floor==0 && actor->floor==0 &&
	actor->z==0,"blocked floor rollback");
  world->tic=1;
  TmSectorChk(SectorMove(sectors,0,16*65536,0,TRUE,TRUE,-1)==
	TM_PLANE_CRUSHED && map->sector[0].ceil==48*65536 &&
	actor->health==1000,
	"crusher between damage tics");
  old=world->random; cnt=world->actor_cnt; world->tic=4;
  expected=old;
  for (i=0;i<6;i++) GameRand(data,&expected);
  TmSectorChk(SectorMove(sectors,0,65536,0,TRUE,TRUE,-1)==
	TM_PLANE_CRUSHED && map->sector[0].ceil==47*65536 &&
	actor->health==990 &&
	world->actor_cnt==cnt+1 && world->random==expected,"crusher cadence");
  blood=WorldActorGet(world,world->last);
  TmSectorChk(blood && blood->type==TM_MT_BLOOD && blood->z==28*65536,
	"crusher blood");
  WorldRemove(world,blood);
  health=actor->health; world->tic=5;
  TmSectorChk(SectorMove(sectors,0,64*65536,46*65536,TRUE,TRUE,-1)==
	TM_PLANE_PAST && map->sector[0].ceil==47*65536 &&
	actor->ceil==47*65536 && actor->health==health,
	"blocked terminal rollback");
  TmSectorChk(SectorMove(sectors,0,65536,128*65536,FALSE,TRUE,1)==TM_PLANE_OK &&
	map->sector[0].ceil==48*65536,"ceiling rises while blocked");
  map->sector[0].floor=10*65536; actor->floor=actor->z=10*65536;
  TmSectorChk(SectorMove(sectors,0,65536,0,TRUE,FALSE,-1)==TM_PLANE_CRUSHED &&
	map->sector[0].floor==10*65536 && actor->z==10*65536,
	"lowering floor obstruction");
  map->sector[0].floor=0; actor->floor=actor->z=0;
  actor->health=0; actor->flags|=TM_MF_CORPSE;
  TmSectorChk(!SectorChange(sectors,0,FALSE) && actor->state==TM_S_GIBS &&
	!actor->radius && !actor->height && !(actor->flags&TM_MF_SOLID),
	"corpse gibs");
  WorldRemove(world,actor);
  other=WorldSpawn(world,TM_MT_CLIP,64*65536,0);
  other->height=64*65536; other->flags|=TM_MF_DROPPED;
  TmSectorChk(!SectorChange(sectors,0,FALSE) && !other->active,"dropped item");
  WorldSweep(world);
  other=WorldSpawn(world,TM_MT_CLIP,64*65536,0); other->height=64*65536;
  TmSectorChk(!SectorChange(sectors,0,FALSE) && other->active,
	"map item remains");
  WorldRemove(world,other);
  actor=WorldSpawn(world,TM_MT_TROOP,64*65536,0); actor->height=56*65536;
  WorldActorUnlink(world,actor); actor->flags|=TM_MF_NOBLOCKMAP;
  TmSectorChk(!SectorChange(sectors,0,FALSE),"unlinked actor ignored");
  actor->flags&=~TM_MF_NOBLOCKMAP; WorldActorLink(world,actor);
  map->sector[0].ceil=128*65536; ActorHeightClip(motion,actor);
  WorldActorUnlink(world,actor); actor->x=-64*65536;
  WorldActorLink(world,actor);
  actor->sector=1; actor->floor=actor->z=0; actor->ceil=128*65536;
  TmSectorChk(SectorMove(sectors,0,96*65536,0,FALSE,TRUE,-1)==TM_PLANE_OK &&
	actor->ceil==128*65536 && actor->z==0,"unaffected neighboring actor");
  map->sector[0].ceil=128*65536;
  WorldActorUnlink(world,actor); actor->x=-8*65536; WorldActorLink(world,actor);
  TmSectorChk(SectorMove(sectors,0,80*65536,0,FALSE,TRUE,-1)==
	TM_PLANE_CRUSHED &&
	map->sector[0].ceil==128*65536,"straddling actor blocks neighbor");
  WorldRemove(world,actor);
  actor=WorldSpawn(world,TM_MT_PLAYER,64*65536,0);
  motion->touch=&TmSectorTouch;
  map->sector[0].floor=7*65536; map->sector[1].floor=-8*65536;
  other=WorldSpawn(world,TM_MT_CLIP,64*65536,0);
  TmSectorChk(WorldPosition(world,actor,64*65536,0,motion->touch) &&
	world->collision->floor==7*65536 && world->collision->sector==0 &&
	world->collision->left==48*65536 && !world->hit_actor &&
	!world->hit_kind && tm_sector_touches==1,"nested contact position");
  WorldSweep(world);
  for (mode=1;mode<=2;mode++) {
    actor->active=TRUE; actor->floor=actor->z=7*65536;
    other=WorldSpawn(world,TM_MT_CLIP,64*65536,0);
    other=WorldSpawn(world,TM_MT_CLIP,64*65536,0);
    tm_sector_touch_mode=mode; old=tm_sector_touches; caught=FALSE;
    if (mode==1) {
      TmSectorChk(!WorldPosition(world,actor,64*65536,0,motion->touch) &&
	    !actor->active && tm_sector_touches==old+1,"retired mover stops");
      actor->active=TRUE;
    } else {
      used=Fs->data_heap->used_u8s;
      try {
	SectorMove(sectors,0,65536,8*65536,FALSE,FALSE,1);
      } catch {
	if (Fs->except_ch=='TouchErr') {caught=TRUE; Fs->catch_except=TRUE;}
      }
      TmSectorChk(caught && map->sector[0].floor==7*65536 &&
	    actor->floor==7*65536 && actor->z==7*65536 &&
	    Fs->data_heap->used_u8s==used,"contact throw rollback");
    }
    id=world->first;
    while (other=WorldActorGet(world,id,FALSE)) {
      id=other->tick_next;
      if (other!=actor) other->active=FALSE;
    }
    WorldSweep(world);
  }
  motion->touch=NULL; WorldRemove(world,actor);
  map->sector[0].floor=0; map->sector[0].ceil=64*65536;
  actor=WorldSpawn(world,TM_MT_TROOP,64*65536,0); actor->height=56*65536;
  actor->health=1000; pain=data->info[TM_MT_TROOP].pain;
  data->info[TM_MT_TROOP].pain_chance=256; data->info[TM_MT_TROOP].pain=pain+1;
  motion->action=&TmSectorThrow; world->tic=8; caught=FALSE;
  used=Fs->data_heap->used_u8s;
  try {
    SectorMove(sectors,0,16*65536,0,TRUE,TRUE,-1);
  } catch {
    if (Fs->except_ch=='PlaneErr') {caught=TRUE; Fs->catch_except=TRUE;}
  }
  TmSectorChk(caught && map->sector[0].ceil==64*65536 &&
	actor->ceil==64*65536 && actor->floor==0 && actor->z==0 &&
	Fs->data_heap->used_u8s==used,"action throw rollback");
  motion->action=&TmSectorSpawn; actor->health=1000;
  cnt=world->actor_cnt;
  TmSectorChk(SectorMove(sectors,0,16*65536,0,TRUE,TRUE,-1)==
	TM_PLANE_CRUSHED && actor->health==990 && world->actor_cnt==cnt+2,
	"new thinkers wait");
  other=WorldActorGet(world,actor->tick_next);
  TmSectorChk(other && other->health==1000 && other->type==TM_MT_TROOP,
	"new thinker remains undamaged");
  data->info[TM_MT_TROOP].pain=pain;
  SectorsDel(sectors); MotionDel(motion); WorldDel(world); MapDel(map);
  GameDataDel(data); tm_sector_done=1;
  "SECTOR %d CASES BAD 0\n",tm_sector_cnt;
}

TmSectorTest;
