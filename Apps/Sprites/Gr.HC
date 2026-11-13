U8 *sprite_gr_error=NULL;

public U8 *SpriteGrError()
{
  return sprite_gr_error;
}

public I64 SpriteGrMax()
{
  return offset(CDC.end)+640*480;
}

I64 SpriteGrStride(I64 width,I64 height)
{
  if (!(1<=width<=640) || !(1<=height<=480)) {
    sprite_gr_error="Sprite dimensions must be 1 to 640 by 1 to 480.";
    return 0;
  }
  return (width+7)&~7;
}

public U8 *SpriteGrWrite(U8 *src,I64 cnt,I64 width,I64 height,I64 *_size)
{//The uncompressed standard-palette DCSave representation.
  I64 stride,i,y,size;
  U8 *res,*body;
  CDC *header;
  sprite_gr_error=NULL;
  stride=SpriteGrStride(width,height);
  if (!stride) return NULL;
  if (!src || cnt!=width*height) {
    sprite_gr_error="Invalid indexed frame length.";
    return NULL;
  }
  for (i=0;i<cnt;i++)
    if (src[i]>15 && src[i]!=TRANSPARENT) {
      sprite_gr_error="Invalid TempleOS palette index.";
      return NULL;
    }
  size=offset(CDC.end)+stride*height;
  res=CAlloc(size);
  header=res;
  header->width=width;header->width_internal=stride;header->height=height;
  body=res+offset(CDC.end);
  MemSet(body,TRANSPARENT,stride*height);
  for (y=0;y<height;y++) MemCpy(body+y*stride,src+y*width,width);
  *_size=size;
  return res;
}

public U8 *SpriteGrRead(U8 *src,I64 size,I64 *_width,I64 *_height)
{//Bounds-check the saved CDC before reading any bitmap bytes.
  CDC *header=src;
  I64 width,height,stride,x,y;
  U8 *res,*body;
  sprite_gr_error=NULL;
  if (!src || size<offset(CDC.end)) {
    sprite_gr_error="Truncated GR header.";
    return NULL;
  }
  width=header->width;height=header->height;
  stride=SpriteGrStride(width,height);
  if (!stride) return NULL;
  if (header->width_internal!=stride || header->flags) {
    sprite_gr_error=
      "Only uncompressed GR with the standard palette is supported.";
    return NULL;
  }
  if (size!=offset(CDC.end)+stride*height) {
    sprite_gr_error="Invalid GR body length.";
    return NULL;
  }
  body=src+offset(CDC.end);
  for (y=0;y<height;y++)
    for (x=0;x<width;x++)
      if (body[y*stride+x]>15 && body[y*stride+x]!=TRANSPARENT) {
	sprite_gr_error="Invalid TempleOS palette index.";
	return NULL;
      }
  res=MAlloc(width*height);
  for (y=0;y<height;y++) MemCpy(res+y*width,body+y*stride,width);
  *_width=width;*_height=height;
  return res;
}
