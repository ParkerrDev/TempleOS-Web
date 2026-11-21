#define KQ_W 160
#define KQ_H 168
#define KQ_PIXELS 26880

U8 kq_pic[KQ_PIXELS],kq_pri[KQ_PIXELS],kq_pixels[KQ_PIXELS];
U8 *kq_views[111],*kq_texts[85];
I64 kq_view_sizes[111],kq_text_sizes[85];
CDC *kq_frame;
I64 kq_fill[KQ_PIXELS];
Bool kq_scr_on,kq_pri_on;
I64 kq_color,kq_priority;

I64 KqWord(U8 *p)
{
  return p[0]+p[1]<<8;
}

U8 *KqResource(U8 *kind,I64 n,I64 *_size=NULL)
{
  U8 name[64];
  StrPrint(name,"Data/%s%03d.BIN",kind,n);
  return FileRead(name,_size);
}

U0 KqDot(I64 x,I64 y)
{
  I64 p;
  if (0<=x<KQ_W && 0<=y<KQ_H) {
    p=y*KQ_W+x;
    if (kq_scr_on) kq_pic[p]=kq_color;
    if (kq_pri_on) kq_pri[p]=kq_priority;
  }
}

U0 KqLine(I64 x,I64 y,I64 xx,I64 yy)
{//GAL rounds a half pixel toward the starting point.
  I64 i,n,m,d,dx=1,dy=1;
  x=MinI64(159,MaxI64(x,0));xx=MinI64(159,MaxI64(xx,0));
  y=MinI64(167,MaxI64(y,0));yy=MinI64(167,MaxI64(yy,0));
  n=MaxI64(xx-x,x-xx);m=MaxI64(yy-y,y-yy);
  if (xx<x) dx=-1;
  if (yy<y) dy=-1;
  KqDot(x,y);
  if (n>m) {
    for (i=1;i<=n;i++) {
      d=i*m/n;
      if (i*m%n*2>n) d++;
      KqDot(x+i*dx,y+d*dy);
    }
  } else
    for (i=1;i<=m;i++) {
      d=i*n/m;
      if (i*n%m*2>m) d++;
      KqDot(x+d*dx,y+i*dy);
    }
}

U0 KqAbsLine(I64 *x,I64 *y,I64 xx,I64 yy)
{//Absolute GAL lines use byte accumulators, unlike relative lines.
  I64 n,m,i,sx=1,sy=1,major,ex=0,ey;
  xx=MinI64(xx,159);yy=MinI64(yy,167);
  n=MaxI64(xx-*x,*x-xx);m=MaxI64(yy-*y,*y-yy);
  if (xx<*x) sx=-1;
  if (yy<*y) sy=-1;
  major=MaxI64(n,m);ey=n/2;
  if (n<m) {ex=m/2;ey=0;}
  for (i=0;i<MaxI64(1,major);i++) {
    ey=(ey+m)&255;
    if (ey>=major) {ey-=major;*y+=sy;}
    ex=(ex+n)&255;
    if (ex>=major) {ex-=major;*x+=sx;}
    KqDot(*x,*y);
  }
}

Bool KqBlank(I64 p)
{
  if (!(0<=p<KQ_PIXELS)) return FALSE;
  if (kq_scr_on) return kq_color!=15 && kq_pic[p]==15;
  return kq_priority!=1 && kq_pri[p]==1;
}

U0 KqFlood(I64 x,I64 y)
{
  I64 p,n=0,xx;
  if (!(0<=x<KQ_W && 0<=y<KQ_H)) return;
  p=y*KQ_W+x;
  if (!KqBlank(p)) return;
  kq_fill[n++]=p;KqDot(x,y);
  while (n) {
    p=kq_fill[--n];x=p%KQ_W;y=p/KQ_W;
    for (xx=-1;xx<=1;xx+=2)
      if (0<=x+xx<KQ_W && KqBlank(p+xx)) {
	KqDot(x+xx,y);kq_fill[n++]=p+xx;
      }
    for (xx=-KQ_W;xx<=KQ_W;xx+=2*KQ_W)
      if (KqBlank(p+xx)) {
	KqDot(x,(p+xx)/KQ_W);kq_fill[n++]=p+xx;
      }
  }
}

U0 KqPicture(I64 room)
{
  I64 size=0,i=0,op,mode,x,y,xx,yy,d;
  U8 *p=KqResource("PIC",room,&size);
  Bool old_scr,old_pri;
  MemSet(kq_pic,15,KQ_PIXELS);MemSet(kq_pri,1,KQ_PIXELS);
  kq_scr_on=TRUE;kq_pri_on=TRUE;kq_color=0;kq_priority=0;
  KqLine(0,0,159,0);KqLine(159,0,159,167);
  KqLine(159,167,0,167);KqLine(0,167,0,0);
  kq_scr_on=FALSE;kq_pri_on=TRUE;kq_color=15;kq_priority=1;
  if (!p) return;
  while (i<size) {
    op=p[i++];
    if (op==255) break;
    switch (op) {
      case 240:
	kq_scr_on=!kq_scr_on;kq_pri_on=!kq_pri_on;
	break;
      case 241:
	kq_color=p[i++];break;
      case 242:
	kq_priority=p[i++];break;
      case 243:
	kq_color=p[i++];kq_priority=p[i++];break;
      case 244...251:
	old_scr=kq_scr_on;old_pri=kq_pri_on;
	if (op<248) {kq_scr_on=TRUE;kq_pri_on=TRUE;}
	mode=op&3;x=p[i++];y=p[i++];KqDot(x,y);
	while (i<size && p[i]<240) {
	  xx=x;yy=y;
	  switch (mode) {
	    case 0:
	      yy=p[i++];mode=1;break;
	    case 1:
	      xx=p[i++];mode=0;break;
	    case 2:
	      xx=p[i++];yy=p[i++];break;
	    case 3:
	      d=p[i++];xx+=d>>4&7;yy+=d&7;
	      if (d&128) xx-=2*(d>>4&7);
	      if (d&8) yy-=2*(d&7);
	      break;
	  }
	  if (mode==2) KqAbsLine(&x,&y,xx,yy);
	  else {KqLine(x,y,xx,yy);x=xx;y=yy;}
	}
	kq_scr_on=old_scr;kq_pri_on=old_pri;
	break;
      case 252...254:
	old_scr=kq_scr_on;old_pri=kq_pri_on;
	kq_scr_on=op!=253;kq_pri_on=op!=254;
	if (kq_scr_on) kq_color=p[i++];
	if (kq_pri_on) kq_priority=p[i++];
	while (i<size && p[i]<240) {
	  x=p[i++];y=p[i++];KqFlood(x,y);
	}
	kq_scr_on=old_scr;kq_pri_on=old_pri;
	break;
    }
  }
  Free(p);
}

U8 *KqView(I64 view)
{
  if (!(0<=view<111)) return NULL;
  if (!kq_views[view])
    kq_views[view]=KqResource("VIEW",view,&kq_view_sizes[view]);
  return kq_views[view];
}

U8 *KqLoop(I64 view,I64 loop)
{
  U8 *v=KqView(view),*p;
  I64 i;
  if (!v) return NULL;
  v+=2;
  if (v[0]==255) return NULL;
  if (!(0<=loop<v[0])) loop=0;
  p=v+17;
  for (i=0;i<loop;i++) p+=KqWord(v+1+i*2);
  return p;
}

U8 *KqCel(I64 view,I64 loop,I64 cel)
{
  U8 *p=KqLoop(view,loop),*q;
  I64 i;
  if (!p) return NULL;
  if (!(0<=cel<p[3])) cel=0;
  q=p+4+p[3]*2;
  for (i=0;i<cel;i++) q+=KqWord(p+4+i*2);
  return q;
}

I64 KqNibble(U8 *p,I64 n)
{
  if (n&1) return p[n>>1]&15;
  return p[n>>1]>>4;
}

I64 KqSprite(I64 view,I64 loop,I64 cel,I64 x,I64 y,I64 pri,Bool burn=FALSE)
{
  U8 *p=KqCel(view,loop,cel);
  I64 row=0,xx=0,i=0,n,col,at,yy,j,limit,painted=0;
  if (!p) return 0;
  limit=kq_view_sizes[view]*2;
  y-=p[0]-1;
  while (row<p[0] && i<limit) {
    n=KqNibble(p+2,i++);
    if (n==8) {row++;xx=0;}
    else if (n>8) xx+=n&7;
    else {
      col=KqNibble(p+2,i++);
      for (j=0;j<n;j++,xx++) {
	if (0<=x+xx<KQ_W && 0<=y+row<KQ_H) {
	  at=(y+row)*KQ_W+x+xx;yy=y+row;
	  while (yy<167 && kq_pri[yy*KQ_W+x+xx]==15) yy++;
	  if (kq_pri[yy*KQ_W+x+xx]<=pri) {
	    kq_pixels[at]=col;painted++;
	    if (burn && kq_pri[at]!=15) kq_pri[at]=pri;
	  }
	}
      }
    }
  }
  return painted;
}

U0 KqScale()
{
  I64 x,y;
  U32 *dst;
  U8 *src;
  for (y=0;y<KQ_H;y++) {
    src=kq_pixels+y*KQ_W;
    dst=kq_frame->body+y*1280;
    for (x=0;x<KQ_W;x++) *dst++=src[x]*0x01010101;
    MemCpy(dst,dst(U8 *)-640,640);
  }
}
