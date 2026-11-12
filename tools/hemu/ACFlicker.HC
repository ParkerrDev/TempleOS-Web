//Counts WinMgr frames drawn while AutoComplete hides its win to refill it,
//and the task switches it lets happen while hidden.

#define AC_FLICKER_CODES	64

#define ACF_FRAMES	0
#define ACF_HIDDEN	1
#define ACF_REFILLS	2
#define ACF_SWITCHES	3
#define ACF_SPANS	4
#define ACF_NUM		5

CTask *ac_flicker_task,*ac_flicker_sampler;
U8 *ac_flicker_word,ac_flicker_text[2][64];
Bool ac_flicker_on=FALSE,ac_flicker_done=FALSE;
I64 ac_flicker_phase=0,ac_flicker_res[2][ACF_NUM];

Bool ACFlickerHidden()
{
  return ac_flicker_on && TaskValidate(ac.task) &&
	!Bt(&ac.task->display_flags,DISPLAYf_SHOW);
}

U0 ACFlickerDraw(CTask *,CDC *)
{//Each WinMgr frame. Was the AutoComplete win left out of it?
  I64 *res=ac_flicker_res[ac_flicker_phase];
  if (ac_flicker_on && TaskValidate(ac.task)) {
    res[ACF_FRAMES]++;
    if (ACFlickerHidden)
      res[ACF_HIDDEN]++;
    if (ac.cur_word!=ac_flicker_word) {//New before old is freed.
      ac_flicker_word=ac.cur_word;
      res[ACF_REFILLS]++;
    }
  }
}

U0 ACFlickerSample(I64)
{//Runs between the other tasks, so it sees each switch while hidden.
  I64 *res;
  Bool hidden,was=FALSE;
  while (!ac_flicker_done) {
    res=ac_flicker_res[ac_flicker_phase];
    if (hidden=ACFlickerHidden) {
      res[ACF_SWITCHES]++;
      if (!was) res[ACF_SPANS]++;
    }
    was=hidden;
    Yield;
  }
}

U0 ACFlickerTask(I64)
{//A focused win whose last word AutoComplete lists.
  DocTermNew;
  SettingsPush; //See $LK,"SettingsPush",A="MN:SettingsPush"$
  WinHorz(2,40);
  WinVert(3,10);
  LBts(&Fs->display_flags,DISPLAYf_SHOW);
  Fs->draw_it=&ACFlickerDraw;
  Fs->win_inhibit=WIG_USER_TASK_DFT; //Spawn's dft inhibits self focus.
  WinFocus;
  while (!ac_flicker_done)
    Sleep(20);
  SettingsPop;
}

U0 ACFlickerText(U8 *dst)
{//First text line of the shown list.
  CDoc *doc=DocDisplay(ac.task);
  CDocEntry *tmpde;
  I64 i;
  *dst=0;
  DocLock(doc);
  tmpde=doc->head.next;
  while (tmpde!=doc) {
    if (tmpde->type_u8==DOCT_TEXT) {
      i=MinI64(StrLen(tmpde->tag),63);
      MemCpy(dst,tmpde->tag,i);
      dst[i]=0;
      break;
    }
    tmpde=tmpde->next;
  }
  DocUnlock(doc);
}

U0 ACFlickerRun(I64 phase,I64 ms)
{//A new scan code each AutoComplete pass makes it refill its list.
  I64 i,*res=ac_flicker_res[phase];
  MemSet(res,0,ACF_NUM*sizeof(I64));
  ac_flicker_word=ac.cur_word;
  ac_flicker_phase=phase;
  ac_flicker_on=TRUE;
  for (i=0;i<ms/20;i++) {
    kbd.scan_code=0x10+i%AC_FLICKER_CODES;
    Sleep(20);
  }
  Sleep(1500);
  ac_flicker_on=FALSE;
  ACFlickerText(ac_flicker_text[phase]);
  "AC %d %d %d %d",phase,res[ACF_FRAMES],res[ACF_HIDDEN],res[ACF_REFILLS];
  " %d %d %s\n",res[ACF_SWITCHES],res[ACF_SPANS],ac_flicker_text[phase];
}

U0 ACFlickerCheck(I64 ms=8000)
{//Phase 0 lists the word Dir, phase 1 is StandBy with no word.
  I64 old_code=kbd.scan_code;
  while (Bt(&ac.flags,ACf_INIT_IN_PROGRESS))
    Sleep(10);
  if (!TaskValidate(ac.task)) throw('NoAC');
  ac_flicker_on=ac_flicker_done=FALSE;
  ac_flicker_task=Spawn(&ACFlickerTask,NULL,"ACFlicker",,Fs);
  ac_flicker_sampler=Spawn(&ACFlickerSample,NULL,"ACSample",,Fs);
  while (sys_focus_task!=ac_flicker_task)
    Sleep(1);
  DocPrint(DocPut(ac_flicker_task),"Dir");
  ACFlickerRun(0,ms);
  DocPrint(DocPut(ac_flicker_task),"\n");
  ACFlickerRun(1,ms);
  kbd.scan_code=old_code;
  ac_flicker_done=TRUE;
  DeathWait(&ac_flicker_task);
  DeathWait(&ac_flicker_sampler);
}
