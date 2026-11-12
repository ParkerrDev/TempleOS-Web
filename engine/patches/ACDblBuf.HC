//AutoComplete hides its win while it fills its doc, and each print and
//disk read yields, so the WinMgr draws frames with the win missing.
//Fill the task's other doc instead and swap it in whole, by DocDblBufSwap.

#define AC_DBL_BUF_NUM	4

CDoc *ac_dbl_buf_doc=NULL;
I64 ac_dbl_buf_task_num=-1,ac_dbl_buf_left=0,ac_dbl_buf_top=0,
      ac_dbl_buf_revision=0,ac_dbl_buf_except=0;
U8 *ac_dbl_buf_old[AC_DBL_BUF_NUM],*ac_dbl_buf_new[AC_DBL_BUF_NUM];

CDoc *ACDblBufBack()
{//The doc the next list goes in. The shown one stays on the scrn.
  if (DocPut==DocDisplay) {
    if (ac_dbl_buf_task_num==Fs->task_num)
      Fs->put_doc=ac_dbl_buf_doc;
    else {
      DocDblBufStart;
      ac_dbl_buf_task_num=Fs->task_num;
    }
  }
  return DocPut;
}

Bool ACDblBufShow()
{//Swap in the finished doc. FALSE if the win z buf must be redone.
  if (DocPut!=DocDisplay) {
    DocLock(DocDisplay); //Any wait comes before the move and swap.
    WinHorz(ac_dbl_buf_left,Fs->win_right);
    WinVert(ac_dbl_buf_top,Fs->win_bottom);
    DocDblBufSwap;
    ac_dbl_buf_doc=DocPut;
    Fs->put_doc=Fs->display_doc; //Clicked links act on the shown doc.
    LBts(&Fs->display_flags,DISPLAYf_SHOW);
    return FALSE;
  }
  return LBts(&Fs->display_flags,DISPLAYf_SHOW);
}

U64 ACDblBufHash(U8 *src,I64 size)
{
  I64 i;
  U64 res=0xCBF29CE484222325;
  for (i=0;i<size;i++) {
    res^=src[i];
    res*=0x100000001B3;
  }
  return res;
}

U8 *ACDblBufCut(U8 *file,U8 *start,U8 *end)
{//A copy of the text from start up to end. Start occurs once.
  U8 *ptr=StrMatch(start,file),*ptr2,*res;
  if (!ptr || StrMatch(start,ptr+1) || !(ptr2=StrMatch(end,ptr)))
    throw('ACVer');
  res=MAlloc(ptr2-ptr+1);
  MemCpy(res,ptr,ptr2-ptr);
  res[ptr2-ptr]=0;
  return res;
}

U8 *ACDblBufSub(U8 *st,U8 *needle,U8 *replacement)
{//An exact source marker must occur once. Ownership moves to the result.
  U8 *ptr=StrMatch(needle,st),*res;
  I64 n=StrLen(needle),len;
  if (!ptr || StrMatch(needle,ptr+n)) throw('ACVer');
  len=ptr-st;
  res=MAlloc(StrLen(st)+StrLen(replacement)+1);
  MemCpy(res,st,len);
  StrCpy(res+len,replacement);
  StrCpy(res+len+StrLen(replacement),ptr+n);
  Free(st);
  return res;
}

U8 *ACDblBufFind(U8 *name)
{
  CHashFun *tmpf=HashFind(name,Fs->hash_table,HTT_FUN);
  if (!tmpf || !tmpf->exe_addr) throw('ACBuild');
  return tmpf->exe_addr;
}

U0 ACDblBufTask(U8 *file,U8 *start,U8 *end,U8 *name)
{//One ACTask routine that shows its list by swapping docs.
  U8 *st=ACDblBufCut(file,start,end);
  st=ACDblBufSub(st,start,name);
  st=ACDblBufSub(st,"if (!LBts(&Fs->display_flags,DISPLAYf_SHOW))",
	"if (!ACDblBufShow)");
  ExePrint("%s",st);
  Free(st);
}

U0 ACDblBufBuild()
{//Compile the installed native routines with only the double buffer.
  U8 *file,*st;
  I64 size;
  file=FileRead("::/Adam/AutoComplete/ACTask.HC.Z",&size);
  if (!file) throw('ACFile');
  if (size!=7294 || ACDblBufHash(file,size)!=0x1EB31CB34E3A773B) {
    Free(file);
    throw('ACVer');
  }
  st=ACDblBufCut(file,"U0 ACDocRst(","I64 ACSkipCrap(");
  st=ACDblBufSub(st,"U0 ACDocRst(","U0 ACDblBufRst(");
  st=ACDblBufSub(st,"  CDoc *doc=DocPut;","  CDoc *doc=ACDblBufBack;");
  st=ACDblBufSub(st,"  LBtr(&Fs->display_flags,DISPLAYf_SHOW);\n"
	"  WinHorz(left,Fs->win_right);\n  WinVert(top,Fs->win_bottom);",
	"  ac_dbl_buf_left=left;\n  ac_dbl_buf_top=top;");
  ExePrint("%s",st);
  Free(st);
  ACDblBufTask(file,"U0 ACTaskNormal(","U0 ACTaskCtrl(","U0 ACDblBufNormal(");
  ACDblBufTask(file,"U0 ACTaskCtrl(","U0 ACTaskAlt(","U0 ACDblBufCtrl(");
  ACDblBufTask(file,"U0 ACTaskAlt(","U0 ACTaskEndCB(","U0 ACDblBufAlt(");
  Free(file);
  ac_dbl_buf_new[0]=ACDblBufFind("ACDblBufRst");
  ac_dbl_buf_new[1]=ACDblBufFind("ACDblBufNormal");
  ac_dbl_buf_new[2]=ACDblBufFind("ACDblBufCtrl");
  ac_dbl_buf_new[3]=ACDblBufFind("ACDblBufAlt");
}

U0 ACDblBufInstall()
{//Core 0 runs every win task and does not preempt, so the AutoComplete
//task waits in a Yield, never in a first instruction. PUSH RBP and
//MOV RBP,RSP stay, so an entry context stays good.
  I64 i;
  if (Gs->num || TaskValidate(ac.task) && ac.task->gs!=Gs) throw('ACCore');
  ac_dbl_buf_old[0]=&ACDocRst;
  ac_dbl_buf_old[1]=&ACTaskNormal;
  ac_dbl_buf_old[2]=&ACTaskCtrl;
  ac_dbl_buf_old[3]=&ACTaskAlt;
  for (i=0;i<AC_DBL_BUF_NUM;i++)
    if (ac_dbl_buf_old[i](U32 *)[0]!=0xEC8B4855 || ac_dbl_buf_old[i][4]==0xE9)
      throw('ACEntry'); //Unknown code, or patched already.
  ACDblBufBuild;
  for (i=0;i<AC_DBL_BUF_NUM;i++)
    if (ac_dbl_buf_new[i](U32 *)[0]!=0xEC8B4855)
      throw('ACEntry');
  PUSHFD
  CLI
  for (i=0;i<AC_DBL_BUF_NUM;i++) {
    ac_dbl_buf_old[i][4]=0xE9;
    (ac_dbl_buf_old[i]+5)(I32 *)[0]=ac_dbl_buf_new[i]-ac_dbl_buf_old[i]-5;
  }
  ac_dbl_buf_revision=1;
  POPFD
}

U0 ACDblBufTry()
{//Install, or keep why not, so a job can go on to other corrections.
  try
    ACDblBufInstall;
  catch {
    ac_dbl_buf_except=Fs->except_ch;
    Fs->catch_except=TRUE;
  }
}
