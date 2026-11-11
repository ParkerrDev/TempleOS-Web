I64 tm_teleport_cnt=0,tm_teleport_done=0,tm_teleport_sounds=0,
	tm_teleport_mode=0,tm_teleport_actions=0;
Motion *tm_teleport_motion;
Actor *tm_teleport_source;

U0 TmTeleportSound(Actor *actor,I64 n)
{
  if (n!=TM_SFX_TELEPT || actor->type!=TM_MT_TFOG) throw('Sound');
  tm_teleport_sounds++;
}

U0 TmTeleportAction(Actor *actor,I64)
{
  World *world=tm_teleport_motion->world;
  tm_teleport_actions++;
  WorldPosition(world,actor,-64*65536,0);
  if (tm_teleport_mode==1) throw('TeleErr',TRUE);
  if (tm_teleport_mode==2) tm_teleport_source->active=FALSE;
}

U0 TmTeleportGrid(GameData *data)
{
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Player player;
  Motion *motion=MotionNew(world,&player);
  Actor *source,*target;
  I64 role,i,j,z,radius,dx,dy,used,old,offsets[9];
  Bool hit,res;
  MemSet(&player,0,sizeof(Player));
  map->sector[0].floor=32*65536; map->sector[0].ceil=90*65536;
  for (role=0;role<3;role++) {
    i=TM_MT_SERGEANT;
    if (!role) i=TM_MT_PLAYER;
    source=WorldSpawn(world,i,-64*65536,0,42*65536);
    world->player=0;
    if (!role) world->player=source->id;
    radius=source->radius+data->info[TM_MT_SERGEANT].radius;
    offsets[0]=-radius-1; offsets[1]=-radius; offsets[2]=-radius+1;
    offsets[3]=-1; offsets[4]=0; offsets[5]=1;
    offsets[6]=radius-1; offsets[7]=radius; offsets[8]=radius+1;
    for (z=0;z<2;z++)
      for (i=0;i<9;i++)
	for (j=0;j<9;j++) {
	  dx=offsets[i]; dy=offsets[j];
	  target=WorldSpawn(world,TM_MT_SERGEANT,64*65536+dx,dy,z*512*65536);
	  hit=2<=i<=6 && 2<=j<=6; used=Fs->data_heap->used_u8s;
	  res=ActorTeleportMove(motion,source,64*65536,0,role==2);
	  if (res!=(role!=1 || !hit) || Fs->data_heap->used_u8s!=used)
	    throw('Occupy');
	  old=data->info[TM_MT_SERGEANT].health;
	  if (hit && role!=1) old-=10000;
	  if (target->health!=old || source->z!=42*65536) throw('Stomp');
	  if (res) {
	    if (source->x!=64*65536 || source->y || source->sector ||
		  source->floor!=32*65536 || source->ceil!=90*65536)
	      throw('Commit');
	    WorldActorUnlink(world,source); source->x=-64*65536;
	    source->sector=1; source->floor=0; source->ceil=128*65536;
	    WorldActorLink(world,source);
	  } else if (source->x!=-64*65536 || source->sector!=1 ||
		source->floor || source->ceil!=128*65536) throw('Atomic');
	  WorldRemove(world,target); tm_teleport_cnt++;
	}
    WorldRemove(world,source);
  }
  source=WorldSpawn(world,TM_MT_SERGEANT,-64*65536,0);
  target=WorldSpawn(world,TM_MT_SERGEANT,64*65536,0);
  target->flags&=~TM_MF_SHOOTABLE;
  if (!ActorTeleportMove(motion,source,64*65536,0)) throw('Scenery');
  tm_teleport_cnt++;
  target->flags|=TM_MF_SHOOTABLE|TM_MF_NOBLOCKMAP;
  WorldActorUnlink(world,target); WorldActorLink(world,target);
  if (!ActorTeleportMove(motion,source,64*65536,0) ||
	target->health!=data->info[TM_MT_SERGEANT].health) throw('NoBlock');
  tm_teleport_cnt++;
  if (!ActorTeleportMove(motion,source,400*65536,0) || source->block!=-1)
    throw('Walls');
  tm_teleport_cnt++;
  MotionDel(motion); WorldDel(world); MapDel(map);
}

U0 TmTeleportOrder(GameData *data)
{
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Player player;
  Motion *motion=MotionNew(world,&player);
  Actor *source,*first,*second,*third,*target,*fog,*old_fog;
  I64 i,angle,used,random,before,state,action;
  Bool caught,expected;
  MemSet(&player,0,sizeof(Player)); player.view_height=39*65536;
  source=WorldSpawn(world,TM_MT_PLAYER,-80*65536,0,20*65536);
  world->player=source->id; tm_teleport_source=source;
  tm_teleport_motion=motion; motion->sound=&TmTeleportSound;
  map->line[0].tag=17; map->sector[0].tag=map->sector[1].tag=17;
  map->sector[0].floor=32*65536;
  first=WorldSpawn(world,TM_MT_TELEPORTMAN,-32*65536,0);
  second=WorldSpawn(world,TM_MT_TELEPORTMAN,64*65536,0);
  third=WorldSpawn(world,TM_MT_TELEPORTMAN,96*65536,0);
  for (i=0;i<16;i++) {
    angle=i*0x10000000; second->angle=angle;
    WorldActorUnlink(world,source); source->x=-80*65536; source->y=0;
    source->z=20*65536; WorldActorLink(world,source);
    source->vx=12; source->vy=-42; source->vz=87; source->angle=123;
    tm_teleport_sounds=0; random=world->random;
    if (ActorTeleport(motion,source,0,1) || world->random!=random ||
	  tm_teleport_sounds) throw('BackSide');
    source->flags|=TM_MF_MISSILE;
    if (ActorTeleport(motion,source,0,0) || world->random!=random ||
	  tm_teleport_sounds) throw('Missile');
    source->flags&=~TM_MF_MISSILE;
    if (!ActorTeleport(motion,source,0,0) || source->x!=second->x ||
	  source->z!=32*65536 || source->angle!=angle || source->vx ||
	  source->vy || source->vz || source->reaction!=18 ||
	  player.view_z!=71*65536 || tm_teleport_sounds!=2 ||
	  world->random!=(random+2)&255) throw('Transit');
    fog=WorldActorGet(world,world->last);
    old_fog=WorldActorGet(world,fog->tick_last);
    if (fog->type!=TM_MT_TFOG || old_fog->type!=TM_MT_TFOG ||
	  fog->x!=64*65536+20*AngleCos(data,angle) ||
	  fog->y!=20*AngleSin(data,angle) || fog->z!=32*65536 ||
	  old_fog->x!=-80*65536 || old_fog->y || old_fog->z!=20*65536)
      throw('Fog');
    WorldRemove(world,fog); WorldRemove(world,old_fog);
    tm_teleport_cnt+=3;
  }
  second->active=FALSE;
  if (!ActorTeleport(motion,source,0,0) || source->x!=third->x)
    throw('Retired');
  tm_teleport_cnt++;
  third->active=FALSE;
  if (!ActorTeleport(motion,source,0,0) || source->x!=first->x) throw('Sector');
  tm_teleport_cnt++;
  first->active=FALSE; before=world->actor_cnt; random=world->random;
  if (ActorTeleport(motion,source,0,0) || world->actor_cnt!=before ||
	world->random!=random) throw('NoDest');
  tm_teleport_cnt++;
  first->active=second->active=third->active=TRUE;
  world->player=0; target=WorldSpawn(world,TM_MT_SERGEANT,second->x,second->y);
  before=source->x; used=Fs->data_heap->used_u8s; random=world->random;
  if (ActorTeleport(motion,source,0,0) || source->x!=before ||
	world->random!=random || Fs->data_heap->used_u8s!=used)
    throw('First');
  tm_teleport_cnt++;
  world->player=source->id; motion->action=&TmTeleportAction;
  state=data->info[TM_MT_SERGEANT].death;
  action=data->state[state].action; data->state[state].action=TM_A_SCREAM;
  for (i=0;i<3;i++) {
    WorldActorUnlink(world,source); source->x=-64*65536;
    source->sector=1; source->floor=0; source->ceil=128*65536;
    WorldActorLink(world,source);
    target->active=TRUE; target->health=150; target->flags|=TM_MF_SHOOTABLE;
    source->active=TRUE; tm_teleport_actions=0; tm_teleport_mode=i;
    before=source->x; used=Fs->data_heap->used_u8s; caught=FALSE;
    expected=i!=2;
    try {
      if (ActorTeleportMove(motion,source,64*65536,0)!=expected)
	throw('Retire');
    } catch {
      if (Fs->except_ch=='TeleErr') {Fs->catch_except=TRUE; caught=TRUE;}
    }
    if (caught!=(i==1) || !tm_teleport_actions ||
	  Fs->data_heap->used_u8s!=used) {
      "CLEANUP %d %d %d %d\n",i,caught,tm_teleport_actions,
	    Fs->data_heap->used_u8s-used;
      throw('Cleanup');
    }
    if (!i) {
      if (source->sector || source->floor!=32*65536 || source->ceil!=128*65536)
	throw('Nested');
    } else if (source->x!=before) throw('Uncommit');
    tm_teleport_cnt++;
  }
  data->state[state].action=action;
  MotionDel(motion); WorldDel(world); MapDel(map);
}

U0 TmTeleportTest()
{
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  I64 used=Fs->data_heap->used_u8s;
  if (!data) throw('Files');
  TmTeleportGrid(data); TmTeleportOrder(data);
  if (Fs->data_heap->used_u8s!=used) throw('Leak');
  GameDataDel(data); tm_teleport_done=1;
  "TELEPORT %d CASES BAD 0\n",tm_teleport_cnt;
}
TmTeleportTest;
