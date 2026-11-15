U8 *win_draw_ref=NULL;
I64 win_draw_phase,win_draw_blink;

U0 WinDrawRef(Bool solid,I64 scroll_x,I64 scroll_y,I64 held)
{//Capture unmodified V5.03 drawing into a private bitmap.
  I64 old_l=Fs->win_left,old_r=Fs->win_right,
	old_t=Fs->win_top,old_b=Fs->win_bottom,
	old_attr=Fs->border_attr;
  CDC *old_dc=gr.dc2,*dc=DCNew(640,480);
  U32 *old_text=gr.text_base,*buf=CAlloc(TEXT_COLS*TEXT_ROWS*4);
  U8 title[STR_LEN];
  CDoc *doc,*pdoc;
  CDocEntry *doc_e,*next;
  CCtrl c;
  CWinScroll s;
  StrCpy(title,Fs->task_title);
  WinHorz(1,38);
  WinVert(1,18);
  Fs->border_attr=0xF1;
  StrCpy(Fs->task_title,"Native Tools");
  doc=DocBorderNew(NULL);
  pdoc=DocNew;
  pdoc->desc='Native';
  doc_e=doc->head.next;
  while (doc_e!=doc) {
    next=doc_e->next;
    if (doc_e->type_u8==DOCT_TEXT && doc_e->tag && StrLen(doc_e->tag)>4)
      DocEntryDel(doc,doc_e); //The browser has no native task address.
    doc_e=next;
  }
  PUSHFD
  CLI
  gr.dc2=dc;
  gr.text_base=buf;
  TextBorder(sys_winmgr_task,1,38,1,18,0xF1,solid);
  win_draw_phase=ToI64(tS*FONT_WIDTH*DOC_SCROLL_SPEED);
  win_draw_blink=Blink;
  DocRecalc(doc,RECALCt_TO_SCRN);
  DocBorderLstDraw(pdoc);
  GrUpdateTextBG;
  GrUpdateTextFG;
  MemSet(&c,0,sizeof(CCtrl));
  MemSet(&s,0,sizeof(CWinScroll));
  c.win_task=Fs;
  c.state=&s;
  s.max=1000000;
  s.pos=scroll_x;
  c.type=CTRLT_WIN_HSCROLL;
  if (held&1) c.flags=CTRLF_CLICKED;
  WinDerivedScrollValsUpdate(&c);
  DrawWinScroll(dc,&c);
  s.pos=scroll_y;
  c.type=CTRLT_WIN_VSCROLL;
  c.flags=0;
  if (held&2) c.flags=CTRLF_CLICKED;
  WinDerivedScrollValsUpdate(&c);
  DrawWinScroll(dc,&c);
  if (!win_draw_ref) win_draw_ref=MAlloc(640*480);
  MemCpy(win_draw_ref,dc->body,640*480);
  gr.dc2=old_dc;
  gr.text_base=old_text;
  POPFD
  DocDel(doc);
  DocDel(pdoc);
  DCDel(dc);
  Free(buf);
  StrCpy(Fs->task_title,title);
  Fs->border_attr=old_attr;
  WinHorz(old_l,old_r);
  WinVert(old_t,old_b);
}
