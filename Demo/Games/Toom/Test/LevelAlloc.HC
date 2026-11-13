I64 tm_level_alloc_cases=0,tm_level_alloc_faults=0,tm_level_alloc_done=0;

U0 TmLevelAllocTest()
{
  I64 i,j,n,heap,used=Fs->data_heap->used_u8s,random,actors,tic;
  Bool caught;
  Game *game,*other;
  Level *old,*candidate;
  Player player;
  game=GameNew("C:/ORACLE/FREEDOOM.WAD","C:/ORACLE/TMDATA.BIN");
  GameLoad(game); old=game->level;
  old->player.health=73; old->player.ammo[TM_AM_CLIP]=123;
  old->brain->easy=TRUE; game->clock=1234;
  MemCpy(&player,&old->player,sizeof(Player));
  random=old->world->random; actors=old->world->actor_cnt; tic=old->world->tic;
  heap=Fs->data_heap->used_u8s;
  for (i=0;i<2;i++) {
    tm_load_count=tm_load_fail=0; tm_load_armed=TRUE;
    if (!i) {
      other=GameNew("C:/ORACLE/FREEDOOM.WAD","C:/ORACLE/TMDATA.BIN");
      GameDel(other);
    } else {
      candidate=LevelNew(game,1,2); LevelDel(candidate);
    }
    tm_load_armed=FALSE; n=tm_load_count;
    if (!n || Fs->data_heap->used_u8s!=heap || tm_load_open!=1)
      throw('Baseline');
    tm_level_alloc_cases++;
    for (j=1;j<=n;j++) {
      caught=FALSE; tm_load_count=0; tm_load_fail=j; tm_load_armed=TRUE;
      try {
	if (!i) {
	  other=GameNew("C:/ORACLE/FREEDOOM.WAD","C:/ORACLE/TMDATA.BIN");
	  GameDel(other);
	} else GameLoad(game,1,2);
      } catch {
	if (Fs->except_ch=='LoadFail') caught=Fs->catch_except=TRUE;
      }
      tm_load_armed=FALSE;
      if (!caught || tm_load_count!=j) throw('Fault');
      if (Fs->data_heap->used_u8s!=heap || tm_load_open!=1) {
	"LEVEL ALLOC %d FAULT %d LEAK %d FILES %d\n",i,j,
	      Fs->data_heap->used_u8s-heap,tm_load_open;
	throw('Leak');
      }
      if (game->level!=old || game->flags || game->clock!=1234 ||
	    MemCmp(&player,&old->player,sizeof(Player)) ||
	    old->world->random!=random || old->world->actor_cnt!=actors ||
	    old->world->tic!=tic || !old->brain->easy ||
	    old->world->actions!=old->actions) throw('Active');
      tm_level_alloc_cases++; tm_level_alloc_faults++;
    }
  }
  GameLoad(game,1,2);
  if (game->level==old || game->level->map_num!=2 || game->flags ||
	game->clock!=1234 || game->level->player.health!=73 ||
	game->level->player.ammo[TM_AM_CLIP]!=123 || !game->level->brain->easy)
    throw('Publish');
  tm_level_alloc_cases++;
  GameDel(game);
  if (Fs->data_heap->used_u8s!=used || tm_load_open) throw('Cleanup');
  tm_level_alloc_done=1;
  "LEVEL ALLOC %d CASES %d FAULTS BAD 0\n",tm_level_alloc_cases,
	tm_level_alloc_faults;
}

TmLevelAllocTest;
