// Volley: two players, one ball. Keep it in play, and score when it gets past the other side.
// Runs in TempleOS V5.03 and in the browser through HolyC-WASM, from this one file.
//   Player 1 (left, yellow): W up, S down      Player 2 (right, red): Up and Down arrows
//   Space serves, and starts a new match after one ends   P pauses   Esc quits
//   The first to 7 points wins.

// Real TempleOS: #ifdef also finds kernel symbols such as kbd, which HolyC-WASM does not
// have, so the file picks its own target. The site's TempleOS launcher defines it too.
#ifndef TOS_NATIVE
#ifdef kbd
#define TOS_NATIVE 1
#endif
#endif

#define VL_DT      (1.0/60.0)
#define VL_FIX     256       // positions and speeds are in 1/256 pixel
#define VL_TOP     48        // the court, inside the window
#define VL_PAD_W   10
#define VL_PAD_H   56
#define VL_PAD_IN  24        // paddle face distance from the side
#define VL_PAD_V   6         // paddle speed, pixels per step
#define VL_BALL    8
#define VL_WIN     7

#define VL_K_W     0x11
#define VL_K_S     0x1F
#define VL_K_P     0x19
#define VL_K_SPACE 0x39
#define VL_K_UP    0x48
#define VL_K_DOWN  0x50

#ifndef TOS_NATIVE
U8 BrowserKeys[128];         // HolyC-WASM fills this with the held keys
#endif

// Score digits, 3 wide and 5 tall, one row of three bits each.
I64 vl_font[50]={7,5,5,5,7, 2,6,2,2,7, 7,1,7,4,7, 7,1,7,1,7, 5,5,7,1,1,
                 7,4,7,1,7, 7,4,7,5,7, 7,1,1,1,1, 7,5,7,5,7, 7,5,7,1,7};

I64 vl_w=640, vl_h=480;      // court size, from the window
I64 vl_p1, vl_p2;            // paddle tops, pixels
I64 vl_bx, vl_by, vl_vx, vl_vy;
I64 vl_s1, vl_s2, vl_serve_to=1, vl_live, vl_winner, vl_rally, vl_best_rally=0;
I64 vl_paused, vl_quit, vl_snd_t, vl_flash;
I64 vl_up1, vl_dn1, vl_up2, vl_dn2;
I64 vl_serve_held, vl_serve_prev, vl_serve_tap, vl_pause_held, vl_pause_prev, vl_pause_tap;

U0 VlSound(I64 ona, I64 frames)
{
  Snd(ona);
  vl_snd_t=frames;
}

U0 VlPlace()                 // ball waits in the middle for a serve
{
  vl_bx=(vl_w/2-VL_BALL/2)*VL_FIX;
  vl_by=((VL_TOP+vl_h)/2-VL_BALL/2)*VL_FIX;
  vl_vx=0; vl_vy=0; vl_live=FALSE; vl_rally=0;
}

U0 VlNewMatch()
{
  vl_s1=0; vl_s2=0; vl_winner=0; vl_paused=FALSE;
  vl_p1=(VL_TOP+vl_h)/2-VL_PAD_H/2; vl_p2=vl_p1;
  VlPlace;
}

U0 VlServe()
{
  vl_vx=5*VL_FIX;
  if (vl_serve_to==1) vl_vx=-vl_vx;
  vl_vy=(RandU16()%(3*VL_FIX))-3*VL_FIX/2;
  vl_live=TRUE;
  VlSound(40, 3);
}

I64 VlClampPad(I64 y)
{
  if (y<VL_TOP+4) return VL_TOP+4;
  if (y>vl_h-4-VL_PAD_H) return vl_h-4-VL_PAD_H;
  return y;
}

// Bounce off a paddle: faster each time, and steeper the further from its middle it hits.
U0 VlHit(I64 pad_top, I64 dir)
{
  I64 speed=AbsI64(vl_vx)*21/20, off;
  if (speed>11*VL_FIX) speed=11*VL_FIX;
  off=vl_by/VL_FIX+VL_BALL/2-(pad_top+VL_PAD_H/2);
  vl_vx=dir*speed;
  vl_vy=off*VL_FIX/5;
  vl_rally++;
  if (vl_rally>vl_best_rally) vl_best_rally=vl_rally;
  VlSound(60, 3);
}

U0 VlPoint(I64 who)
{
  if (who==1) vl_s1++; else vl_s2++;
  vl_serve_to=3-who;         // the side that lost the point receives the serve
  vl_flash=20;
  VlSound(30, 12);
  if (vl_s1>=VL_WIN) vl_winner=1;
  if (vl_s2>=VL_WIN) vl_winner=2;
  VlPlace;
}

U0 VlMoveBall()
{
  I64 ox=vl_bx/VL_FIX, nx, ny, left=VL_PAD_IN+VL_PAD_W, right=vl_w-VL_PAD_IN-VL_PAD_W;
  vl_bx+=vl_vx; vl_by+=vl_vy;
  ny=vl_by/VL_FIX;
  if (ny<VL_TOP) {
    vl_by=VL_TOP*VL_FIX; vl_vy=AbsI64(vl_vy);
    VlSound(50, 2);
  } else if (ny>vl_h-VL_BALL) {
    vl_by=(vl_h-VL_BALL)*VL_FIX; vl_vy=-AbsI64(vl_vy);
    VlSound(50, 2);
  }
  nx=vl_bx/VL_FIX; ny=vl_by/VL_FIX;
  // A paddle hit is any step that crosses the paddle's face while the ball overlaps it.
  if (vl_vx<0 && ox>=left && nx<left && ny+VL_BALL>vl_p1 && ny<vl_p1+VL_PAD_H) {
    vl_bx=left*VL_FIX;
    VlHit(vl_p1, 1);
  } else if (vl_vx>0 && ox+VL_BALL<=right && nx+VL_BALL>right &&
        ny+VL_BALL>vl_p2 && ny<vl_p2+VL_PAD_H) {
    vl_bx=(right-VL_BALL)*VL_FIX;
    VlHit(vl_p2, -1);
  } else if (nx+VL_BALL<0)
    VlPoint(2);
  else if (nx>vl_w)
    VlPoint(1);
}

U0 VlStep()
{
  I64 serve=(vl_serve_held || vl_serve_tap) && !vl_serve_prev;
  I64 pause=(vl_pause_held || vl_pause_tap) && !vl_pause_prev;
  if (vl_snd_t>0) { vl_snd_t--; if (!vl_snd_t) Snd(0); }
  if (vl_flash>0) vl_flash--;
  if (pause && !vl_winner) vl_paused=!vl_paused;
  if (!vl_paused) {
    if (vl_winner) {
      if (serve) VlNewMatch;
    } else {
      if (vl_up1) vl_p1-=VL_PAD_V;
      if (vl_dn1) vl_p1+=VL_PAD_V;
      if (vl_up2) vl_p2-=VL_PAD_V;
      if (vl_dn2) vl_p2+=VL_PAD_V;
      vl_p1=VlClampPad(vl_p1); vl_p2=VlClampPad(vl_p2);
      if (vl_live) VlMoveBall;
      else if (serve) VlServe;
    }
  }
  vl_serve_prev=vl_serve_held; vl_serve_tap=FALSE;
  vl_pause_prev=vl_pause_held; vl_pause_tap=FALSE;
}

//==================== input ====================
I64 VlKeyHeld(I64 sc)
{
#ifdef TOS_NATIVE
  return Bt(kbd.down_bitmap, sc);
#else
  return BrowserKeys[sc];
#endif
}

U0 VlKey(I64 ch)
{
  if (ch==0x1B) vl_quit=TRUE;
  else if (ch==' ') vl_serve_tap=TRUE;
  else if (ch=='p' || ch=='P') vl_pause_tap=TRUE;
}

U0 VlInput()
{
#ifdef TOS_NATIVE
  I64 a1, a2, msg;
  while (msg=ScanMsg(&a1, &a2, 1<<MSG_KEY_DOWN|1<<MSG_KEY_UP))
    if (msg==MSG_KEY_DOWN)
      VlKey(a1);
#else
  while (ScanChar())
    VlKey(KeyGet());
#endif
  vl_up1=VlKeyHeld(VL_K_W);   vl_dn1=VlKeyHeld(VL_K_S);
  vl_up2=VlKeyHeld(VL_K_UP);  vl_dn2=VlKeyHeld(VL_K_DOWN);
  vl_serve_held=VlKeyHeld(VL_K_SPACE);
  vl_pause_held=VlKeyHeld(VL_K_P);
}

//==================== drawing ====================
U0 VlBox(CDC *dc, I64 x, I64 y, I64 w, I64 h, I64 color)
{
  dc->color=color;
  GrRect(dc, x, y, w, h);
}

U0 VlDigit(CDC *dc, I64 x, I64 y, I64 d, I64 color)
{
  I64 r, c;
  for (r=0; r<5; r++)
    for (c=0; c<3; c++)
      if ((vl_font[d*5+r]>>(2-c))&1)
        VlBox(dc, x+c*8, y+r*8, 8, 8, color);
}

U0 VlCenter(CDC *dc, I64 y, U8 *s, I64 color)
{
  dc->color=color;
  GrPrint(dc, vl_w/2-StrLen(s)*4, y, s);
}

U0 VlDraw(CTask *task, CDC *dc)
{
  I64 y, cx;
  vl_w=task->pix_width; vl_h=task->pix_height;
  cx=vl_w/2;
  VlBox(dc, 0, 0, vl_w, VL_TOP, WHITE);
  VlBox(dc, 0, VL_TOP, vl_w, vl_h-VL_TOP, BLUE);
  if (vl_flash&4) VlBox(dc, 0, VL_TOP, vl_w, vl_h-VL_TOP, LTBLUE);
  VlBox(dc, 0, VL_TOP, vl_w, 2, LTCYAN);
  VlBox(dc, 0, vl_h-2, vl_w, 2, LTCYAN);
  for (y=VL_TOP+6; y<vl_h; y+=16)
    VlBox(dc, cx-1, y, 3, 8, LTCYAN);

  dc->color=BLUE;
  GrPrint(dc, 8, 6, "V O L L E Y");
  dc->color=BROWN;
  GrPrint(dc, 8, 18, "Player 1: W S");
  dc->color=RED;
  GrPrint(dc, vl_w-8-15*8, 18, "Player 2: Up Dn");
  dc->color=BLACK;
  GrPrint(dc, 8, 32, "Space serve  P pause  Esc quit");
  GrPrint(dc, vl_w-8-15*8, 32, "First to 7 wins");
  VlDigit(dc, cx-72, VL_TOP+16, vl_s1%10, YELLOW);
  VlDigit(dc, cx+48, VL_TOP+16, vl_s2%10, LTRED);

  VlBox(dc, VL_PAD_IN, vl_p1, VL_PAD_W, VL_PAD_H, YELLOW);
  VlBox(dc, VL_PAD_IN+VL_PAD_W-3, vl_p1, 3, VL_PAD_H, BROWN);
  VlBox(dc, vl_w-VL_PAD_IN-VL_PAD_W, vl_p2, VL_PAD_W, VL_PAD_H, LTRED);
  VlBox(dc, vl_w-VL_PAD_IN-VL_PAD_W, vl_p2, 3, VL_PAD_H, RED);
  if (!vl_winner)
    VlBox(dc, vl_bx/VL_FIX, vl_by/VL_FIX, VL_BALL, VL_BALL, WHITE);

  if (vl_winner) {
    VlBox(dc, cx-120, vl_h/2-20, 240, 48, WHITE);
    if (vl_winner==1) VlCenter(dc, vl_h/2-8, "PLAYER 1 WINS", BROWN);
    else VlCenter(dc, vl_h/2-8, "PLAYER 2 WINS", RED);
    VlCenter(dc, vl_h/2+8, "Space: play again", BLUE);
  } else if (vl_paused)
    VlCenter(dc, vl_h/2+40, "PAUSED: P to carry on", WHITE);
  else if (!vl_live) {
    if (vl_serve_to==1) VlCenter(dc, vl_h/2+40, "Space: serve to player 1", WHITE);
    else VlCenter(dc, vl_h/2+40, "Space: serve to player 2", WHITE);
  }
}

//==================== main ====================
U0 Volley()
{
  I64 steps;
  F64 last, now, acc=0.0;
  Seed(0);
#ifdef TOS_NATIVE
  SettingsPush;
  AutoComplete(OFF);
  WinBorder(OFF);
  WinMax;
  DocCursor(OFF);
  DocClear;
  Fs->win_inhibit|=WIF_SELF_MS_L|WIF_SELF_MS_R|WIG_DBL_CLICK;
  vl_w=Fs->pix_width; vl_h=Fs->pix_height;
  LBtr(kbd.down_bitmap, VL_K_SPACE);
  FlushMsgs;
  VlNewMatch;
  Fs->draw_it=&VlDraw;
#else
  CDC *dc=DCAlias;
  vl_w=Fs->pix_width; vl_h=Fs->pix_height;
  VlNewMatch;
#endif
  last=tS();
  try {
    while (!vl_quit) {
      VlInput;
      now=tS(); acc+=now-last; last=now;
      if (acc>0.25) acc=0.25;
      steps=0;
      while (acc>=VL_DT && steps<15) { VlStep; acc-=VL_DT; steps++; }
#ifdef TOS_NATIVE
      Refresh;
#else
      VlDraw(Fs, dc);
      Sleep(16);
#endif
    }
  } catch
    PutExcept;
  Snd(0);
#ifdef TOS_NATIVE
  Fs->draw_it=NULL;
  Fs->win_inhibit=WIG_USER_TASK_DFT;
  DocClear;
  SettingsPop;
  FlushMsgs;
#else
  DCFill(dc, BLACK);
#endif
  "Volley: ";
  "%d to %d, longest rally %d\n", vl_s1, vl_s2, vl_best_rally;
}

Volley;
