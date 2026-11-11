#define TM_SPRITE_CACHE_SIZE	0x400000
#define TM_SPRITE_FRAMES	32

class Sprites
{
  Wad *wad;
  GameData *data;
  I32 *frame;
  Image **image;
  I64 *stamp,clock,cache_size;
};

U0 SpritesDel(Sprites *tmps)
{
  I64 i;
  if (tmps) {
    if (tmps->image)
      for (i=0;i<tmps->wad->cnt;i++) ImageDel(tmps->image[i]);
    Free(tmps->frame);
    Free(tmps->image);
    Free(tmps->stamp);
    Free(tmps);
  }
}

Bool SpriteFrameAdd(Sprites *tmps,I64 sprite,I64 frame,I64 rotation,I64 code)
{//Rotation zero covers all views; negative lump codes reflect the image.
  I64 i,n;
  if (!(0<=frame<TM_SPRITE_FRAMES) || !(0<=rotation<=8)) return FALSE;
  n=(sprite*TM_SPRITE_FRAMES+frame)*8;
  if (!rotation)
    for (i=0;i<8;i++) tmps->frame[n+i]=code;
  else
    tmps->frame[n+rotation-1]=code;
  return TRUE;
}

Sprites *SpritesNew(Wad *tmpw,GameData *tmpd)
{//Index frame/rotation names once; decode an image only when it is drawn.
  I64 i,j,first=LumpFind(tmpw,"S_START"),last=LumpFind(tmpw,"S_END"),n;
  U8 *name;
  U32 *names=tmpd->sprite;
  Sprites *tmps=CAlloc(sizeof(Sprites));
  Bool valid=FALSE;
  try {
    tmps->wad=tmpw; tmps->data=tmpd;
    if (!(0<=first<last<tmpw->cnt)) goto sn_fail;
    n=TM_SPRITE_NUM*TM_SPRITE_FRAMES*8;
    tmps->frame=CAlloc(n*sizeof(I32));
    tmps->image=CAlloc(tmpw->cnt*sizeof(Image *));
    tmps->stamp=CAlloc(tmpw->cnt*sizeof(I64));
    for (i=first+1;i<last;i++) {
      name=tmpw->dir[i].name;
      j=0;
      while (j<TM_SPRITE_NUM && names[j]!=*name(U32 *)) j++;
      if (j<TM_SPRITE_NUM) {
	if (!SpriteFrameAdd(tmps,j,name[4]-'A',name[5]-'0',i+1))
	  goto sn_fail;
	if (name[6] && !SpriteFrameAdd(tmps,j,name[6]-'A',name[7]-'0',-i-1))
	  goto sn_fail;
      }
    }
    for (i=0;i<TM_SPRITE_NUM*TM_SPRITE_FRAMES;i++) {
      n=0;
      for (j=0;j<8;j++) if (tmps->frame[i*8+j]) n++;
      if (n && n!=8) goto sn_fail;
    }
    valid=TRUE;
sn_fail:;
  } catch {
    SpritesDel(tmps);
  }
  if (valid) return tmps;
  SpritesDel(tmps);
  return NULL;
}

Image *SpriteGet(Sprites *tmps,I64 code)
{//Bounded sprite cache, independent of which level first used a frame.
  I64 n=AbsI64(code)-1,i,j,width,height,size,old;
  U8 header[8],*ptr=header;
  Image *tmpi;
  if (!(0<=n<tmps->wad->cnt)) return NULL;
  tmps->stamp[n]=++tmps->clock;
  if (tmps->image[n]) return tmps->image[n];
  if (tmps->wad->dir[n].size<8 ||
	!WadRead(tmps->wad,header,tmps->wad->dir[n].offset,8))
    return NULL;
  width=*ptr(U16 *); height=*(ptr+2)(U16 *);
  size=width*height*sizeof(U16);
  if (size>TM_SPRITE_CACHE_SIZE) return NULL;
  while (tmps->cache_size+size>TM_SPRITE_CACHE_SIZE) {
    old=I64_MAX; j=-1;
    for (i=0;i<tmps->wad->cnt;i++)
      if (tmps->image[i] && tmps->stamp[i]<old) {
	j=i; old=tmps->stamp[i];
      }
    if (j<0) return NULL;
    tmpi=tmps->image[j];
    tmps->cache_size-=tmpi->width*tmpi->height*sizeof(U16);
    ImageDel(tmpi); tmps->image[j]=NULL;
  }
  if (!(tmpi=PatchNew(tmps->wad,n))) return NULL;
  tmps->image[n]=tmpi;
  tmps->cache_size+=size;
  return tmpi;
}

I64 SpriteFrame(Sprites *tmps,I64 sprite,I64 frame,I64 rotation)
{
  frame&=0x7FFF;
  if (!(0<=sprite<TM_SPRITE_NUM) || !(0<=frame<TM_SPRITE_FRAMES))
    return 0;
  return tmps->frame[(sprite*TM_SPRITE_FRAMES+frame)*8+rotation&7];
}

U0 SpriteDraw(View *tmpv,Sprites *tmps,Actor *tmpa)
{//A camera-facing patch keeps its origin, rotation, reflection and depth.
  I64 code,rotation,x,y,x1,x2,y1,y2,u,v,c,z,light,offset,us[TM_VIEW_WIDTH];
  F64 wx=tmpa->x/65536.0,wy=tmpa->y/65536.0,wz=tmpa->z/65536.0,
	dx=wx-tmpv->x,dy=wy-tmpv->y,d=dx*tmpv->cs+dy*tmpv->sn,
	r=dx*tmpv->sn-dy*tmpv->cs,a,sx,sy,scale,step;
  Image *tmpi;
  Sector *sector;
  U8 *color,*dst;
  U16 *src;
  I32 *depth;
  if (!tmpa->active || tmpa->flags&TM_MF_NOSECTOR || d<TM_VIEW_NEAR ||
	!(0<=tmpa->sector<tmpv->map->sector_cnt)) return;
  a=Arg(-dx,-dy)-tmpa->angle*6.283185307179586/4294967296.0;
  rotation=Floor((a+0.3926990816987241)/0.7853981633974483);
  code=SpriteFrame(tmps,tmpa->sprite,tmpa->frame,rotation);
  if (!(tmpi=SpriteGet(tmps,code))) return;
  scale=tmpv->fx/d;
  offset=tmpi->left;
  if (code<0) offset=tmpi->width-offset;
  sx=tmpv->cx+(r-offset)*scale;
  sy=tmpv->cy-(wz+tmpi->top-tmpv->z)*tmpv->fy/d;
  x1=MaxI64(Ceil(sx-0.5),0);
  x2=MinI64(Ceil(sx+tmpi->width*scale-0.5)-1,tmpv->width-1);
  y1=MaxI64(Ceil(sy-0.5),0);
  y2=MinI64(Ceil(sy+tmpi->height*tmpv->fy/d-0.5)-1,tmpv->height-1);
  if (x1>x2 || y1>y2) return;
  sector=tmpv->map->sector+tmpa->sector;
  y1=MaxI64(y1,Ceil(tmpv->cy-(sector->ceil/65536.0-tmpv->z)*tmpv->fy/d-0.5));
  y2=MinI64(y2,Ceil(tmpv->cy-(sector->floor/65536.0-tmpv->z)*tmpv->fy/d-0.5)-1);
  light=0;
  if (!(tmpa->frame&0x8000)) {
    light=4*(15-ClampI64(sector->light>>4,0,15));
    light=ViewLight(light,tmpv->fx*16/d);
  }
  color=tmpv->gr->colormap+light*256;
  z=Min(100000000.0/d,I32_MAX);
  step=d/tmpv->fy;
  for (x=x1;x<=x2;x++) {
    u=ClampI64(SampleFixed((x+0.5-sx)/scale)>>16,0,tmpi->width-1);
    if (code<0) u=tmpi->width-1-u;
    us[x]=u;
  }
  for (y=y1;y<=y2;y++) {
    v=ClampI64(SampleFixed((y+0.5-sy)*step)>>16,0,tmpi->height-1);
    src=tmpi->pix+v*tmpi->width;
    dst=tmpv->pix+y*tmpv->width;
    depth=tmpv->depth+y*tmpv->width;
    for (x=x1;x<=x2;x++)
      if (z>AbsI64(depth[x])) {
	c=src[us[x]];
	if (c!=TM_TRANSPARENT) {
	  dst[x]=color[c];
	  depth[x]=z;
	}
      }
  }
}
