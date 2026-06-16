// Snake — the classic, in HolyC -> WebAssembly.  W/A/S/D to steer, Esc to quit.
#define GW   34
#define GH   26
#define CELL 18
#define OX   14
#define OY   6

I64 sx[1024], sy[1024];          // snake body, head at index 0
I64 slen, dirx, diry, ax, ay, alive;

U0 PlaceApple()
{
  ax = Rand()*GW; if (ax>=GW) ax=GW-1;
  ay = Rand()*GH; if (ay>=GH) ay=GH-1;
}

U0 Reset()
{
  I64 i;
  slen=5; dirx=1; diry=0; alive=1;
  for (i=0; i<slen; i++) { sx[i]=GW/2-i; sy[i]=GH/2; }
  PlaceApple();
}

U0 Snake()
{
  CDC *dc=DCAlias;
  I64 ch,i;
  Reset();
  while (TRUE) {
    while (ScanChar()) {
      ch=KeyGet();
      if      (ch=='w' && diry==0) { dirx=0;  diry=-1; }
      else if (ch=='s' && diry==0) { dirx=0;  diry=1;  }
      else if (ch=='a' && dirx==0) { dirx=-1; diry=0;  }
      else if (ch=='d' && dirx==0) { dirx=1;  diry=0;  }
      else if (ch==0x1b) return;
    }
    if (alive) {
      I64 nx=sx[0]+dirx, ny=sy[0]+diry, self=0;
      for (i=0; i<slen; i++) if (sx[i]==nx && sy[i]==ny) self=1;
      if (nx<0||nx>=GW||ny<0||ny>=GH||self) alive=0;
      else {
        for (i=slen; i>0; i--) { sx[i]=sx[i-1]; sy[i]=sy[i-1]; }
        sx[0]=nx; sy[0]=ny;
        if (nx==ax && ny==ay) { slen++; PlaceApple(); }
      }
    }
    DCFill(dc, BLACK);
    dc->color=DKGRAY; GrBorder(dc, OX-2, OY-2, GW*CELL+2, GH*CELL+2);
    dc->color=RED;    GrRect(dc, OX+ax*CELL, OY+ay*CELL, CELL-2, CELL-2);
    for (i=0; i<slen; i++) {
      if (i==0) dc->color=LTGREEN; else dc->color=GREEN;
      if (!alive) dc->color=LTRED;
      GrRect(dc, OX+sx[i]*CELL, OY+sy[i]*CELL, CELL-2, CELL-2);
    }
    Sleep(105);
    if (!alive) { Sleep(800); Reset(); }
  }
}

Snake;
