//Moves the AutoComplete win as a drag of its title bar does, then makes it
//list again, show the key map, list again and start over, and keeps where
//its win is after each.

#define ACM_LEFT	20
#define ACM_TOP		30
#define ACM_STEPS_NUM	7

CTask *ac_move_task;
Bool ac_move_done=FALSE;
I64 ac_move_res[ACM_STEPS_NUM][2];

U0 ACMoveTask(I64)
{//A focused win whose last word AutoComplete lists.
  DocTermNew;
  SettingsPush; //See $LK,"SettingsPush",A="MN:SettingsPush"$
  WinHorz(2,40);
  WinVert(3,10);
  LBts(&Fs->display_flags,DISPLAYf_SHOW);
  Fs->win_inhibit=WIG_USER_TASK_DFT; //No key descs, so no slow key map.
  WinFocus;
  while (!ac_move_done)
    Sleep(20);
  SettingsPop;
}

U0 ACMoveStep(I64 step,I64 sc)
{//A new scan code makes AutoComplete list again. Ctrl and Alt make it
//show the key map.
  kbd.scan_code=sc;
  Sleep(1200);
  ac_move_res[step][0]=ac.task->win_left;
  ac_move_res[step][1]=ac.task->win_top;
}

U0 ACMoveDrag(I64 step)
{//As the WinMgr moves a win whose title bar is dragged.
  CTask *task=ac.task;
  WinHorz(ACM_LEFT,task->win_width-1+ACM_LEFT,task);
  WinVert(ACM_TOP,task->win_height-1+ACM_TOP,task);
  Sleep(200);
  ac_move_res[step][0]=task->win_left;
  ac_move_res[step][1]=task->win_top;
}

U0 ACMoveCheck()
{//Prints the col and row of the win after each step.
  I64 i,old_code=kbd.scan_code;
  while (Bt(&ac.flags,ACf_INIT_IN_PROGRESS))
    Sleep(10);
  if (!TaskValidate(ac.task)) throw('NoAC');
  ac_move_done=FALSE;
  MemSet(ac_move_res,0,sizeof(ac_move_res));
  ac_move_task=Spawn(&ACMoveTask,NULL,"ACMove",,Fs);
  while (sys_focus_task!=ac_move_task)
    Sleep(1);
  DocPrint(DocPut(ac_move_task),"Dir");
  ACMoveStep(0,0x10);
  ACMoveDrag(1);
  ACMoveStep(2,0x11);
  DocPrint(DocPut(ac_move_task),"\n");
  ACMoveStep(3,0x12);
  ACMoveStep(4,SCF_CTRL|SCF_ALT|0x13);
  ACMoveStep(5,0x14);
  AutoComplete;
  AutoComplete(ON);
  DocPrint(DocPut(ac_move_task),"Dir");
  ACMoveStep(6,0x15);
  kbd.scan_code=old_code;
  ac_move_done=TRUE;
  DeathWait(&ac_move_task);
  "ACM";
  for (i=0;i<ACM_STEPS_NUM;i++)
    " %d,%d",ac_move_res[i][0],ac_move_res[i][1];
  '\n';
}
