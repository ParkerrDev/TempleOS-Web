I64 tm_final_play_done=0,tm_final_play_cases=0;

U0 TmFinalePlayExit(Play *play,I64 episode,I64 map_num,Bool secret=FALSE)
{//Complete the loaded world at its owner boundary; no map walkthrough claim.
  GameLoad(play->game,episode,map_num); PlaySndBind(play);
  play->stage=TM_PLAY_LEVEL;
  play->game->level->world->exit_rqst=TM_EXIT_NORMAL+secret;
  PlayTick(play,0,TRUE);
  if (play->stage==TM_PLAY_STATS) {
    play->result.phase=TM_IM_DONE; PlayTick(play,0,TRUE);
  }
  if (play->stage!=TM_PLAY_FINALE || play->finale.tic ||
	play->finale.stage!=TM_FINAL_TEXT || play->final_gr) throw('Start');
}

U0 TmFinalePlayFrame(Play *play)
{//A failed lazy frame leaves the published front and both locks intact.
  CDC *front=play->front;
  I64 frames=play->frames;
  Bool caught=FALSE;
  tm_load_count=0; tm_load_fail=1; tm_load_armed=TRUE;
  try {PlayFrame(play);} catch {
    if (Fs->except_ch=='LoadFail') caught=Fs->catch_except=TRUE;
  }
  tm_load_armed=FALSE; tm_load_fail=0;
  if (!caught || play->flags || play->game->flags || play->front!=front ||
	play->frames!=frames || play->game->wad->file->dv->owning_task==Fs)
    throw('Frame');
  PlayFrame(play);
  if (play->frames!=frames+1 || play->front==front) throw('Retry');
  tm_final_play_cases++;
}

U0 TmFinalePlayTest()
{
  Play *play;
  Level *old;
  Finale saved;
  Cast cast;
  I64 i,j,tic,clock,maps[5],nexts[5],frames;
  CDC *front;
  Bool caught;
  maps[0]=6; maps[1]=11; maps[2]=20; maps[3]=15; maps[4]=31;
  nexts[0]=7; nexts[1]=12; nexts[2]=21; nexts[3]=31; nexts[4]=32;
  play=PlayNew("C:/ORACLE/PHASE1.WAD","C:/ORACLE/TMDATA.BIN");
  for (i=1;i<=4;i++) {
    TmFinalePlayExit(play,i,8);
    TmFinalePlayFrame(play);
    old=play->game->level; tic=old->world->tic;
    MemCpy(&saved,&play->finale,sizeof(Finale));
    play->paused=TRUE; clock=play->game->clock;
    for (j=0;j<5;j++) PlayTick(play,1<<TMf_KEY_FIRE,TRUE);
    if (MemCmp(&saved,&play->finale,sizeof(Finale)) ||
	  old->world->tic!=tic || play->game->clock!=clock+5) throw('Pause');
    play->paused=FALSE;
    PlayTick(play,1<<TMf_KEY_USE,FALSE);
    if (MemCmp(&saved,&play->finale,sizeof(Finale))) throw('Focus');
    PlayTick(play,0,TRUE);
    while (play->finale.stage==TM_FINAL_TEXT)
      PlayTick(play,1<<TMf_KEY_FIRE,TRUE);
    if (play->finale.tic || play->game->level!=old ||
	  old->world->tic!=tic || play->finale.done) throw('Art');
    PlayFrame(play);
    if (i==3) {
      while (play->finale.tic<1210) PlayTick(play,0,TRUE);
      PlayFrame(play);
      if (play->final_gr->end_num!=6 || play->final_gr->last_stage!=6)
	throw('Scroll');
    }
    FinaleGrDel(play->final_gr); play->final_gr=NULL;
    tm_final_play_cases++;
  }
  PlayDel(play);
  play=PlayNew("C:/ORACLE/PHASE2.WAD","C:/ORACLE/TMDATA.BIN");
  for (i=0;i<5;i++) {
    TmFinalePlayExit(play,1,maps[i],i>=3);
    TmFinalePlayFrame(play);
    old=play->game->level;
    for (j=0;j<51;j++) PlayTick(play,1<<TMf_KEY_FIRE,TRUE);
    if (play->finale.tic!=51 || play->stage!=TM_PLAY_FINALE ||
	  play->game->level!=old) throw('Early');
    caught=FALSE; tm_final_next_fail=TRUE;
    front=play->front; frames=play->frames;
    try {PlayTick(play,1<<TMf_KEY_FIRE,TRUE);} catch {
      if (Fs->except_ch=='NextFail') caught=Fs->catch_except=TRUE;
    }
    tm_final_next_fail=FALSE;
    if (!caught || !play->finale.done || play->stage!=TM_PLAY_FINALE ||
	  play->game->level!=old || !play->final_gr || play->flags ||
	  play->game->flags || play->front!=front || play->frames!=frames)
      throw('NextOwn');
    PlayTick(play,1<<TMf_KEY_FIRE,TRUE);
    if (play->stage!=TM_PLAY_LEVEL || play->game->level==old ||
	  play->game->level->map_num!=nexts[i] || play->final_gr ||
	  play->blocked!=1<<TMf_KEY_FIRE) throw('Next');
    PlayFrame(play); tm_final_play_cases++;
  }
  TmFinalePlayExit(play,1,30);
  TmFinalePlayFrame(play);
  for (i=0;i<52;i++) PlayTick(play,1<<TMf_KEY_FIRE,TRUE);
  if (play->finale.stage!=TM_FINAL_CAST || play->cast.num ||
	play->cast.frames || play->cast_buttons!=TM_BTF_ATTACK) throw('Cast');
  MemCpy(&cast,&play->cast,sizeof(Cast));
  PlayTick(play,1<<TMf_KEY_FIRE,TRUE);
  if (MemCmp(&cast,&play->cast,sizeof(Cast))) throw('Held');
  PlayTick(play,0,TRUE);
  if (play->cast_buttons) throw('Release');
  TmFinalePlayFrame(play);
  if (!PlayKey(play,'x',Char2ScanCode('x')) || !play->cast.death)
    throw('Death');
  MemCpy(&cast,&play->cast,sizeof(Cast));
  if (!PlayKey(play,'x',Char2ScanCode('x')) ||
	MemCmp(&cast,&play->cast,sizeof(Cast))) throw('Repeat');
  PlayTick(play,1<<TMf_KEY_FIRE,TRUE);
  if (!play->cast.death || play->cast_buttons) throw('Consumer');
  if (PlayKey(play,'x',Char2ScanCode('x')|SCF_KEY_UP)) throw('Up');
  play->paused=TRUE; MemCpy(&cast,&play->cast,sizeof(Cast));
  PlayKey(play,'z',Char2ScanCode('z')); PlayTick(play,0,TRUE);
  if (MemCmp(&cast,&play->cast,sizeof(Cast))) throw('CastHold');
  play->paused=FALSE;
  PlayTick(play,0,FALSE); MemCpy(&cast,&play->cast,sizeof(Cast));
  if (PlayKey(play,'z',Char2ScanCode('z')) ||
	MemCmp(&cast,&play->cast,sizeof(Cast))) throw('CastLost');
  PlayTick(play,0,TRUE);
  for (i=0;i<300 && !play->cast.num;i++) PlayTick(play,0,TRUE);
  if (play->cast.num!=1 || play->cast.death) throw('NextCast');
  PlayFrame(play); tm_final_play_cases++;
  if (!PlayKey(play,CH_ESC,SC_ESC) || !play->quit) throw('Exit');
  PlayDel(play);
}

U0 TmFinalePlayHeap()
{
  I64 used=Fs->data_heap->used_u8s;
  TmFinalePlayTest;
  if (Fs->data_heap->used_u8s!=used || tm_load_open) throw('Cleanup');
  tm_final_play_done=1;
  "FINALE PLAY %d CASES BAD 0\n",tm_final_play_cases;
}

TmFinalePlayHeap;
