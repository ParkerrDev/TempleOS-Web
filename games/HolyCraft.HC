// HolyCraft — a tiny voxel sandbox (Minecraft-ish) written in HolyC.
//
// Everything is CPU-bound (software rendering, single thread), so it is built for
// speed: a per-pixel voxel raycaster (3D DDA, Amanatides & Woo) renders into a small
// 8-bit indexed buffer in memory with NO host calls in the hot loop, then that buffer
// is blitted scaled to fill the 640x480 screen each frame.
//
// Controls:  W/S move   A/D strafe   R/F up/down (toggle fly with G)   J/L turn   I/K look
//            (in the browser you can also LOOK with the MOUSE)
//            LEFT-click break · RIGHT-click place · 1..7 pick block · Esc quit
//
// Two build targets, picked by #ifdef TOS_NATIVE:
//   default          -> holyc-wasm (the in-browser Games launcher): present via GrSprite,
//                       look with the mouse, input via ScanChar/KeyGet.
//   #define TOS_NATIVE -> real TempleOS (run from the C: disk in HEMU): renders through the
//                       standard Fs->draw_it callback (like Demo/Games/Halogen.HC), input via
//                       ScanMsg(MSG_KEY_DOWN); look with J/L/I/K or the arrow keys. A smaller
//                       frame because the x86 emulator is much slower than native WASM.
#ifdef TOS_NATIVE
#define RES_W   80           // x8 = 640
#define RES_H   60           // x8 = 480
#define SCALE   8
#else
#define RES_W   128          // x5 = 640
#define RES_H   96           // x5 = 480
#define SCALE   5
#endif
#define WX      128           // world size
#define WZ      128
#define WY      40
#define WATER   5
#define RDIST   36.0         // render distance (WORLD units) -> fog horizon
#define FOGMID  12.0         // start side-face darkening
#define FOGFAR  22.0         // far -> darkest tone
#define MAXSTEP 110          // DDA step cap per ray
#define EYE     1.62         // eye height above the feet
#define GRAV    0.020        // gravity per frame
#define JUMP    0.33         // jump impulse

U8  *g_world = NULL;         // WX*WZ*WY voxels, 0 = air
U8  *g_fb    = NULL;         // RES_W*RES_H indexed frame
U8  *g_ramp  = NULL;         // [block*3 + tone] -> palette index  (tone 0 top,1 side,2 dark/far)
F64  g_px, g_py, g_pz;       // camera position
F64  g_yaw, g_pitch;         // camera angles
I64  g_sel  = 1;             // selected block to place
I64  g_plb  = 0, g_prb = 0;  // previous mouse button states (edge detect)
// movement timers (refreshed by key events, decay each frame -> smooth hold via key-repeat)
I64  g_tf,g_tb,g_tl,g_tr,g_tu,g_td,g_tjl,g_tjr,g_tpu,g_tpd;
F64  g_vy = 0.0;             // vertical velocity (gravity)
I64  g_fly = 0;             // creative fly toggle ('g')
I64  g_onground = 0, g_quit = 0;

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
      for (lz=z-2; lz<=z+2; lz++)              // (no `continue` — TempleOS HolyC has no such keyword)
        if (!Solid(lx,ly,lz))
          if ((lx-x)*(lx-x)+(lz-z)*(lz-z)+(ly-top-4)*(ly-top-4) <= 6)
            if (lx>=0 && lx<WX && lz>=0 && lz<WZ && ly<WY) g_world[WIdx(lx,ly,lz)]=5;
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
  // spawn standing in the middle: drop in from just above the ground, gravity settles you
  g_px = WX/2 + 0.5; g_pz = WZ/2 + 0.5;
  g_py = HeightAt(WX/2, WZ/2) + EYE + 3.0;
  g_vy = 0.0; g_fly = 0; g_onground = 0;
  g_yaw = 0.7; g_pitch = -0.06;
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
      F64 ln=Sqrt(dx*dx+dy*dy+dz*dz);   // normalize so t == true world distance
      dx=dx/ln; dy=dy/ln; dz=dz/ln;     // (else fog/render-distance wobble per column -> sky strips)
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
        if (t>FOGFAR) tone=2; else if (t>FOGMID && tone<1) tone=1;   // distance darkening
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

I64 PlayerHits(F64 fx, F64 fy, F64 fz)
{//does the player (eye at fx,fy,fz; ~1.7 tall) overlap a solid voxel?
  I64 cx=Floor(fx), cz=Floor(fz);
  if (Solid(cx, Floor(fy-EYE),     cz)) return 1;   // feet
  if (Solid(cx, Floor(fy-EYE+1.5), cz)) return 1;   // chest/head
  return 0;
}

// one character keystroke -> game action (shared by both input back-ends)
U0 KeyDown(I64 ch)
{
  if (ch=='w') g_tf=4;  else if (ch=='s') g_tb=4;
  else if (ch=='a') g_tl=4;  else if (ch=='d') g_tr=4;
  else if (ch=='j') g_tjl=4; else if (ch=='l') g_tjr=4;
  else if (ch=='i') g_tpu=4; else if (ch=='k') g_tpd=4;
  else if (ch=='r') g_tu=4;  else if (ch=='f') g_td=4;        // fly up/down (press 'g' to fly)
  else if (ch==' ') { if (g_onground && !g_fly) { g_vy=JUMP; g_onground=0; } }   // jump
  else if (ch=='g') { g_fly=1-g_fly; g_vy=0.0; }              // toggle creative fly
  else if ('1'<=ch<='7') g_sel=ch-'0';
  else if (ch==0x1b) g_quit=1;                                // Esc (CH_ESC) quits
}

U0 HandleInput()
{
  I64 ch;
#ifdef TOS_NATIVE
  // real TempleOS: drain the message queue (non-blocking). Letters carry a char (arg1);
  // arrow keys carry char 0 + a scancode (arg2) -> use them to look/turn. We pump KEY_UP too
  // (and ignore it) so released-key messages don't pile up in the task queue. Movement is
  // held via key-repeat refreshing the per-direction timers, like the browser build.
  I64 a1, a2, msg;
  while (msg = ScanMsg(&a1, &a2, 1<<MSG_KEY_DOWN | 1<<MSG_KEY_UP)) {
    if (msg==MSG_KEY_DOWN) {
      ch = a1;
      if (ch) KeyDown(ch);
      else {
        I64 sc = a2.u8[0];
        if      (sc==SC_CURSOR_LEFT)  g_tjl=4;
        else if (sc==SC_CURSOR_RIGHT) g_tjr=4;
        else if (sc==SC_CURSOR_UP)    g_tpu=4;
        else if (sc==SC_CURSOR_DOWN)  g_tpd=4;
      }
      if (g_quit) return;
    }
  }
#else
  while (ScanChar()) {            // peek (ScanChar does NOT consume in this runtime)...
    ch = KeyGet();               // ...so KeyGet() consumes the char (won't block, one is ready)
    KeyDown(ch);
    if (g_quit) return;
  }
  // mouse look (browser): turn/pitch rate by distance from screen centre (dead zone)
  F64 dxm=(ms.pos.x-320)/320.0, dym=(ms.pos.y-240)/240.0;
  if (dxm>0.14||dxm<-0.14) g_yaw   += dxm*0.06;
  if (dym>0.14||dym<-0.14) g_pitch -= dym*0.05;
#endif

  // ---- everything below is shared ----
  F64 rot=0.05;
  if (g_tjl>0){g_yaw-=rot; g_tjl--;}
  if (g_tjr>0){g_yaw+=rot; g_tjr--;}
  if (g_tpu>0){g_pitch+=rot; g_tpu--;}
  if (g_tpd>0){g_pitch-=rot; g_tpd--;}
  if (g_pitch>1.45) g_pitch=1.45;
  if (g_pitch<-1.45) g_pitch=-1.45;

  // walk in the yaw plane, per-axis collision
  F64 spd=0.12, cy=Cos(g_yaw), sy=Sin(g_yaw), mvx=0.0, mvz=0.0;
  if (g_tf>0){mvx+=sy; mvz+=cy; g_tf--;}
  if (g_tb>0){mvx-=sy; mvz-=cy; g_tb--;}
  if (g_tl>0){mvx-=cy; mvz+=sy; g_tl--;}
  if (g_tr>0){mvx+=cy; mvz-=sy; g_tr--;}
  if (!PlayerHits(g_px+mvx*spd, g_py, g_pz)) g_px+=mvx*spd;
  if (!PlayerHits(g_px, g_py, g_pz+mvz*spd)) g_pz+=mvz*spd;

  // vertical: creative fly, or gravity + ground/ceiling collision
  if (g_fly) {
    if (g_tu>0){ if (!PlayerHits(g_px,g_py+0.16,g_pz)) g_py+=0.16; g_tu--; }
    if (g_td>0){ if (!PlayerHits(g_px,g_py-0.16,g_pz)) g_py-=0.16; g_td--; }
    g_vy=0.0; g_onground=0;
  } else {
    g_vy -= GRAV; if (g_vy<-0.7) g_vy=-0.7;
    F64 ny=g_py+g_vy;
    if (g_vy<=0.0) {
      if (PlayerHits(g_px,ny,g_pz)) { g_py=Floor(ny-EYE)+1.0+EYE; g_vy=0.0; g_onground=1; }
      else { g_py=ny; g_onground=0; }
    } else {
      if (PlayerHits(g_px,ny,g_pz)) g_vy=0.0; else g_py=ny;
    }
  }

  // break / place on mouse click edges (PickTarget raycasts from the crosshair, not the cursor)
  I64 lb=ms.lb, rb=ms.rb;
  if (lb && !g_plb) if (PickTarget()) g_world[WIdx(g_hx,g_hy,g_hz)]=0;
  if (rb && !g_prb) if (PickTarget()) g_world[WIdx(g_bx,g_by,g_bz)]=g_sel;
  g_plb=lb; g_prb=rb;
}

#ifdef TOS_NATIVE
// real TempleOS calls this each refresh with the screen DC: blit g_fb scaled, centered.
U0 DrawIt(CTask *task, CDC *dc)
{
  I64 w=dc->width_internal, sw=task->pix_width, sh=task->pix_height;
  I64 ox=(sw-RES_W*SCALE)/2, oy=(sh-RES_H*SCALE)/2;
  if (ox<0) ox=0;
  if (oy<0) oy=0;
  I64 x,y,sx2,sy2, c, base;
  if (!g_fb) return;
  for (y=0; y<RES_H; y++)
    for (x=0; x<RES_W; x++) {
      c=g_fb[y*RES_W+x];
      base=(oy+y*SCALE)*w + ox+x*SCALE;
      for (sy2=0; sy2<SCALE; sy2++)
        for (sx2=0; sx2<SCALE; sx2++) dc->body[base+sy2*w+sx2]=c;
    }
}
#else
U0 Present(CDC *dc)
{
  GrSprite(dc, 0, 0, g_fb, RES_W, RES_H, SCALE);   // holyc-wasm blits the 8-bit buffer
}
#endif

U0 HolyCraft()
{
#ifdef TOS_NATIVE
  SettingsPush;
  AutoComplete(OFF);            // don't pop the completion box while we read keys
  WinBorder(OFF);
  WinMax;
  DocCursor(OFF);
  DocClear;
  Init();
  Fs->draw_it=&DrawIt;          // the OS now composites our frame every refresh
  try {
    while (!g_quit) {
      HandleInput();
      RenderFrame();
      DrawHUD();
      Sleep(16);
    }
  } catch
    PutExcept;
  Fs->draw_it=NULL;
  DocClear;
  SettingsPop;
#else
  Init();
  CDC *dc=DCAlias;
  while (!g_quit) {
    HandleInput();
    RenderFrame();
    DrawHUD();
    Present(dc);
    Sleep(16);
  }
  DCFill(dc, BLACK);
  "HolyCraft: thanks for playing!\n";
#endif
}

HolyCraft;
