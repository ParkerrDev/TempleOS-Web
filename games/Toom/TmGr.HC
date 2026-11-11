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

Image *ImageNew(I64 width,I64 height)
{//Indexed pixels remain unscaled; palette conversion happens when drawing.
  Image *tmpi;
  if (!(0<width<=2048) || !(0<height<=2048)) return NULL;
  tmpi=CAlloc(sizeof(Image));
  tmpi->width=width; tmpi->height=height;
  tmpi->pix=MAlloc(width*height*sizeof(U16));
  MemSetU16(tmpi->pix,TM_TRANSPARENT,width*height);
  return tmpi;
}

U0 ImageDel(Image *tmpi)
{
  if (tmpi) {
    Free(tmpi->pix);
    Free(tmpi);
  }
}

Image *PatchNew(Wad *tmpw,I64 lump)
{//Decode one requested patch, rather than all sprites during startup.
  U8 *src;
  Image *tmpi=NULL;
  if (!(src=LumpRead(tmpw,lump))) return NULL;
  if (PatchChk(src,tmpw->dir[lump].size)) {
    tmpi=ImageNew(*src(U16 *),*(src+2)(U16 *));
    tmpi->left=*(src+4)(I16 *);
    tmpi->top=*(src+6)(I16 *);
    PatchBlot(tmpi,src,0,0);
  }
  Free(src);
  return tmpi;
}
