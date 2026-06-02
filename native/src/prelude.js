// prelude.js — the HolyC standard-library prelude, compiled together with every
// user program. It is real HolyC: classes, #defines, and functions layered over
// the small set of host intrinsics declared in abi.js (the __xxx imports).
//
// This mirrors how TempleOS builds most of Gr*/math/etc. in HolyC on top of a
// few primitives, and it exercises the compiler on real HolyC code.
export const PRELUDE_SRC = String.raw`
//==================== constants ====================
#define NULL 0
#define TRUE 1
#define FALSE 0
#define ON 1
#define OFF 0
#define GR_WIDTH 640
#define GR_HEIGHT 480
#define FONT_WIDTH 8
#define FONT_HEIGHT 8
#define COLORS_NUM 16

#define BLACK 0
#define BLUE 1
#define GREEN 2
#define CYAN 3
#define RED 4
#define PURPLE 5
#define BROWN 6
#define LTGRAY 7
#define DKGRAY 8
#define LTBLUE 9
#define LTGREEN 10
#define LTCYAN 11
#define LTRED 12
#define LTPURPLE 13
#define YELLOW 14
#define WHITE 15

#define I8_MAX 0x7F
#define I16_MAX 0x7FFF
#define I32_MAX 0x7FFFFFFF
#define I64_MAX 0x7FFFFFFFFFFFFFFF
#define U8_MAX 0xFF
#define U16_MAX 0xFFFF
#define U32_MAX 0xFFFFFFFF

#define CH_ESC 0x1B
#define CH_SHIFT_ESC 0x9B
#define CH_SPACE ' '
#define CH_SHIFT_SPACE 0xA0
#define CH_BACKSPACE 8
#define CH_TAB 9
#define CH_RETURN '\n'
#define CH_NEW_LINE '\n'

//==================== math constants ====================
F64 pi=3.14159265358979323846;
F64 pi2=6.28318530717958647692;
F64 sqrt2=1.41421356237309504880;
F64 exp_1=2.71828182845904523536;

//==================== mouse struct (mirrors host writes at MS_ADDR) ====
class CD3I32 { I32 x; I32 y; I32 z; };
class CMouse {
  CD3I32 pos;
  I32 lb;
  I32 rb;
} ms;

//==================== device context ====================
// A lightweight CDC. The real TempleOS CDC is huge; we keep the fields demos use.
class CDC {
  I64 color;
  I64 thick;
  I64 x;
  I64 y;
  I64 flags;
};
CDC gr_dc_storage;

//==================== "Fs" task graphics fields ====================
class CTask {
  I64 pix_width;
  I64 pix_height;
  I64 draw_it;
  I64 task_end_cb;
  I64 win_inhibit;
};
CTask fs_storage;
CTask *Fs;

//==================== gr global ====================
class CGr {
  CDC *dc;
};
CGr gr;

//==================== math (host-backed) ====================
F64 Sin(F64 x) { return __sin(x); }
F64 Cos(F64 x) { return __cos(x); }
F64 Tan(F64 x) { return __tan(x); }
F64 ASin(F64 x) { return __asin(x); }
F64 ACos(F64 x) { return __acos(x); }
F64 ATan(F64 x) { return __atan(x); }
F64 ATan2(F64 y, F64 x) { return __atan2(y,x); }
F64 Pow(F64 x, F64 y) { return __pow(x,y); }
F64 Exp(F64 x) { return __exp(x); }
F64 Ln(F64 x) { return __log(x); }
F64 Log(F64 x) { return __log(x); }
F64 Log10(F64 x) { return __log10(x); }
F64 Sqrt(F64 x) { return __pow(x,0.5); }

F64 Abs(F64 x) { if (x<0.0) return -x; return x; }
I64 AbsI64(I64 x) { if (x<0) return -x; return x; }
I64 SignI64(I64 x) { if (x>0) return 1; if (x<0) return -1; return 0; }
F64 Sign(F64 x) { if (x>0.0) return 1.0; if (x<0.0) return -1.0; return 0.0; }
I64 ClampI64(I64 x, I64 lo, I64 hi) { if (x<lo) return lo; if (x>hi) return hi; return x; }
F64 Clamp(F64 x, F64 lo, F64 hi) { if (x<lo) return lo; if (x>hi) return hi; return x; }
I64 MinI64(I64 a, I64 b) { if (a<b) return a; return b; }
I64 MaxI64(I64 a, I64 b) { if (a>b) return a; return b; }
F64 Min(F64 a, F64 b) { if (a<b) return a; return b; }
F64 Max(F64 a, F64 b) { if (a>b) return a; return b; }
I64 Ceil(F64 x) { I64 i=x; if (i<x) return i+1; return i; }
I64 Floor(F64 x) { I64 i=x; if (i>x) return i-1; return i; }
I64 RoundI64(F64 x) { return Floor(x+0.5); }

//==================== random (xorshift, matches TempleOS Seed semantics) ====
U64 rand_seed=0x123456789ABCDEF;
U0 Seed(I64 s=0) {
  if (s==0) rand_seed = (__time_ms()*1000.0)+0x2545F4914F6CDD1D;
  else rand_seed = s;
  if (rand_seed==0) rand_seed=1;
}
U64 RandU64() {
  U64 x=rand_seed;
  x = x ^ (x<<13);
  x = x ^ (x>>7);
  x = x ^ (x<<17);
  rand_seed=x;
  return x;
}
U32 RandU32() { return RandU64()&0xFFFFFFFF; }
U16 RandU16() { return RandU64()&0xFFFF; }
I16 RandI16() { return RandU64()&0xFFFF; }
I64 RandI64() { return RandU64(); }
F64 Rand() { return (RandU64()>>11)*(1.0/9007199254740992.0); }

//==================== time / scheduling ====================
F64 tS() { return __time_ms()/1000.0; }
U0 Sleep(I64 ms) { __sleep(ms); }
U0 Yield() { __yield(); }
F64 GetTSC() { return __time_ms()*1000000.0; }

//==================== input ====================
I64 ScanChar() { return __scan_char(); }
I64 GetChar(I64 echo=TRUE, I64 do_scan=TRUE) { return __get_char(echo,do_scan); }
I64 KeyGet() { return __get_char(0,0); }
U0 PressAKey() { __get_char(0,1); }

//==================== console ====================
U0 Putc(I64 ch) { __putc(ch); }
U0 PutChars(I64 ch) { __putc(ch); }
U0 PutExcept() { "$FG,4$Exception$FG$\n"; }

//==================== sound ====================
F64 ona2freq_tab=0;
F64 Freq2Ona(F64 f) { return f; }
U0 Snd(I64 ona=0) {
  if (ona<=0) { __snd(0.0); return; }
  // TempleOS ona: freq = 2^((ona-1)/12) * base; we map with a simple scale.
  F64 f = 65.40639 * __pow(2.0, ona/12.0);
  __snd(f);
}
U0 Beep(I64 ona=0, I64 busy=0) { __snd(880.0); __sleep(60); __snd(0.0); }
U0 Note(F64 freq, F64 secs=0.2) { __play_note(freq, secs*1000.0); }
U0 MusicSettingsRst() {}
U0 SndTaskEndCB() { __snd(0.0); }

// Play(): minimal music-notation interpreter. Supports octave digits 1-9,
// note letters A-G (with optional # / b), durations w/h/q/e/s/t, '.' dotted,
// and space = rest. The 2nd "lyrics" arg is ignored (printed by caller normally).
I64 play_octave=4;
F64 play_whole_ms=1600.0;
F64 NoteFreq(I64 octave, I64 semitone) {
  // semitone: 0=C .. 11=B ; A4=440. MIDI number = (octave+1)*12 + semitone.
  I64 midi=(octave+1)*12+semitone;
  return 440.0*__pow(2.0,(midi-69)/12.0);
}
U0 Play(U8 *notes, U8 *lyrics=NULL) {
  I64 i=0;
  U8 c;
  F64 dur=play_whole_ms/4.0;
  while (notes[i]) {
    c=notes[i];
    if ('1'<=c<='9') { play_octave=c-'0'; i++; continue; }
    if (c=='w') { dur=play_whole_ms; i++; continue; }
    if (c=='h') { dur=play_whole_ms/2.0; i++; continue; }
    if (c=='q') { dur=play_whole_ms/4.0; i++; continue; }
    if (c=='e') { dur=play_whole_ms/8.0; i++; continue; }
    if (c=='s') { dur=play_whole_ms/16.0; i++; continue; }
    if (c=='t') { dur=play_whole_ms/32.0; i++; continue; }
    if (c==' ') { __sleep(dur); i++; continue; }
    I64 semi=-1;
    if (c=='C') semi=0;
    if (c=='D') semi=2;
    if (c=='E') semi=4;
    if (c=='F') semi=5;
    if (c=='G') semi=7;
    if (c=='A') semi=9;
    if (c=='B') semi=11;
    if (semi<0) { i++; continue; }
    i++;
    if (notes[i]=='#') { semi++; i++; }
    else if (notes[i]=='b') { semi--; i++; }
    __play_note(NoteFreq(play_octave,semi), dur);
  }
  __snd(0.0);
}

//==================== device-context / graphics ====================
CDC *DCAlias(CTask *t=NULL) {
  gr_dc_storage.color=WHITE;
  gr_dc_storage.thick=1;
  return &gr_dc_storage;
}
CDC *DCNew(I64 w=GR_WIDTH, I64 h=GR_HEIGHT) { return DCAlias(); }
U0 DCDel(CDC *dc=NULL) {}
U0 DCFill(CDC *dc=NULL, I64 color=BLACK) { __gr_fill(color); }

U0 GrPlot(CDC *dc, I64 x, I64 y) {
  I64 col=WHITE;
  if (dc) col=dc->color;
  __gr_plot(x,y,col&15);
}
U0 GrLine(CDC *dc, I64 x1, I64 y1, I64 x2, I64 y2, I64 thick=1) {
  I64 col=WHITE;
  if (dc) { col=dc->color; if (dc->thick>0) thick=dc->thick; }
  __gr_line(x1,y1,x2,y2,col&15,thick);
}
U0 GrRect(CDC *dc, I64 x, I64 y, I64 w, I64 h) {
  I64 col=WHITE;
  if (dc) col=dc->color;
  __gr_rect(x,y,w,h,col&15);
}
U0 GrBorder(CDC *dc, I64 x, I64 y, I64 w, I64 h) {
  I64 col=WHITE;
  if (dc) col=dc->color;
  __gr_line(x,y,x+w,y,col&15,1);
  __gr_line(x+w,y,x+w,y+h,col&15,1);
  __gr_line(x+w,y+h,x,y+h,col&15,1);
  __gr_line(x,y+h,x,y,col&15,1);
}
U0 GrCircle(CDC *dc, I64 x, I64 y, I64 r) {
  I64 col=WHITE;
  if (dc) col=dc->color;
  __gr_circle(x,y,r,col&15,1);
}
U0 GrPrint(CDC *dc, I64 x, I64 y, U8 *s) {
  I64 col=WHITE;
  if (dc) col=dc->color;
  __gr_text(x,y,col&15,s);
}
// Blit an 8-bit indexed sprite: one palette index (0..15) per pixel, 0xFF =
// transparent. Like TempleOS DCBlot, the source carries its own colors, so dc
// only matters for clipping (the framebuffer handles bounds). scale>1 upsizes
// with nearest-neighbor (chunky-pixel look).
U0 GrSprite(CDC *dc, I64 x, I64 y, U8 *image, I64 w, I64 h, I64 scale=1) {
  __gr_sprite(x,y,w,h,image,scale);
}
U0 GrFloodFill(CDC *dc, I64 x, I64 y) {}

//==================== misc no-ops demos sometimes call ====================
U0 Refresh() { __gr_flip(); }
U0 WinBorder(I64 on=1) {}
U0 DocClear() {}
U0 Free(U8 *p) { __free(p); }
U8 *MAlloc(I64 size) { return __malloc(size); }
U8 *CAlloc(I64 size) { U8 *p=__malloc(size); return p; }

//==================== runtime init (called by __rt_init) ====================
U0 __hcrt_init() {
  Fs = &fs_storage;
  Fs->pix_width = GR_WIDTH;
  Fs->pix_height = GR_HEIGHT;
  gr.dc = &gr_dc_storage;
  gr_dc_storage.color = WHITE;
  gr_dc_storage.thick = 1;
}

U0 MemSet(U8 *d, I64 b, I64 n) { I64 i; for (i=0;i<n;i++) d[i]=b; }
U0 MemCpy(U8 *d, U8 *s, I64 n) { I64 i; for (i=0;i<n;i++) d[i]=s[i]; }
I64 StrLen(U8 *s) { I64 n=0; while (s[n]) n++; return n; }
U0 StrCpy(U8 *d, U8 *s) { I64 i=0; while (s[i]) { d[i]=s[i]; i++; } d[i]=0; }
I64 StrCmp(U8 *a, U8 *b) {
  I64 i=0;
  while (a[i] && a[i]==b[i]) i++;
  return a[i]-b[i];
}
`;
