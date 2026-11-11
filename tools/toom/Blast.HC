I64 tm_blast_cnt=0,tm_blast_done=0;

U0 TmBlastThrow(Actor *,I64)
{
  throw('BlastErr',TRUE);
}

U0 TmBlastTest()
{
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Motion *motion=MotionNew(world);
  Path *path=PathNew(world);
  Attack *trace=AttackNew(world);
  Actor *source=WorldSpawn(world,TM_MT_POSSESSED,-64*65536,0),
	*target=WorldSpawn(world,TM_MT_TROOP,64*65536,0),*spot;
  I64 *body,*row,size,i,n,before,x,expected,health,pain;
  Bool caught;
  if (!data) throw('Files');
  source->height=target->height=56*65536;
  body=FileRead("C:/ORACLE/SIGHT.BIN",&size);
  if (!body || size!=8+body[0]*5*8) throw('SightBin');
  for (i=0,row=body+1;i<body[0];i++,row+=5) {
    map->sector[1].floor=row[0]*65536; map->sector[1].ceil=row[1]*65536;
    source->z=row[2]*65536; target->z=row[3]*65536;
    if (ActorSight(path,source,target)!=row[4]) {
      "SIGHT %d FLOOR %d CEIL %d Z %d %d EXPECT %d\n",i,
	    row[0],row[1],row[2],row[3],row[4];
      throw('Sight');
    }
    tm_blast_cnt++;
  }
  Free(body); map->sector[1].floor=0; map->sector[1].ceil=128*65536;
  source->z=target->z=0;
  map->line[6].flags|=3;
  if (!ActorSight(path,source,target)) throw('FlgSight');
  map->line[6].flags=4; tm_blast_cnt++;
  world->collision->line[6].back=-1;
  if (ActorSight(path,source,target)) throw('OneSide');
  world->collision->line[6].back=1; tm_blast_cnt++;
  map->reject=MAlloc(1); map->reject[0]=4; map->reject_size=1;
  if (ActorSight(path,source,target)) throw('Reject');
  map->reject_size=0;
  if (!ActorSight(path,source,target)) throw('ShortRej');
  tm_blast_cnt++;
  target->x=source->x;
  if (!ActorSight(path,source,target)) throw('SamePos');
  target->x=64*65536; tm_blast_cnt++;
  target->world=NULL;
  if (ActorSight(path,source,target)) throw('OtherMap');
  target->world=world; tm_blast_cnt++;
  WorldRemove(world,target);
  source->health=100000;
  spot=WorldSpawn(world,TM_MT_ROCKET,0,0,0);
  for (i=0;i<10;i++) {
    switch (i/2) {
      case 0:
	x=0;
	break;
      case 1:
	x=20;
	break;
      case 2:
	x=83;
	break;
      case 3:
	x=84;
	break;
      default:
	x=85;
    }
    expected=MaxI64(64-MaxI64(x-20,0),0);
    if (i&1) x=-x;
    target=WorldSpawn(world,TM_MT_TROOP,x*65536,0); target->health=1000;
    ActorRadius(motion,path,spot,source,64);
    if (target->health!=1000-expected) throw('Radius');
    WorldRemove(world,target); tm_blast_cnt++;
  }
  WorldRemove(world,spot); spot=WorldSpawn(world,TM_MT_ROCKET,-64*65536,0,0);
  target=WorldSpawn(world,TM_MT_TROOP,64*65536,0); health=target->health;
  map->sector[1].ceil=0;
  ActorRadius(motion,path,spot,source,128);
  if (target->health!=health) throw('BstWall');
  map->sector[1].ceil=128*65536; WorldRemove(world,target); tm_blast_cnt++;
  for (i=0;i<2;i++) {
    n=TM_MT_CYBORG;
    if (i) n=TM_MT_SPIDER;
    target=WorldSpawn(world,n,0,0); health=target->health;
    ActorRadius(motion,path,spot,source,128);
    if (target->health!=health) throw('Boss');
    WorldRemove(world,target); tm_blast_cnt++;
  }
  health=source->health; ActorRadius(motion,path,spot,source,128);
  if (source->health!=health-128) throw('SelfHit');
  tm_blast_cnt++;
  target=WorldSpawn(world,TM_MT_TROOP,0,0); target->health=1000;
  pain=data->info[TM_MT_TROOP].pain;
  data->info[TM_MT_TROOP].pain_chance=256;
  data->info[TM_MT_TROOP].pain=pain+1; motion->action=&TmBlastThrow;
  before=Fs->data_heap->used_u8s; caught=FALSE;
  try {
    ActorRadius(motion,path,spot,source,128);
  } catch {
    if (Fs->except_ch=='BlastErr') {caught=TRUE; Fs->catch_except=TRUE;}
  }
  if (!caught || Fs->data_heap->used_u8s!=before) throw('BlastMem');
  motion->action=NULL; data->info[TM_MT_TROOP].pain=pain;
  WorldRemove(world,target); tm_blast_cnt++;
  WorldRemove(world,spot); spot=WorldSpawn(world,TM_MT_BFG,96*65536,0,0);
  spot->angle=0; spot->target=source->id;
  target=WorldSpawn(world,TM_MT_CYBORG,0,0); target->health=100000;
  target->height=56*65536; target->radius=64*65536;
  world->max_radius=MaxI64(world->max_radius,target->radius);
  world->random=0; before=world->actor_cnt;
  ActorBfg(motion,trace,spot);
  if (world->actor_cnt!=before+40 || target->health!=100000-TM_BFG_DAMAGE ||
	world->random!=TM_BFG_RANDOM) {
    "BFG EFFECTS %d DAMAGE %d RANDOM %d\n",world->actor_cnt-before,
	  100000-target->health,world->random;
    throw('BfgRays');
  }
  tm_blast_cnt++;
  spot->angle=0x80000000; before=world->actor_cnt; health=target->health;
  ActorBfg(motion,trace,spot);
  if (world->actor_cnt!=before || target->health!=health) throw('BfgBack');
  tm_blast_cnt++;
  WorldRemove(world,source); before=world->actor_cnt;
  ActorBfg(motion,trace,spot);
  if (world->actor_cnt!=before) throw('BfgOwner');
  tm_blast_cnt++;
  AttackDel(trace); PathDel(path); MotionDel(motion);
  WorldDel(world); MapDel(map); GameDataDel(data); tm_blast_done=1;
  "BLAST %d CASES BAD 0\n",tm_blast_cnt;
}

TmBlastTest;
