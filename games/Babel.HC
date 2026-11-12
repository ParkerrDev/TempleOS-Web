//Stones fall onto the tower. Turn and place them; a full row is cleared.

#define BB_W		10 //The well, in cells.
#define BB_H		20
#define BB_CELL		20 //Pixels a cell.
#define BB_DT		(1.0/60.0)
#define BB_STONES_NUM	8

#define BB_SC_W		0x11
#define BB_SC_A		0x1E
#define BB_SC_S		0x1F
#define BB_SC_D		0x20
#define BB_SC_P		0x19
#define BB_SC_SPACE	0x39

#define BB_LEFT		0
#define BB_RIGHT	1
#define BB_TURN		2
#define BB_SOFT		3
#define BB_DROP		4
#define BB_PAUSE	5
#define BB_ACTS_NUM	6

//A stone is a mask of its 4x4 box. The Latin cross has one upright turn.
I64 bb_base[BB_STONES_NUM]={
      0x00F0,0x0033,0x0072,0x0036,0x0063,0x0071,0x0074,0x2272},
    bb_size[BB_STONES_NUM]={4,2,3,3,3,3,3,4},
    bb_turn_num[BB_STONES_NUM]={4,4,4,4,4,4,4,1},
    bb_light[BB_STONES_NUM]={
      LTCYAN,YELLOW,LTPURPLE,LTGREEN,LTRED,LTBLUE,WHITE,YELLOW},
    bb_dark[BB_STONES_NUM]={CYAN,BROWN,PURPLE,GREEN,RED,BLUE,LTGRAY,RED},
    bb_points[5]={0,100,300,600,1000},
    bb_kicks[5]={0,-1,1,-2,2}; //Nudges tried when a turn is blocked.

I64 bb_rot[BB_STONES_NUM*4], //[stone*4+turn]
    bb_bag[BB_STONES_NUM],bb_bag_left,
    bb_cur,bb_turn,bb_x,bb_y,bb_next,
    bb_fall_t,bb_lock_t,bb_lock_moves,bb_clear_t,bb_rep_t,
    bb_score,bb_lines,bb_level,bb_best=0,
    bb_over,bb_paused,bb_snd_t,
    bb_held[BB_ACTS_NUM],bb_prev[BB_ACTS_NUM],bb_tap[BB_ACTS_NUM];
U8 bb_board[BB_W*BB_H], //0 empty, else stone+1.
    bb_full[BB_H]; //Rows being cleared.

I64 MaskTurn(I64 mask,I64 n)
{//A quarter turn clockwise inside an n by n box.
  I64 r,c,res=0;
  for (r=0;r<n;r++)
    for (c=0;c<n;c++)
      if (mask>>(r*4+c)&1)
	res|=1<<(c*4+n-1-r);
  return res;
}

U0 RotInit()
{
  I64 i,t,m;
  for (i=0;i<BB_STONES_NUM;i++) {
    m=bb_base[i];
    for (t=0;t<4;t++) {
      bb_rot[i*4+t]=m;
      if (bb_turn_num[i]>1)
	m=MaskTurn(m,bb_size[i]);
    }
  }
}

Bool StoneFits(I64 mask,I64 px,I64 py)
{
  I64 r,c,x,y;
  for (r=0;r<4;r++)
    for (c=0;c<4;c++)
      if (mask>>(r*4+c)&1) {
	x=px+c;y=py+r;
	if (!(0<=x<BB_W) || y>=BB_H)
	  return FALSE;
	if (y>=0 && bb_board[y*BB_W+x])
	  return FALSE;
      }
  return TRUE;
}

I64 BagNext()
{//Each stone once in every eight, shuffled.
  I64 i,j,t;
  if (bb_bag_left<=0) {
    for (i=0;i<BB_STONES_NUM;i++)
      bb_bag[i]=i;
    for (i=BB_STONES_NUM-1;i>0;i--) {
      j=RandU16%(i+1);
      t=bb_bag[i];bb_bag[i]=bb_bag[j];bb_bag[j]=t;
    }
    bb_bag_left=BB_STONES_NUM;
  }
  return bb_bag[--bb_bag_left];
}

U0 SndFrames(I64 ona,I64 frames)
{
  Snd(ona);
  bb_snd_t=frames;
}

U0 StoneNew()
{
  bb_cur=bb_next;bb_next=BagNext;
  bb_turn=0;bb_x=3;bb_y=0;
  if (!bb_cur) bb_y=-1; //The long stone lies in the second row of its box.
  if (bb_cur==1) bb_x=4;
  bb_fall_t=0;bb_lock_t=0;bb_lock_moves=0;
  if (!StoneFits(bb_rot[bb_cur*4],bb_x,bb_y)) {
    bb_over=TRUE;
    if (bb_score>bb_best)
      bb_best=bb_score;
    SndFrames(20,40);
  }
}

U0 Init()
{
  MemSet(bb_board,0,sizeof(bb_board));
  MemSet(bb_full,0,sizeof(bb_full));
  bb_bag_left=0;bb_score=0;bb_lines=0;bb_level=1;
  bb_over=FALSE;bb_paused=FALSE;bb_clear_t=0;bb_rep_t=0;
  bb_next=BagNext;
  StoneNew;
}

U0 RowsCollapse()
{
  I64 y,yy,n=0;
  for (y=0;y<BB_H;y++)
    if (bb_full[y])
      n++;
  y=BB_H-1;
  for (yy=BB_H-1;yy>=0;yy--)
    if (!bb_full[yy]) {
      if (y!=yy)
	MemCpy(&bb_board[y*BB_W],&bb_board[yy*BB_W],BB_W);
      y--;
    }
  for (;y>=0;y--)
    MemSet(&bb_board[y*BB_W],0,BB_W);
  MemSet(bb_full,0,sizeof(bb_full));
  bb_score+=bb_points[n]*bb_level;
  bb_lines+=n;
  bb_level=1+bb_lines/10;
}

U0 StoneLock()
{
  I64 r,c,x,y,mask=bb_rot[bb_cur*4+bb_turn],n=0;
  Bool full;
  for (r=0;r<4;r++)
    for (c=0;c<4;c++)
      if (mask>>(r*4+c)&1 && bb_y+r>=0)
	bb_board[(bb_y+r)*BB_W+bb_x+c]=bb_cur+1;
  for (y=0;y<BB_H;y++) {
    full=TRUE;
    for (x=0;x<BB_W;x++)
      if (!bb_board[y*BB_W+x])
	full=FALSE;
    if (bb_full[y]=full)
      n++;
  }
  if (n) {
    bb_clear_t=18; //The rows shine white, then fall away.
    SndFrames(50+n*6,10);
  } else {
    SndFrames(30,2);
    StoneNew;
  }
}

Bool StoneMove(I64 dx,I64 dy)
{
  if (!StoneFits(bb_rot[bb_cur*4+bb_turn],bb_x+dx,bb_y+dy))
    return FALSE;
  bb_x+=dx;bb_y+=dy;
  if (dx && bb_lock_moves<15) {
    bb_lock_t=0;
    bb_lock_moves++;
  }
  return TRUE;
}

U0 StoneTurn()
{
  I64 i,t=(bb_turn+1)&3;
  if (bb_turn_num[bb_cur]==1)
    return;
  for (i=0;i<5;i++)
    if (StoneFits(bb_rot[bb_cur*4+t],bb_x+bb_kicks[i],bb_y)) {
      bb_x+=bb_kicks[i];bb_turn=t;
      if (bb_lock_moves<15) {
	bb_lock_t=0;
	bb_lock_moves++;
      }
      return;
    }
}

Bool Pressed(I64 a)
{//A new press, from a held key or from a tap shorter than a step.
  return (bb_held[a] || bb_tap[a]) && !bb_prev[a];
}

U0 StoneFall()
{
  I64 rows=0,speed=50-4*bb_level;
  if (Pressed(BB_DROP)) {
    while (StoneMove(0,1))
      rows++;
    bb_score+=2*rows;
    StoneLock;
    return;
  }
  if (speed<3) speed=3;
  if (bb_held[BB_SOFT]) speed=2;
  if (++bb_fall_t>=speed) {
    bb_fall_t=0;
    if (StoneMove(0,1)) {
      if (bb_held[BB_SOFT]) bb_score++;
      bb_lock_t=0;
    }
  }
  if (!StoneFits(bb_rot[bb_cur*4+bb_turn],bb_x,bb_y+1) && ++bb_lock_t>=30)
    StoneLock;
}

U0 BabelStep()
{
  I64 a,dx=0;
  if (bb_snd_t>0 && !--bb_snd_t)
    Snd;
  if (bb_over) {
    if (Pressed(BB_DROP))
      Init;
  } else if (Pressed(BB_PAUSE))
    bb_paused=!bb_paused;
  else if (bb_clear_t>0) {
    if (!bb_paused && !--bb_clear_t) {
      RowsCollapse;
      StoneNew;
    }
  } else if (!bb_paused) {
    if (Pressed(BB_LEFT)) {
      dx=-1;bb_rep_t=10;
    } else if (Pressed(BB_RIGHT)) {
      dx=1;bb_rep_t=10;
    } else if (bb_held[BB_LEFT]!=bb_held[BB_RIGHT] && --bb_rep_t<=0) {
      bb_rep_t=3; //Holding a side keeps the stone sliding.
      if (bb_held[BB_LEFT])
	dx=-1;
      else
	dx=1;
    }
    if (dx)
      StoneMove(dx,0);
    if (Pressed(BB_TURN))
      StoneTurn;
    StoneFall;
  }
  for (a=0;a<BB_ACTS_NUM;a++) {
    bb_prev[a]=bb_held[a];
    bb_tap[a]=FALSE;
  }
}

U0 HeldUpdate()
{
  bb_held[BB_LEFT]=Bt(kbd.down_bitmap,BB_SC_A) ||
	Bt(kbd.down_bitmap,SC_CURSOR_LEFT);
  bb_held[BB_RIGHT]=Bt(kbd.down_bitmap,BB_SC_D) ||
	Bt(kbd.down_bitmap,SC_CURSOR_RIGHT);
  bb_held[BB_TURN]=Bt(kbd.down_bitmap,BB_SC_W) ||
	Bt(kbd.down_bitmap,SC_CURSOR_UP);
  bb_held[BB_SOFT]=Bt(kbd.down_bitmap,BB_SC_S) ||
	Bt(kbd.down_bitmap,SC_CURSOR_DOWN);
  bb_held[BB_DROP]=Bt(kbd.down_bitmap,BB_SC_SPACE);
  bb_held[BB_PAUSE]=Bt(kbd.down_bitmap,BB_SC_P);
}

U0 AnimateTask(I64)
{//Steps 60 times a second. A late wake catches up a quarter second at most.
  I64 steps;
  F64 now,last=tS,acc=0.0;
  while (TRUE) {
    HeldUpdate;
    now=tS;
    acc+=now-last;
    last=now;
    if (acc>0.25) acc=0.25;
    for (steps=0;acc>=BB_DT && steps<15;steps++) {
      BabelStep;
      acc-=BB_DT;
    }
    Sleep(1);
  }
}

U0 BoxDraw(CDC *dc,I64 x,I64 y,I64 w,I64 h,I64 color)
{
  dc->color=color;
  GrRect(dc,x,y,w,h);
}

U0 StoneDraw(CDC *dc,I64 x,I64 y,I64 s)
{
  BoxDraw(dc,x,y,BB_CELL-1,BB_CELL-1,bb_dark[s]);
  BoxDraw(dc,x,y,BB_CELL-4,BB_CELL-4,bb_light[s]);
  BoxDraw(dc,x+4,y+4,BB_CELL-10,BB_CELL-10,bb_dark[s]);
  BoxDraw(dc,x+5,y+5,BB_CELL-12,BB_CELL-12,bb_light[s]);
}

U0 ShapeDraw(CDC *dc,I64 mask,I64 ox,I64 oy,I64 s,Bool ghost)
{
  I64 r,c,x,y;
  for (r=0;r<4;r++)
    for (c=0;c<4;c++)
      if (mask>>(r*4+c)&1 && oy+r*BB_CELL>=0) {
	x=ox+c*BB_CELL;y=oy+r*BB_CELL;
	if (ghost) {
	  BoxDraw(dc,x,y,BB_CELL-1,BB_CELL-1,DKGRAY);
	  BoxDraw(dc,x+2,y+2,BB_CELL-5,BB_CELL-5,BLACK);
	} else
	  StoneDraw(dc,x,y,s);
      }
}

U0 LabelDraw(CDC *dc,I64 x,I64 y,U8 *name,I64 n)
{
  dc->color=BLUE;
  GrPrint(dc,x,y,name);
  dc->color=BLACK;
  GrPrint(dc,x,y+12,"%d",n);
}

U0 HelpDraw(CDC *dc,I64 x,I64 y)
{
  dc->color=RED;
  GrPrint(dc,x,y,"B A B E L");
  dc->color=BLUE;
  GrPrint(dc,x,y+16,"Build the tower.");
  GrPrint(dc,x,y+26,"Full rows clear.");
  dc->color=BLACK;
  GrPrint(dc,x,y+48,"A D  <- ->  move");
  GrPrint(dc,x,y+60,"W    Up     turn");
  GrPrint(dc,x,y+72,"S    Down   fall");
  GrPrint(dc,x,y+84,"Space       drop");
  GrPrint(dc,x,y+96,"P pause  Esc quit");
  GrPrint(dc,x,y+120,"Cross stays");
  GrPrint(dc,x,y+132,"upright.");
}

U0 DrawIt(CTask *task,CDC *dc)
{
  I64 x,y,gy,mask,px,ox=task->pix_width/2-BB_W*BB_CELL/2-40,
	oy=(task->pix_height-BB_H*BB_CELL)/2,cy;
  if (oy<12) oy=12;
  cy=oy+BB_H*BB_CELL/2;
  BoxDraw(dc,0,0,task->pix_width,task->pix_height,WHITE);
  BoxDraw(dc,ox-8,oy-8,BB_W*BB_CELL+16,BB_H*BB_CELL+16,BLUE);
  BoxDraw(dc,ox-6,oy-6,BB_W*BB_CELL+12,BB_H*BB_CELL+12,WHITE);
  BoxDraw(dc,ox-4,oy-4,BB_W*BB_CELL+8,BB_H*BB_CELL+8,BLUE);
  BoxDraw(dc,ox-1,oy-1,BB_W*BB_CELL+1,BB_H*BB_CELL+1,BLACK);
  for (y=0;y<BB_H;y++)
    for (x=0;x<BB_W;x++)
      if (bb_full[y] && bb_clear_t&2)
	BoxDraw(dc,ox+x*BB_CELL,oy+y*BB_CELL,BB_CELL-1,BB_CELL-1,WHITE);
      else if (bb_board[y*BB_W+x])
	StoneDraw(dc,ox+x*BB_CELL,oy+y*BB_CELL,bb_board[y*BB_W+x]-1);
  if (!bb_over && !bb_clear_t) {
    mask=bb_rot[bb_cur*4+bb_turn];
    for (gy=bb_y;StoneFits(mask,bb_x,gy+1);gy++);
    if (gy!=bb_y)
      ShapeDraw(dc,mask,ox+bb_x*BB_CELL,oy+gy*BB_CELL,bb_cur,TRUE);
    ShapeDraw(dc,mask,ox+bb_x*BB_CELL,oy+bb_y*BB_CELL,bb_cur,FALSE);
  }
  px=ox+BB_W*BB_CELL+28;
  dc->color=BLUE;
  GrPrint(dc,px,oy,"NEXT STONE");
  BoxDraw(dc,px,oy+12,4*BB_CELL+8,4*BB_CELL+8,BLUE);
  BoxDraw(dc,px+2,oy+14,4*BB_CELL+4,4*BB_CELL+4,BLACK);
  mask=bb_rot[bb_next*4];
  if (bb_size[bb_next]==4)
    ShapeDraw(dc,mask,px+4,oy+16,bb_next,FALSE);
  else
    ShapeDraw(dc,mask,px+4+BB_CELL/2*(4-bb_size[bb_next]),
	  oy+16+BB_CELL/2,bb_next,FALSE);
  LabelDraw(dc,px,oy+120,"SCORE",bb_score);
  LabelDraw(dc,px,oy+152,"ROWS",bb_lines);
  LabelDraw(dc,px,oy+184,"LEVEL",bb_level);
  LabelDraw(dc,px,oy+216,"BEST",bb_best);
  HelpDraw(dc,16,oy);
  if (bb_paused || bb_over) {
    BoxDraw(dc,ox+12,cy-26,BB_W*BB_CELL-24,52,BLUE);
    BoxDraw(dc,ox+14,cy-24,BB_W*BB_CELL-28,48,WHITE);
    if (bb_over) {
      dc->color=RED;
      GrPrint(dc,ox+40,cy-14,"THE TOWER FELL");
      dc->color=BLUE;
      GrPrint(dc,ox+28,cy+4,"Space: build again");
    } else {
      dc->color=BLUE;
      GrPrint(dc,ox+76,cy-14,"PAUSED");
      GrPrint(dc,ox+36,cy+4,"P to carry on");
    }
  }
}

U0 Babel()
{
  I64 sc;
  SettingsPush; //See $LK,"SettingsPush",A="MN:SettingsPush"$
  AutoComplete;
  WinBorder;
  WinMax;
  DocCursor;
  DocClear;
  Fs->win_inhibit|=WIF_SELF_MS_L|WIF_SELF_MS_R|WIG_DBL_CLICK;
  FlushMsgs;
  MemSet(bb_tap,0,sizeof(bb_tap));
  HeldUpdate;
  MemCpy(bb_prev,bb_held,sizeof(bb_held)); //A key held now is no press.
  bb_snd_t=0;
  RotInit;
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
	      bb_tap[BB_LEFT]=TRUE;
	      break;
	    case SC_CURSOR_RIGHT:
	      bb_tap[BB_RIGHT]=TRUE;
	      break;
	    case SC_CURSOR_UP:
	      bb_tap[BB_TURN]=TRUE;
	      break;
	  }
	  break;
	case CH_SPACE:
	  bb_tap[BB_DROP]=TRUE;
	  break;
	case 'p':
	case 'P':
	  bb_tap[BB_PAUSE]=TRUE;
	  break;
	case 'w':
	case 'W':
	  bb_tap[BB_TURN]=TRUE;
	  break;
	case 'a':
	case 'A':
	  bb_tap[BB_LEFT]=TRUE;
	  break;
	case 'd':
	case 'D':
	  bb_tap[BB_RIGHT]=TRUE;
	  break;
	case CH_SHIFT_ESC:
	case CH_ESC:
	  goto bb_done;
      }
bb_done: //Don't goto out of try
  } catch
    PutExcept;
  SettingsPop;
}

Babel;
