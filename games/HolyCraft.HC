// HolyCraft — a tiny voxel sandbox (Minecraft-ish) written in HolyC, compiled to
// WebAssembly by holyc-wasm and run in the browser.
//
// Everything is CPU-bound (software rendering, single thread), so it is built for
// speed: a per-pixel voxel raycaster (3D DDA, Amanatides & Woo) renders into a small
// 8-bit indexed buffer in WASM memory with NO host calls in the hot loop, then one
// GrSprite() blits that buffer scaled to fill the 640x480 screen each frame.
//   128*5 = 640, 96*5 = 480  -> the low-res frame fills the screen exactly.
//
// Controls:  W/S move   A/D strafe   R/F up/down   J/L turn   I/K look
//            move the MOUSE to look · LEFT-click break · RIGHT-click place
//            1..7 pick block   Esc quit

#define RES_W   128          // internal render width  (x5 = 640)
#define RES_H   96           // internal render height (x5 = 480)
#define SCALE   5
#define WX      64           // world size
#define WZ      64
#define WY      40
#define WATER   5
#define RDIST   24.0         // render distance (ray units) -> fog horizon
#define MAXSTEP 96           // DDA step cap per ray

U8  *g_world = NULL;         // WX*WZ*WY voxels, 0 = air
U8  *g_fb    = NULL;         // RES_W*RES_H indexed frame
U8  *g_ramp  = NULL;         // [block*3 + tone] -> palette index  (tone 0 top,1 side,2 dark/far)
F64  g_px, g_py, g_pz;       // camera position
F64  g_yaw, g_pitch;         // camera angles
I64  g_sel  = 1;             // selected block to place
I64  g_plb  = 0, g_prb = 0;  // previous mouse button states (edge detect)
// movement timers (refreshed by key events, decay each frame -> smooth hold via key-repeat)
I64  g_tf,g_tb,g_tl,g_tr,g_tu,g_td,g_tjl,g_tjr,g_tpu,g_tpd;

I64 WIdx(I64 x, I64 y, I64 z)
{
  return x + WX*(z + WZ*y);
}

I64 Solid(I64 x, I64 y, I64 z)
{
  if (x<0 || x>=WX || z<0 || z>=WZ || y<0 || y>=WY) return 0;
  return g_world[WIdx(x,y,z)];
}

I64 HeightAt(I64 x, I64 z)
{
  F64 h = 14.0 + 4.0*Sin(x*0.16) + 4.0*Cos(z*0.15) + 2.5*Sin((x+z)*0.08) + 2.0*Cos((x-z)*0.11);
  I64 hi = h;
  if (hi<2) hi=2;
  if (hi>WY-8) hi=WY-8;
  return hi;
}

U0 SetRamp()
{
  g_ramp[1*3+0]=10; g_ramp[1*3+1]=2;  g_ramp[1*3+2]=8;   // grass  LTGREEN/GREEN/DKGRAY
  g_ramp[2*3+0]=6;  g_ramp[2*3+1]=6;  g_ramp[2*3+2]=8;   // dirt   BROWN
  g_ramp[3*3+0]=7;  g_ramp[3*3+1]=7;  g_ramp[3*3+2]=8;   // stone  LTGRAY
  g_ramp[4*3+0]=6;  g_ramp[4*3+1]=8;  g_ramp[4*3+2]=8;   // wood
  g_ramp[5*3+0]=10; g_ramp[5*3+1]=2;  g_ramp[5*3+2]=2;   // leaves
  g_ramp[6*3+0]=14; g_ramp[6*3+1]=6;  g_ramp[6*3+2]=6;   // sand   YELLOW
  g_ramp[7*3+0]=11; g_ramp[7*3+1]=9;  g_ramp[7*3+2]=1;   // water  LTCYAN/LTBLUE/BLUE
}

U0 PlantTree(I64 x, I64 top, I64 z)
{
  I64 dy,lx,ly,lz;
  for (dy=0; dy<4; dy++)
    if (top+dy<WY) g_world[WIdx(x,top+dy,z)]=4;            // trunk
  for (ly=top+3; ly<=top+5; ly++)
    for (lx=x-2; lx<=x+2; lx++)
      for (lz=z-2; lz<=z+2; lz++) {
        if (Solid(lx,ly,lz)) continue;
        if ((lx-x)*(lx-x)+(lz-z)*(lz-z)+(ly-top-4)*(ly-top-4) <= 6)
          if (lx>=0 && lx<WX && lz>=0 && lz<WZ && ly<WY) g_world[WIdx(lx,ly,lz)]=5;
      }
}

U0 GenWorld()
{
  I64 x,z,y,h;
  for (x=0; x<WX; x++)
    for (z=0; z<WZ; z++) {
      h = HeightAt(x,z);
      for (y=0; y<WY; y++) {
        I64 b=0;
        if (y<h-3)      b=3;        // stone
        else if (y<h-1) b=2;        // dirt
        else if (y<h)   b=1;        // grass (top)
        if (b==0 && y<=WATER && y>=h) b=7;   // water above low terrain
        if (b==1 && h<=WATER+1) b=6;          // sand at the shoreline
        g_world[WIdx(x,y,z)]=b;
      }
      if (h>WATER+1 && ((x*7+z*13)%53)==0) PlantTree(x,h,z);
    }
}

U0 Init()
{
  g_world = MAlloc(WX*WZ*WY);
  g_fb    = MAlloc(RES_W*RES_H);
  g_ramp  = MAlloc(8*3);
  SetRamp();
  GenWorld();
  // spawn on the highest column near the middle so you start on land with a view
  I64 sx,sz,bestx=WX/2,bestz=WZ/2,besth=0;
  for (sx=WX/2-12; sx<WX/2+12; sx++)
    for (sz=WZ/2-12; sz<WZ/2+12; sz++) {
      I64 hh=HeightAt(sx,sz);
      if (hh>besth) { besth=hh; bestx=sx; bestz=sz; }
    }
  g_px = bestx+0.5; g_pz = bestz+0.5;
  g_py = besth + 1.7;
  g_yaw = 0.7; g_pitch = -0.18;
}

// ----- the renderer: one 3D-DDA ray per pixel into g_fb -----
U0 RenderFrame()
{
  F64 cp=Cos(g_pitch), sp=Sin(g_pitch), cy=Cos(g_yaw), sy=Sin(g_yaw);
  F64 fwx=sy*cp, fwy=sp,  fwz=cy*cp;          // forward
  F64 rgx=cy,    rgy=0.0, rgz=-sy;             // right
  F64 upx=-sy*sp,upy=cp,  upz=-cy*sp;          // up
  F64 fov=0.85, asp=1.0*RES_W/RES_H;
  F64 ox=g_px, oy=g_py, oz=g_pz;
  I64 bix=Floor(ox), biy=Floor(oy), biz=Floor(oz);
  I64 sx,syy;
  for (syy=0; syy<RES_H; syy++) {
    F64 vy=(1.0 - 2.0*syy/RES_H)*fov;
    F64 bx=fwx+upx*vy, by=fwy+upy*vy, bz=fwz+upz*vy;   // row base dir (cx=0)
    F64 cstep=2.0/RES_W*asp*fov;
    F64 cx=-asp*fov;
    I64 row=syy*RES_W;
    I64 skytone=9; if (syy<RES_H*3/8) skytone=1; else if (syy<RES_H/2) skytone=9; else skytone=11;
    for (sx=0; sx<RES_W; sx++) {
      F64 dx=bx+rgx*cx, dy=by, dz=bz+rgz*cx;
      cx+=cstep;
      // 3D DDA setup
      I64 ix=bix, iy=biy, iz=biz;
      F64 adx=Abs(dx), ady=Abs(dy), adz=Abs(dz);
      I64 stx,sty,stz;
      F64 tdx,tdy,tdz, tmx,tmy,tmz;
      if (dx>0.0) { stx=1;  tdx=1.0/adx; tmx=(ix+1-ox)*tdx; }
      else if (dx<0.0){ stx=-1; tdx=1.0/adx; tmx=(ox-ix)*tdx; }
      else { stx=0; tdx=1000000.0; tmx=1000000.0; }
      if (dy>0.0) { sty=1;  tdy=1.0/ady; tmy=(iy+1-oy)*tdy; }
      else if (dy<0.0){ sty=-1; tdy=1.0/ady; tmy=(oy-iy)*tdy; }
      else { sty=0; tdy=1000000.0; tmy=1000000.0; }
      if (dz>0.0) { stz=1;  tdz=1.0/adz; tmz=(iz+1-oz)*tdz; }
      else if (dz<0.0){ stz=-1; tdz=1.0/adz; tmz=(oz-iz)*tdz; }
      else { stz=0; tdz=1000000.0; tmz=1000000.0; }
      I64 axis=1, hit=0, bt=0, step;
      F64 t=0.0;
      for (step=0; step<MAXSTEP; step++) {
        if (tmx<tmy && tmx<tmz) { ix+=stx; t=tmx; tmx+=tdx; axis=0; }
        else if (tmy<tmz)       { iy+=sty; t=tmy; tmy+=tdy; axis=1; }
        else                    { iz+=stz; t=tmz; tmz+=tdz; axis=2; }
        if (t>RDIST) break;
        if (ix<0||ix>=WX||iz<0||iz>=WZ||iy<0||iy>=WY) break;
        bt=g_world[WIdx(ix,iy,iz)];
        if (bt) { hit=1; break; }
      }
      I64 col;
      if (hit) {
        I64 tone;
        if (axis==1) { if (sty<0) tone=0; else tone=2; }   // top bright, bottom dark
        else tone=1;                                        // x/z side
        if (t>15.0) tone=2; else if (t>8.0 && tone<1) tone=1;   // distance darkening
        col=g_ramp[bt*3+tone];
      } else col=skytone;
      g_fb[row+sx]=col;
    }
  }
}

U0 DrawHUD()
{
  I64 cx=RES_W/2, cy=RES_H/2, i;
  for (i=-3; i<=3; i++) { g_fb[cy*RES_W+cx+i]=15; g_fb[(cy+i)*RES_W+cx]=15; }   // crosshair
  // hotbar: 7 swatches along the bottom, selected one framed white
  I64 b, bw=10, x0=(RES_W-7*bw)/2, y0=RES_H-9;
  for (b=1; b<=7; b++) {
    I64 px=x0+(b-1)*bw, py, qx;
    I64 c=g_ramp[b*3+0];
    for (py=y0; py<y0+7; py++)
      for (qx=px+1; qx<px+bw-1; qx++) g_fb[py*RES_W+qx]=c;
    if (b==g_sel)
      for (qx=px; qx<px+bw; qx++) { g_fb[(y0-1)*RES_W+qx]=15; g_fb[(y0+7)*RES_W+qx]=15; }
  }
}

// raycast from the camera center to the first solid voxel; returns hit + the
// empty cell just before it (for placing). out_* via globals.
I64 g_hx,g_hy,g_hz, g_bx,g_by,g_bz;   // hit cell, and the air cell before it
I64 PickTarget()
{
  F64 cp=Cos(g_pitch), sp=Sin(g_pitch), cy=Cos(g_yaw), sy=Sin(g_yaw);
  F64 dx=sy*cp, dy=sp, dz=cy*cp;
  F64 ox=g_px, oy=g_py, oz=g_pz;
  I64 ix=Floor(ox), iy=Floor(oy), iz=Floor(oz), px=ix,py=iy,pz=iz;
  F64 adx=Abs(dx),ady=Abs(dy),adz=Abs(dz);
  I64 stx,sty,stz; F64 tdx,tdy,tdz,tmx,tmy,tmz;
  if (dx>0.0){stx=1;tdx=1.0/adx;tmx=(ix+1-ox)*tdx;}else if(dx<0.0){stx=-1;tdx=1.0/adx;tmx=(ox-ix)*tdx;}else{stx=0;tdx=1000000.0;tmx=1000000.0;}
  if (dy>0.0){sty=1;tdy=1.0/ady;tmy=(iy+1-oy)*tdy;}else if(dy<0.0){sty=-1;tdy=1.0/ady;tmy=(oy-iy)*tdy;}else{sty=0;tdy=1000000.0;tmy=1000000.0;}
  if (dz>0.0){stz=1;tdz=1.0/adz;tmz=(iz+1-oz)*tdz;}else if(dz<0.0){stz=-1;tdz=1.0/adz;tmz=(oz-iz)*tdz;}else{stz=0;tdz=1000000.0;tmz=1000000.0;}
  I64 step; F64 t=0.0;
  for (step=0; step<48; step++) {
    px=ix; py=iy; pz=iz;
    if (tmx<tmy && tmx<tmz){ix+=stx;t=tmx;tmx+=tdx;}
    else if (tmy<tmz)      {iy+=sty;t=tmy;tmy+=tdy;}
    else                   {iz+=stz;t=tmz;tmz+=tdz;}
    if (t>6.0) return 0;
    if (Solid(ix,iy,iz)) { g_hx=ix;g_hy=iy;g_hz=iz; g_bx=px;g_by=py;g_bz=pz; return 1; }
  }
  return 0;
}

U0 TryMove(F64 mx, F64 my, F64 mz)
{
  if (!Solid(Floor(g_px+mx), Floor(g_py), Floor(g_pz))) g_px+=mx;
  if (!Solid(Floor(g_px), Floor(g_py), Floor(g_pz+mz))) g_pz+=mz;
  if (!Solid(Floor(g_px), Floor(g_py+my), Floor(g_pz))) g_py+=my;
}

U0 HandleInput()
{
  I64 ch;
  while (ScanChar()) {            // peek (ScanChar does NOT consume in this runtime)...
    ch = KeyGet();               // ...so KeyGet() consumes the char (won't block, one is ready)
    if (ch=='w') g_tf=4;  else if (ch=='s') g_tb=4;
    else if (ch=='a') g_tl=4;  else if (ch=='d') g_tr=4;
    else if (ch=='r') g_tu=4;  else if (ch=='f') g_td=4;
    else if (ch=='j') g_tjl=4; else if (ch=='l') g_tjr=4;
    else if (ch=='i') g_tpu=4; else if (ch=='k') g_tpd=4;
    else if ('1'<=ch<='7') g_sel=ch-'0';
    else if (ch==0x1b) { g_py=-9999.0; return; }   // Esc -> sentinel to quit
  }
  // mouse look: rate by distance from screen centre (dead zone)
  I64 mx=ms.pos.x, my=ms.pos.y;
  F64 dxm=(mx-320)/320.0, dym=(my-240)/240.0;
  if (dxm>0.12||dxm<-0.12) g_yaw   += dxm*0.06;
  if (dym>0.12||dym<-0.12) g_pitch -= dym*0.05;

  F64 spd=0.18, rot=0.05;
  F64 cy=Cos(g_yaw), sy=Sin(g_yaw);
  if (g_tf>0){TryMove(sy*spd,0,cy*spd);  g_tf--;}
  if (g_tb>0){TryMove(-sy*spd,0,-cy*spd);g_tb--;}
  if (g_tl>0){TryMove(-cy*spd,0,sy*spd); g_tl--;}
  if (g_tr>0){TryMove(cy*spd,0,-sy*spd); g_tr--;}
  if (g_tu>0){TryMove(0,spd,0);  g_tu--;}
  if (g_td>0){TryMove(0,-spd,0); g_td--;}
  if (g_tjl>0){g_yaw-=rot; g_tjl--;}
  if (g_tjr>0){g_yaw+=rot; g_tjr--;}
  if (g_tpu>0){g_pitch+=rot; g_tpu--;}
  if (g_tpd>0){g_pitch-=rot; g_tpd--;}
  if (g_pitch>1.45) g_pitch=1.45;
  if (g_pitch<-1.45) g_pitch=-1.45;

  // break / place on mouse click edges
  I64 lb=ms.lb, rb=ms.rb;
  if (lb && !g_plb) if (PickTarget()) g_world[WIdx(g_hx,g_hy,g_hz)]=0;
  if (rb && !g_prb) if (PickTarget()) g_world[WIdx(g_bx,g_by,g_bz)]=g_sel;
  g_plb=lb; g_prb=rb;
}

U0 HolyCraft()
{
  CDC *dc=DCAlias;
  Init();
  while (TRUE) {
    HandleInput();
    if (g_py<-9000.0) break;        // Esc
    RenderFrame();
    DrawHUD();
    GrSprite(dc, 0, 0, g_fb, RES_W, RES_H, SCALE);
    Sleep(16);
  }
  DCFill(dc, BLACK);
  "HolyCraft: thanks for playing!\n";
}

HolyCraft;
