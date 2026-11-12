Bool PatchChk(U8 *src,I64 size)
{//Check the column posts, including relative top deltas in tall patches.
  I64 x,y,n,prev,offset,width,height;
  U32 *cols;
  if (size<8) return FALSE;
  width=*src(U16 *); height=*(src+2)(U16 *);
  if (!(0<width<=2048) || !(0<height<=2048) || size<8+width*4)
    return FALSE;
  cols=src+8;
  for (x=0;x<width;x++) {
    offset=cols[x];
    prev=-1;
    if (offset<8+width*4) return FALSE;
    while (TRUE) {
      if (offset>=size) return FALSE;
      y=src[offset];
      if (y==255) break;
      if (offset>size-4) return FALSE;
      n=src[offset+1];
      if (y<=prev) y+=prev;
      prev=y;
      if (y+n>height || offset>size-4-n) return FALSE;
      offset+=n+4;
    }
  }
  return TRUE;
}

U0 PatchBlot(Image *tmpi,U8 *src,I64 x0,I64 y0)
{//A checked patch, clipped into an indexed image; 256 means transparent.
  I64 x,y,n,prev,offset,i,dx,dy,width=*src(U16 *);
  U32 *cols=src+8;
  U8 *p;
  for (x=0;x<width;x++) {
    dx=x0+x;
    if (0<=dx<tmpi->width) {
      offset=cols[x];
      prev=-1;
      while (src[offset]!=255) {
	y=src[offset];
	n=src[offset+1];
	if (y<=prev) y+=prev;
	prev=y;
	p=src+offset+3;
	for (i=0;i<n;i++) {
	  dy=y0+y+i;
	  if (0<=dy<tmpi->height)
	    tmpi->pix[dx+dy*tmpi->width]=p[i];
	}
	offset+=n+4;
      }
    }
  }
}

U0 ImageDel(Image *tmpi)
{
  if (tmpi) {
    Free(tmpi->pix);
    Free(tmpi);
  }
}

Image *ImageNew(I64 width,I64 height)
{//Indexed pixels remain unscaled; palette conversion happens when drawing.
  Image *tmpi;
  if (!(0<width<=2048) || !(0<height<=2048)) return NULL;
  tmpi=CAlloc(sizeof(Image));
  tmpi->width=width; tmpi->height=height;
  try {
    tmpi->pix=MAlloc(width*height*sizeof(U16));
    MemSetU16(tmpi->pix,TM_TRANSPARENT,width*height);
  } catch {
    ImageDel(tmpi);
  }
  return tmpi;
}

Image *PatchNew(Wad *tmpw,I64 lump)
{//Decode one requested patch, rather than all sprites during startup.
  U8 *src;
  Image *tmpi=NULL;
  if (!(src=LumpRead(tmpw,lump))) return NULL;
  try {
    if (PatchChk(src,tmpw->dir[lump].size)) {
      tmpi=ImageNew(*src(U16 *),*(src+2)(U16 *));
      tmpi->left=*(src+4)(I16 *);
      tmpi->top=*(src+6)(I16 *);
      PatchBlot(tmpi,src,0,0);
    }
  } catch {
    Free(src); ImageDel(tmpi);
  }
  Free(src);
  return tmpi;
}

U0 ImageDraw(U8 *pix,I64 width,I64 height,Image *tmpi,I64 x0,I64 y0,
	Bool flip=FALSE)
{//Patch origins and transparent posts retain their original screen placement.
  I64 x,y,x1,y1,x2,y2,c,step=1;
  U16 *src;
  U8 *dst;
  x0-=tmpi->left; y0-=tmpi->top;
  x1=MaxI64(x0,0); y1=MaxI64(y0,0);
  x2=MinI64(x0+tmpi->width,width); y2=MinI64(y0+tmpi->height,height);
  if (x1>=x2 || y1>=y2) return;
  if (flip) step=-1;
  for (y=y1;y<y2;y++) {
    src=tmpi->pix+(y-y0)*tmpi->width;
    if (flip) src+=tmpi->width-1-x1+x0;
    else src+=x1-x0;
    dst=pix+y*width+x1;
    for (x=x1;x<x2;x++) {
      c=*src; src+=step;
      if (c!=TM_TRANSPARENT) *dst=c;
      dst++;
    }
  }
}
