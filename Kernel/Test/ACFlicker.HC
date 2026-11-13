//Counts WinMgr frames drawn while AutoComplete hides its win to refill it,
//the task switches it lets happen while hidden, and each change of the win
//as it goes to the scrn, with the looks that last only a frame or few.

#define AC_FLICKER_CODES	64

#define ACF_FRAMES	0
#define ACF_HIDDEN	1
#define ACF_REFILLS	2
#define ACF_SWITCHES	3
#define ACF_SPANS	4
#define ACF_CHANGES	5
#define ACF_SHORTS	6
#define ACF_NUM		7
#define ACF_PHASES	3
#define ACF_SHORT_FRAMES	3
#define ACF_TOGGLE_STEPS	30

CTask *ac_flicker_task,*ac_flicker_sampler;
U8 *ac_flicker_word,ac_flicker_text[ACF_PHASES][64];
Bool ac_flicker_on=FALSE,ac_flicker_done=FALSE;
I64 ac_flicker_phase=0,ac_flicker_res[ACF_PHASES][ACF_NUM],ac_flicker_run=-1,
      ac_flicker_left=0,ac_flicker_top=0;
U64 ac_flicker_hash=0;
U0 (*ac_flicker_old_final)(CDC *dc)=NULL;

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

U64 ACFlickerHash()
{//The scrn from the win's left border and first row to the scrn's corner.
//Its title scrolls, so is left out.
  I64 x,y;
  U64 res=0xCBF29CE484222325;
  U8 *row;
  for (y=ac_flicker_top;y<GR_HEIGHT;y++) {
    row=gr.dc2->body+y*gr.dc2->width_internal;
    for (x=ac_flicker_left;x<GR_WIDTH;x+=8) {
      res^=(row+x)(U64 *)[0];
      res*=0x100000001B3;
    }
  }
  return res;
}

U0 ACFlickerFinal(CDC *dc)
{//Each frame, before the mouse, as it goes to the scrn.
  I64 *res=ac_flicker_res[ac_flicker_phase];
  U64 hash;
  if (ac_flicker_on && TaskValidate(ac.task)) {
    hash=ACFlickerHash;
    if (ac_flicker_run<0)
      ac_flicker_run=ACF_SHORT_FRAMES+1; //Its start was before the phase.
    else if (hash!=ac_flicker_hash) {
      res[ACF_CHANGES]++;
      if (ac_flicker_run<=ACF_SHORT_FRAMES)
	res[ACF_SHORTS]++;
      ac_flicker_run=1;
    } else
      ac_flicker_run++;
    ac_flicker_hash=hash;
  }
  if (ac_flicker_old_final)
    (*ac_flicker_old_final)(dc);
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

U0 ACFlickerRun(I64 phase,I64 ms,Bool toggle=FALSE)
{//A new scan code each AutoComplete pass makes it refill its list. Toggle
//types Dir and a new line in turn, so the win changes size.
  I64 i,*res=ac_flicker_res[phase];
  Bool word=FALSE;
  MemSet(res,0,ACF_NUM*sizeof(I64));
  ac_flicker_word=ac.cur_word;
  ac_flicker_phase=phase;
  ac_flicker_run=-1;
  ac_flicker_left=ClampI64(ac.task->win_left-1,0,TEXT_COLS-1)*FONT_WIDTH;
  ac_flicker_top=ClampI64(ac.task->win_top,0,TEXT_ROWS-1)*FONT_HEIGHT;
  ac_flicker_on=TRUE;
  for (i=0;i<ms/20;i++) {
    if (toggle && !(i%ACF_TOGGLE_STEPS)) {
      word=!word;
      if (word)
	DocPrint(DocPut(ac_flicker_task),"Dir");
      else
	DocPrint(DocPut(ac_flicker_task),"\n");
    }
    kbd.scan_code=0x10+i%AC_FLICKER_CODES;
    Sleep(20);
  }
  if (word)
    DocPrint(DocPut(ac_flicker_task),"\n");
  Sleep(1500);
  ac_flicker_on=FALSE;
  ACFlickerText(ac_flicker_text[phase]);
  "AC %d %d %d %d",phase,res[ACF_FRAMES],res[ACF_HIDDEN],res[ACF_REFILLS];
  " %d %d %d %d",res[ACF_SWITCHES],res[ACF_SPANS],
	res[ACF_CHANGES],res[ACF_SHORTS];
  " %s\n",ac_flicker_text[phase];
}

U0 ACFlickerCheck(I64 ms=8000)
{//Phase 0 lists the word Dir, phase 1 is StandBy with no word, and phase 2
//goes from one to the other.
  I64 old_code=kbd.scan_code;
  while (Bt(&ac.flags,ACf_INIT_IN_PROGRESS))
    Sleep(10);
  if (!TaskValidate(ac.task)) throw('NoAC');
  ac_flicker_on=ac_flicker_done=FALSE;
  ac_flicker_old_final=gr.fp_final_scrn_update;
  gr.fp_final_scrn_update=&ACFlickerFinal;
  ac_flicker_task=Spawn(&ACFlickerTask,NULL,"ACFlicker",,Fs);
  ac_flicker_sampler=Spawn(&ACFlickerSample,NULL,"ACSample",,Fs);
  while (sys_focus_task!=ac_flicker_task)
    Sleep(1);
  DocPrint(DocPut(ac_flicker_task),"Dir");
  Sleep(1500); //Its list for the new win settles, as after each phase.
  ACFlickerRun(0,ms);
  DocPrint(DocPut(ac_flicker_task),"\n");
  ACFlickerRun(1,ms);
  ACFlickerRun(2,ms,TRUE);
  kbd.scan_code=old_code;
  gr.fp_final_scrn_update=ac_flicker_old_final;
  ac_flicker_done=TRUE;
  DeathWait(&ac_flicker_task);
  DeathWait(&ac_flicker_sampler);
}
