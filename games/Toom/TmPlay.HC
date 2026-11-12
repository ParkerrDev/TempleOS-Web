#define TMf_PLAY_BUSY  0
#define TMf_PLAY_FRAME 1
#define TM_PLAY_HEIGHT 400
#define TM_PLAY_LEVEL  0
#define TM_PLAY_STATS  1
#define TM_PLAY_FINALE 2

class Play
{
  Game *game;
  Audio *audio;
  Story *story;
  Intermission result;
  Finale finale;
  Cast cast;
  IntermissionGr *result_gr;
  FinaleGr *final_gr;
  SoundScene sound;
  CDC *front,*back;
  CTask *task;
  Controls controls;
  I64 flags,blocked,frames,stage,cast_buttons;
  Bool focused,paused,pause_down,quit,did_secret;
};

U8 *tm_weapon_names[TM_WEAPON_NUM]={
  "FIST","PISTOL","SHOTGUN","CHAINGUN","ROCKET","PLASMA","BFG",
  "CHAINSAW","SUPER SHOTGUN"
};

U0 PlayEnter(Play *tmpp)
{
  if (LBts(&tmpp->flags,TMf_PLAY_BUSY)) throw('Busy');
}

U0 PlayLeave(Play *tmpp)
{
  LBtr(&tmpp->flags,TMf_PLAY_BUSY);
}

U0 PlayHUD(Play *tmpp,CDC *dc)
{
  Level *level=tmpp->game->level;
  Player *player=&level->player;
  I64 weapon=player->ready_weapon,ammo,i;
  U8 *keys="BYR";
  dc->color=BLACK; GrRect(dc,0,336,640,64);
  dc->color=WHITE;
  GrPrint(dc,8,344,"HEALTH:%3d  ARMOR:%3d  %s",MaxI64(player->health,0),
	player->armor,tm_weapon_names[weapon]);
  ammo=tmpp->game->data->weapon[weapon].ammo;
  if (0<=ammo<TM_AMMO_NUM)
    GrPrint(dc,400,344,"AMMO:%3d/%3d",player->ammo[ammo],
	  player->max_ammo[ammo]);
  else GrPrint(dc,400,344,"AMMO: ---");
  for (i=0;i<3;i++) {
    dc->color=DKGRAY;
    if (player->card[i] || player->card[i+3])
      switch (i) {
	case 0: dc->color=LTBLUE; break;
	case 1: dc->color=YELLOW; break;
	case 2: dc->color=LTRED; break;
      }
    GrPrint(dc,536+i*32,344,"%c",keys[i]);
  }
  dc->color=LTGRAY;
  if (tmpp->game->commercial) GrPrint(dc,8,360,"MAP%02d",level->map_num);
  else GrPrint(dc,8,360,"E%dM%d",level->episode,level->map_num);
  GrPrint(dc,80,360,"KILLS:%d/%d  ITEMS:%d/%d  SECRETS:%d/%d",
	player->kills,level->world->total_kills,player->items,
	level->world->total_items,player->secrets,level->world->total_secrets);
  dc->color=YELLOW;
  if (tmpp->paused || !tmpp->focused) GrPrint(dc,8,384,"PAUSED");
  else if (player->dead) GrPrint(dc,8,384,"SPACE TO RESTART");
  else if (level->world->exit_rqst) GrPrint(dc,8,384,"LEVEL COMPLETE");
  else GrPrint(dc,8,384,
	"ARROWS/WASD MOVE  CTRL FIRE  SPACE USE  P PAUSE  ESC EXIT");
}

U0 PlayResultDraw(Play *tmpp,CDC *dc)
{//Freedoom's own art loads on the first frame of each result.
  Intermission *tmpi=&tmpp->result;
  IntermissionGr *tmpg=tmpp->result_gr;
  if (!tmpg) {
    tmpg=IntermissionGrNew(tmpp->game->wad,tmpi);
    tmpp->result_gr=tmpg;
  }
  tmpg->pointer_on=tmpi->wait&31<20;
  IntermissionGrDraw(tmpg,tmpi);
  IntermissionGrBlot(tmpg,dc);
  if (tmpp->paused || !tmpp->focused) {
    dc->color=YELLOW; GrPrint(dc,8,384,"PAUSED");
  }
}

U0 PlayFinaleDraw(Play *tmpp,CDC *dc)
{
  FinaleGr *tmpg=tmpp->final_gr;
  if (!tmpg) {
    tmpg=FinaleGrNew(tmpp->game->wad,&tmpp->finale);
    tmpg->sound=tmpp->result.sound; tmpg->context=tmpp;
    tmpp->final_gr=tmpg;
  }
  if (tmpp->finale.stage==TM_FINAL_CAST)
    CastGrDraw(tmpg,&tmpp->cast,tmpp->game->sprites,tmpp->story);
  else FinaleGrDraw(tmpg,&tmpp->finale);
  FinaleGrBlot(tmpg,dc);
  if (tmpp->paused || !tmpp->focused) {
    dc->color=YELLOW; GrPrint(dc,8,384,"PAUSED");
  }
}

U0 PlayFrame(Play *tmpp)
{//The compositor keeps the completed front buffer while the next frame draws.
  CDC *dc;
  PlayEnter(tmpp);
  try {
    if (tmpp->stage==TM_PLAY_LEVEL) {
      GameDraw(tmpp->game,tmpp->back); PlayHUD(tmpp,tmpp->back);
    } else if (tmpp->stage==TM_PLAY_FINALE)
      PlayFinaleDraw(tmpp,tmpp->back);
    else PlayResultDraw(tmpp,tmpp->back);
    while (LBts(&tmpp->flags,TMf_PLAY_FRAME)) Yield;
    dc=tmpp->front; tmpp->front=tmpp->back; tmpp->back=dc;
    tmpp->frames++;
    LBtr(&tmpp->flags,TMf_PLAY_FRAME);
  } catch {
    PlayLeave(tmpp);
  }
  PlayLeave(tmpp);
}

U0 PlayBlot(Play *tmpp,CDC *dc,I64 x=0,I64 y=0)
{
  while (LBts(&tmpp->flags,TMf_PLAY_FRAME)) Yield;
  try {
    GrBlot(dc,x,y,tmpp->front);
  } catch {
    LBtr(&tmpp->flags,TMf_PLAY_FRAME);
  }
  LBtr(&tmpp->flags,TMf_PLAY_FRAME);
}

U0 PlayActorSnd(Actor *actor,I64 n)
{
  Play *tmpp=Fs->user_data;
  World *world;
  if (!tmpp || tmpp->task!=Fs || !tmpp->game->level) throw('Owner');
  world=tmpp->game->level->world;
  if (actor) {
    if (actor->world!=world || WorldActorGet(world,actor->id)!=actor)
      throw('Actor');
    SoundSceneStart(&tmpp->sound,1,actor->id,n);
  } else SoundSceneStart(&tmpp->sound,0,0,n);
}

U0 PlaySectorSnd(I64 sector,I64 n)
{
  Play *tmpp=Fs->user_data;
  if (!tmpp || tmpp->task!=Fs) throw('Owner');
  SoundSceneStart(&tmpp->sound,2,sector,n);
}

U0 PlaySndBind(Play *tmpp)
{
  Level *level=SoundSceneSync(&tmpp->sound);
  if (level && tmpp->task) {
    level->motion->sound=&PlayActorSnd;
    level->sectors->sound=&PlaySectorSnd;
  }
}

U0 PlayResultSnd(I64 n,U8 *context)
{
  Play *tmpp=context;
  AudioStart(tmpp->audio,0,0,n);
}

U0 PlayFinaleStart(Play *tmpp)
{
  FinaleStart(&tmpp->finale,tmpp->story,&tmpp->result);
  FinaleGrDel(tmpp->final_gr); tmpp->final_gr=NULL;
  MemSet(&tmpp->cast,0,sizeof(Cast)); tmpp->cast_buttons=0;
  AudioStop(tmpp->audio);
  tmpp->stage=TM_PLAY_FINALE;
}

U0 PlayFinish(Play *tmpp)
{
  Level *level=tmpp->game->level;
  Intermission result;
  I64 n=StoryMap(level->episode,level->map_num,tmpp->game->commercial);
  IntermissionStart(&result,tmpp->game,tmpp->story->par[n],tmpp->did_secret);
  GameFinish(tmpp->game); AudioStop(tmpp->audio);
  IntermissionGrDel(tmpp->result_gr); tmpp->result_gr=NULL;
  MemCpy(&tmpp->result,&result,sizeof(Intermission));
  tmpp->result.sound=&PlayResultSnd; tmpp->result.context=tmpp;
  tmpp->did_secret=result.did_secret;
  tmpp->stage=TM_PLAY_STATS;
  if (!result.next) PlayFinaleStart(tmpp);
}

U0 PlayNext(Play *tmpp,I64 keys)
{//A failed candidate leaves the completed old level and result intact.
  Intermission *tmpi=&tmpp->result;
  if (tmpi->finale && tmpp->stage!=TM_PLAY_FINALE) PlayFinaleStart(tmpp);
  else {
    AudioStop(tmpp->audio);
    GameLoad(tmpp->game,tmpi->episode,tmpi->next);
    PlaySndBind(tmpp);
    IntermissionGrDel(tmpp->result_gr); tmpp->result_gr=NULL;
    FinaleGrDel(tmpp->final_gr); tmpp->final_gr=NULL;
    tmpp->stage=TM_PLAY_LEVEL;
    ControlsInit(&tmpp->controls); tmpp->blocked=keys;
  }
}

U0 PlayFinaleTick(Play *tmpp,I64 keys)
{//Only buttons held at cast entry survive the cast key-event consumer.
  I64 buttons=tmpp->controls.buttons,events;
  if (tmpp->finale.stage==TM_FINAL_CAST) {
    tmpp->cast_buttons&=buttons; buttons=tmpp->cast_buttons;
  }
  events=FinaleTick(&tmpp->finale,buttons);
  if (events&TM_FINALF_CAST) {
    CastStart(&tmpp->cast,tmpp->game->data,&PlayResultSnd,tmpp);
    tmpp->cast_buttons=buttons;
  }
  if (tmpp->finale.stage==TM_FINAL_CAST) CastTick(&tmpp->cast);
  if (tmpp->finale.done) PlayNext(tmpp,keys);
}

U0 PlaySndOff(Play *tmpp)
{
  Level *level=tmpp->game->level;
  if (level) {
    if (level->motion->sound==&PlayActorSnd) level->motion->sound=NULL;
    if (level->sectors->sound==&PlaySectorSnd) level->sectors->sound=NULL;
  }
  AudioStop(tmpp->audio);
  while (!SpeakerStop(&tmpp->audio->speaker)) Sleep(1);
}

U0 PlaySongTask(Play *tmpp)
{//Focus is checked by the song owner even during a long private frame.
  Audio *audio=tmpp->audio;
  Bool paused;
  Fs->task_end_cb=&SpeakerTaskEnd;
  while (TRUE) {
    paused=tmpp->paused || !tmpp->task || sys_focus_task!=tmpp->task;
    if (audio->paused!=paused || audio->speaker.paused!=paused)
      AudioPause(audio,paused);
    SleepUntil(SpeakerTick(&audio->speaker,cnts.jiffies));
  }
}

U0 PlayTick(Play *tmpp,I64 keys,Bool focused)
{//A newly focused or restarted window waits for held keys to be released.
  Controls *input=&tmpp->controls;
  Level *level;
  PlayEnter(tmpp);
  try {
    if (!focused || !tmpp->focused) tmpp->blocked=keys;
    tmpp->focused=focused;
    AudioPause(tmpp->audio,tmpp->paused || !focused);
    tmpp->blocked&=keys;
    if (!focused) keys=0;
    ControlsCmd(input,keys&~tmpp->blocked);
    if (tmpp->stage==TM_PLAY_LEVEL) {
      GameTick(tmpp->game,input->forward,input->side,input->turn,
	    input->buttons,input->weapon,tmpp->paused || !focused);
      SoundSceneUpdate(&tmpp->sound);
      level=tmpp->game->level;
      if (level->world->exit_rqst) PlayFinish(tmpp);
      else if (level->player.reborn) {
	AudioStop(tmpp->audio);
	GameLoad(tmpp->game,level->episode,level->map_num,TRUE);
	PlaySndBind(tmpp);
	ControlsInit(input); tmpp->blocked=keys;
      }
    } else {
      GameTick(tmpp->game,,,,,,TRUE);
      AudioUpdate(tmpp->audio);
      if (tmpp->stage==TM_PLAY_STATS && !tmpp->paused && focused) {
	IntermissionTick(&tmpp->result,input->buttons);
	if (tmpp->result.phase==TM_IM_DONE) PlayNext(tmpp,keys);
      } else if (tmpp->stage==TM_PLAY_FINALE && !tmpp->paused && focused)
	PlayFinaleTick(tmpp,keys);
    }
  } catch {
    PlayLeave(tmpp);
  }
  PlayLeave(tmpp);
}

U0 PlayDel(Play *tmpp)
{
  if (tmpp) {
    PlayEnter(tmpp);
    try {
      if (tmpp->task) throw('Active');
      AudioDel(tmpp->audio); IntermissionGrDel(tmpp->result_gr);
      FinaleGrDel(tmpp->final_gr);
      StoryDel(tmpp->story); GameDel(tmpp->game);
      DCDel(tmpp->front); DCDel(tmpp->back);
    } catch {
      PlayLeave(tmpp);
    }
    Free(tmpp);
  }
}

Play *PlayNew(U8 *wad_name,U8 *data_name="TMDATA.BIN",I64 skill=2,
	Bool fast=FALSE)
{
  Play *tmpp=CAlloc(sizeof(Play));
  try {
    tmpp->game=GameNew(wad_name,data_name,skill,fast);
    tmpp->story=StoryNew(tmpp->game->wad);
    GameLoad(tmpp->game);
    tmpp->audio=AudioNew(tmpp->game->wad,tmpp->game->data);
    SoundSceneInit(&tmpp->sound,tmpp->audio,tmpp->game);
    ControlsInit(&tmpp->controls);
    tmpp->front=DCNew(TM_VIEW_WIDTH*2,TM_PLAY_HEIGHT);
    tmpp->back=DCNew(TM_VIEW_WIDTH*2,TM_PLAY_HEIGHT);
    if (!tmpp->front || !tmpp->back) throw('DC');
    PlayFrame(tmpp);
  } catch {
    PlayDel(tmpp);
  }
  return tmpp;
}

I64 PlayStep(Play *tmpp,I64 *clock,I64 now,I64 keys,Bool focused)
{//Catch up at most four tics before checking messages and showing a frame.
  I64 res=0;
  while (*clock<now && res<4) {
    PlayTick(tmpp,keys,focused);
    (*clock)++; res++;
  }
  return res;
}

Bool PlayKey(Play *tmpp,I64 ch,I64 sc)
{
  if (sc&SCF_KEY_UP) {
    if (ch=='p' || ch=='P') tmpp->pause_down=FALSE;
    return FALSE;
  }
  if (ch==CH_ESC || ch==CH_SHIFT_ESC) {
    tmpp->quit=TRUE;
    return TRUE;
  }
  if ((ch=='p' || ch=='P') && !tmpp->pause_down) {
    tmpp->pause_down=TRUE; tmpp->paused=!tmpp->paused;
    AudioPause(tmpp->audio,tmpp->paused || !tmpp->focused);
    return TRUE;
  }
  if (tmpp->stage==TM_PLAY_FINALE && tmpp->finale.stage==TM_FINAL_CAST &&
	tmpp->focused && (!tmpp->task || sys_focus_task==tmpp->task) &&
	!tmpp->paused && ch!='p' && ch!='P')
    return CastKey(&tmpp->cast,TRUE);
  return FALSE;
}

U0 PlayDrawIt(CTask *task,CDC *dc)
{
  Play *tmpp=task->user_data;
  if (tmpp)
    PlayBlot(tmpp,dc,(task->pix_width-TM_VIEW_WIDTH*2)/2,
	  (task->pix_height-TM_PLAY_HEIGHT)/2);
}

U0 PlayRestore(Play *tmpp,I64 user_data,CTaskSettings *settings)
{//Drain the old draw callback before changing the task's private pointer.
  PlaySndOff(tmpp);
  if (settings) {
    Fs->draw_it=NULL; Refresh(,TRUE);
    Fs->user_data=user_data;
  }
  tmpp->task=NULL;
  if (settings) SettingsPop;
  tmpp->audio->task=NULL;
}

U0 PlayRun(Play *tmpp)
{
  CTaskSettings *settings=NULL;
  I64 user_data=Fs->user_data,clock,ch,sc,keys,msg,ticks;
  Bool changed,focused;
  PlayEnter(tmpp);
  try {
    if (tmpp->task) throw('Active');
    tmpp->task=Fs;
    tmpp->quit=tmpp->paused=tmpp->pause_down=tmpp->focused=FALSE;
    tmpp->blocked=0; ControlsInit(&tmpp->controls);
  } catch {
    PlayLeave(tmpp);
  }
  PlayLeave(tmpp);
  try {
    settings=SettingsPush;
    Fs->draw_it=NULL; Refresh(,TRUE);
    Fs->user_data=tmpp;
    AudioPause(tmpp->audio,TRUE);
    PlaySndBind(tmpp);
    tmpp->audio->task=Fs;
    Fs->song_task=Spawn(&PlaySongTask,tmpp,"TOOM sound",,Fs);
    AutoComplete; WinBorder; WinMax;
    DocCursor; DocClear;
    Fs->win_inhibit=WIG_TASK_DFT-WIF_SELF_FOCUS-WIF_SELF_BORDER;
    Fs->text_attr=BLACK<<4+WHITE;
    Fs->draw_it=&PlayDrawIt;
    clock=Floor(tS*TM_TICK_HZ);
    while (!tmpp->quit) {
      changed=FALSE;
      if (!tmpp->focused || sys_focus_task!=Fs)
	tmpp->pause_down=Bt(kbd.down_bitmap,Char2ScanCode('p'));
      while (msg=ScanMsg(&ch,&sc)) {
	if (msg==MSG_KEY_DOWN) changed|=PlayKey(tmpp,ch,sc);
	else if (msg==MSG_KEY_UP) PlayKey(tmpp,ch,sc|SCF_KEY_UP);
      }
      if (!tmpp->quit) {
	keys=ControlsKeys(&tmpp->controls,kbd.down_bitmap);
	focused=tmpp->focused;
	ticks=PlayStep(tmpp,&clock,Floor(tS*TM_TICK_HZ),
	      keys,sys_focus_task==Fs);
	if (focused!=tmpp->focused) changed=TRUE;
	if (changed || ticks && tmpp->focused && !tmpp->paused)
	  PlayFrame(tmpp);
	Sleep(1);
      }
    }
  } catch {
    PlayRestore(tmpp,user_data,settings);
  }
  PlayRestore(tmpp,user_data,settings);
}

U0 Toom(U8 *wad_name="FREEDOOM.WAD",U8 *data_name="TMDATA.BIN",I64 skill=2,
	Bool fast=FALSE)
{
  Play *tmpp=PlayNew(wad_name,data_name,skill,fast);
  try {
    PlayRun(tmpp);
  } catch {
    PlayDel(tmpp);
  }
  PlayDel(tmpp);
}
