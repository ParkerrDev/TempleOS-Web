U0 KqEnter(I64 room)
{
  KqActor *a=&kq_actor[0];
  U8 *p=KqCel(a->view,a->loop,a->cel);
  I64 width=6;
  if (!(0<=room<85)) {kq_next_room=-1;return;}
  KqUnderClear;
  if (p) width=p[1];
  switch (kq_var[3]) {
    case 1: a->x=158-width;break;
    case 2: a->x=2;break;
    case 3: a->y=165;break;
    case 4: a->y=42;break;
  }
  kq_var[18]=kq_var[1];kq_var[1]=room;
  kq_var[3]=0;kq_var[6]=0;kq_var[21]=0;kq_var[22]=0;
  kq_var[14]=RandU16&1;kq_next_room=-1;
  kq_block_x=0;kq_block_y=0;
  kq_sound_base=0;KqSound(0);
  a->dir=0;a->mode=0;a->flags=0;
  MemSet(kq_display,0,sizeof(kq_display));
}

U0 KqReset()
{
  I64 n,i;
  U8 *p=FileRead("Data/INITIAL.BIN",&n);
  KqUnderClear;
  MemSet(kq_var,0,sizeof(kq_var));
  MemSet(kq_actor,0,sizeof(kq_actor));
  if (p && n>=1150) MemCpy(kq_object,p+262,888);
  Free(p);
  kq_var[24]=3;kq_next_room=-1;kq_picture=1;
  kq_control=TRUE;kq_cycle_all=FALSE;kq_game_over=FALSE;
  kq_quit=FALSE;kq_dir=0;kq_input_len=0;*kq_input=0;
  kq_block_x=0;kq_block_y=0;kq_message_row=0;kq_message_col=0;
  kq_text_fg=15;kq_text_bg=0;kq_verb=0;kq_noun=0;
  kq_sound_base=0;KqSound(0);
  MemSet(kq_messages,0,sizeof(kq_messages));
  MemSet(kq_display,0,sizeof(kq_display));
  for (i=0;i<111;i++) kq_actor[i].priority=15;
  KqIdle(0);
  if (kq_next_room>=0) KqEnter(kq_next_room);
  KqIdle(0);KqIdle(kq_var[1]);KqPaint;
}

U0 KqParse(U8 *st)
{
  U8 word[24][40],*p,*q,*r;
  I64 i=0,j=0,n=0,seq,type,token,len,best,best_type,best_token;
  Bool found,verb_found=FALSE,noun_found=FALSE;
  if (!StrICmp(st,"restart")) {KqReset;return;}
  if (!StrICmp(st,"jump")) {kq_var[17]=1;return;}
  if (!StrICmp(st,"duck")) {
    kq_var[31]=!kq_var[31];kq_var[16]=kq_var[31];return;
  }
  if (!StrICmp(st,"quit")) {kq_quit=TRUE;return;}
  if (!StrICmp(st,"save") || !StrICmp(st,"save game")) {
    KqSave(FALSE);return;
  }
  if (!StrICmp(st,"restore") || !StrICmp(st,"restore game")) {
    KqSave(TRUE);return;
  }
  MemSet(word,0,sizeof(word));
  while (*st && n<24) {
    if ('A'<=*st<='Z') *st+=32;
    if ('a'<=*st<='z' || '0'<=*st<='9' || *st=='\'') {
      if (j<39) word[n][j++]=*st;
    } else if (j) {n++;j=0;}
    st++;
  }
  if (j) n++;
  kq_verb=1;kq_noun=2;kq_input_matched=FALSE;
  while (i<n) {
    p=kq_words;found=FALSE;best=0;best_type=4;best_token=0;
    while (p && *p && *p!='{') {
      q=p+StrLen(p)+1;seq=q[0];type=q[1];token=q[2];
      len=1;
      if (!StrCmp(word[i],p) && seq!=3) {
	if (seq==2) {
	  r=q+3;
	  if (i+1<n && !StrCmp(word[i+1],r)) {
	    q=r+StrLen(r)+1;type=q[1];token=q[2];len=2;
	  } else len=0;
	}
	if (len>best) {
	  found=TRUE;best=len;best_type=type;best_token=token;
	}
      }
      p=p+StrLen(p)+4;
    }
    if (found) {
      if (best_type==2 && !verb_found) {
	kq_verb=best_token;verb_found=TRUE;
      }
      if (best_type==3 && !noun_found) {
	kq_noun=best_token;noun_found=TRUE;
      }
      i+=best;
    } else i++;
  }
  kq_var[28]=0;
  KqInput(0);
  if (kq_next_room>=0) KqEnter(kq_next_room);
  KqInput(kq_var[1]);
  if (kq_next_room>=0) KqEnter(kq_next_room);
  if (!kq_input_matched) KqSay("Try describing an action and an object.");
  kq_var[28]=3;
}

U0 KqDraw(CTask *task,CDC *dc)
{
  I64 x=(task->pix_width-640)/2,y=MaxI64(8,(task->pix_height-464)/2),i;
  dc->color=BLACK;GrRect(dc,0,0,task->pix_width,task->pix_height);
  dc->color=WHITE;
  GrPrint(dc,x,y,"KING'S QUEST     Score: %d of 158",kq_var[19]);
  GrBlot(dc,x,y+16,kq_frame);
  dc->color=kq_text_fg;
  for (i=0;i<25;i++)
    if (*kq_display[i]) GrPrint(dc,x,y+i*16,"%s",kq_display[i]);
  dc->color=WHITE;
  for (i=0;i<8;i++)
    GrPrint(dc,x+8,y+360+i*8,"%s",kq_messages[i]);
  GrPrint(dc,x+8,y+428,"> %s_",kq_input);
  dc->color=LTGRAY;
  GrPrint(dc,x+8,y+448,
	"Arrows walk  0 jump  - duck  = swim  F5 save  F7 restore  F12 quit");
}

U0 KqTick()
{
  I64 i,guard=0;
  kq_var[3]=0;kq_var[6]=0;kq_var[21]=0;kq_var[22]=0;
  if (!kq_game_over) {
    for (i=0;i<111;i++) KqActorTick(i);
    if (kq_var[2]) kq_var[2]--;
    for (i=9;i<=12;i++)
      if (kq_var[i]) kq_var[i]--;
  }
  kq_var[13]=(kq_var[13]+1)%3;
  do {
    if (kq_next_room>=0) KqEnter(kq_next_room);
    KqIdle(0);
    if (kq_next_room<0) KqIdle(kq_var[1]);
  } while (kq_next_room>=0 && ++guard<16);
  kq_var[17]=0;KqPaint;
}

U0 KingsQuest()
{
  I64 i,ch,sc,msg,dir,tick=0,n;
  F64 clock;
  SettingsPush;
  try {
    AutoComplete;WinBorder;WinMax;DocCursor;DocClear;FlushMsgs;
    kq_frame=DCNew(640,336);
    kq_words=FileRead("Data/WORDS.BIN",&n);
    if (!kq_words) throw('NoWords');
    kq_last_tone=-1;kq_mute=FALSE;
    KqReset;Fs->draw_it=&KqDraw;clock=tS;
    while (!kq_quit) {
      while ((msg=ScanMsg(&ch,&sc,1<<MSG_KEY_DOWN))==MSG_KEY_DOWN) {
	dir=0;
	switch (sc.u8[0]) {
	  case SC_CURSOR_UP: dir=1;break;
	  case SC_PAGE_UP: dir=2;break;
	  case SC_CURSOR_RIGHT: dir=3;break;
	  case SC_PAGE_DOWN: dir=4;break;
	  case SC_CURSOR_DOWN: dir=5;break;
	  case SC_END: dir=6;break;
	  case SC_CURSOR_LEFT: dir=7;break;
	  case SC_HOME: dir=8;break;
	  case SC_F5: KqSave(FALSE);break;
	  case SC_F7: KqSave(TRUE);break;
	  case SC_F10: kq_mute=!kq_mute;break;
	  case SC_F12: kq_quit=TRUE;break;
	}
	if (dir) {
	  if (kq_dir==dir) kq_dir=0;
	  else kq_dir=dir;
	  kq_var[31]=0;kq_var[16]=0;
	} else if (ch==CH_SHIFT_ESC || ch==CH_ESC) kq_quit=TRUE;
	else if (ch=='\n' || ch=='\r') {
	  if (kq_input_len) KqParse(kq_input);
	  kq_input_len=0;*kq_input=0;
	} else if (!kq_input_len && ch=='0') kq_var[17]=1;
	else if (!kq_input_len && ch=='-') {
	  kq_var[31]=!kq_var[31];kq_var[16]=kq_var[31];
	} else if (!kq_input_len && ch=='=') kq_var[27]=1;
	else if (ch==CH_BACKSPACE) {
	  if (kq_input_len) kq_input[--kq_input_len]=0;
	} else if (32<=ch<127 && kq_input_len<78) {
	  kq_input[kq_input_len++]=ch;kq_input[kq_input_len]=0;
	}
      }
      if (tS>=clock) {
	KqSoundTick;
	if (++tick>=MaxI64(1,kq_var[24])) {tick=0;KqTick;}
	clock=Max(clock+0.0549254,tS);
      }
      Sleep(1);
    }
  } catch
    PutExcept;
  SettingsPop;Snd;KqUnderClear;
  DCDel(kq_frame);kq_frame=NULL;Free(kq_words);kq_words=NULL;
  Free(kq_sound);kq_sound=NULL;
  for (i=0;i<111;i++) {Free(kq_views[i]);kq_views[i]=NULL;}
  for (i=0;i<85;i++) {Free(kq_texts[i]);kq_texts[i]=NULL;}
}
