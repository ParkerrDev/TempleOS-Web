I64 tm_progress_done=0,tm_progress_cases=0,tm_progress_hash=0;

U0 TmProgressExit(Play *play,Bool secret=FALSE)
{//Use an authored line action on the actual loaded map.
  Level *level=play->game->level;
  Map *map=level->map;
  Actor *actor=WorldActorGet(level->world,level->world->player);
  I64 i,n;
  for (i=0;i<map->line_cnt;i++) {
    n=map->line[i].special;
    if (n==11+secret*40) {
      if (!LineUse(level->specials,actor,i,0)) throw('Use');
      break;
    }
    if (n==52+secret*72) {
      LineCross(level->specials,actor,i,0);
      break;
    }
  }
  if (i==map->line_cnt || level->world->exit_rqst!=TM_EXIT_NORMAL+secret)
    throw('Exit');
  PlayTick(play,0,TRUE);
}

U0 TmProgressSkip(Play *play)
{
  I64 i;
  PlayTick(play,0,TRUE); PlayTick(play,1<<TMf_KEY_FIRE,TRUE);
  if (play->result.state!=10) throw('Stats');
  PlayTick(play,0,TRUE); PlayTick(play,1<<TMf_KEY_USE,TRUE);
  if (play->result.phase==TM_IM_NEXT) {
    PlayTick(play,0,TRUE); PlayTick(play,1<<TMf_KEY_USE,TRUE);
  }
  if (play->result.phase!=TM_IM_WAIT || play->result.wait!=10)
    throw('Wait');
  for (i=0;i<10;i++) PlayTick(play,0,TRUE);
}

U0 TmProgressTest()
{
  Play *play=PlayNew("C:/ORACLE/FREEDOOM.WAD","C:/ORACLE/TMDATA.BIN");
  Level *old=play->game->level,*level;
  Actor *actor=WorldActorGet(old->world,old->world->player);
  I64 i,tic,clock,heap,frames;
  Intermission saved;
  CDC *front;
  Bool caught;
  old->player.health=actor->health=83; old->player.armor=61;
  old->player.ammo[TM_AM_CLIP]=17; old->player.ammo[TM_AM_SHELL]=9;
  old->player.weapon[TM_WP_SHOTGUN]=TRUE;
  old->player.ready_weapon=TM_WP_SHOTGUN;
  for (i=0;i<TM_POWER_NUM;i++) old->player.power[i]=20;
  for (i=0;i<TM_CARD_NUM;i++) old->player.card[i]=TRUE;
  actor->flags|=TM_MF_SHADOW;
  old->player.kills=3; old->player.items=2; old->player.secrets=1;
  old->player.damage_cnt=8; old->player.bonus_cnt=9;
  old->player.extra_light=2; old->player.fixed_colormap=1;
  old->player.attack_down=TRUE;
  TmProgressExit(play);
  if (play->stage!=TM_PLAY_STATS || play->result.par!=30 ||
	play->result.next!=2 || play->game->level!=old || play->did_secret)
    throw('Start');
  for (i=0;i<TM_POWER_NUM;i++) if (old->player.power[i]) throw('Power');
  for (i=0;i<TM_CARD_NUM;i++) if (old->player.card[i]) throw('Card');
  if (actor->flags&TM_MF_SHADOW || old->player.damage_cnt ||
	old->player.bonus_cnt || old->player.extra_light ||
	old->player.fixed_colormap) throw('Finish');
  tm_progress_cases++;
  for (i=0;i<5;i++) PlayTick(play,1<<TMf_KEY_FIRE,TRUE);
  if (play->result.state!=1) throw('Held');
  tm_progress_cases++;
  MemCpy(&saved,&play->result,sizeof(Intermission));
  tic=old->world->tic; clock=play->game->clock; play->paused=TRUE;
  for (i=0;i<5;i++) PlayTick(play,0,TRUE);
  if (MemCmp(&saved,&play->result,sizeof(Intermission)) ||
	old->world->tic!=tic || play->game->clock!=clock+5) throw('Pause');
  play->paused=FALSE;
  PlayTick(play,1<<TMf_KEY_USE,FALSE);
  PlayTick(play,1<<TMf_KEY_USE,TRUE);
  if (play->result.state!=1) throw('Focus');
  tm_progress_cases++;
  PlayFrame(play);
  if (play->front->body[0]!=BLACK) throw('Frame');
  tm_progress_hash=2166136261;
  for (i=0;i<play->front->width_internal*play->front->height;i++)
    tm_progress_hash=(tm_progress_hash^play->front->body[i])*
	  16777619&0xFFFFFFFF;
  TmProgressSkip(play); level=play->game->level;
  if (play->stage!=TM_PLAY_LEVEL || level==old || level->map_num!=2 ||
	play->sound.level!=level || level->world->tic ||
	level->player.health!=83 || level->player.armor!=61 ||
	level->player.ammo[TM_AM_CLIP]!=17 ||
	level->player.ammo[TM_AM_SHELL]!=9 ||
	!level->player.weapon[TM_WP_SHOTGUN] ||
	level->player.ready_weapon!=TM_WP_SHOTGUN ||
	level->player.kills || level->player.items || level->player.secrets)
    throw('Next');
  frames=play->frames;
  PlayFrame(play);
  if (play->frames!=frames+1 || play->flags || play->game->flags)
    throw('Frame');
  tm_progress_cases++;
  TmProgressExit(play); play->result.phase=TM_IM_DONE;
  old=play->game->level; heap=Fs->data_heap->used_u8s;
  front=play->front; frames=play->frames;
  tm_progress_fail=TRUE; caught=FALSE;
  try {PlayTick(play,0,TRUE);} catch {
    if (Fs->except_ch=='NextFail') caught=Fs->catch_except=TRUE;
  }
  tm_progress_fail=FALSE;
  if (!caught || play->game->level!=old || play->sound.level!=old ||
	play->stage!=TM_PLAY_STATS || play->flags || play->game->flags ||
	play->front!=front || play->frames!=frames ||
	Fs->data_heap->used_u8s!=heap) throw('Unwind');
  PlayTick(play,0,TRUE);
  if (play->stage!=TM_PLAY_LEVEL || play->game->level->map_num!=3)
    throw('Retry');
  tm_progress_cases++;
  TmProgressExit(play,TRUE); TmProgressSkip(play);
  if (play->stage!=TM_PLAY_LEVEL || play->game->level->map_num!=9 ||
	play->did_secret) throw('Secret');
  tm_progress_cases++;
  TmProgressExit(play); TmProgressSkip(play);
  if (play->stage!=TM_PLAY_LEVEL || play->game->level->map_num!=4 ||
	!play->did_secret) throw('Return');
  tm_progress_cases++;
  GameLoad(play->game,1,8); PlaySndBind(play);
  TmProgressExit(play);
  if (play->stage!=TM_PLAY_FINALE || play->result.next ||
	play->result.finale!=TM_FINALE_EPISODE) throw('Finale');
  old=play->game->level;
  for (i=0;i<100;i++) PlayTick(play,1<<TMf_KEY_FIRE,TRUE);
  if (play->game->level!=old || play->stage!=TM_PLAY_FINALE)
    throw('Ending');
  PlayFrame(play); tm_progress_cases++;
  PlayDel(play);
}

U0 TmProgressHeap()
{
  I64 used=Fs->data_heap->used_u8s;
  TmProgressTest;
  if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
  tm_progress_done=1;
  "PROGRESS %d CASES HASH %d BAD 0\n",tm_progress_cases,tm_progress_hash;
}

TmProgressHeap;
