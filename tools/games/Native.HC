class CGameChk
{
  CTask *task;
  U8 *filename,*name;
  I64 state,except;
  Bool stop,stopped,again;
  CTaskSettings *settings;
};

I64 game_chk_frame;

U0 GameChkDraw(CTask *,CDC *)
{
}

U0 GameChkRun(CGameChk *tmpg)
{
  Bool compiled=FALSE;
  CHashFun *tmpf;
  SettingsPush;
  WinHorz(3,73);
  WinVert(4,52);
  Fs->text_attr=GREEN<<4+BLUE;
  Fs->win_inhibit=WIG_USER_TASK_DFT|WIF_SELF_MS_L;
  Fs->draw_it=&GameChkDraw;
  tmpg->settings=Fs->next_settings;
  while (!tmpg->stop) {
    tmpg->state=1;
    try {
      if (compiled) {
	tmpf=HashFind(tmpg->name,Fs->hash_table,HTT_FUN);
	if (!tmpf)
	  throw('GameMain');
	Call(tmpf->exe_addr);
      } else {
	ExeFile2(tmpg->filename);
	compiled=TRUE;
      }
      tmpg->state=2;
    } catch {
      tmpg->except=Fs->except_ch;
      Fs->catch_except=TRUE;
      tmpg->state=3;
    }
    while (!tmpg->stop && !tmpg->again)
      Sleep(1);
    tmpg->again=FALSE;
  }
  SettingsPop;
  tmpg->stopped=TRUE;
  while (TRUE)
    Sleep(1);
}

I64 *GameChkVar(CGameChk *tmpg,U8 *name)
{
  CHashGlblVar *tmpv=HashFind(name,tmpg->task->hash_table,HTT_GLBL_VAR);
  if (!tmpv)
    throw('GameVar');
  return tmpv->data_addr;
}

U0 GameChkWait(CGameChk *tmpg,I64 *value,I64 expected,I64 size=8)
{
  F64 end=tS+5;
  while (TRUE) {
    if (size==1) {
      if (*value(U8 *)==expected)
	return;
    } else if (*value==expected)
      return;
    if (tmpg->state>=2 || tS>=end)
      throw('GameWait');
    Sleep(1);
  }
}

U0 GameChkKey(CGameChk *tmpg,I64 ch,I64 sc,Bool down)
{//Tests the native task-message and keyboard held-state boundary.
  LBEqu(kbd.down_bitmap,sc.u8[0],down);
  if (down)
    PostMsg(tmpg->task,MSG_KEY_DOWN,ch,sc);
  else
    PostMsg(tmpg->task,MSG_KEY_UP,ch,sc|SCF_KEY_UP);
}

U0 GameChkTap(CGameChk *tmpg,I64 ch,I64 sc)
{
  GameChkKey(tmpg,ch,sc,TRUE);
  GameChkKey(tmpg,ch,sc,FALSE);
}

I64 GameChkFrame(CGameChk *tmpg)
{
  CDC *dc=DCNew(640,480);
  I64 i,hash=0xCBF29CE484222325;
  try {
    tmpg->task->draw_it(tmpg->task,dc);
    for (i=0;i<640*480;i++)
      hash=(hash^dc->body[i])*0x100000001B3;
  } catch {
    DCDel(dc);
  }
  DCDel(dc);
  return hash;
}

U0 BabelChk(CGameChk *tmpg)
{
  I64 i,*paused=GameChkVar(tmpg,"bb_paused"),
	*x=GameChkVar(tmpg,"bb_x"),*y=GameChkVar(tmpg,"bb_y"),
	*rot=GameChkVar(tmpg,"bb_rot"),*board=GameChkVar(tmpg,"bb_board");
  GameChkTap(tmpg,'p',0x19);
  GameChkWait(tmpg,paused,TRUE);
  i=*y;
  Sleep(120);
  if (*y!=i)
    throw('Pause');
  MemSet(board,0,200);
  MemSet(GameChkVar(tmpg,"bb_full"),0,20);
  *GameChkVar(tmpg,"bb_cur")=7;
  *GameChkVar(tmpg,"bb_next")=7;
  *GameChkVar(tmpg,"bb_turn")=0;
  *GameChkVar(tmpg,"bb_clear_t")=0;
  *GameChkVar(tmpg,"bb_score")=0;
  *GameChkVar(tmpg,"bb_lines")=0;
  *GameChkVar(tmpg,"bb_best")=0;
  *GameChkVar(tmpg,"bb_level")=1;
  *x=3;*y=0;
  for (i=28;i<32;i++)
    if (rot[i]!=0x2272)
      throw('Cross');
  game_chk_frame=GameChkFrame(tmpg);
  "FRAME:Babel:%016X\n",game_chk_frame;
  GameChkTap(tmpg,'p',0x19);
  GameChkWait(tmpg,paused,FALSE);
  GameChkTap(tmpg,'w',0x11);
  GameChkTap(tmpg,'a',0x1E);
  GameChkWait(tmpg,x,2);
  if (*GameChkVar(tmpg,"bb_turn"))
    throw('CrossRot');
  GameChkTap(tmpg,'d',0x20);
  GameChkWait(tmpg,x,3);
  GameChkTap(tmpg,' ',0x39);
  for (i=0;i<100 && !*(board(U8 *)+19*10+4);i++)
    Sleep(1);
  if (*(board(U8 *)+19*10+4)!=8)
    throw('Drop');
  "INPUT:Babel:pause,cross,left,right,drop\n";
}

U0 VolleyChk(CGameChk *tmpg)
{
  I64 before,*p1=GameChkVar(tmpg,"vl_p1"),*p2=GameChkVar(tmpg,"vl_p2"),
	*paused=GameChkVar(tmpg,"vl_paused"),*live=GameChkVar(tmpg,"vl_live");
  before=*p1;
  GameChkKey(tmpg,'w',0x11,TRUE);
  Sleep(120);
  GameChkKey(tmpg,'w',0x11,FALSE);
  if (*p1>=before)
    throw('Player1');
  before=*p2;
  GameChkKey(tmpg,0,SC_CURSOR_DOWN,TRUE);
  Sleep(120);
  GameChkKey(tmpg,0,SC_CURSOR_DOWN,FALSE);
  if (*p2<=before)
    throw('Player2');
  GameChkTap(tmpg,' ',0x39);
  GameChkWait(tmpg,live,TRUE);
  GameChkTap(tmpg,'p',0x19);
  GameChkWait(tmpg,paused,TRUE);
  before=*GameChkVar(tmpg,"vl_bx");
  Sleep(120);
  if (*GameChkVar(tmpg,"vl_bx")!=before)
    throw('Pause');
  *p1=80;*p2=240;
  *GameChkVar(tmpg,"vl_bx")=128*256;
  *GameChkVar(tmpg,"vl_by")=180*256;
  *GameChkVar(tmpg,"vl_s1")=2;
  *GameChkVar(tmpg,"vl_s2")=3;
  *GameChkVar(tmpg,"vl_flash")=0;
  game_chk_frame=GameChkFrame(tmpg);
  "FRAME:Volley:%016X\n",game_chk_frame;
  "INPUT:Volley:both-players,serve,pause\n";
}

U0 SnakePhysicsChk(CGameChk *tmpg)
{
  CHashFun *tmps=HashFind("SnakeStep",tmpg->task->hash_table,HTT_FUN),
	*tmpa=HashFind("ApplePick",tmpg->task->hash_table,HTT_FUN);
  I64 i,*len=GameChkVar(tmpg,"len"),*head=GameChkVar(tmpg,"head"),
	*body=GameChkVar(tmpg,"body"),*apple=GameChkVar(tmpg,"apple"),
	*dx=GameChkVar(tmpg,"dir_x"),*dy=GameChkVar(tmpg,"dir_y");
  U8 *board=GameChkVar(tmpg,"board"),*alive=GameChkVar(tmpg,"alive"),
	*pending=GameChkVar(tmpg,"turn_pending");
  *pending=FALSE;
  MemSet(board,0,884);
  *len=4;*head=3;*apple=883;*alive=TRUE;*dx=0;*dy=-1;
  body[0]=35;body[1]=36;body[2]=70;body[3]=69;
  for (i=0;i<4;i++)
    board[body[i]]=TRUE;
  Call(tmps->exe_addr);
  if (!*alive || *len!=4 || *head!=4 || body[*head]!=35 || !board[35])
    throw('Tail');
  MemSet(board,0,884);
  *len=5;*head=4;*apple=883;*alive=TRUE;*dx=1;*dy=0;
  body[0]=0;body[1]=34;body[2]=35;body[3]=69;body[4]=68;
  for (i=0;i<5;i++)
    board[body[i]]=TRUE;
  Call(tmps->exe_addr);
  if (*alive || *len!=5 || *head!=4 || body[*head]!=68)
    throw('Self');
  MemSet(board,0,884);
  *len=1;*head=0;*apple=400;
  for (i=0;i<4;i++) {
    *alive=TRUE;*dx=0;*dy=0;
    switch (i) {
      case 0: body[0]=0;*dx=-1;break;
      case 1: body[0]=33;*dx=1;break;
      case 2: body[0]=0;*dy=-1;break;
      case 3: body[0]=883;*dy=1;break;
    }
    Call(tmps->exe_addr);
    if (*alive || *head || *len!=1)
      throw('Wall');
  }
  MemSet(board,0,884);
  *len=5;*head=883;*apple=0;*alive=TRUE;*dx=1;*dy=0;
  for (i=879;i<884;i++) {
    body[i]=34+10+i-879;
    board[body[i]]=TRUE;
  }
  Call(tmps->exe_addr);
  if (!*alive || *head || body[0]!=49 || board[44] || !board[49])
    throw('Ring');
  MemSet(board,1,884);
  *len=883;
  for (i=0;i<884;i++) {
    board[i]=FALSE;
    if (Call(tmpa->exe_addr)!=i)
      throw('FreeCell');
    board[i]=TRUE;
  }
  *head=882;*apple=883;*alive=TRUE;*dx=1;*dy=0;
  for (i=0;i<883;i++)
    body[i]=i;
  board[883]=FALSE;
  Call(tmps->exe_addr);
  if (*alive || *len!=884 || *head!=883 || body[883]!=883 ||
	*apple!=-1 || !board[883] || Call(tmpa->exe_addr)!=-1)
    throw('Full');
  "LOGIC:Snake:tail,self,4-walls,ring,884-free-cells,full-board\n";
}

U0 SnakeChk(CGameChk *tmpg)
{
  I64 i,before,*len=GameChkVar(tmpg,"len"),*head=GameChkVar(tmpg,"head"),
	*body=GameChkVar(tmpg,"body"),*apple=GameChkVar(tmpg,"apple"),
	*dy=GameChkVar(tmpg,"dir_y"),*pending=GameChkVar(tmpg,"turn_pending");
  U8 *board=GameChkVar(tmpg,"board");
  F64 end=tS+5;
  while (!tmpg->task->animate_task && tS<end)
    Sleep(1);
  if (!tmpg->task->animate_task)
    throw('Animate');
  Suspend(tmpg->task->animate_task);
  *len=42;
  GameChkTap(tmpg,'\n',SC_ENTER);
  GameChkWait(tmpg,len,5);
  before=body[*head];
  GameChkTap(tmpg,'w',0x11);
  GameChkWait(tmpg,pending,TRUE,1);
  Suspend(tmpg->task->animate_task,FALSE);
  GameChkWait(tmpg,dy,-1);
  Suspend(tmpg->task->animate_task);
  if (body[*head]%34!=before%34 || body[*head]/34>=before/34)
    throw('Up');
  GameChkTap(tmpg,'s',0x1F);
  GameChkTap(tmpg,'a',0x1E);
  GameChkWait(tmpg,pending,TRUE,1);
  if (*GameChkVar(tmpg,"turn_x")!=-1 || *GameChkVar(tmpg,"turn_y"))
    throw('Reverse');
  *apple=body[*head]-1;
  Suspend(tmpg->task->animate_task,FALSE);
  GameChkWait(tmpg,len,6);
  Suspend(tmpg->task->animate_task);
  if (!(0<=*apple<34*26) || board[*apple])
    throw('Apple');
  SnakePhysicsChk(tmpg);
  *len=42;
  GameChkTap(tmpg,'\n',SC_ENTER);
  GameChkWait(tmpg,len,5);
  for (i=0;i<34*26;i++)
    if (board[i] && !(34*13+13<=i<=34*13+17))
      throw('Restart');
  if (*head!=4 || *dy || *GameChkVar(tmpg,"dir_x")!=1 ||
	*pending(U8 *) || !*GameChkVar(tmpg,"alive")(U8 *))
    throw('Restart');
  *apple=0;
  game_chk_frame=GameChkFrame(tmpg);
  "FRAME:Snake:%016X\n",game_chk_frame;
  "INPUT:Snake:restart,turn,reverse,grow,free-apple\n";
}

U0 GameChk(U8 *filename,U8 *name,I64 runs)
{
  CGameChk *tmpg=CAlloc(sizeof(CGameChk));
  I64 i,except=0;
  F64 end;
  U8 saved_keys[sizeof(kbd.down_bitmap)];
  MemCpy(saved_keys,kbd.down_bitmap,sizeof(saved_keys));
  tmpg->filename=filename;
  tmpg->name=name;
  tmpg->task=Spawn(&GameChkRun,tmpg,name,,Fs);
  try {
    for (i=0;i<runs;i++) {
      end=tS+5;
      while (tmpg->state<2 && (!tmpg->state ||
	    tmpg->task->draw_it==&GameChkDraw) && tS<end)
	Sleep(1);
      if (tmpg->state!=1 || tmpg->task->draw_it==&GameChkDraw) {
	"LOAD:%s:%C:%d\n",name,tmpg->except,tmpg->state;
	throw('GameLoad');
      }
      if (!StrCmp(name,"Babel"))
	BabelChk(tmpg);
      else if (!StrCmp(name,"Volley"))
	VolleyChk(tmpg);
      else if (!StrCmp(name,"Snake"))
	SnakeChk(tmpg);
      if (i&1)
	GameChkTap(tmpg,CH_SHIFT_ESC,SC_ESC|SCF_SHIFT);
      else
	GameChkTap(tmpg,CH_ESC,SC_ESC);
      GameChkWait(tmpg,&tmpg->state,2);
      if (tmpg->except || tmpg->task->draw_it!=&GameChkDraw ||
	    tmpg->task->next_settings!=tmpg->settings ||
	    tmpg->task->animate_task || tmpg->task->song_task ||
	    tmpg->task->win_left!=3 || tmpg->task->win_right!=73 ||
	    tmpg->task->win_top!=4 || tmpg->task->win_bottom!=52 ||
	    tmpg->task->text_attr!=GREEN<<4+BLUE ||
	    tmpg->task->win_inhibit!=(WIG_USER_TASK_DFT|WIF_SELF_MS_L))
	throw('Cleanup');
      "EXIT:%s:settings,draw,window,tasks\n",name;
      if (i+1<runs) {
	tmpg->state=0;
	tmpg->again=TRUE;
      }
    }
  } catch {
    except=Fs->except_ch;
    Fs->catch_except=TRUE;
  }
  if (tmpg->state>=2) {
    tmpg->stop=TRUE;
    end=tS+2;
    while (!tmpg->stopped && tS<end)
      Sleep(1);
  }
  Kill(tmpg->task);
  MemCpy(kbd.down_bitmap,saved_keys,sizeof(saved_keys));
  Free(tmpg);
  if (except)
    throw(except);
}
