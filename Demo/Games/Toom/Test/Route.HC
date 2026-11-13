I64 tm_route_cases=0,tm_route_faults=0,tm_route_done=0;

U0 TmRouteTest()
{
  Game game;
  Level level;
  World world;
  Intermission result;
  I64 *rows,size,i,used=Fs->data_heap->used_u8s;
  Bool caught;
  MemSet(&game,0,sizeof(Game)); MemSet(&level,0,sizeof(Level));
  MemSet(&world,0,sizeof(World)); game.level=&level; level.world=&world;
  rows=FileRead("C:/ORACLE/ROUTES.BIN",&size);
  if (!rows || size!=212*8*8) throw('Rows');
  try {
    for (i=0;i<212;i++) {
      level.episode=rows[i*8]; level.map_num=rows[i*8+1];
      game.commercial=rows[i*8+2];
      world.exit_rqst=TM_EXIT_NORMAL+rows[i*8+3];
      IntermissionStart(&result,&game,,rows[i*8+4]);
      if (result.next!=rows[i*8+5] || result.finale!=rows[i*8+6] ||
	    result.did_secret!=rows[i*8+7] ||
	    result.phase!=(TM_IM_STATS+(result.next==0)*TM_IM_DONE))
	throw('Route');
      tm_route_cases++;
    }
    for (i=1;i<=32;i++)
      if (i!=15 && i!=31) {
	caught=FALSE;
	try {MapNext(1,i,TRUE,TRUE);} catch {
	  if (Fs->except_ch=='Secret') caught=Fs->catch_except=TRUE;
	}
	if (!caught) throw('Secret');
	tm_route_faults++;
      }
    for (i=0;i<6;i++) {
      caught=FALSE;
      try {
	switch (i) {
	  case 0: MapNext(1,0,TRUE,FALSE); break;
	  case 1: MapNext(1,33,TRUE,FALSE); break;
	  case 2: MapNext(0,1,FALSE,FALSE); break;
	  case 3: MapNext(5,1,FALSE,FALSE); break;
	  case 4: MapNext(1,0,FALSE,FALSE); break;
	  case 5: MapNext(1,10,FALSE,FALSE); break;
	}
      } catch {
	if (Fs->except_ch=='Map') caught=Fs->catch_except=TRUE;
      }
      if (!caught) throw('Map');
      tm_route_faults++;
    }
  } catch {
    Free(rows);
  }
  Free(rows);
  if (Fs->data_heap->used_u8s!=used) throw('Heap');
  tm_route_done=1;
  "ROUTE %d CASES %d FAULTS BAD 0\n",tm_route_cases,tm_route_faults;
}

TmRouteTest;
