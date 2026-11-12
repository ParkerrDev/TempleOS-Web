//What a game gets from V5.03's Adam and the browser compiler lacks. The
//browser runs this file first, so a game's source is the one TempleOS runs.
//The first SettingsPush starts the window manager, so a program that never
//calls it keeps the browser's own drawing.

#define WINMGR_FPS	120 //TempleOS draws 30000.0/1001 times a second. At
//twice a 60 Hz display no frame misses its beat, and 120 Hz gets every one.

CTask *win_mgr_task;

public Bool AutoComplete(Bool val=OFF)
{//The browser has no AutoComplete task, so it was off and stays off.
  no_warn val;
  return FALSE;
}

public CTaskSettings *SettingsPush(CTask *task=NULL,I64 flags=0)
{//$LK,"SettingsPush",A="FF:::/Adam/TaskSettings.HC,SettingsPush"$ without the AutoComplete task.
  CTaskSettings *tmpse;
  CDoc *doc;
  if (!task) task=Fs;
  if (!TaskValidate(task)) return NULL;
  tmpse=CAlloc(sizeof(CTaskSettings),task);
  tmpse->cur_dir=DirCur(task,task);
  tmpse->draw_it=task->draw_it;
  GrPaletteGet(tmpse->palette);
  tmpse->task_end_cb=task->task_end_cb;
  if (!(flags&TSF_SAME_SONG)) {
    if (tmpse->song_task=task->song_task) {
      Suspend(task->song_task);
      Snd;
    }
    task->song_task=NULL;
  }
  if (tmpse->animate_task=task->animate_task)
    Suspend(task->animate_task);
  task->animate_task=NULL;
  if (doc=DocPut(task)) {
    tmpse->hide_cursor=!Bt(&doc->flags,DOCf_HIDE_CURSOR);
    tmpse->highlight_cursor=!Bt(&doc->flags,DOCf_DONT_HIGHLIGHT_CURSOR);
    tmpse->scroll=!Bt(&doc->flags,DOCf_NO_SCROLL_BARS);
  }
  tmpse->left=task->win_left;
  tmpse->right=task->win_right;
  tmpse->top=task->win_top;
  tmpse->bottom=task->win_bottom;
  tmpse->scroll_x=task->scroll_x;
  tmpse->scroll_y=task->scroll_y;
  tmpse->scroll_z=task->scroll_z;
  tmpse->win_inhibit=task->win_inhibit;
  tmpse->text_attr=task->text_attr;
  StrCpy(tmpse->task_title,task->task_title);
  tmpse->title_src=task->title_src;
  tmpse->border_attr=task->border_attr;
  tmpse->border_src=task->border_src;
  tmpse->border=!Bt(&task->display_flags,DISPLAYf_NO_BORDER);
  tmpse->autocomplete=FALSE;
  tmpse->next=task->next_settings;
  task->next_settings=tmpse;
  if (!TaskValidate(win_mgr_task))
    win_mgr_task=Spawn(&WinMgrTask,NULL,"WinMgr",,task);
  return tmpse;
}

U0 SettingsPop2(CTask *task,CTaskSettings *tmpse)
{
  CDoc *doc;
  if (doc=DocPut(task)) {
    LBEqu(&doc->flags,DOCf_HIDE_CURSOR,!tmpse->hide_cursor);
    LBEqu(&doc->flags,DOCf_DONT_HIGHLIGHT_CURSOR,!tmpse->highlight_cursor);
    LBEqu(&doc->flags,DOCf_NO_SCROLL_BARS,!tmpse->scroll);
  }
  WinBorder(tmpse->border,task);
  WinHorz(tmpse->left,tmpse->right,task);
  WinVert(tmpse->top,tmpse->bottom,task);
  task->scroll_x=tmpse->scroll_x;
  task->scroll_y=tmpse->scroll_y;
  task->scroll_z=tmpse->scroll_z;
  task->win_inhibit=tmpse->win_inhibit;
  task->text_attr=tmpse->text_attr;
  task->border_attr=tmpse->border_attr;
  task->border_src=tmpse->border_src;
  task->title_src=tmpse->title_src;
  StrCpy(task->task_title,tmpse->task_title);
  GrPaletteSet(tmpse->palette);
  Snd;
}

public U0 SettingsPop(CTask *task=NULL,I64 flags=0)
{//$LK,"SettingsPop",A="FF:::/Adam/TaskSettings.HC,SettingsPop"$, which kills the animate and song tasks.
  CTaskSettings *tmpse;
  if (!task) task=Fs;
  if (!TaskValidate(task))
    return;
  if (tmpse=task->next_settings) {
    task->next_settings=tmpse->next;
    Cd(tmpse->cur_dir);
    Free(tmpse->cur_dir);
    task->draw_it=tmpse->draw_it;
    task->task_end_cb=tmpse->task_end_cb;
    if (task->animate_task)
      Kill(task->animate_task);
    if (task->animate_task=tmpse->animate_task)
      Suspend(task->animate_task,FALSE);
    if (!(flags&TSF_SAME_SONG)) {
      if (task->song_task)
	Kill(task->song_task);
      if (task->song_task=tmpse->song_task)
	Suspend(task->song_task,FALSE);
    }
    SettingsPop2(task,tmpse);
    Free(tmpse);
  }
}

U0 WinMgrTask(I64)
{//Like $LK,"WinMgrTask",A="MN:WinMgrTask"$, calls the window's draw_it WINMGR_FPS times a second.
//WinHostDraw is the browser compiler's: it gives draw_it a fresh alias.
  CTask *task=Fs->parent_task;
  F64 next=tS;
  while (TRUE) {
    if (task->draw_it) {
      DCFill(gr.dc,task->text_attr>>4);
      WinHostDraw(task,gr.dc);
      Refresh;
    }
    next+=1.0/WINMGR_FPS;
    if (next<tS) next=tS; //A late frame is dropped, not caught up.
    Sleep(1000*(next-tS));
  }
}
