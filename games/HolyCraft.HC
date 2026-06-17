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
#define RES_W   640          // FULL native resolution — NO downscaling (1 framebuffer px = 1 screen px).
#define RES_H   472          // the maximized borderless window is 640x472 (top 8px = OS menu bar).
#define SCALE   1            // SLOW in the x86 emulator for now; per the user, optimize the emulator later.
#define RDIST   32.0         // render distance (WORLD units)
#define MAXSTEP 80           // DDA step cap (>= steps to reach RDIST diagonally)
#else
#define RES_W   640          // full 640x480 in the browser too (native WASM is fast enough), SCALE 1
#define RES_H   480
#define SCALE   1
#define RDIST   36.0         // render distance (WORLD units)
#define MAXSTEP 110          // DDA step cap per ray
#endif
#define WX      128           // world size
#define WZ      128
#define WY      40
#define WATER   5
#define EYE     1.62         // eye height above the feet
#define GRAV    0.050        // gravity per frame (HIGH -> fast, snappy jump arc to suit the low emulator fps)
#define JUMP    0.46         // jump impulse (~2-block jump but a much shorter air time than the old 0.020/0.33)

U8  *g_world = NULL;         // WX*WZ*WY voxels, 0 = air
U8  *g_fb    = NULL;         // RES_W*RES_H indexed frame — RenderFrame/DrawHUD's render target
U8  *g_show  = NULL;         // the published frame DrawIt reads (native: a 2nd buffer, swapped each
                            // frame so DrawIt never blits a half-rendered frame; browser: == g_fb)
U8   g_skyr[3];             // sky gradient ramp (blue zenith -> ltblue -> ltcyan horizon)
U8   g_lr[24*4];            // per-block ramp, 4 levels dark->bright. 0=air; 1-7 materials; 8-23 = the 16 system colors
U8   g_flo[24*6], g_fhi[24*6]; // per (block,face): the 2 ramp colors bracketing that face's light shade
I64  g_fthr[24*6];          // per (block,face): probability 0..65536 for the LIVE "static" dither blend
U8  *g_hm    = NULL;         // per (x,z): top solid y (heightmap) -> bounds the native exposed-face scan
I64  g_frame = 0;           // frame counter -> reseeds the dither each frame so it animates (like Varoom)
F64  g_px, g_py, g_pz;       // camera position
F64  g_yaw, g_pitch;         // camera angles
I64  g_sel  = 8;             // selected block to place (8..23 = the 16 palette-colour blocks)
I64  g_plb  = 0, g_prb = 0;  // previous mouse button states (edge detect)
// movement timers (refreshed by key events, decay each frame -> smooth hold via key-repeat)
I64  g_tf,g_tb,g_tl,g_tr,g_tu,g_td,g_tjl,g_tjr,g_tpu,g_tpd;
F64  g_vy = 0.0;             // vertical velocity (gravity)
I64  g_fly = 0;             // creative fly toggle ('g')
I64  g_onground = 0, g_quit = 0;
#ifdef TOS_NATIVE
// native face-rasterizer state (declared before Init, which allocates g_depth). CDC is an OS type, so
// these stay inside TOS_NATIVE (the browser/holyc-wasm target never sees them).
I32 *g_depth = NULL;          // z-buffer (I32/px; smaller==nearer; cleared to I32_MAX); attached to the DC each frame
I64  g_depthcap = 1024*768;   // z-buffer capacity in px (covers any sane screen)
F64  g_focal, g_cxc, g_cyc;   // perspective focal length (px) + screen centre (set per frame from the DC size)
I64  g_sw, g_sh;              // screen width/height (px) -- for the off-screen face reject in DrawFace
CDC *g_rdc = NULL;            // the DC the current frame's faces fill (set at the top of RenderFaces)
#endif

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
  I64 c; U8 dk[16], lt[16];
  g_skyr[0]=1; g_skyr[1]=9; g_skyr[2]=11;                 // sky: blue -> ltblue -> ltcyan
  // Materials (terrain). 4-level ramp dark->bright; face lighting + the live dither blend the two
  // bracketing colors. Darken with BLACK (not gray) so shading stays the material's hue.
  g_lr[1*4+0]=0;  g_lr[1*4+1]=2;  g_lr[1*4+2]=10; g_lr[1*4+3]=10;   // grass  black->green->ltgreen
  g_lr[2*4+0]=0;  g_lr[2*4+1]=6;  g_lr[2*4+2]=6;  g_lr[2*4+3]=14;   // dirt   black->brown->yellow
  g_lr[3*4+0]=0;  g_lr[3*4+1]=8;  g_lr[3*4+2]=7;  g_lr[3*4+3]=15;   // stone  black->dkgray->ltgray->white
  g_lr[4*4+0]=0;  g_lr[4*4+1]=6;  g_lr[4*4+2]=6;  g_lr[4*4+3]=14;   // wood
  g_lr[5*4+0]=0;  g_lr[5*4+1]=2;  g_lr[5*4+2]=10; g_lr[5*4+3]=10;   // leaves
  g_lr[6*4+0]=6;  g_lr[6*4+1]=14; g_lr[6*4+2]=14; g_lr[6*4+3]=15;   // sand   brown->yellow->white
  g_lr[7*4+0]=1;  g_lr[7*4+1]=9;  g_lr[7*4+2]=11; g_lr[7*4+3]=11;   // water  blue->ltblue->ltcyan
  // The 16 system colours are blocks 8..23 (block 8+c = palette colour c) -> the placeable hotbar. These are
  // the 16 DISTINCT colours; the 7 terrain materials (1..7) each duplicate one of these hues (grass/leaves=
  // green, dirt/wood=brown, stone=gray, sand=yellow, water=cyan) so they're kept for terrain/trees but NOT
  // shown in the hotbar (no duplicate swatches).
  dk[0] =0; dk[1] =0; dk[2] =0;  dk[3] =1;  dk[4] =0;  dk[5] =0;  dk[6] =0;  dk[7] =8;   // darker shade per color
  dk[8] =0; dk[9] =1; dk[10]=2;  dk[11]=9;  dk[12]=4;  dk[13]=5;  dk[14]=6;  dk[15]=7;
  lt[0] =8; lt[1] =9; lt[2] =10; lt[3] =11; lt[4] =12; lt[5] =13; lt[6] =14; lt[7] =15;  // brighter shade per color
  lt[8] =7; lt[9] =11;lt[10]=15; lt[11]=15; lt[12]=14; lt[13]=15; lt[14]=15; lt[15]=15;
  for (c=0; c<16; c++) {
    g_lr[(8+c)*4+0]=dk[c]; g_lr[(8+c)*4+1]=c; g_lr[(8+c)*4+2]=c; g_lr[(8+c)*4+3]=lt[c];
  }
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
    for (bt=1; bt<=23; bt++) {              // 7 materials (terrain) + the 16 palette-colour blocks (8..23)
      g_flo[bt*6+f] =g_lr[bt*4+lo];
      g_fhi[bt*6+f] =g_lr[bt*4+lo+1];
      g_fthr[bt*6+f]=fr*65536.0;            // probability the pixel takes the brighter color (live dither)
      if (g_fthr[bt*6+f]>65535) g_fthr[bt*6+f]=65535;   // clamp for the U16 dither_probability field
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

// heightmap = the top solid voxel of each (x,z) column. The native face-rasterizer walks this "shell"
// (top face + the side faces exposed wherever a neighbour column is lower) instead of every voxel.
U0 ColTop(I64 x, I64 z)
{
  I64 y, top=0;
  for (y=WY-1; y>=0; y--)
    if (g_world[WIdx(x,y,z)]) { top=y; break; }
  g_hm[x+WX*z]=top;
}

U0 BuildHM()
{
  I64 x,z;
  for (x=0; x<WX; x++)
    for (z=0; z<WZ; z++) ColTop(x,z);
}

U0 Init()
{
  g_world = MAlloc(WX*WZ*WY);
  g_hm    = MAlloc(WX*WZ);
  g_fb    = MAlloc(RES_W*RES_H);
#ifdef TOS_NATIVE
  g_show  = MAlloc(RES_W*RES_H);   // second buffer: tear-free hand-off to DrawIt
  g_depth = MAlloc(g_depthcap*sizeof(I32));   // face-rasterizer z-buffer (attached to the screen DC each frame)
#else
  g_show  = g_fb;
#endif
  SetRamp();
  BuildFaceShades();
  GenWorld();
  BuildHM();
  // spawn standing in the middle: drop in from just above the ground, gravity settles you
  g_px = WX/2 + 0.5; g_pz = WZ/2 + 0.5;
  g_py = HeightAt(WX/2, WZ/2) + EYE;
  g_vy = 0.0; g_fly = 0; g_onground = 1;
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
  // LIVE "static" dither RNG (a 64-bit LCG). Seeded from g_frame so the noise re-randomizes every frame
  // (animated, like TempleOS's RandU16 probability dither / the Varoom car), and from y0 so SMP slices differ.
  U64 rng = (g_frame*2654435761 + y0*2246822519 + 12345) | 1;
  for (syy=y0; syy<y1; syy++) {
    F64 vy=(1.0 - 2.0*syy/RES_H)*fov;
#ifdef TOS_NATIVE
    vy = -vy;   // real TempleOS HolyC renders the vertical ray sweep INVERTED vs holyc-wasm (the camera
                // up-vector contribution comes out negated; Sin/Cos/the vy formula all verify correct in
                // isolation, so it's a codegen difference). Flip it here so the native world is right-side up.
#endif
    F64 bx=fwx+upx*vy, by=fwy+upy*vy, bz=fwz+upz*vy;   // row base dir (cx=0)
    F64 cstep=2.0/RES_W*asp*fov;
    F64 cx=-asp*fov;
    I64 row=syy*RES_W;
    // per-row sky gradient: position in the 3-colour ramp + dither probability toward the next colour
    F64 skp=2.0*syy/RES_H; if (skp>1.999) skp=1.999;
    I64 sklv=skp, skb=g_skyr[sklv], skb2=g_skyr[sklv+1];
    I64 skthr=(skp-sklv)*65536.0;
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
        bt=g_world[ix + WX*(iz + WZ*iy)];   // WIdx() inlined: TempleOS HolyC doesn't inline, and a CALL per
        if (bt) { hit=1; break; }            // DDA step (~millions/frame) is brutal in the x86 emulator
      }
      rng = rng*6364136223846793005 + 1442695040888963407;   // advance the LCG (one random value per pixel)
      I64 rv = (rng>>48)&0xFFFF, col;                         // 0..65535
      if (hit) {
        // which of the 6 cube faces (DDA step axis + sign) -> its precomputed light-direction shade,
        // then a LIVE probability dither (rv<threshold) blends toward the brighter ramp colour.
        // (no ternary -- real TempleOS HolyC has none; holyc-wasm tolerates it but the OS compiler errors.)
        I64 faceid;
        if (axis==0)      { if (stx>0) faceid=0; else faceid=1; }   // hit -X vs +X face
        else if (axis==1) { if (sty>0) faceid=2; else faceid=3; }   // -Y (bottom) vs +Y (top)
        else              { if (stz>0) faceid=4; else faceid=5; }   // -Z vs +Z
        I64 k=bt*6+faceid;
        if (rv < g_fthr[k]) col=g_fhi[k]; else col=g_flo[k];
      } else if (rv < skthr) col=skb2; else col=skb;          // sky gradient (also dithered)
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
  g_frame++;                       // advance the live-dither seed so the "static" re-randomizes each frame
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
  I64 aw=RES_W/110, t; if (aw<4) aw=4;                       // crosshair = a Latin (Christian) cross: short top + crossbar, long lower stem; you aim at the crossing
  for (t=0; t<2; t++) {                                       // 2px thick
    for (i=-aw; i<=aw*3; i++) g_fb[(cy+i)*RES_W + cx+t]=15;   // vertical stem (top stub aw, lower stem 3aw)
    for (i=-aw; i<=aw;   i++) g_fb[(cy+t)*RES_W + cx+i]=15;   // crossbar (near the top)
  }
  // hotbar: 7 swatches along the bottom, sized RELATIVE to the resolution (so it isn't huge at low res
  // or invisible at high res). gap framing inside each cell; selected one framed white.
  I64 nb=16, bw=RES_W/17, gap=bw/8, b;                       // 16 placeable blocks = the palette colours (8..23)
  if (gap<1) gap=1;
  I64 bh=bw*3/4, x0=(RES_W-nb*bw)/2, y0=RES_H-bh-bh/3;       // squarish swatches near the bottom
  for (b=0; b<nb; b++) {
    I64 blk=8+b, px=x0+b*bw, py, qx;
    I64 c=g_lr[blk*4+2];                                     // representative shade of the colour block
    for (py=y0; py<y0+bh; py++)
      for (qx=px+gap; qx<px+bw-gap; qx++) g_fb[py*RES_W+qx]=c;
    if (blk==g_sel)
      for (qx=px-1; qx<px+bw; qx++) { g_fb[(y0-1)*RES_W+qx]=15; g_fb[(y0+bh)*RES_W+qx]=15; }
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
  else if ('1'<=ch<='9') g_sel=7+ch-'0';                      // 1-9: quick-pick the first nine colour blocks (8..16)
  else if (ch=='q') { g_sel--; if (g_sel<8)  g_sel=23; }      // cycle the selected colour (8..23); the ARROW
  else if (ch=='e') { g_sel++; if (g_sel>23) g_sel=8;  }      //   keys do this too (see HandleInput)
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
        I64 sc = a2.u8[0];                                    // arrow keys now CYCLE the selected block
        if      (sc==SC_CURSOR_LEFT  || sc==SC_CURSOR_UP)   { g_sel--; if (g_sel<8)  g_sel=23; }
        else if (sc==SC_CURSOR_RIGHT || sc==SC_CURSOR_DOWN) { g_sel++; if (g_sel>23) g_sel=8;  }
      }
      if (g_quit) return;
    }
  }
  // mouse look (native/TempleOS): dead-zone steering off the OS cursor (ms.pos). With pointer-capture (host
  // feeds recentred deltas) this reads as relative look; without it, steer by pushing the cursor to an edge.
  F64 dxm, dym, dyaw, dpit;
  dxm=(ms.pos.x-320)*0.003125; dym=(ms.pos.y-240)*0.004167;   // /320, /240 -> -1..1
  dyaw=dxm*0.07; dpit=dym*0.05;
  if (dxm>0.14 || dxm<-0.14) g_yaw   = g_yaw   + dyaw;
  if (dym>0.14 || dym<-0.14) g_pitch = g_pitch - dpit;        // var - var (codegen-safe)
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
  F64 rot=0.07;                  // snappier turn (bigger step/frame to suit the low emulator fps)
  if (g_tjl>0){g_yaw-=rot; g_tjl--;}
  if (g_tjr>0){g_yaw+=rot; g_tjr--;}
  if (g_tpu>0){g_pitch+=rot; g_tpu--;}
  if (g_tpd>0){g_pitch-=rot; g_tpd--;}
  if (g_pitch>1.45) g_pitch=1.45;
  if (g_pitch<-1.45) g_pitch=-1.45;

  // walk in the yaw plane, per-axis collision
  F64 spd=0.16, cy=Cos(g_yaw), sy=Sin(g_yaw), mvx=0.0, mvz=0.0;
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
  if (lb && !g_plb) if (PickTarget()) { g_world[WIdx(g_hx,g_hy,g_hz)]=0;    ColTop(g_hx,g_hz); }
  if (rb && !g_prb) if (PickTarget()) { g_world[WIdx(g_bx,g_by,g_bz)]=g_sel; ColTop(g_bx,g_bz); }
  g_plb=lb; g_prb=rb;
}

#ifdef TOS_NATIVE
// ===== native FACE-RASTERIZER ====================================================================
// Instead of one DDA ray per pixel (~302K rays/frame -> ~0.4fps in the x86 emulator), draw the world's
// exposed block FACES as filled z-buffered 3D quads via the OS primitive GrFillPoly3(). Its inner span
// filler GrFillRow is HLE-accelerated by HEMU (the SAME native-speed path that lets Varoom hit 30fps),
// and it z-buffers through dc->depth_buf so faces occlude correctly + each pixel is written ~once.
// We do the perspective projection ourselves (matching RenderRows' fov=1.05 / camera basis). Every
// "var - var" below is deliberate: real TempleOS HolyC mis-compiles "literal - <mul/div expr>".
I64 ProjPt(F64 wxf, F64 wyf, F64 wzf, CD3I32 *p)
{//world -> screen (x,y px) + depth z (>0, nearer==smaller). Returns 0 if behind the near plane.
  F64 rx, ry, rz, fd, rt, upc, inv, dxv, dyv, dzv;
  I64 tx, ty, tz;
  rx = wxf - g_px; ry = wyf - g_py; rz = wzf - g_pz;
  fd = rx*g_fwx + ry*g_fwy + rz*g_fwz;          // forward = camera-space depth
  if (fd < 0.2) return 0;
  rt  = rx*g_rgx + rz*g_rgz;                     // right (rgy is always 0)
  upc = rx*g_upx + ry*g_upy + rz*g_upz;          // up
  inv = g_focal / fd;
  dxv = rt*inv;  dyv = upc*inv;
  tx = g_cxc + dxv;  p->x = tx;                  // + is commutative -> codegen-safe
  ty = g_cyc - dyv;  p->y = ty;                  // var - var (NOT literal - expr)
  dzv = fd * 256.0;  tz = dzv;  p->z = tz;
  return 1;
}

U0 DrawFace(I64 cx, I64 cy0, I64 cy1, I64 cz, I64 faceid, I64 bt)
{//one face spanning cells cy0..cy1 vertically (cy0==cy1 = single cell). face 0=-X 1=+X 2=-Y 3=+Y 4=-Z 5=+Z.
  CD3I32 poly[4];
  F64 ax, ay, az, bx, by, bz;
  I64 ok=0;
  ax=cx; ay=cy0; az=cz; bx=cx+1; by=cy1+1; bz=cz+1;
  if      (faceid==3) { ok+=ProjPt(ax,by,az,&poly[0]); ok+=ProjPt(bx,by,az,&poly[1]); ok+=ProjPt(bx,by,bz,&poly[2]); ok+=ProjPt(ax,by,bz,&poly[3]); }
  else if (faceid==2) { ok+=ProjPt(ax,ay,az,&poly[0]); ok+=ProjPt(ax,ay,bz,&poly[1]); ok+=ProjPt(bx,ay,bz,&poly[2]); ok+=ProjPt(bx,ay,az,&poly[3]); }
  else if (faceid==0) { ok+=ProjPt(ax,ay,az,&poly[0]); ok+=ProjPt(ax,by,az,&poly[1]); ok+=ProjPt(ax,by,bz,&poly[2]); ok+=ProjPt(ax,ay,bz,&poly[3]); }
  else if (faceid==1) { ok+=ProjPt(bx,ay,az,&poly[0]); ok+=ProjPt(bx,ay,bz,&poly[1]); ok+=ProjPt(bx,by,bz,&poly[2]); ok+=ProjPt(bx,by,az,&poly[3]); }
  else if (faceid==4) { ok+=ProjPt(ax,ay,az,&poly[0]); ok+=ProjPt(bx,ay,az,&poly[1]); ok+=ProjPt(bx,by,az,&poly[2]); ok+=ProjPt(ax,by,az,&poly[3]); }
  else                { ok+=ProjPt(ax,ay,bz,&poly[0]); ok+=ProjPt(ax,by,bz,&poly[1]); ok+=ProjPt(bx,by,bz,&poly[2]); ok+=ProjPt(bx,ay,bz,&poly[3]); }
  if (ok==4) {
    // cheap reject: skip the (emulated, costly) GrFillPoly3 when the whole quad is off one screen edge
    if (poly[0].x<0    && poly[1].x<0    && poly[2].x<0    && poly[3].x<0)    return;
    if (poly[0].x>=g_sw && poly[1].x>=g_sw && poly[2].x>=g_sw && poly[3].x>=g_sw) return;
    if (poly[0].y<0    && poly[1].y<0    && poly[2].y<0    && poly[3].y<0)    return;
    if (poly[0].y>=g_sh && poly[1].y>=g_sh && poly[2].y>=g_sh && poly[3].y>=g_sh) return;
    // LIVE probability dither between the two ramp colours bracketing this face's light shade -- the OS's
    // GrFillRow (HLE-accelerated) rolls RandU16<prob per pixel, EXACTLY like the browser raycaster's dither,
    // so the native build gets the same >16-colour blended look. (canonical idiom: dither + c2<<16 + c1.)
    I64 k = bt*6+faceid;
    g_rdc->color = ROPF_PROBABILITY_DITHER + g_fhi[k] << 16 + g_flo[k];
    g_rdc->dither_probability_u16 = g_fthr[k];
    GrFillPoly3(g_rdc, 4, poly);
  }
}

U0 SideRun(I64 x, I64 z, I64 h, I64 faceid, I64 noff)
{//merge a vertical run of same-block faces (neighbour cell base+noff is air) into ONE tall quad -> far fewer
 //GrFillPoly3 calls for trunks/cliffs/canopy sides. Caller already did the back-face (front-facing) test.
  I64 y=0, y2, bt, base, b2;
  while (y<=h) {
    base = x + WX*(z + WZ*y);
    bt = g_world[base];
    if (bt && !g_world[base+noff]) {
      y2=y;
      while (y2+1<=h) {
        b2 = x + WX*(z + WZ*(y2+1));
        if (g_world[b2]==bt && !g_world[b2+noff]) y2=y2+1; else break;
      }
      DrawFace(x,y,y2,z,faceid,bt);
      y=y2+1;
    } else
      y=y+1;
  }
}

U0 RenderFaces(CDC *dc)
{
  I64 need, R, bix, biz, xa, xb, za, zb, x, z, y, h, bt, bidx;
  F64 hw, hh, rcx, rcz, fdc, prp;
  g_rdc = dc;
  SetupCam();                                   // camera basis + g_bix/g_biz (ProjPt reads the basis)
  g_sw=dc->width; g_sh=dc->height;
  hw=g_sw;  hw=hw/2.0;  g_cxc=hw;
  hh=g_sh;  hh=hh/2.0;  g_cyc=hh;
  g_focal = hh / 1.05;                           // (H/2)/fov : same view as RenderRows (fov=1.05)
  need = dc->width_internal * dc->height;
  if (need > g_depthcap) return;
  dc->depth_buf = g_depth;                       // attach our z-buffer ...
  MemSetU32(g_depth, I32_MAX, need);             // ... cleared to "far away"
  MemSet(dc->body, 11, need);                    // sky (ltcyan); faces overwrite it
  R=RDIST; bix=g_bix; biz=g_biz;
  xa=bix-R; xb=bix+R; za=biz-R; zb=biz+R;
  if (xa<1) xa=1;  if (xb>WX-2) xb=WX-2;
  if (za<1) za=1;  if (zb>WZ-2) zb=WZ-2;
  for (z=za; z<=zb; z++)
    for (x=xa; x<=xb; x++) {
      rcx = x - g_px;  rcz = z - g_pz;            // frustum cull: skip columns behind OR well outside the FOV cone
      fdc = rcx*g_fwx + rcz*g_fwz;                 //   forward distance (along the look direction)
      prp = rcx*g_rgx + rcz*g_rgz; if (prp<0.0) prp=-prp;   // |sideways| distance (the right axis)
      if (fdc >= -2.0 && prp <= fdc*3.0 + 8.0) {  // cone widens with distance (generous margin -> no edge pop)
        h = g_hm[x+WX*z];                          // top solid cell of this column (nothing solid above it)
        for (y=0; y<=h; y++) {                     // TOP/BOTTOM faces per cell (horizontal -> can't vertical-merge)
          bidx = x + WX*(z + WZ*y);                // (buried interior cells here are just cheap reads)
          bt = g_world[bidx];
          if (bt) {                                // x in [1,WX-2], z in [1,WZ-2] -> x/z neighbours in-bounds
            if ((y>=WY-1 || !g_world[bidx + WX*WZ]) && g_py>y+1) DrawFace(x,y,y,z,3,bt);   // +Y top
            if (y>0 && !g_world[bidx - WX*WZ]       && g_py<y)   DrawFace(x,y,y,z,2,bt);   // -Y bottom
          }
        }
        if (g_px<x)   SideRun(x,z,h,0,-1);          // SIDE faces: merge each vertical run into ONE tall quad
        if (g_px>x+1) SideRun(x,z,h,1,+1);          //   (-X +X -Z +Z; neighbour offset -1 +1 -WX +WX)
        if (g_pz<z)   SideRun(x,z,h,4,-WX);
        if (g_pz>z+1) SideRun(x,z,h,5,+WX);
      }
    }
  dc->depth_buf = NULL;                           // detach (the buffer is ours; DCDel must not free it)
}

U0 DrawHUDDC(CDC *dc)
{//crosshair + hotbar straight into the window body (2D, on top of the rendered world)
  U8 *b=dc->body;
  I64 W=dc->width, H=dc->height, st=dc->width_internal, cx=W/2, cy=H/2, i;
  I64 aw=W/110, t; if (aw<4) aw=4;                           // Latin (Christian) cross crosshair (aim at the crossing)
  for (t=0; t<2; t++) {
    for (i=-aw; i<=aw*3; i++) b[(cy+i)*st + cx+t]=15;        // vertical stem
    for (i=-aw; i<=aw;   i++) b[(cy+t)*st + cx+i]=15;        // crossbar (near the top)
  }
  I64 nb=16, bw=W/17, gap=bw/8, bsel;
  if (gap<1) gap=1;
  I64 bh=bw*3/4, x0=(W-nb*bw)/2, y0=H-bh-bh/3;
  for (bsel=0; bsel<nb; bsel++) {
    I64 blk=8+bsel, px=x0+bsel*bw, py, qx, c=g_lr[blk*4+2];
    for (py=y0; py<y0+bh; py++)
      for (qx=px+gap; qx<px+bw-gap; qx++) b[py*st+qx]=c;
    if (blk==g_sel)
      for (qx=px-1; qx<px+bw; qx++) { b[(y0-1)*st+qx]=15; b[(y0+bh)*st+qx]=15; }
  }
}

// real TempleOS calls this each refresh with the window DC -> render the world fresh, Varoom-style.
U0 DrawIt(CTask *task, CDC *dc)
{
  no_warn task;
  if (!g_world) return;
  RenderFaces(dc);
  DrawHUDDC(dc);
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
  Fs->draw_it=&DrawIt;          // the WinMgr now renders the world (faces) to the screen DC every refresh
  try {
    while (!g_quit) {
      HandleInput();            // input + physics only; DrawIt does all the rendering (Varoom-style)
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
