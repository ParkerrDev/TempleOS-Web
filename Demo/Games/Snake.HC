//Eat the apples and do not bite your tail. Arrows or WASD steer.

#define SNAKE_W		34
#define SNAKE_H		26
#define SNAKE_CELL	17
#define SNAKE_LEN_MAX	(SNAKE_W*SNAKE_H)
#define SNAKE_PERIOD	0.105

I64 body[SNAKE_LEN_MAX],head,len,dir_x,dir_y,turn_x,turn_y,apple,
      best_score=0;
U8 board[SNAKE_LEN_MAX]; //TRUE where the snake is.
Bool alive,turn_pending;
F64 last_step,restart_tS;

I64 ApplePick()
{//A free cell picked evenly, or -1 when the snake fills the board.
  I64 i,n;
  if (len==SNAKE_LEN_MAX)
    return -1;
  n=RandU32%(SNAKE_LEN_MAX-len);
  for (i=0;i<SNAKE_LEN_MAX;i++)
    if (!board[i]) {
      if (!n)
	return i;
      n--;
    }
  throw('Snake');
}

U0 Init()
{
  I64 i;
  MemSet(board,0,sizeof(board));
  MemSet(body,0,sizeof(body));
  head=4;len=5;
  for (i=0;i<len;i++) {
    body[i]=SNAKE_H/2*SNAKE_W+SNAKE_W/2-4+i;
    board[body[i]]=TRUE;
  }
  dir_x=1;dir_y=0;turn_x=1;turn_y=0;
  turn_pending=FALSE;alive=TRUE;
  last_step=tS;restart_tS=0;
  apple=ApplePick;
}

U0 SnakeTurn(I64 dx,I64 dy)
{//One turn waits for each step. The snake cannot reverse into itself.
  if (turn_pending || dx==-dir_x && dy==-dir_y)
    return;
  if (dx!=dir_x || dy!=dir_y) {
    turn_x=dx;turn_y=dy;
    turn_pending=TRUE;
  }
}

U0 SnakeStep()
{//The tail moves out of its cell as the head moves in, unless it eats.
  I64 x,y,next,tail;
  Bool eat;
  if (!alive)
    return;
  if (turn_pending) {
    dir_x=turn_x;dir_y=turn_y;
    turn_pending=FALSE;
  }
  x=body[head]%SNAKE_W+dir_x;
  y=body[head]/SNAKE_W+dir_y;
  next=y*SNAKE_W+x;
  tail=body[(head+SNAKE_LEN_MAX-len+1)%SNAKE_LEN_MAX];
  eat=next==apple;
  if (!(0<=x<SNAKE_W && 0<=y<SNAKE_H) ||
	board[next] && (next!=tail || eat)) {
    alive=FALSE;
    restart_tS=tS+0.8;
    return;
  }
  if (eat)
    len++;
  else
    board[tail]=FALSE;
  head=(head+1)%SNAKE_LEN_MAX;
  body[head]=next;
  board[next]=TRUE;
  if (eat) {
    if (len-5>best_score)
      best_score=len-5;
    apple=ApplePick;
    if (apple<0) {
      alive=FALSE;
      restart_tS=tS+0.8;
    }
  }
}

U0 AnimateTask(I64)
{//Steps at a fixed rate. A late wake catches up a quarter second at most.
  F64 now;
  while (TRUE) {
    now=tS;
    if (!alive) {
      if (now>=restart_tS)
	Init;
    } else {
      if (now-last_step>0.25)
	last_step=now-0.25;
      while (alive && now-last_step>=SNAKE_PERIOD) {
	SnakeStep;
	last_step+=SNAKE_PERIOD;
      }
    }
    Sleep(1);
  }
}

U0 DrawIt(CTask *task,CDC *dc)
{
  I64 i,pos,ox=(task->pix_width-SNAKE_W*SNAKE_CELL)/2,
	oy=(task->pix_height-SNAKE_H*SNAKE_CELL)/2;
  dc->color=BLACK; //DCFill would clear the whole screen, top line and all.
  GrRect(dc,0,0,task->pix_width,task->pix_height);
  dc->color=DKGRAY;
  GrBorder(dc,ox-2,oy-2,ox+SNAKE_W*SNAKE_CELL,oy+SNAKE_H*SNAKE_CELL);
  if (apple>=0) {
    dc->color=RED;
    GrRect(dc,ox+apple%SNAKE_W*SNAKE_CELL,oy+apple/SNAKE_W*SNAKE_CELL,
	  SNAKE_CELL-2,SNAKE_CELL-2);
  }
  for (i=0;i<len;i++) {
    pos=body[(head+SNAKE_LEN_MAX-i)%SNAKE_LEN_MAX];
    if (!alive)
      dc->color=LTRED;
    else if (!i)
      dc->color=LTGREEN;
    else
      dc->color=GREEN;
    GrRect(dc,ox+pos%SNAKE_W*SNAKE_CELL,oy+pos/SNAKE_W*SNAKE_CELL,
	  SNAKE_CELL-2,SNAKE_CELL-2);
  }
  dc->color=WHITE;
  GrPrint(dc,ox,oy-11,"Score:%d Best:%d",len-5,best_score);
}

U0 Snake()
{
  I64 sc;
  SettingsPush; //See $LK,"SettingsPush",A="MN:SettingsPush"$
  AutoComplete;
  WinBorder;
  WinMax;
  DocCursor;
  DocClear;
  Fs->win_inhibit|=WIF_SELF_MS_L|WIF_SELF_MS_R|WIG_DBL_CLICK;
  Seed;
  Init;
  Fs->draw_it=&DrawIt;
  Fs->animate_task=Spawn(&AnimateTask,NULL,"Animate",,Fs);
  try {
    while (TRUE)
      switch (GetKey(&sc)) {
	case 0:
	  switch (sc.u8[0]) {
	    case SC_CURSOR_LEFT:
	      SnakeTurn(-1,0);
	      break;
	    case SC_CURSOR_RIGHT:
	      SnakeTurn(1,0);
	      break;
	    case SC_CURSOR_UP:
	      SnakeTurn(0,-1);
	      break;
	    case SC_CURSOR_DOWN:
	      SnakeTurn(0,1);
	      break;
	  }
	  break;
	case 'a':
	case 'A':
	  SnakeTurn(-1,0);
	  break;
	case 'd':
	case 'D':
	  SnakeTurn(1,0);
	  break;
	case 'w':
	case 'W':
	  SnakeTurn(0,-1);
	  break;
	case 's':
	case 'S':
	  SnakeTurn(0,1);
	  break;
	case '\n':
	case CH_SPACE:
	  Init;
	  break;
	case CH_SHIFT_ESC:
	case CH_ESC:
	  goto sn_done;
      }
sn_done: //Don't goto out of try
  } catch
    PutExcept;
  SettingsPop;
}

Snake;
