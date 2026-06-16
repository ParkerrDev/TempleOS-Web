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
// The x86 emulator is MUCH slower than native WASM, so the native build is tuned HARD for frame rate.
// RES 80x59 x SCALE 8 == 640x472 EXACTLY (the maximized borderless window minus the 8px menu bar), and
// 80/59 == 640/472 so the aspect is exact (no distortion). The integer block-fill (DrawIt) then reads
// each of the 4720 source pixels ONCE and writes its 8x8 block — ~3x cheaper than per-pixel scaling,
// which read all ~302K screen pixels every OS refresh and was the real "barely crawling" cost.
// 80×59 ×8 == 640×472 (the maximized window), 80/59 == 640/472 -> exact aspect, square pixels.
// Finer resolutions are too heavy for the per-pixel software raycaster even split across all 4 SMP
// cores (160×118 measured ~3fps), so this is the resolution/fps sweet spot in the x86 emulator.
#define RES_W   80
#define RES_H   59
#define SCALE   8
#define RDIST   32.0         // fog horizon (WORLD units)
#define FOGMID  11.0
#define FOGFAR  22.0
#define MAXSTEP 80           // DDA step cap (>= steps to reach RDIST diagonally)
#else
#define RES_W   160          // x4 = 640 (finer than the old 128x96 — native WASM affords it; the dither
#define RES_H   120          // x4 = 480  shader makes the extra detail read smoother still)
#define SCALE   4
#define RDIST   36.0         // render distance (WORLD units) -> fog horizon
#define FOGMID  12.0         // start side-face darkening
#define FOGFAR  22.0         // far -> darkest tone
#define MAXSTEP 110          // DDA step cap per ray
#endif
#define WX      128           // world size
#define WZ      128
#define WY      40
#define WATER   5
#define EYE     1.62         // eye height above the feet
#define GRAV    0.020        // gravity per frame
#define JUMP    0.33         // jump impulse
#define DITHER  8.0          // surface-dither cells per world unit (fine: 2 Bayer tiles per block edge)

U8  *g_world = NULL;         // WX*WZ*WY voxels, 0 = air
U8  *g_fb    = NULL;         // RES_W*RES_H indexed frame — RenderFrame/DrawHUD's render target
U8  *g_show  = NULL;         // the published frame DrawIt reads (native: a 2nd buffer, swapped each
                            // frame so DrawIt never blits a half-rendered frame; browser: == g_fb)
U8  *g_ramp  = NULL;         // [block*3 + tone] -> palette index  (tone 0 top,1 side,2 dark/far)
U8   g_bayer[16];            // 4x4 ordered-dither matrix: a fine "static" blend of two palette colors
U8   g_skyr[3];             // sky gradient ramp (blue zenith -> ltblue -> ltcyan horizon)
U8   g_lr[8*4];             // per-block brightness ramp, 4 levels dark->bright (block 0=air unused)
U8   g_flo[8*6], g_fhi[8*6], g_fthr[8*6];  // per (block,face): the 2 ramp colors bracketing that face's
                            // light-direction shade + a dither threshold (0..16). 6 faces -> 6 shades/block.
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
  g_skyr[0]=1; g_skyr[1]=9; g_skyr[2]=11;                 // sky: blue -> ltblue -> ltcyan
  // Bayer 4x4 thresholds (0..15). A pixel takes the *darker* neighbouring tone when bayer < frac*16,
  // so a fractional shade between two of the 16 palette colours is rendered as a fine "static" mix.
  g_bayer[0] =0;  g_bayer[1] =8;  g_bayer[2] =2;  g_bayer[3] =10;
  g_bayer[4] =12; g_bayer[5] =4;  g_bayer[6] =14; g_bayer[7] =6;
  g_bayer[8] =3;  g_bayer[9] =11; g_bayer[10]=1;  g_bayer[11]=9;
  g_bayer[12]=15; g_bayer[13]=7;  g_bayer[14]=13; g_bayer[15]=5;
  // per-block brightness ramp, 4 levels dark->bright. Face lighting picks a position in this ramp and
  // the dither blends the two bracketing colors, so each block reads as up to 6 shades of one material.
  g_lr[1*4+0]=8;  g_lr[1*4+1]=2;  g_lr[1*4+2]=10; g_lr[1*4+3]=10;   // grass  dkgray->green->ltgreen
  g_lr[2*4+0]=8;  g_lr[2*4+1]=6;  g_lr[2*4+2]=6;  g_lr[2*4+3]=14;   // dirt   dkgray->brown->yellow
  g_lr[3*4+0]=0;  g_lr[3*4+1]=8;  g_lr[3*4+2]=7;  g_lr[3*4+3]=15;   // stone  black->dkgray->ltgray->white
  g_lr[4*4+0]=8;  g_lr[4*4+1]=6;  g_lr[4*4+2]=6;  g_lr[4*4+3]=14;   // wood
  g_lr[5*4+0]=8;  g_lr[5*4+1]=2;  g_lr[5*4+2]=10; g_lr[5*4+3]=10;   // leaves
  g_lr[6*4+0]=6;  g_lr[6*4+1]=14; g_lr[6*4+2]=14; g_lr[6*4+3]=15;   // sand   brown->yellow->white
  g_lr[7*4+0]=1;  g_lr[7*4+1]=9;  g_lr[7*4+2]=11; g_lr[7*4+3]=11;   // water  blue->ltblue->ltcyan
}

U0 BuildFaceShades()
{   // Directional per-face lighting: dot each of the 6 cube-face normals with a fixed light direction to
    // get 6 brightness levels, and resolve each to (two ramp colors + dither threshold). Done ONCE -> the
    // hot loop is a single table lookup per pixel. Face order: 0=-X 1=+X 2=-Y 3=+Y 4=-Z 5=+Z.
  F64 Lx=0.394, Ly=0.788, Lz=0.473, amb=0.30;   // light dir (above + +x/+z), pre-normalized
  I64 f, bt;
  for (f=0; f<6; f++) {
    F64 d;
    if      (f==0) d=-Lx; else if (f==1) d=Lx;
    else if (f==2) d=-Ly; else if (f==3) d=Ly;
    else if (f==4) d=-Lz; else          d=Lz;
    if (d<0.0) d=0.0;
    F64 p=(amb+(1.0-amb)*d)*3.0;          // brightness 0..1 -> ramp position 0..3
    I64 lo=p; if (lo>2) lo=2;
    F64 fr=p-lo; if (fr<0.0) fr=0.0; if (fr>1.0) fr=1.0;
    for (bt=1; bt<=7; bt++) {
      g_flo[bt*6+f] =g_lr[bt*4+lo];
      g_fhi[bt*6+f] =g_lr[bt*4+lo+1];
      g_fthr[bt*6+f]=fr*16.0;
    }
  }
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
#ifdef TOS_NATIVE
  g_show  = MAlloc(RES_W*RES_H);   // second buffer: tear-free hand-off to DrawIt
#else
  g_show  = g_fb;
#endif
  g_ramp  = MAlloc(8*3);
  SetRamp();
  BuildFaceShades();
  GenWorld();
  // spawn standing in the middle: drop in from just above the ground, gravity settles you
  g_px = WX/2 + 0.5; g_pz = WZ/2 + 0.5;
  g_py = HeightAt(WX/2, WZ/2) + EYE + 3.0;
  g_vy = 0.0; g_fly = 0; g_onground = 0;
  g_yaw = 0.7; g_pitch = -0.06;
}

// ----- the renderer: one 3D-DDA ray per pixel into g_fb. On SMP the scanlines are SPLIT across all
//       CPU cores (the TempleOS JobQue pattern, like Demo/Graphics/PredatorPrey.HC) -> ~Nx the fps. -----
// camera basis, computed once per frame into globals so every core's slice reads the same view.
F64 g_fwx,g_fwy,g_fwz, g_rgx,g_rgz, g_upx,g_upy,g_upz, g_cox,g_coy,g_coz;
I64 g_bix,g_biy,g_biz;
#ifdef TOS_NATIVE
I64 g_mpdone;                  // SMP: one bit per core, cleared (atomically) when that core's rows are done
#endif

U0 SetupCam()
{
  F64 cp=Cos(g_pitch), sp=Sin(g_pitch), cy=Cos(g_yaw), sy=Sin(g_yaw);
  g_fwx=sy*cp; g_fwy=sp;  g_fwz=cy*cp;        // forward
  g_rgx=cy;               g_rgz=-sy;          // right (rgy is always 0)
  g_upx=-sy*sp; g_upy=cp; g_upz=-cy*sp;       // up
  g_cox=g_px; g_coy=g_py; g_coz=g_pz;
  g_bix=Floor(g_px); g_biy=Floor(g_py); g_biz=Floor(g_pz);
}

U0 RenderRows(I64 y0, I64 y1)                 // render scanlines [y0,y1) into g_fb (reads the basis globals)
{
  F64 fwx=g_fwx,fwy=g_fwy,fwz=g_fwz, rgx=g_rgx,rgz=g_rgz, upx=g_upx,upy=g_upy,upz=g_upz;
  F64 fov=1.05, asp=1.0*RES_W/RES_H;          // wider field of view (was 0.85)
  F64 ox=g_cox, oy=g_coy, oz=g_coz;
  I64 bix=g_bix, biy=g_biy, biz=g_biz;
  I64 sx,syy;
  for (syy=y0; syy<y1; syy++) {
    F64 vy=(1.0 - 2.0*syy/RES_H)*fov;
    F64 bx=fwx+upx*vy, by=fwy+upy*vy, bz=fwz+upz*vy;   // row base dir (cx=0)
    F64 cstep=2.0/RES_W*asp*fov;
    F64 cx=-asp*fov;
    I64 row=syy*RES_W;
    // per-row dither setup: sky gradient position, this row's Bayer offset, and the fog rate
    F64 skp=2.0*syy/RES_H; if (skp>1.999) skp=1.999;
    I64 sklv=skp, skb=g_skyr[sklv], skb2=g_skyr[sklv+1]; F64 skfr=skp-sklv;
    I64 brow=(syy&3)<<2;
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
        // which of the 6 cube faces (DDA step axis + sign) -> its precomputed light-direction shade.
        // (no ternary -- real TempleOS HolyC has none; holyc-wasm tolerates it but the OS compiler errors.)
        I64 faceid, k;
        if (axis==0)      { if (stx>0) faceid=0; else faceid=1; }   // hit -X vs +X face
        else if (axis==1) { if (sty>0) faceid=2; else faceid=3; }   // -Y (bottom) vs +Y (top)
        else              { if (stz>0) faceid=4; else faceid=5; }   // -Z vs +Z
        k=bt*6+faceid;
        col=g_flo[k];
        if (g_fthr[k]) {
          // blend toward the brighter ramp color with a FINE surface-locked dither (indexed by the hit
          // point ON the face -> sticks to the block, like a painted CColorROP material, not the screen).
          F64 hu, hv; I64 du, dv;
          if (axis==0)      { hu=oy+dy*t; hv=oz+dz*t; }
          else if (axis==1) { hu=ox+dx*t; hv=oz+dz*t; }
          else              { hu=ox+dx*t; hv=oy+dy*t; }
          du=hu*DITHER; dv=hv*DITHER;
          if (g_bayer[((dv&3)<<2)|(du&3)] < g_fthr[k]) col=g_fhi[k];
        }
      } else if (g_bayer[brow|(sx&3)] < skfr*16.0) col=skb2; else col=skb;   // sky: screen-vertical gradient
      g_fb[row+sx]=col;
    }
  }
}

#ifdef TOS_NATIVE
I64 RenderSlice(U8 *data)        // a Seth job: render THIS core's band of scanlines, then clear its flag bit
{
  I64 n=Gs->num;                 // the core this job runs on (0..mp_cnt-1) == its slice index
  RenderRows(n*RES_H/mp_cnt, (n+1)*RES_H/mp_cnt);
  LBtr(&g_mpdone, n);            // atomic: signal "core n done" (releases this core's pixel writes)
  return 0;
}
#endif

U0 RenderFrame()
{
  SetupCam();
#ifdef TOS_NATIVE
  if (mp_cnt>1) {                // SMP: hand each core a horizontal band, wait for all (PredatorPrey pattern)
    I64 i, spins=0;
    g_mpdone=(1<<mp_cnt)-1;      // one set bit per core
    for (i=0; i<mp_cnt; i++) JobQue(&RenderSlice, NULL, i);
    do { Yield; spins++; } while (g_mpdone && spins<400000);   // wait for every slice (cap so a lost job never hangs)
    LBts(&g_mpdone,31); LBtr(&g_mpdone,31);                    // atomic fence: acquire all cores' pixel writes before we read g_fb
  } else
    RenderRows(0, RES_H);
#else
  RenderRows(0, RES_H);
#endif
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
// real TempleOS calls this each refresh with the screen DC. CHEAP integer block-fill: each of the 4720
// source pixels is read ONCE and written as its SCALE×SCALE block. RES*SCALE == 640×472 fills the
// maximized window exactly (oy/ox=0, no overflow); a smaller window centers with a stable black border.
// Reads g_show (the published frame, never the one RenderFrame is mid-writing) -> tear-free.
U0 DrawIt(CTask *task, CDC *dc)
{
  U8 *fb=g_show;
  if (!fb) return;
  I64 w=dc->width_internal, sw=task->pix_width, sh=task->pix_height;
  I64 ox=(sw-RES_W*SCALE)/2, oy=(sh-RES_H*SCALE)/2;
  if (ox<0) ox=0;
  if (oy<0) oy=0;
  I64 x,y,sx2,sy2,c,base;
  for (y=0; y<RES_H; y++)
    for (x=0; x<RES_W; x++) {
      c=fb[y*RES_W+x];
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
  U8 *tmp;
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
      RenderFrame();            // draw into g_fb (the back buffer)
      DrawHUD();
      tmp=g_show; g_show=g_fb; g_fb=tmp;   // publish it for DrawIt (pointer swap = tear-free)
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
