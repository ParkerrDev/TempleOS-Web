I64 tm_respawn_map_cases=0,tm_respawn_map_done=0,tm_respawn_map_trace[180];

U0 TmRespawnMapsTest()
{
  Wad *wad=WadNew("C:/ORACLE/FREEDOOM.WAD");
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map;
  World *world;
  Motion *motion;
  Actor *actor,*born;
  Thing *thing;
  I64 *expected=FileRead("C:/ORACLE/MAPS.BIN"),*ids,*dst,
	i,j,k,n,used,passed,blocked,hash,flags,z;
  U8 name[8];
  if (!wad || !data || !expected) throw('Files');
  used=Fs->data_heap->used_u8s;
  for (i=0;i<36;i++) {
    StrPrint(name,"E%dM%d",i/9+1,i%9+1);
    map=MapNew(wad,name); world=WorldNew(map,data,4);
    WorldLoadThings(world); motion=MotionNew(world);
    if (world->total_kills!=expected[i]) throw('Count');
    ids=MAlloc(world->total_kills*sizeof(I64)); n=0;
    for (j=0;j<world->slot_cap;j++)
      if ((actor=world->slot[j].actor) && actor->flags&TM_MF_COUNTKILL)
	ids[n++]=actor->id;
    if (n!=expected[i]) throw('Count');
    passed=blocked=0; hash=2166136261;
    for (j=0;j<n;j++) {
      actor=WorldActorGet(world,ids[j]);
      if (!actor || !(0<=actor->spawn<map->thing_cnt)) throw('Spawn');
      k=actor->spawn; thing=map->thing+k;
      actor->health=0; actor->flags=actor->flags&~(TM_MF_SOLID|
	    TM_MF_SHOOTABLE)|TM_MF_CORPSE;
      actor->height/=4; actor->tics=-1; actor->move_cnt=419;
      world->tic=448; world->random=255;
      ActorThink(motion,actor);
      if (actor->active) {
	if (world->random || actor->move_cnt!=420) throw('Blocked');
	blocked++; hash=(hash^k)*16777619&0xFFFFFFFF;
      } else {
	born=WorldActorGet(world,world->last);
	flags=data->info[actor->type].flags;
	if (thing->flags&8) flags|=TM_MF_AMBUSH;
	z=born->floor;
	if (flags&TM_MF_SPAWNCEILING) z=born->ceil-born->height;
	if (!born || born==actor || born->type!=actor->type ||
	      born->spawn!=k || born->x!=thing->x*65536 ||
	      born->y!=thing->y*65536 || born->z!=z ||
	      born->angle!=536870912*(thing->angle/45)&0xFFFFFFFF ||
	      born->flags!=flags || born->reaction!=18 ||
	      born->tics!=data->state[data->info[born->type].spawn].tics ||
	      world->random!=3) throw('Born');
	passed++; hash=(hash^born->type^born->x^born->y^born->z^
	      born->angle^born->flags^k)*16777619&0xFFFFFFFF;
      }
      WorldSweep(world);
      if (world->total_kills!=expected[i]) throw('Kills');
    }
    if (!passed) throw('Empty');
    dst=tm_respawn_map_trace+i*5;
    dst[0]=i; dst[1]=n; dst[2]=passed; dst[3]=blocked; dst[4]=hash;
    Free(ids); MotionDel(motion); WorldDel(world); MapDel(map);
    if (Fs->data_heap->used_u8s!=used) throw('Heap');
    tm_respawn_map_cases++;
  }
  for (i=0;i<36;i++) {
    dst=tm_respawn_map_trace+i*5;
    "RESPAWN MAP %d MONSTERS %d REPLACED %d BLOCKED %d HASH %d\n",
	  dst[0],dst[1],dst[2],dst[3],dst[4];
  }
  GameDataDel(data); WadDel(wad); Free(expected); tm_respawn_map_done=1;
  "RESPAWN MAPS 36 BAD 0\n";
}

TmRespawnMapsTest;
