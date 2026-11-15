#define ATTRF_BLINK	0x10000000
#define ATTRF_INVERT	0x20000000
#define CTRLF_CLICKED	16

//CCtrl's drawing fields; the browser owns input and task windows.
class CCtrl
{
  I64 flags,left,right,top,bottom;
  U8 *state;
};

CDC *win_dc=NULL;
U32 *win_text=NULL;
I64 win_cols,win_rows;
U8 win_title[256];

Bool TextChar(CTask *,Bool=FALSE,I64 x,I64 y,I64 d)
{//Adapt the text layer to one independent window bitmap.
  if (!(0<=x<win_cols && 0<=y<win_rows))
    return FALSE;
  win_text[y*win_cols+x]=d;
  return TRUE;
}

public U0 TextBorder(CTask *task=NULL,
	I64 l,I64 r,I64 t,I64 b,I64 attr,Bool solid)
{//V5.03 Adam/Gr/GrTextBase.HC drawing body.
  I64 i;
  if (!task) task=Fs;
  attr<<=8;
  TextChar(task,,l-1,t-1,text.border_chars[6+solid]+attr);
  TextChar(task,,r+1,t-1,text.border_chars[8+solid]+attr);
  TextChar(task,,l-1,b+1,text.border_chars[10+solid]+attr);
  TextChar(task,,r+1,b+1,text.border_chars[12+solid]+attr);
  for (i=l;i<=r;i++) {
    TextChar(task,,i,t-1,text.border_chars[2+solid]+attr);
    TextChar(task,,i,b+1,text.border_chars[2+solid]+attr);
  }
  for (i=t;i<=b;i++) {
    TextChar(task,,l-1,i,text.border_chars[4+solid]+attr);
    TextChar(task,,r+1,i,text.border_chars[4+solid]+attr);
  }
}

U0 DrawWinScroll(CDC *dc,CCtrl *c)
{//V5.03 Adam/Ctrls/CtrlsA.HC drawing body.
  CWinScroll *s=c->state;
  if (c->flags&CTRLF_CLICKED)
    dc->color=s->color>>4;
  else
    dc->color=s->color&0xF;
  GrRect(dc,c->left,c->top,c->right-c->left+1,c->bottom-c->top+1);
  if (c->flags&CTRLF_CLICKED)
    dc->color=s->color&0xF;
  else
    dc->color=s->color>>4;
  GrRect(dc,c->left+2,c->top+2,c->right-c->left+1-4,c->bottom-c->top+1-4);
}

U0 WinBorderDoc(I64 mS,Bool close)
{//DocBorderNew's title, [X], MENU; DocRecalc's SCX=15 calculation.
//No editor status fields or native task address for a browser window.
  I64 i,j,k,cnt=MaxI64(0,MinI64(15,win_cols-10)),
	x=(win_cols-2-cnt)>>1+1,attr=0xF100,
	i_jif,shift;
  U8 st[260],*ptr;
  StrCpy(st,win_title);
  StrCpy(st+StrLen(st),"...");
  j=StrLen(st);
  i_jif=mS*64/1000%(j*FONT_WIDTH);
  shift=(FONT_WIDTH-1-i_jif)&(FONT_WIDTH-1);
  i_jif>>=3;
  for (k=0;k<cnt;k++)
    TextChar(Fs,TRUE,x+k,0,
	  attr|ATTRF_INVERT|shift<<16|st[(i_jif+k)%j]);
  if (close) {
    if (win_dc->width&7)
      TextChar(Fs,TRUE,win_cols-5,0,attr+CH_SPACE);
    ptr="[X]";
    for (i=0;i<3;i++)
      TextChar(Fs,TRUE,win_cols-4+i,0,attr|ptr[i]|
	    (win_dc->width-win_cols*8&31)<<16);
  }
  ptr="MENU";
  for (i=0;i<4;i++)
    TextChar(Fs,TRUE,1+i,0,attr|ATTRF_BLINK|ptr[i]);
  for (i=0;i<8 && win_title[i] && win_title[i]!=' ' && i<win_rows-2;i++)
    TextChar(Fs,TRUE,0,i+1,attr+win_title[i]);
}

U0 WinTextDraw(I64 mS)
{//GrUpdateTextBG/FG's two passes, using the runtime's native GrPutChar.
  I64 pass,x,y,px,py,ch,attr,shift,
	width=win_dc->width,height=win_dc->height;
  for (pass=0;pass<2;pass++)
    for (y=0;y<win_rows;y++)
      for (x=0;x<win_cols;x++)
	if (ch=win_text[y*win_cols+x]) {
	  attr=ch>>8&0xFF;
	  if (ch&ATTRF_INVERT)
	    attr=(attr<<4+attr>>4)&0xFF;
	  if (ch&ATTRF_BLINK && mS/200&1)
	    attr=(attr<<4+attr>>4)&0xFF;
	  px=MinI64(x*8,width-8);
	  py=MinI64(y*8,height-8);
	  if (x<win_cols-1) win_dc->width=width-8;
	  if (y<win_rows-1) win_dc->height=height-8;
	  if (!pass) {
	    win_dc->color=attr>>4;
	    GrRect(win_dc,px,py,8,8);
	  } else {
	    win_dc->color=attr&15;
	    shift=ch>>16&31;
	    if (shift&16) shift|=~31;
	    GrPutChar(win_dc,px+shift,py,ch&255);
	  }
	  win_dc->width=width;
	  win_dc->height=height;
	}
}

public U8 *WinDrawTitle()
{//A 255-byte title, terminated by zero.
  return win_title;
}

public I64 WinDrawStride()
{//Bytes per row of the returned indexed bitmap.
  return win_dc->width_internal;
}

public U8 *WinDraw(I64 width,I64 height,Bool solid,I64 mS,
	I64 scroll_x,I64 scroll_y,I64 held,Bool close=TRUE)
{//One window, transparent interior, 8x8 font and standard VGA colors.
//Scroll positions are millionths. Partial edge cells are clipped to fit.
  CCtrl c;
  CWinScroll s;
  if (!(24<=width<=4096 && 24<=height<=4096))
    return NULL;
  if (!win_dc || win_dc->width!=width || win_dc->height!=height) {
    DCDel(win_dc);
    Free(win_text);
    win_dc=DCNew(width,height);
    win_cols=(width+7)/8;
    win_rows=(height+7)/8;
    win_text=CAlloc(win_cols*win_rows*sizeof(U32));
  }
  DCFill(win_dc);
  MemSet(win_text,0,win_cols*win_rows*sizeof(U32));
  text.border_chars[2](I64)=0x0908070605040302;
  text.border_chars[10](U32)=0x0D0C0B0A;
  TextBorder(Fs,1,win_cols-2,1,win_rows-2,0xF1,solid);
  WinBorderDoc(mS,close);
  WinTextDraw(mS);
  s.color=0x1E;
  c.state=&s;
  c.left=4+ClampI64(scroll_x,0,1000000)*(width-16)/1000000;
  c.top=height-8;
  c.right=c.left+7;
  c.bottom=c.top+7;
  c.flags=0;
  if (held&1) c.flags=CTRLF_CLICKED;
  DrawWinScroll(win_dc,&c);
  c.left=width-8;
  c.top=4+ClampI64(scroll_y,0,1000000)*(height-16)/1000000;
  c.right=c.left+7;
  c.bottom=c.top+7;
  c.flags=0;
  if (held&2) c.flags=CTRLF_CLICKED;
  DrawWinScroll(win_dc,&c);
  return win_dc->body;
}
