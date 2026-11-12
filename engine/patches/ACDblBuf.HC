//AutoComplete hides its win while it fills its doc, and each print and
//disk read yields, so the WinMgr draws frames with the win missing.
//Fill the task's other doc instead and swap it in whole, by DocDblBufSwap.
//The scroll bars are ctrls, drawn from each update while the scrn still
//shows the text of the one before, so they are drawn where that text was.
//The host may give the text of ACTask.HC.Z, checked as the file would be,
//and may build on another core, so core 0 only checks and jumps.

#define AC_DBL_BUF_NUM	4

CDoc *ac_dbl_buf_doc=NULL;
I64 ac_dbl_buf_task_num=-1,ac_dbl_buf_left=0,ac_dbl_buf_top=0,
      ac_dbl_buf_revision=0,ac_dbl_buf_except=0;
Bool ac_dbl_buf_built=FALSE;
U8 *ac_dbl_buf_old[AC_DBL_BUF_NUM],*ac_dbl_buf_new[AC_DBL_BUF_NUM];

class CACDblBufScroll
{//Where a scroll bar was last drawn, in scrn pixels.
  Bool drawn; //FALSE if not since the win was shown.
  I64 left,right,top,bottom;
} ac_dbl_buf_scroll[2];

U0 ACDblBufScrollOut(CCtrl *c,CACDblBufScroll *s)
{//Out of the win, which shrank or moved. The z buf gives the place to the
//win under it, but the scrn still shows this win's text there.
  CDC *dc=DCAlias(gr.dc2,Fs);
  dc->flags|=DCF_ON_TOP;
  c->left=s->left-Fs->pix_left;
  c->right=s->right-Fs->pix_left;
  c->top=s->top-Fs->pix_top;
  c->bottom=s->bottom-Fs->pix_top;
  DrawWinScroll(dc,c);
  DCDel(dc);
}

U0 ACDblBufScrollDraw(CDC *dc,CCtrl *c)
{//The scrn shows a win's text from the last update that drew the win,
//but its ctrls from this one. Draw the bar where it was, by that text.
  CACDblBufScroll *s=&ac_dbl_buf_scroll[c->type==CTRLT_WIN_VSCROLL];
  CTask *task=c->win_task;
  I64 left=c->left,right=c->right,top=c->top,bottom=c->bottom;
  if (s->drawn) {
    c->left=s->left-task->pix_left;
    c->right=s->right-task->pix_left;
    c->top=s->top-task->pix_top;
    c->bottom=s->bottom-task->pix_top;
    if (0<=c->left && c->right<task->pix_width &&
	  0<=c->top && c->bottom<task->pix_height)
      DrawWinScroll(dc,c);
    else
      ACDblBufScrollOut(c,s);
    c->left=left;
    c->right=right;
    c->top=top;
    c->bottom=bottom;
  }
  s->left=left+task->pix_left;
  s->right=right+task->pix_left;
  s->top=top+task->pix_top;
  s->bottom=bottom+task->pix_top;
  s->drawn=TRUE;
}

U0 ACDblBufScrollSet(I64 type)
{//Take a bar from the stock routine, where it drew it last. DrawCtrls
//draws it with the win one char bigger, to reach the border.
  CCtrl *c=CtrlFindUnique(Fs,type);
  CACDblBufScroll *s=&ac_dbl_buf_scroll[type==CTRLT_WIN_VSCROLL];
  if (c && c->draw_it==&DrawWinScroll) {
    s->left=c->left+Fs->pix_left-FONT_WIDTH;
    s->right=c->right+Fs->pix_left-FONT_WIDTH;
    s->top=c->top+Fs->pix_top-FONT_HEIGHT;
    s->bottom=c->bottom+Fs->pix_top-FONT_HEIGHT;
    s->drawn=Bt(&Fs->display_flags,DISPLAYf_SHOW);
    c->draw_it=&ACDblBufScrollDraw;
  }
}

CDoc *ACDblBufBack()
{//The doc the next list goes in. The shown one stays on the scrn.
  if (DocPut==DocDisplay) {
    if (ac_dbl_buf_task_num==Fs->task_num)
      Fs->put_doc=ac_dbl_buf_doc;
    else {
      DocDblBufStart;
      ACDblBufScrollSet(CTRLT_WIN_HSCROLL);
      ACDblBufScrollSet(CTRLT_WIN_VSCROLL);
      ac_dbl_buf_task_num=Fs->task_num;
    }
  }
  return DocPut;
}

U0 ACDblBufBorder(CDoc *old,CDoc *doc)
{//The border's More, $$ and type fields show the doc they were made with.
  CDoc *bdoc=DocBorder;
  CDocEntry *tmpde;
  if (!bdoc) return;
  tmpde=bdoc->head.next;
  while (tmpde!=bdoc) {
    if (tmpde->user_data==old)
      tmpde->user_data=doc;
    tmpde=tmpde->next;
  }
}

Bool ACDblBufShow()
{//Swap in the finished doc. FALSE if the win z buf must be redone.
//Nothing from the lock to the swap yields, so the WinMgr's first frame of
//the new doc has the size and scroll it would settle on frames later.
  Bool res=TRUE;
  if (DocPut!=DocDisplay) {
    DocLock(DocDisplay); //Any wait comes before the move and swap.
    WinHorz(ac_dbl_buf_left,Fs->win_right);
    WinVert(ac_dbl_buf_top,Fs->win_bottom);
    DocRecalc(DocPut,RECALCt_NORMAL|RECALCF_HAS_CURSOR); //Fits the win to it
    DocRecalc(DocPut,RECALCt_NORMAL|RECALCF_HAS_CURSOR); //and scrolls in it.
    DocDblBufSwap;
    ac_dbl_buf_doc=DocPut;
    Fs->put_doc=Fs->display_doc; //Clicked links act on the shown doc.
    ACDblBufBorder(ac_dbl_buf_doc,Fs->display_doc);
    res=FALSE;
  }
  if (!LBts(&Fs->display_flags,DISPLAYf_SHOW)) {
    ac_dbl_buf_scroll[0].drawn=ac_dbl_buf_scroll[1].drawn=FALSE;
    res=FALSE;
  }
  return res;
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

U8 *ACDblBufRead(U8 *src,I64 size,I64 *_size)
{//The installed ACTask.HC.Z, or the host's copy of its text, checked alike.
  U8 *res;
  if (!src)
    return FileRead("::/Adam/AutoComplete/ACTask.HC.Z",_size);
  res=MAlloc(size+1);
  MemCpy(res,src,size);
  res[size]=0;
  *_size=size;
  return res;
}

U0 ACDblBufBuild(U8 *src=NULL,I64 size=0)
{//Compile the installed native routines with only the double buffer.
  U8 *file,*st;
  file=ACDblBufRead(src,size,&size);
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
  ac_dbl_buf_built=TRUE;
}

U0 ACDblBufBuildTry(U8 *src=NULL,I64 size=0)
{//Build on any core, or keep why not. ACDblBufTry installs it.
  try
    ACDblBufBuild(src,size);
  catch {
    ac_dbl_buf_except=Fs->except_ch;
    Fs->catch_except=TRUE;
  }
}

U0 ACDblBufInstall(U8 *src=NULL,I64 size=0)
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
  if (!ac_dbl_buf_built)
    ACDblBufBuild(src,size);
  MemSet(ac_dbl_buf_scroll,0,sizeof(ac_dbl_buf_scroll));
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

U0 ACDblBufTry(U8 *src=NULL,I64 size=0)
{//Install, or keep why not, so a job can go on to other corrections.
  try
    ACDblBufInstall(src,size);
  catch {
    ac_dbl_buf_except=Fs->except_ch;
    Fs->catch_except=TRUE;
  }
}
