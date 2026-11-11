I64 tm_level_cases=0,tm_level_done=0;

U0 TmLevelTest()
{
  I64 i,used=Fs->data_heap->used_u8s,heap,clock,tic,random;
  Bool caught;
  Game *game=GameNew("C:/ORACLE/FREEDOOM.WAD","C:/ORACLE/TMDATA.BIN");
  Level *old;
  Player player;
  Actor *actor;
  caught=FALSE;
  try {
    GameTick(game);
  } catch {
    if (Fs->except_ch=='Level') caught=Fs->catch_except=TRUE;
  }
  if (!caught || game->flags || game->level) throw('Empty');
  tm_level_cases++;
  GameLoad(game);
  if (!game->level || game->commercial || game->clock || game->flags)
    throw('Game');
  old=game->level; actor=WorldActorGet(old->world,old->world->player);
  if (!actor || actor->health!=100 || old->player.health!=100 ||
	old->player.ammo[TM_AM_CLIP]!=50 || old->world->tic ||
	old->world->actions!=old->actions ||
	old->motion->player!=&old->player ||
	old->actions->game_tic!=&game->clock) throw('Level');
  tm_level_cases++;
  for (i=0;i<35;i++) GameTick(game);
  if (old->world->tic!=35 || game->clock!=35 || game->flags)
    throw('Tick');
  tm_level_cases++;
  MemCpy(&player,&old->player,sizeof(Player)); random=old->world->random;
  for (i=0;i<5;i++) GameTick(game,50,50,100,TM_BTF_ATTACK,,TRUE);
  if (old->world->tic!=35 || game->clock!=40 ||
	MemCmp(&player,&old->player,sizeof(Player)) ||
	old->world->random!=random) throw('Pause');
  tm_level_cases++;
  heap=Fs->data_heap->used_u8s; caught=FALSE;
  try {
    GameLoad(game,1,99);
  } catch {
    if (Fs->except_ch=='Map') caught=Fs->catch_except=TRUE;
  }
  if (!caught || game->level!=old || game->flags ||
	Fs->data_heap->used_u8s!=heap ||
	MemCmp(&player,&old->player,sizeof(Player))) throw('Reject');
  tm_level_cases++;
  old->player.health=73; actor->health=73;
  old->player.ammo[TM_AM_CLIP]=123; old->player.armor=67;
  old->player.armor_type=1; old->player.weapon[TM_WP_SHOTGUN]=TRUE;
  old->player.card[TM_IT_BLUECARD]=TRUE;
  old->player.power[TM_PW_IRONFEET]=90;
  old->player.kills=5; old->player.items=6; old->player.secrets=7;
  old->brain->easy=TRUE; old->view->fuzz=49; clock=game->clock;
  GameLoad(game,1,2); old=game->level;
  actor=WorldActorGet(old->world,old->world->player);
  if (game->clock!=clock || old->world->tic || old->map_num!=2 ||
	old->player.health!=73 || actor->health!=73 ||
	old->player.ammo[TM_AM_CLIP]!=123 || old->player.armor!=67 ||
	!old->player.weapon[TM_WP_SHOTGUN] ||
	old->player.card[TM_IT_BLUECARD] || old->player.power[TM_PW_IRONFEET] ||
	old->player.kills || old->player.items || old->player.secrets ||
	!old->brain->easy || old->view->fuzz!=49) throw('Carry');
  tm_level_cases++;
  GameLoad(game,1,1,TRUE); old=game->level;
  if (old->player.health!=100 || old->player.ammo[TM_AM_CLIP]!=50 ||
	old->player.armor || old->player.weapon[TM_WP_SHOTGUN] ||
	game->clock!=clock || !old->brain->easy ||
	!old->player.use_down || !old->player.attack_down) throw('Born');
  tm_level_cases++;
  tic=old->world->tic; old->world->exit_rqst=TM_EXIT_NORMAL;
  if (GameTick(game)!=TM_EXIT_NORMAL || old->world->tic!=tic ||
	game->clock!=clock+1) throw('Exit');
  tm_level_cases++;
  for (i=0;i<4;i++) {
    caught=FALSE; heap=Fs->data_heap->used_u8s;
    try {
      if (!i) LevelDel(old);
      else {
	GameEnter(game);
	if (i==1) GameLoad(game);
	else if (i==2) GameTick(game);
	else GameDel(game);
      }
    } catch {
      if (!i && Fs->except_ch=='Active' || i && Fs->except_ch=='Busy')
	caught=Fs->catch_except=TRUE;
    }
    if (i) GameLeave(game);
    if (!caught || game->level!=old || Fs->data_heap->used_u8s!=heap)
      throw('Guard');
    tm_level_cases++;
  }
  for (i=0;i<4;i++) {
    old->world->thinking=i<2; old->world->ticking=i>=2;
    caught=FALSE; heap=Fs->data_heap->used_u8s;
    try {
      if (i&1) GameDel(game);
      else GameLoad(game);
    } catch {
      if (i<2 && Fs->except_ch=='Thinking' ||
	    i>=2 && Fs->except_ch=='Ticking') caught=Fs->catch_except=TRUE;
    }
    old->world->thinking=old->world->ticking=FALSE;
    if (!caught || game->level!=old || game->flags ||
	  Fs->data_heap->used_u8s!=heap) throw('Idle');
    tm_level_cases++;
  }
  for (i=0;i<2;i++) {
    game->clock=-1; if (i) game->clock=I64_MAX;
    caught=FALSE; tic=old->world->tic;
    try {
      GameTick(game);
    } catch {
      if (Fs->except_ch=='Clock') caught=Fs->catch_except=TRUE;
    }
    if (!caught || game->flags || old->world->tic!=tic) throw('Clock');
    tm_level_cases++;
  }
  for (i=0;i<2;i++) {
    caught=FALSE; heap=Fs->data_heap->used_u8s;
    try {
      GameNew("C:/ORACLE/FREEDOOM.WAD","C:/ORACLE/TMDATA.BIN",i*6-1);
    } catch {
      if (Fs->except_ch=='Skill') caught=Fs->catch_except=TRUE;
    }
    if (!caught || Fs->data_heap->used_u8s!=heap) throw('Skill');
    tm_level_cases++;
  }
  GameDel(game);
  if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
  tm_level_done=1;
  "LEVEL %d CASES BAD 0\n",tm_level_cases;
}

TmLevelTest;
