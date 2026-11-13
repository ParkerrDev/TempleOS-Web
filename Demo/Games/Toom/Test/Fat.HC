I64 tm_fat_real_cases=0,tm_fat_real_done=0,tm_fat_real_sounds,
	tm_fat_real_rng[2],tm_fat_real_fail;
Actor *tm_fat_real_origins[2],*tm_fat_real_source,*tm_fat_real_target;
Enemies *tm_fat_real_enemies;
GameData *tm_fat_real_data;

U0 TmFatRealSound(Actor *actor,I64)
{
  I64 n=tm_fat_real_sounds;
  if (n>=2) throw('Sound');
  tm_fat_real_origins[n]=actor;
  tm_fat_real_rng[n]=actor->world->random; tm_fat_real_sounds++;
  if (tm_fat_real_fail==n+1) throw('SoundCB',TRUE);
}

U0 TmFatRealNew(I64 type=TM_MT_FATSO)
{
  Map *map=RoomsNew(FALSE);
  World *world;
  Motion *motion;
  Sectors *sectors;
  Specials *specials;
  map->line[0].side[0]=map->line[4].side[0]=map->line[5].side[0]=1;
  world=WorldNew(map,tm_fat_real_data); motion=MotionNew(world);
  sectors=SectorsNew(motion); specials=SpecialsNew(sectors);
  tm_fat_real_enemies=EnemiesNew(specials);
  tm_fat_real_source=WorldSpawn(world,type,-64*65536,0);
  tm_fat_real_target=WorldSpawn(world,TM_MT_PLAYER,64*65536,0);
  tm_fat_real_source->target=tm_fat_real_target->id;
  tm_fat_real_source->flags|=TM_MF_AMBUSH;
  motion->sound=&TmFatRealSound; world->random=0;
  tm_fat_real_sounds=tm_fat_real_fail=0;
  MemSet(tm_fat_real_origins,0,sizeof(tm_fat_real_origins));
  MemSet(tm_fat_real_rng,0,sizeof(tm_fat_real_rng));
}

U0 TmFatRealDel()
{
  Enemies *enemies=tm_fat_real_enemies;
  Specials *specials=enemies->specials;
  Sectors *sectors=specials->sectors;
  Motion *motion=sectors->motion;
  World *world=motion->world;
  Map *map=world->map;
  EnemiesDel(enemies); SpecialsDel(specials); SectorsDel(sectors);
  MotionDel(motion); WorldDel(world); MapDel(map);
}

U0 TmFatRealTest()
{
  I64 *body=FileRead("C:/ORACLE/FATREAL.BIN"),*row,i,j,n,k,out[22],used,type,
	x,y,vx,vy;
  Enemies *enemies;
  Motion *motion;
  World *world;
  Actor *source,*target,*missile;
  Bool caught;
  tm_fat_real_data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  if (!body || !tm_fat_real_data) throw('Files');
  used=Fs->data_heap->used_u8s;
  for (i=0,row=body+1;i<body[0];i++,row+=26) {
    TmFatRealNew; enemies=tm_fat_real_enemies;
    motion=enemies->specials->sectors->motion; world=motion->world;
    source=tm_fat_real_source; target=tm_fat_real_target;
    target->flags|=row[1]; target->z=row[3]; world->random=row[2];
    EnemyFatAttack(enemies,source,row[0]);
    if (world->actor_cnt!=4 || tm_fat_real_sounds!=2) throw('Count');
    out[0]=source->angle; out[1]=world->random;
    for (j=0;j<2;j++) {
      missile=tm_fat_real_origins[j];
      if (!missile || missile->type!=TM_MT_FATSHOT ||
	    missile->target!=source->id || !missile->active ||
	    missile->block!=-1) throw('Missile');
      n=2+j*10; out[n]=missile->angle; out[n+1]=missile->vx;
      out[n+2]=missile->vy; out[n+3]=missile->vz;
      out[n+4]=missile->x; out[n+5]=missile->y; out[n+6]=missile->z;
      out[n+7]=missile->tics; out[n+8]=missile->lastlook;
      out[n+9]=tm_fat_real_rng[j];
    }
    for (j=0;j<22;j++) if (out[j]!=row[4+j]) {
      "FAT REAL %d FIELD %d GOT %d EXPECTED %d\n",i,j,out[j],row[4+j];
      throw('Spread');
    }
    TmFatRealDel;
    if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
    tm_fat_real_cases++;
  }
  for (i=0;i<12;i++) {
    type=TM_MT_FATSO; if (i>=9) type=TM_MT_SKULL;
    TmFatRealNew(type); enemies=tm_fat_real_enemies;
    motion=enemies->specials->sectors->motion; world=motion->world;
    source=tm_fat_real_source; target=tm_fat_real_target;
    caught=FALSE; n=3;
    switch (i) {
      case 0: source->target=0; break;
      case 1: target->active=FALSE; break;
      case 2: source->active=FALSE; break;
      case 3: source->world=NULL; break;
      case 4: n=0; break;
      case 5: n=4; break;
      case 6: source->target=0; break;
      case 7: tm_fat_real_fail=1; break;
      case 8: tm_fat_real_fail=2; break;
      case 9: source->target=0; break;
      case 11: tm_fat_real_fail=1; break;
    }
    try {
      if (i==6) EnemyFatRaise(enemies,source);
      else if (i>=9) EnemySkull(enemies,source);
      else EnemyFatAttack(enemies,source,n);
    } catch {
      if (i==3 && Fs->except_ch=='World' ||
	    4<=i<=5 && Fs->except_ch=='Attack' ||
	    (i==7 || i==8 || i==11) && Fs->except_ch=='SoundCB') {
	caught=TRUE; Fs->catch_except=TRUE;
      }
    }
    if (caught!=!!(3<=i<=5 || i==7 || i==8 || i==11)) throw('Guard');
    source->world=world;
    k=2; n=0;
    if (i==6 || i>=10) n=1;
    if (i==7 || i==8) {n=i-6; k+=n;}
    if (world->actor_cnt!=k || tm_fat_real_sounds!=n) throw('Owned');
    n=0; if (i==7 || i==8) n=1+(i-7)*2;
    if (world->random!=n) throw('Random');
    if (i==10) {
      if (!(source->flags&TM_MF_SKULLFLY) || source->flags&TM_MF_AMBUSH ||
	    source->angle || source->vz!=target->height/2/6) throw('Charge');
      x=source->x; y=source->y; vx=source->vx; vy=source->vy;
      ActorXY(motion,source);
      if (source->x!=x+vx || source->y!=y+vy ||
	    source->vx!=vx || source->vy!=vy ||
	    !(source->flags&TM_MF_SKULLFLY)) throw('Motion');
    }
    if (i==11 && (!(source->flags&TM_MF_SKULLFLY) ||
	  !(source->flags&TM_MF_AMBUSH) || source->vx || source->vy))
      throw('Order');
    TmFatRealDel;
    if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
    tm_fat_real_cases++;
  }
  GameDataDel(tm_fat_real_data); Free(body); tm_fat_real_done=1;
  "FAT %d REAL CASES BAD 0\n",tm_fat_real_cases;
}

TmFatRealTest;
