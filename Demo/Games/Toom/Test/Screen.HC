I64 tm_screen_cases=0,tm_screen_done=0;

I64 TmScreenHash(U8 *src,I64 size)
{
  I64 i,res=2166136261;
  for (i=0;i<size;i++) res=(res^src[i])*16777619&0xFFFFFFFF;
  return res;
}

U0 TmScreenTest()
{
  I64 phase,level,stage,i,j,x,y,n,keys,clock,trace[192],*dst=trace,
	used=Fs->data_heap->used_u8s,heap,cases=0,actor_id,old_name;
  Game *game=NULL;
  World world;
  Player player;
  Actor *actor,*copies;
  CDC *dc=DCNew(648,344),*small=DCNew(639,335);
  Controls input;
  Bool caught;
  for (phase=1;phase<=2;phase++) {
    if (phase==1)
      game=GameNew("C:/ORACLE/PHASE1.WAD","C:/ORACLE/TMDATA.BIN");
    else game=GameNew("C:/ORACLE/PHASE2.WAD","C:/ORACLE/TMDATA.BIN");
    for (level=0;level<2;level++) {
      if (phase==1) GameLoad(game,level+1,level+1);
      else GameLoad(game,1,1+level*29);
      ControlsInit(&input);
      for (stage=0;stage<6;stage++) {
	n=0; keys=0;
	switch (stage) {
	  case 1:
	    n=1; Bts(&keys,TMf_KEY_UP); Bts(&keys,TMf_KEY_SPEED);
	    break;
	  case 2:
	    n=4; Bts(&keys,TMf_KEY_LEFT); Bts(&keys,TMf_KEY_FIRE);
	    break;
	  case 3:
	    n=8; Bts(&keys,TMf_KEY_STRAFERIGHT); Bts(&keys,TMf_KEY_FIRE);
	    break;
	  case 4:
	    n=3;
	    break;
	  case 5:
	    n=35;
	    break;
	}
	for (i=0;i<n;i++) {
	  ControlsCmd(&input,keys);
	  GameTick(game,input.forward,input.side,input.turn,input.buttons,
		input.weapon,stage==4);
	}
	MemCpy(&world,game->level->world,sizeof(World));
	MemCpy(&player,&game->level->player,sizeof(Player)); clock=game->clock;
	copies=CAlloc(world.slot_cap*sizeof(Actor));
	for (i=0;i<world.slot_cap;i++)
	  if (actor=world.slot[i].actor) MemCpy(copies+i,actor,sizeof(Actor));
	MemSet(dc->body,0xAA,dc->width_internal*dc->height);
	GameDraw(game,dc);
	if (game->clock!=clock || game->flags ||
	      MemCmp(&world,game->level->world,sizeof(World)) ||
	      MemCmp(&player,&game->level->player,sizeof(Player)))
	  throw('Mutated');
	for (i=0;i<world.slot_cap;i++)
	  if (actor=world.slot[i].actor)
	    if (MemCmp(copies+i,actor,sizeof(Actor))) throw('Actor');
	Free(copies);
	for (y=0;y<dc->height;y++) for (x=0;x<dc->width_internal;x++)
	  if (x>=640 || y>=336)
	    if (dc->body[x+y*dc->width_internal]!=0xAA) throw('Margin');
	dst[0]=phase; dst[1]=game->level->episode;
	dst[2]=game->level->map_num; dst[3]=stage;
	dst[4]=world.tic; dst[5]=world.random;
	dst[6]=TmScreenHash(game->level->view->pix,320*168);
	dst[7]=TmScreenHash(dc->body,dc->width_internal*dc->height);
	dst+=8; cases++; tm_screen_cases++;
      }
    }
    GameDel(game); game=NULL;
  }
  game=GameNew("C:/ORACLE/PHASE1.WAD","C:/ORACLE/TMDATA.BIN");
  caught=FALSE;
  try {
    GameDraw(game,dc);
  } catch {
    if (Fs->except_ch=='Level') caught=Fs->catch_except=TRUE;
  }
  if (!caught || game->flags) throw('Empty');
  tm_screen_cases++;
  GameLoad(game);
  for (j=0;j<6;j++) {
    caught=FALSE; heap=Fs->data_heap->used_u8s;
    actor_id=game->level->world->player;
    old_name=game->level->map->sector[0].floor_name(I64);
    try {
      switch (j) {
	case 0:
	  GameDraw(game,small);
	  break;
	case 1:
	  GameEnter(game); GameDraw(game,dc);
	  break;
	case 2:
	  game->level->world->thinking=TRUE; GameDraw(game,dc);
	  break;
	case 3:
	  game->level->world->ticking=TRUE; GameDraw(game,dc);
	  break;
	case 4:
	  game->level->world->player=0; GameDraw(game,dc);
	  break;
	case 5:
	  game->level->map->sector[0].floor_name(I64)='MISSING';
	  GameDraw(game,dc);
	  break;
      }
    } catch {
      if (!j && Fs->except_ch=='View' || j==1 && Fs->except_ch=='Busy' ||
	    j==2 && Fs->except_ch=='Thinking' ||
	    j==3 && Fs->except_ch=='Ticking' ||
	    j==4 && Fs->except_ch=='Player' || j==5 && Fs->except_ch=='Flat')
	caught=Fs->catch_except=TRUE;
    }
    if (j==1) GameLeave(game);
    game->level->world->thinking=game->level->world->ticking=FALSE;
    game->level->world->player=actor_id;
    game->level->map->sector[0].floor_name(I64)=old_name;
    if (!caught || game->flags || Fs->data_heap->used_u8s!=heap)
      throw('Guard');
    tm_screen_cases++;
  }
  GameDraw(game,dc); GameDel(game);
  DCDel(dc); DCDel(small);
  if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
  if (!FileWrite("C:/ORACLE/SCREEN.BIN",trace,sizeof(trace))) throw('Trace');
  for (i=0;i<cases;i++) {
    dst=trace+i*8;
    "SCREEN %d %d %d %d %d %d %d %d\n",dst[0],dst[1],dst[2],dst[3],
	  dst[4],dst[5],dst[6],dst[7];
  }
  tm_screen_done=1;
  "SCREEN %d CASES BAD 0\n",tm_screen_cases;
}

TmScreenTest;
