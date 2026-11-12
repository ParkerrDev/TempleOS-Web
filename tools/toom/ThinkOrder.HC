I64 tm_order_cases=0,tm_order_calls=0,tm_order_done=0,tm_order_num,
	tm_order_trigger,tm_order_child,tm_order_retire,tm_order_extra,
	tm_order_used,tm_order_trace[32];
Thinker *tm_order_objects[5];
Bool tm_order_once[5];
Specials *tm_order_specials;

U0 TmOrderAdd(I64 kind)
{
  Specials *specials=tm_order_specials;
  Sectors *sectors=specials->sectors;
  Actor *actor;
  Mover *mover;
  Light *light;
  I64 n=tm_order_num++;
  if (n>=5) throw('Objects');
  switch (kind) {
    case TM_THINK_ACTOR:
      actor=WorldSpawn(sectors->motion->world,TM_MT_TROOP,64*65536,0);
      actor->spawn=n; tm_order_objects[n]=&actor->thinker;
      break;
    case TM_THINK_MOVER:
      mover=MoverNew(sectors,n+2,TM_MOVER_DOOR);
      tm_order_objects[n]=&mover->thinker;
      break;
    case TM_THINK_LIGHT:
      light=LightNew(specials->lights,n+2,TM_LIGHT_GLOW);
      tm_order_objects[n]=&light->thinker;
      break;
  }
}

U0 TmOrderStep(I64 kind,I64 n)
{
  Thinker *tmpq;
  Actor *actor;
  if (!(0<=n<tm_order_num) || tm_order_used>=32) throw('Order');
  tm_order_trace[tm_order_used++]=kind*16+n;
  if (!tm_order_once[n]) {
    tm_order_once[n]=TRUE;
    if (n==tm_order_trigger) {
      TmOrderAdd(tm_order_child);
      if (tm_order_retire>=0) {
	tmpq=tm_order_objects[tm_order_retire];
	if (tmpq->kind==TM_THINK_ACTOR) {
	  actor=tmpq; actor->active=FALSE;
	} else if (tmpq->kind==TM_THINK_MOVER)
	  MoverFinish(tm_order_specials->sectors,tmpq);
	else throw('Retire');
      }
    } else if (n==3 && tm_order_extra) TmOrderAdd(tm_order_child%3+1);
  }
}

U0 TmOrderActor(Motion *,Actor *actor)
{
  if (actor->active) TmOrderStep(TM_THINK_ACTOR,actor->spawn);
}

U0 TmOrderMover(Sectors *,Mover *mover)
{
  TmOrderStep(TM_THINK_MOVER,mover->sector-2);
}

U0 TmOrderLight(Lights *,Light *light)
{
  TmOrderStep(TM_THINK_LIGHT,light->sector-2);
}

//ThinkersTick.

U0 TmOrderTest()
{
  I64 *body=FileRead("C:/ORACLE/THINK.BIN"),*row=body+1,
	i,j,pass,n,used;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  Sector *sectors=CAlloc(10*sizeof(Sector));
  World *world;
  Motion *motion;
  Sectors *planes;
  if (!body || !data) throw('Files');
  MemCpy(sectors,map->sector,2*sizeof(Sector));
  Free(map->sector); map->sector=sectors; map->sector_cnt=10;
  for (i=2;i<10;i++) MemCpy(sectors+i,sectors,sizeof(Sector));
  used=Fs->data_heap->used_u8s;
  for (i=0;i<body[0];i++) {
    world=WorldNew(map,data); motion=MotionNew(world);
    planes=SectorsNew(motion); tm_order_specials=SpecialsNew(planes);
    tm_order_num=0; MemSet(tm_order_once,0,sizeof(tm_order_once));
    TmOrderAdd(row[0]); TmOrderAdd(row[1]); TmOrderAdd(row[2]);
    tm_order_trigger=row[3]; tm_order_child=row[4];
    tm_order_retire=row[5]; tm_order_extra=row[6]; row+=7;
    for (pass=0;pass<2;pass++) {
      tm_order_used=0; ThinkersTick(tm_order_specials); n=*row++;
      if (n!=tm_order_used || world->thinking || world->tic) throw('Count');
      for (j=0;j<n;j++)
	if (tm_order_trace[j]!=row[j]) {
	  "CASE %d PASS %d STEP %d GOT %d EXPECT %d\n",
		i,pass,j,tm_order_trace[j],row[j];
	  throw('Sequence');
	}
      row+=n; tm_order_calls+=n;
    }
    SpecialsDel(tm_order_specials); SectorsDel(planes); MotionDel(motion);
    WorldDel(world);
    if (Fs->data_heap->used_u8s!=used) throw('Leak');
    tm_order_cases++;
  }
  Free(body); MapDel(map); GameDataDel(data);
  tm_order_done=1;
  "THINK %d CASES %d CALLS BAD 0\n",tm_order_cases,tm_order_calls;
}

TmOrderTest;
