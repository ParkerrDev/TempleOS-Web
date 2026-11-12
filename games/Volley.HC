//Two players, one ball. Score when it gets past the other side; 7 wins.

#define VL_DT		(1.0/60.0)
#define VL_FIX		256 //Positions and speeds are in 1/256 pixel.
#define VL_TOP		48 //The court starts below the help lines.
#define VL_PAD_W	10
#define VL_PAD_H	56
#define VL_PAD_IN	24 //Paddle face from the side.
#define VL_PAD_V	6 //Paddle pixels a step.
#define VL_BALL		8
#define VL_WIN		7

#define VL_SC_W		0x11
#define VL_SC_S		0x1F
#define VL_SC_P		0x19
#define VL_SC_SPACE	0x39

//Score digits, 3 wide and 5 tall, a row of three bits each.
I64 vl_font[50]={
      7,5,5,5,7,2,6,2,2,7,7,1,7,4,7,7,1,7,1,7,5,5,7,1,1,
      7,4,7,1,7,7,4,7,5,7,7,1,1,1,1,7,5,7,5,7,7,5,7,1,7};

I64 vl_w,vl_h, //The court, from the window.
    vl_p1,vl_p2, //Paddle tops.
    vl_bx,vl_by,vl_vx,vl_vy,
    vl_s1,vl_s2,vl_serve_to,vl_live,vl_winner,vl_rally,vl_best_rally=0,
    vl_paused,vl_snd_t,vl_flash;
Bool vl_up1,vl_dn1,vl_up2,vl_dn2,
    vl_serve_held,vl_serve_prev,vl_serve_tap,
    vl_pause_held,vl_pause_prev,vl_pause_tap;

U0 SndFrames(I64 ona,I64 frames)
{
  Snd(ona);
  vl_snd_t=frames;
}

U0 BallPlace()
{//The ball waits in the middle for a serve.
  vl_bx=(vl_w/2-VL_BALL/2)*VL_FIX;
  vl_by=((VL_TOP+vl_h)/2-VL_BALL/2)*VL_FIX;
  vl_vx=0;vl_vy=0;vl_live=FALSE;vl_rally=0;
}

U0 Init()
{
  vl_s1=0;vl_s2=0;vl_winner=0;vl_paused=FALSE;
  vl_p1=(VL_TOP+vl_h)/2-VL_PAD_H/2;vl_p2=vl_p1;
  BallPlace;
}

U0 BallServe()
{
  vl_vx=5*VL_FIX;
  if (vl_serve_to==1) vl_vx=-vl_vx;
  vl_vy=RandU16%(3*VL_FIX)-3*VL_FIX/2;
  vl_live=TRUE;
  SndFrames(40,3);
}

I64 PadClamp(I64 y)
{
  if (y<VL_TOP+4)
    return VL_TOP+4;
  if (y>vl_h-4-VL_PAD_H)
    return vl_h-4-VL_PAD_H;
  return y;
}

U0 PadHit(I64 pad_top,I64 dir)
{//Faster each time, and steeper the further from the middle it hits.
  I64 speed=AbsI64(vl_vx)*21/20,off;
  if (speed>11*VL_FIX) speed=11*VL_FIX;
  off=vl_by/VL_FIX+VL_BALL/2-(pad_top+VL_PAD_H/2);
  vl_vx=dir*speed;
  vl_vy=off*VL_FIX/5;
  if (++vl_rally>vl_best_rally)
    vl_best_rally=vl_rally;
  SndFrames(60,3);
}

U0 PointWin(I64 who)
{//The side that lost the point receives the serve.
  if (who==1)
    vl_s1++;
  else
    vl_s2++;
  vl_serve_to=3-who;
  vl_flash=20;
  SndFrames(30,12);
  if (vl_s1>=VL_WIN) vl_winner=1;
  if (vl_s2>=VL_WIN) vl_winner=2;
  BallPlace;
}

U0 BallMove()
{//A hit is a step that crosses a paddle's face while the ball overlaps it.
  I64 ox=vl_bx/VL_FIX,nx,ny,left=VL_PAD_IN+VL_PAD_W,
	right=vl_w-VL_PAD_IN-VL_PAD_W;
  vl_bx+=vl_vx;vl_by+=vl_vy;
  ny=vl_by/VL_FIX;
  if (ny<VL_TOP) {
    vl_by=VL_TOP*VL_FIX;vl_vy=AbsI64(vl_vy);
    SndFrames(50,2);
  } else if (ny>vl_h-VL_BALL) {
    vl_by=(vl_h-VL_BALL)*VL_FIX;vl_vy=-AbsI64(vl_vy);
    SndFrames(50,2);
  }
  nx=vl_bx/VL_FIX;ny=vl_by/VL_FIX;
  if (vl_vx<0 && ox>=left && nx<left &&
	ny+VL_BALL>vl_p1 && ny<vl_p1+VL_PAD_H) {
    vl_bx=left*VL_FIX;
    PadHit(vl_p1,1);
  } else if (vl_vx>0 && ox+VL_BALL<=right && nx+VL_BALL>right &&
	ny+VL_BALL>vl_p2 && ny<vl_p2+VL_PAD_H) {
    vl_bx=(right-VL_BALL)*VL_FIX;
    PadHit(vl_p2,-1);
  } else if (nx+VL_BALL<0)
    PointWin(2);
  else if (nx>vl_w)
    PointWin(1);
}

U0 VolleyStep()
{
  Bool serve=(vl_serve_held || vl_serve_tap) && !vl_serve_prev,
	pause=(vl_pause_held || vl_pause_tap) && !vl_pause_prev;
  if (vl_snd_t>0 && !--vl_snd_t)
    Snd;
  if (vl_flash>0) vl_flash--;
  if (pause && !vl_winner)
    vl_paused=!vl_paused;
  if (!vl_paused) {
    if (vl_winner) {
      if (serve)
	Init;
    } else {
      if (vl_up1) vl_p1-=VL_PAD_V;
      if (vl_dn1) vl_p1+=VL_PAD_V;
      if (vl_up2) vl_p2-=VL_PAD_V;
      if (vl_dn2) vl_p2+=VL_PAD_V;
      vl_p1=PadClamp(vl_p1);vl_p2=PadClamp(vl_p2);
      if (vl_live)
	BallMove;
      else if (serve)
	BallServe;
    }
  }
  vl_serve_prev=vl_serve_held;vl_serve_tap=FALSE;
  vl_pause_prev=vl_pause_held;vl_pause_tap=FALSE;
}

U0 HeldUpdate()
{
  vl_up1=Bt(kbd.down_bitmap,VL_SC_W);
  vl_dn1=Bt(kbd.down_bitmap,VL_SC_S);
  vl_up2=Bt(kbd.down_bitmap,SC_CURSOR_UP);
  vl_dn2=Bt(kbd.down_bitmap,SC_CURSOR_DOWN);
  vl_serve_held=Bt(kbd.down_bitmap,VL_SC_SPACE);
  vl_pause_held=Bt(kbd.down_bitmap,VL_SC_P);
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
    for (steps=0;acc>=VL_DT && steps<15;steps++) {
      VolleyStep;
      acc-=VL_DT;
    }
    Sleep(1);
  }
}

U0 BoxDraw(CDC *dc,I64 x,I64 y,I64 w,I64 h,I64 color)
{
  dc->color=color;
  GrRect(dc,x,y,w,h);
}

U0 DigitDraw(CDC *dc,I64 x,I64 y,I64 d,I64 color)
{
  I64 r,c;
  for (r=0;r<5;r++)
    for (c=0;c<3;c++)
      if (vl_font[d*5+r]>>(2-c)&1)
	BoxDraw(dc,x+c*8,y+r*8,8,8,color);
}

U0 CenterPrint(CDC *dc,I64 y,U8 *st,I64 color)
{
  dc->color=color;
  GrPrint(dc,vl_w/2-StrLen(st)*4,y,st);
}

U0 DrawIt(CTask *task,CDC *dc)
{//The court follows the window.
  I64 y,cx;
  vl_w=task->pix_width;vl_h=task->pix_height;
  cx=vl_w/2;
  BoxDraw(dc,0,0,vl_w,VL_TOP,WHITE);
  BoxDraw(dc,0,VL_TOP,vl_w,vl_h-VL_TOP,BLUE);
  if (vl_flash&4)
    BoxDraw(dc,0,VL_TOP,vl_w,vl_h-VL_TOP,LTBLUE);
  BoxDraw(dc,0,VL_TOP,vl_w,2,LTCYAN);
  BoxDraw(dc,0,vl_h-2,vl_w,2,LTCYAN);
  for (y=VL_TOP+6;y<vl_h;y+=16)
    BoxDraw(dc,cx-1,y,3,8,LTCYAN);
  dc->color=BLUE;
  GrPrint(dc,8,6,"V O L L E Y");
  dc->color=BROWN;
  GrPrint(dc,8,18,"Player 1: W S");
  dc->color=RED;
  GrPrint(dc,vl_w-8-15*8,18,"Player 2: Up Dn");
  dc->color=BLACK;
  GrPrint(dc,8,32,"Space serve  P pause  Esc quit");
  GrPrint(dc,vl_w-8-15*8,32,"First to 7 wins");
  DigitDraw(dc,cx-72,VL_TOP+16,vl_s1%10,YELLOW);
  DigitDraw(dc,cx+48,VL_TOP+16,vl_s2%10,LTRED);
  BoxDraw(dc,VL_PAD_IN,vl_p1,VL_PAD_W,VL_PAD_H,YELLOW);
  BoxDraw(dc,VL_PAD_IN+VL_PAD_W-3,vl_p1,3,VL_PAD_H,BROWN);
  BoxDraw(dc,vl_w-VL_PAD_IN-VL_PAD_W,vl_p2,VL_PAD_W,VL_PAD_H,LTRED);
  BoxDraw(dc,vl_w-VL_PAD_IN-VL_PAD_W,vl_p2,3,VL_PAD_H,RED);
  if (vl_winner) {
    BoxDraw(dc,cx-120,vl_h/2-20,240,48,WHITE);
    if (vl_winner==1)
      CenterPrint(dc,vl_h/2-8,"PLAYER 1 WINS",BROWN);
    else
      CenterPrint(dc,vl_h/2-8,"PLAYER 2 WINS",RED);
    CenterPrint(dc,vl_h/2+8,"Space: play again",BLUE);
  } else {
    BoxDraw(dc,vl_bx/VL_FIX,vl_by/VL_FIX,VL_BALL,VL_BALL,WHITE);
    if (vl_paused)
      CenterPrint(dc,vl_h/2+40,"PAUSED: P to carry on",WHITE);
    else if (!vl_live) {
      if (vl_serve_to==1)
	CenterPrint(dc,vl_h/2+40,"Space: serve to player 1",WHITE);
      else
	CenterPrint(dc,vl_h/2+40,"Space: serve to player 2",WHITE);
    }
  }
}

U0 Volley()
{
  SettingsPush; //See $LK,"SettingsPush",A="MN:SettingsPush"$
  AutoComplete;
  WinBorder;
  WinMax;
  DocCursor;
  DocClear;
  Fs->win_inhibit|=WIF_SELF_MS_L|WIF_SELF_MS_R|WIG_DBL_CLICK;
  FlushMsgs;
  vl_w=Fs->pix_width;vl_h=Fs->pix_height;
  vl_snd_t=0;vl_flash=0;vl_serve_to=1;
  vl_serve_tap=FALSE;vl_pause_tap=FALSE;
  HeldUpdate;
  vl_serve_prev=vl_serve_held; //A key held now is no press.
  vl_pause_prev=vl_pause_held;
  Seed;
  Init;
  Fs->draw_it=&DrawIt;
  Fs->animate_task=Spawn(&AnimateTask,NULL,"Animate",,Fs);
  try {
    while (TRUE)
      switch (GetKey) {
	case CH_SPACE:
	  vl_serve_tap=TRUE;
	  break;
	case 'p':
	case 'P':
	  vl_pause_tap=TRUE;
	  break;
	case CH_SHIFT_ESC:
	case CH_ESC:
	  goto vl_done;
      }
vl_done: //Don't goto out of try
  } catch
    PutExcept;
  SettingsPop;
}

Volley;
