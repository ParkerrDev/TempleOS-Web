// Babel: stones fall onto the tower. Turn and place them, and every full row is cleared.
// Runs in TempleOS V5.03 and in the browser through HolyC-WASM, from this one file.
//   A/D or Left/Right move   W or Up turns   S or Down drops faster   Space drops at once
//   P pauses   Space starts again after the tower falls   Esc quits

// Real TempleOS: #ifdef also finds kernel symbols such as kbd, which HolyC-WASM does not
// have, so the file picks its own target. The site's TempleOS launcher defines it too.
#ifndef TOS_NATIVE
#ifdef kbd
#define TOS_NATIVE 1
#endif
#endif

#define BB_W      10        // the well, in cells
#define BB_H      20
#define BB_CELL   20        // pixels per cell
#define BB_DT     (1.0/60.0)

#define BB_K_W     0x11     // merged scan codes, the same in TempleOS and the browser bridge
#define BB_K_A     0x1E
#define BB_K_S     0x1F
#define BB_K_D     0x20
#define BB_K_P     0x19
#define BB_K_SPACE 0x39
#define BB_K_UP    0x48
#define BB_K_LEFT  0x4B
#define BB_K_RIGHT 0x4D
#define BB_K_DOWN  0x50

#define BB_LEFT  0          // actions
#define BB_RIGHT 1
#define BB_TURN  2
#define BB_SOFT  3
#define BB_DROP  4
#define BB_PAUSE 5
#define BB_ACTS  6

#ifndef TOS_NATIVE
U8 BrowserKeys[128];        // HolyC-WASM fills this with the held keys
#endif

// The seven stones in a 4x4 box, bit r*4+c, and the size of the box each one turns in.
I64 bb_base[7]={0x00F0,0x0033,0x0072,0x0036,0x0063,0x0071,0x0074};
I64 bb_size[7]={4,2,3,3,3,3,3};
I64 bb_light[7]={LTCYAN,YELLOW,LTPURPLE,LTGREEN,LTRED,LTBLUE,WHITE};
I64 bb_dark[7]={CYAN,BROWN,PURPLE,GREEN,RED,BLUE,LTGRAY};
I64 bb_points[5]={0,100,300,600,1000};
I64 bb_kicks[5]={0,-1,1,-2,2};   // sideways nudges tried when a turn is blocked
I64 bb_rot[28];             // [stone*4+turn]

U8  bb_board[BB_W*BB_H];    // 0 empty, else stone+1
U8  bb_full[BB_H];          // rows being cleared
I64 bb_bag[7], bb_bag_left;
I64 bb_cur, bb_turn, bb_x, bb_y, bb_next;
I64 bb_fall_t, bb_lock_t, bb_lock_moves, bb_clear_t, bb_rep_t;
I64 bb_score, bb_lines, bb_level, bb_best=0;
I64 bb_over, bb_paused, bb_quit, bb_snd_t;
I64 bb_held[BB_ACTS], bb_prev[BB_ACTS], bb_tap[BB_ACTS];

I64 BbTurned(I64 mask, I64 n)   // a quarter turn clockwise inside an n x n box
{
  I64 r, c, out=0;
  for (r=0; r<n; r++)
    for (c=0; c<n; c++)
      if ((mask>>(r*4+c))&1)
        out|=1<<(c*4+n-1-r);
  return out;
}

U0 BbMakeTurns()
{
  I64 i, t, m;
  for (i=0; i<7; i++) {
    m=bb_base[i];
    for (t=0; t<4; t++) {
      bb_rot[i*4+t]=m;
      m=BbTurned(m, bb_size[i]);
    }
  }
}

I64 BbFits(I64 mask, I64 px, I64 py)
{
  I64 r, c, x, y;
  for (r=0; r<4; r++)
    for (c=0; c<4; c++)
      if ((mask>>(r*4+c))&1) {
        x=px+c; y=py+r;
        if (x<0 || x>=BB_W || y>=BB_H) return FALSE;
        if (y>=0 && bb_board[y*BB_W+x]) return FALSE;
      }
  return TRUE;
}

I64 BbFromBag()             // each run of seven holds every stone once
{
  I64 i, j, t;
  if (bb_bag_left<=0) {
    for (i=0; i<7; i++) bb_bag[i]=i;
    for (i=6; i>0; i--) {
      j=RandU16()%(i+1);
      t=bb_bag[i]; bb_bag[i]=bb_bag[j]; bb_bag[j]=t;
    }
    bb_bag_left=7;
  }
  bb_bag_left--;
  return bb_bag[bb_bag_left];
}

U0 BbSound(I64 ona, I64 frames)
{
  Snd(ona);
  bb_snd_t=frames;
}

U0 BbSpawn()
{
  bb_cur=bb_next; bb_next=BbFromBag();
  bb_turn=0; bb_x=3; bb_y=0;
  if (bb_cur==0) bb_y=-1;   // the long stone lies in the second row of its box
  if (bb_cur==1) bb_x=4;
  bb_fall_t=0; bb_lock_t=0; bb_lock_moves=0;
  if (!BbFits(bb_rot[bb_cur*4], bb_x, bb_y)) {
    bb_over=TRUE;
    if (bb_score>bb_best) bb_best=bb_score;
    BbSound(20, 40);
  }
}

U0 BbNew()
{
  I64 i;
  for (i=0; i<BB_W*BB_H; i++) bb_board[i]=0;
  for (i=0; i<BB_H; i++) bb_full[i]=0;
  bb_bag_left=0; bb_score=0; bb_lines=0; bb_level=1;
  bb_over=FALSE; bb_paused=FALSE; bb_clear_t=0; bb_rep_t=0;
  bb_next=BbFromBag();
  BbSpawn;
}

U0 BbCollapse()
{
  I64 y, yy, x, n=0;
  for (y=BB_H-1; y>=0; y--)
    if (bb_full[y]) n++;
  y=BB_H-1;
  for (yy=BB_H-1; yy>=0; yy--) {
    if (!bb_full[yy]) {
      if (y!=yy)
        for (x=0; x<BB_W; x++) bb_board[y*BB_W+x]=bb_board[yy*BB_W+x];
      y--;
    }
  }
  for (; y>=0; y--)
    for (x=0; x<BB_W; x++) bb_board[y*BB_W+x]=0;
  for (y=0; y<BB_H; y++) bb_full[y]=0;
  bb_score+=bb_points[n]*bb_level;
  bb_lines+=n;
  bb_level=1+bb_lines/10;
}

U0 BbLock()
{
  I64 r, c, x, y, mask=bb_rot[bb_cur*4+bb_turn], full, n=0;
  for (r=0; r<4; r++)
    for (c=0; c<4; c++)
      if ((mask>>(r*4+c))&1) {
        x=bb_x+c; y=bb_y+r;
        if (y>=0) bb_board[y*BB_W+x]=bb_cur+1;
      }
  for (y=0; y<BB_H; y++) {
    full=TRUE;
    for (x=0; x<BB_W; x++)
      if (!bb_board[y*BB_W+x]) full=FALSE;
    bb_full[y]=full;
    if (full) n++;
  }
  if (n) {
    bb_clear_t=18;          // the rows shine white, then fall away
    BbSound(50+n*6, 10);
  } else {
    BbSound(30, 2);
    BbSpawn;
  }
}

I64 BbMove(I64 dx, I64 dy)
{
  if (!BbFits(bb_rot[bb_cur*4+bb_turn], bb_x+dx, bb_y+dy)) return FALSE;
  bb_x+=dx; bb_y+=dy;
  if (dx && bb_lock_moves<15) { bb_lock_t=0; bb_lock_moves++; }
  return TRUE;
}

U0 BbTurn()
{
  I64 i, t=(bb_turn+1)&3;
  for (i=0; i<5; i++)
    if (BbFits(bb_rot[bb_cur*4+t], bb_x+bb_kicks[i], bb_y)) {
      bb_x+=bb_kicks[i]; bb_turn=t;
      if (bb_lock_moves<15) { bb_lock_t=0; bb_lock_moves++; }
      return;
    }
}

I64 BbPressed(I64 a)        // a new press, from a held key or from a tap shorter than a frame
{
  return (bb_held[a] || bb_tap[a]) && !bb_prev[a];
}

U0 BbStep()
{
  I64 a, dx=0, rows=0, speed;
  if (bb_snd_t>0) { bb_snd_t--; if (!bb_snd_t) Snd(0); }
  if (bb_over) {
    if (BbPressed(BB_DROP)) BbNew;
  } else if (BbPressed(BB_PAUSE)) {
    bb_paused=!bb_paused;
  } else if (bb_paused) {
  } else if (bb_clear_t>0) {
    bb_clear_t--;
    if (!bb_clear_t) { BbCollapse; BbSpawn; }
  } else {
    if (BbPressed(BB_LEFT)) { dx=-1; bb_rep_t=10; }
    else if (BbPressed(BB_RIGHT)) { dx=1; bb_rep_t=10; }
    else if (bb_held[BB_LEFT] != bb_held[BB_RIGHT]) {
      if (--bb_rep_t<=0) {    // holding a side keeps the stone sliding
        bb_rep_t=3;
        if (bb_held[BB_LEFT]) dx=-1; else dx=1;
      }
    }
    if (dx) BbMove(dx, 0);
    if (BbPressed(BB_TURN)) BbTurn;
    if (BbPressed(BB_DROP)) {
      while (BbMove(0, 1)) rows++;
      bb_score+=2*rows;
      BbLock;
    } else {
      speed=50-4*bb_level;
      if (speed<3) speed=3;
      if (bb_held[BB_SOFT] && speed>2) speed=2;
      if (++bb_fall_t>=speed) {
        bb_fall_t=0;
        if (BbMove(0, 1)) {
          if (bb_held[BB_SOFT]) bb_score++;
          bb_lock_t=0;
        }
      }
      if (!BbFits(bb_rot[bb_cur*4+bb_turn], bb_x, bb_y+1)) {
        if (++bb_lock_t>=30) BbLock;
      }
    }
  }
  for (a=0; a<BB_ACTS; a++) {
    bb_prev[a]=bb_held[a];
    bb_tap[a]=FALSE;
  }
}

//==================== input ====================
I64 BbKeyHeld(I64 sc)
{
#ifdef TOS_NATIVE
  return Bt(kbd.down_bitmap, sc);
#else
  return BrowserKeys[sc];
#endif
}

U0 BbKey(I64 ch, I64 sc)
{
  if (ch==0x1B) bb_quit=TRUE;
  else if (ch==' ') bb_tap[BB_DROP]=TRUE;
  else if (ch=='p' || ch=='P') bb_tap[BB_PAUSE]=TRUE;
  else if (ch=='w' || ch=='W' || sc==BB_K_UP) bb_tap[BB_TURN]=TRUE;
  else if (ch=='a' || ch=='A' || sc==BB_K_LEFT) bb_tap[BB_LEFT]=TRUE;
  else if (ch=='d' || ch=='D' || sc==BB_K_RIGHT) bb_tap[BB_RIGHT]=TRUE;
}

U0 BbInput()
{
#ifdef TOS_NATIVE
  I64 a1, a2, msg;
  while (msg=ScanMsg(&a1, &a2, 1<<MSG_KEY_DOWN|1<<MSG_KEY_UP))
    if (msg==MSG_KEY_DOWN)
      BbKey(a1, a2.u8[0]);
#else
  while (ScanChar())
    BbKey(KeyGet(), 0);
#endif
  bb_held[BB_LEFT]=BbKeyHeld(BB_K_A) || BbKeyHeld(BB_K_LEFT);
  bb_held[BB_RIGHT]=BbKeyHeld(BB_K_D) || BbKeyHeld(BB_K_RIGHT);
  bb_held[BB_TURN]=BbKeyHeld(BB_K_W) || BbKeyHeld(BB_K_UP);
  bb_held[BB_SOFT]=BbKeyHeld(BB_K_S) || BbKeyHeld(BB_K_DOWN);
  bb_held[BB_DROP]=BbKeyHeld(BB_K_SPACE);
  bb_held[BB_PAUSE]=BbKeyHeld(BB_K_P);
}

//==================== drawing ====================
U0 BbNum(U8 *buf, I64 n)    // decimal digits, so GrPrint needs no format
{
  U8 tmp[24];
  I64 i=0, j=0;
  if (n<0) n=0;
  do {
    tmp[i++]='0'+n%10;
    n/=10;
  } while (n && i<20);
  while (i>0) buf[j++]=tmp[--i];
  buf[j]=0;
}

U0 BbBox(CDC *dc, I64 x, I64 y, I64 w, I64 h, I64 color)
{
  dc->color=color;
  GrRect(dc, x, y, w, h);
}

U0 BbStone(CDC *dc, I64 x, I64 y, I64 s)
{
  BbBox(dc, x, y, BB_CELL-1, BB_CELL-1, bb_dark[s]);
  BbBox(dc, x, y, BB_CELL-4, BB_CELL-4, bb_light[s]);
  BbBox(dc, x+4, y+4, BB_CELL-10, BB_CELL-10, bb_dark[s]);
  BbBox(dc, x+5, y+5, BB_CELL-12, BB_CELL-12, bb_light[s]);
}

U0 BbShape(CDC *dc, I64 mask, I64 ox, I64 oy, I64 s, I64 ghost)
{
  I64 r, c;
  for (r=0; r<4; r++)
    for (c=0; c<4; c++)
      if ((mask>>(r*4+c))&1 && oy+r*BB_CELL>=0) {
        if (ghost) {
          BbBox(dc, ox+c*BB_CELL, oy+r*BB_CELL, BB_CELL-1, BB_CELL-1, DKGRAY);
          BbBox(dc, ox+c*BB_CELL+2, oy+r*BB_CELL+2, BB_CELL-5, BB_CELL-5, BLACK);
        } else
          BbStone(dc, ox+c*BB_CELL, oy+r*BB_CELL, s);
      }
}

U0 BbLabel(CDC *dc, I64 x, I64 y, U8 *name, I64 n)
{
  U8 buf[24];
  dc->color=BLUE;
  GrPrint(dc, x, y, name);
  BbNum(buf, n);
  dc->color=BLACK;
  GrPrint(dc, x, y+12, buf);
}

U0 BbDraw(CTask *task, CDC *dc)
{
  I64 w=task->pix_width, h=task->pix_height, ox, oy, x, y, gy, mask, px;
  ox=w/2-BB_W*BB_CELL/2-40; oy=(h-BB_H*BB_CELL)/2;
  if (oy<12) oy=12;
  BbBox(dc, 0, 0, w, h, WHITE);
  // a double blue frame around the well, as TempleOS draws its windows
  BbBox(dc, ox-8, oy-8, BB_W*BB_CELL+16, BB_H*BB_CELL+16, BLUE);
  BbBox(dc, ox-6, oy-6, BB_W*BB_CELL+12, BB_H*BB_CELL+12, WHITE);
  BbBox(dc, ox-4, oy-4, BB_W*BB_CELL+8, BB_H*BB_CELL+8, BLUE);
  BbBox(dc, ox-1, oy-1, BB_W*BB_CELL+1, BB_H*BB_CELL+1, BLACK);
  for (y=0; y<BB_H; y++)
    for (x=0; x<BB_W; x++) {
      if (bb_full[y] && bb_clear_t&2)
        BbBox(dc, ox+x*BB_CELL, oy+y*BB_CELL, BB_CELL-1, BB_CELL-1, WHITE);
      else if (bb_board[y*BB_W+x])
        BbStone(dc, ox+x*BB_CELL, oy+y*BB_CELL, bb_board[y*BB_W+x]-1);
    }
  if (!bb_over && !bb_clear_t) {
    mask=bb_rot[bb_cur*4+bb_turn];
    gy=bb_y;
    while (BbFits(mask, bb_x, gy+1)) gy++;
    if (gy!=bb_y) BbShape(dc, mask, ox+bb_x*BB_CELL, oy+gy*BB_CELL, bb_cur, TRUE);
    BbShape(dc, mask, ox+bb_x*BB_CELL, oy+bb_y*BB_CELL, bb_cur, FALSE);
  }

  px=ox+BB_W*BB_CELL+28;
  dc->color=BLUE;
  GrPrint(dc, px, oy, "NEXT STONE");
  BbBox(dc, px, oy+12, 4*BB_CELL+8, 3*BB_CELL+8, BLUE);
  BbBox(dc, px+2, oy+14, 4*BB_CELL+4, 3*BB_CELL+4, BLACK);
  mask=bb_rot[bb_next*4];
  if (bb_next==0) BbShape(dc, mask, px+4, oy+16, bb_next, FALSE);
  else BbShape(dc, mask, px+4+BB_CELL/2*(4-bb_size[bb_next]), oy+16+BB_CELL/2, bb_next, FALSE);
  BbLabel(dc, px, oy+96, "SCORE", bb_score);
  BbLabel(dc, px, oy+128, "ROWS", bb_lines);
  BbLabel(dc, px, oy+160, "LEVEL", bb_level);
  BbLabel(dc, px, oy+192, "BEST", bb_best);

  x=16;
  dc->color=RED;
  GrPrint(dc, x, oy, "B A B E L");
  dc->color=BLUE;
  GrPrint(dc, x, oy+16, "Build the tower.");
  GrPrint(dc, x, oy+26, "Full rows clear.");
  dc->color=BLACK;
  GrPrint(dc, x, oy+48, "A D  <- ->  move");
  GrPrint(dc, x, oy+60, "W    Up     turn");
  GrPrint(dc, x, oy+72, "S    Down   fall");
  GrPrint(dc, x, oy+84, "Space       drop");
  GrPrint(dc, x, oy+96, "P pause  Esc quit");

  if (bb_paused || bb_over) {
    BbBox(dc, ox+12, oy+BB_H*BB_CELL/2-26, BB_W*BB_CELL-24, 52, BLUE);
    BbBox(dc, ox+14, oy+BB_H*BB_CELL/2-24, BB_W*BB_CELL-28, 48, WHITE);
    if (bb_over) {
      dc->color=RED;
      GrPrint(dc, ox+40, oy+BB_H*BB_CELL/2-14, "THE TOWER FELL");
      dc->color=BLUE;
      GrPrint(dc, ox+28, oy+BB_H*BB_CELL/2+4, "Space: build again");
    } else {
      dc->color=BLUE;
      GrPrint(dc, ox+76, oy+BB_H*BB_CELL/2-14, "PAUSED");
      GrPrint(dc, ox+36, oy+BB_H*BB_CELL/2+4, "P to carry on");
    }
  }
}

//==================== main ====================
U0 Babel()
{
  I64 steps;
  F64 last, now, acc=0.0;
  BbMakeTurns;
  Seed(0);
  BbNew;
#ifdef TOS_NATIVE
  SettingsPush;
  AutoComplete(OFF);
  WinBorder(OFF);
  WinMax;
  DocCursor(OFF);
  DocClear;
  Fs->win_inhibit|=WIF_SELF_MS_L|WIF_SELF_MS_R|WIG_DBL_CLICK;
  LBtr(kbd.down_bitmap, BB_K_SPACE);
  FlushMsgs;
  Fs->draw_it=&BbDraw;
#else
  CDC *dc=DCAlias;
#endif
  last=tS();
  try {
    while (!bb_quit) {
      BbInput;
      now=tS(); acc+=now-last; last=now;
      if (acc>0.25) acc=0.25;
      steps=0;
      while (acc>=BB_DT && steps<15) { BbStep; acc-=BB_DT; steps++; }
#ifdef TOS_NATIVE
      Refresh;
#else
      BbDraw(Fs, dc);
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
  "Babel: best score ";
  "%d\n", bb_best;
}

Babel;
