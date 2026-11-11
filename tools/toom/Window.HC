class TmWindow
{
  CTask *task;
  Play *play;
  I64 state,except,run_except,runs,draws,bad;
  Bool again,stop,stopped;
};

TmWindow *tm_window;
I64 tm_window_done=0,tm_window_stage=0;

U0 TmWindowDraw(CTask *task,CDC *)
{
  if (task->user_data!=0x12345678) tm_window->bad++;
  tm_window->draws++;
}

U0 TmWindowRun(TmWindow *tmpw)
{
  CTaskSettings *settings;
  SettingsPush;
  WinHorz(3,73); WinVert(4,52);
  Fs->text_attr=GREEN<<4+BLUE;
  Fs->win_inhibit=WIG_USER_TASK_DFT|WIF_SELF_MS_L;
  Fs->draw_it=&TmWindowDraw; Fs->user_data=0x12345678;
  settings=Fs->next_settings;
  try {
    tmpw->play=PlayNew("C:/ORACLE/FREEDOOM.WAD","C:/ORACLE/TMDATA.BIN");
    while (!tmpw->stop) {
      tmpw->state=1;
      tmpw->run_except=0;
      try {
	PlayRun(tmpw->play);
      } catch {
	tmpw->run_except=Fs->except_ch; Fs->catch_except=TRUE;
      }
      if (Fs->draw_it!=&TmWindowDraw || Fs->user_data!=0x12345678 ||
	    Fs->next_settings!=settings || Fs->animate_task || Fs->song_task ||
	    Fs->win_left!=3 || Fs->win_right!=73 ||
	    Fs->win_top!=4 || Fs->win_bottom!=52 ||
	    Fs->text_attr!=GREEN<<4+BLUE ||
	    Fs->win_inhibit!=(WIG_USER_TASK_DFT|WIF_SELF_MS_L) ||
	    tmpw->play->task || tmpw->play->flags) throw('Restore');
      tmpw->runs++; tmpw->state=2;
      while (!tmpw->stop && !tmpw->again) Sleep(1);
      tmpw->again=FALSE;
    }
  } catch {
    tmpw->except=Fs->except_ch; Fs->catch_except=TRUE;
    tmpw->state=3;
  }
  PlayDel(tmpw->play); tmpw->play=NULL;
  Fs->draw_it=NULL; Refresh(,TRUE);
  Fs->user_data=0; SettingsPop;
  tmpw->stopped=TRUE;
  while (TRUE) Sleep(1);
}

U0 TmWindowWait(TmWindow *tmpw,I64 *value,I64 expected,I64 size=8)
{
  F64 end=tS+20;
  while (TRUE) {
    if (size==1) {
      if (*value(U8 *)==expected) return;
    } else if (*value>=expected) return;
    if (tmpw->state>=3 || tS>=end) {
      "WAIT STAGE %d STATE %d GOT %d WANT %d FOCUS %X TASK %X INHIBIT %X\n",
	    tm_window_stage,tmpw->state,*value,expected,sys_focus_task,
	    tmpw->task,tmpw->task->win_inhibit;
      throw('WinWait');
    }
    Sleep(1);
  }
}

U0 TmWindowKey(TmWindow *tmpw,I64 ch,I64 sc,Bool down)
{
  LBEqu(kbd.down_bitmap,sc.u8[0],down);
  if (down) PostMsg(tmpw->task,MSG_KEY_DOWN,ch,sc|SCF_NEW_KEY);
  else PostMsg(tmpw->task,MSG_KEY_UP,ch,sc|SCF_KEY_UP);
}

U0 TmWindowTest()
{
  I64 i,except=0,expected,clock,tic,frames,inhibit=Fs->win_inhibit,
	display=Fs->display_flags;
  U8 saved_keys[sizeof(kbd.down_bitmap)];
  CTask *focus=sys_focus_task;
  Play *play;
  F64 end;
  CDC *dc;
  tm_window=CAlloc(sizeof(TmWindow));
  MemCpy(saved_keys,kbd.down_bitmap,sizeof(saved_keys));
  MemSet(kbd.down_bitmap,0,sizeof(kbd.down_bitmap));
  tm_window->task=Spawn(&TmWindowRun,tm_window,"TOOM Host",,Fs);
  try {
    for (i=0;i<3;i++) {
      end=tS+20;
      while (tm_window->state<3 &&
	    tm_window->task->draw_it!=&PlayDrawIt && tS<end) Sleep(1);
      if (tm_window->state!=1 ||
	    tm_window->task->draw_it!=&PlayDrawIt) throw('Attach');
      play=tm_window->play;
      if (tm_window->task->user_data!=play || play->task!=tm_window->task)
	throw('Owner');
      WinFocus(tm_window->task);
      if (i==2)
	play->game->level->map->sector[0].floor_name(I64)='MISSING';
      else {
	tm_window_stage++; TmWindowWait(tm_window,&play->focused,TRUE,1);
	clock=play->game->clock;
	TmWindowKey(tm_window,0,SC_CURSOR_UP,TRUE);
	tm_window_stage++; TmWindowWait(tm_window,&play->game->clock,clock+3);
	if (play->controls.forward!=25) throw('Move');
	TmWindowKey(tm_window,0,SC_CURSOR_UP,FALSE);
	TmWindowKey(tm_window,'p',0x19,TRUE);
	TmWindowKey(tm_window,'p',0x19,FALSE);
	tm_window_stage++; TmWindowWait(tm_window,&play->paused,TRUE,1);
	tic=play->game->level->world->tic; clock=play->game->clock;
	tm_window_stage++; TmWindowWait(tm_window,&play->game->clock,clock+3);
	if (play->game->level->world->tic!=tic) throw('Pause');
	dc=DCNew(tm_window->task->pix_width,tm_window->task->pix_height);
	(*tm_window->task->draw_it)(tm_window->task,dc);
	DCDel(dc);
	frames=play->frames;
	PostMsg(tm_window->task,MSG_KEY_DOWN,'p',0x19);
	clock=play->game->clock;
	tm_window_stage++; TmWindowWait(tm_window,&play->game->clock,clock+2);
	if (!play->paused || play->frames!=frames) throw('Repeat');
	PostMsg(tm_window->task,MSG_KEY_DOWN,'p',0x19|SCF_NEW_KEY);
	tm_window_stage++; TmWindowWait(tm_window,&play->paused,FALSE,1);
	tm_window_stage++;
	TmWindowWait(tm_window,&play->game->level->world->tic,tic+2);
	Fs->win_inhibit&=~WIF_SELF_FOCUS;
	Bts(&Fs->display_flags,DISPLAYf_CHILDREN_NOT_ON_TOP); WinFocus;
	tm_window_stage++; TmWindowWait(tm_window,&play->focused,FALSE,1);
	tic=play->game->level->world->tic; clock=play->game->clock;
	TmWindowKey(tm_window,0,SC_CURSOR_UP,TRUE);
	tm_window_stage++; TmWindowWait(tm_window,&play->game->clock,clock+2);
	if (play->game->level->world->tic!=tic) throw('Blur');
	WinFocus(tm_window->task);
	tm_window_stage++; TmWindowWait(tm_window,&play->focused,TRUE,1);
	clock=play->game->clock;
	tm_window_stage++; TmWindowWait(tm_window,&play->game->clock,clock+2);
	if (play->controls.forward) throw('Held');
	TmWindowKey(tm_window,0,SC_CURSOR_UP,FALSE);
	frames=play->frames;
	tm_window_stage++; TmWindowWait(tm_window,&play->frames,frames+2);
	if (i)
	  PostMsg(tm_window->task,MSG_KEY_DOWN,CH_SHIFT_ESC,SC_ESC|SCF_SHIFT);
	else PostMsg(tm_window->task,MSG_KEY_DOWN,CH_ESC,SC_ESC);
      }
      tm_window_stage++; TmWindowWait(tm_window,&tm_window->state,2);
      (*tm_window->task->draw_it)(tm_window->task,NULL);
      expected=0;
      if (i==2) expected='Flat';
      if (tm_window->except || tm_window->bad ||
	    tm_window->run_except!=expected) throw('Restore');
      if (i<2) {
	tm_window->state=0; tm_window->again=TRUE;
      }
    }
    if (tm_window->runs!=3 || !tm_window->draws) throw('Runs');
  } catch {
    except=Fs->except_ch; Fs->catch_except=TRUE;
  }
  if (tm_window->state==2) {
    tm_window->stop=TRUE;
    end=tS+5;
    while (!tm_window->stopped && tS<end) Sleep(1);
  }
  if (tm_window->except) {
    "WINDOW CHILD EXCEPT %C\n",tm_window->except;
    except=tm_window->except;
  }
  Kill(tm_window->task);
  MemCpy(kbd.down_bitmap,saved_keys,sizeof(saved_keys));
  Fs->win_inhibit=inhibit; Fs->display_flags=display;
  if (TaskValidate(focus)) WinFocus(focus);
  Free(tm_window); tm_window=NULL;
  if (except) throw(except);
  tm_window_done=1;
  "WINDOW 3 RUNS INPUT FOCUS PAUSE EXIT FAULT RESTORE BAD 0\n";
}

TmWindowTest;
