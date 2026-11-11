#define TM_VIEW_WIDTH	320
#define TM_VIEW_HEIGHT	168
#define TM_VIEW_NEAR	1.0

class FlatRef
{
  I64 name,lump;
};

class View
{
  Surfaces *surfaces;
  FlatRef *floor,*ceil;
  Map *map;
  Seg **masked;
  I64 masked_cnt;
  Graphics *gr;
  F64 x,y,z,angle,cs,sn,fx,fy,cx,cy;
  I64 width,height,*stack,sky;
  I16 *top,*bottom;
  U16 *plane;
  I32 *depth;
  U8 *pix,**flat;
};

U0 ViewDel(View *tmpv)
{
  I64 i;
  if (tmpv) {
    if (tmpv->flat)
      for (i=0;i<tmpv->gr->wad->cnt;i++) Free(tmpv->flat[i]);
    Free(tmpv->flat);
    Free(tmpv->masked);
    Free(tmpv->floor);
    Free(tmpv->ceil);
    Free(tmpv->stack);
    Free(tmpv->top);
    Free(tmpv->bottom);
    Free(tmpv->plane);
    Free(tmpv->depth);
    Free(tmpv->pix);
    Free(tmpv);
  }
}

I64 ViewFlatFind(Graphics *tmpg,I64 name)
{
  U8 text[9];
  I64 n;
  text(I64)=name; text[8]=0;
  if (!StrCmp(text,"F_SKY1")) return -1;
  n=LumpFind(tmpg->wad,text);
  if (n<0 || tmpg->wad->dir[n].size!=4096) return -2;
  return n;
}

Bool ViewFlatsSync(View *tmpv)
{//Movers can change flat names and sky flags after the view is created.
  I64 i,j,key,n;
  FlatRef *ref;
  Sector *sector;
  for (i=0;i<tmpv->map->sector_cnt;i++) {
    sector=tmpv->map->sector+i;
    for (j=0;j<2;j++) {
      if (j) {ref=tmpv->ceil+i; key=sector->ceil_name(I64);}
      else {ref=tmpv->floor+i; key=sector->floor_name(I64);}
      if (key!=ref->name) {
	n=ViewFlatFind(tmpv->gr,key);
	if (n< -1) return FALSE;
	ref->name=key; ref->lump=n;
      }
    }
  }
  return TRUE;
}

View *ViewNew(Map *tmpm,Graphics *tmpg,Surfaces *surfaces=NULL)
{//A small indexed view and screen-space clipping, not a world-space grid.
  I64 i,n,w=TM_VIEW_WIDTH,h=TM_VIEW_HEIGHT;
  U8 name[9];
  View *tmpv=CAlloc(sizeof(View));
  Bool valid=FALSE;
  try {
    tmpv->map=tmpm; tmpv->gr=tmpg; tmpv->surfaces=surfaces;
    if (surfaces && (surfaces->map!=tmpm || surfaces->graphics!=tmpg))
      goto vn_fail;
    tmpv->masked=MAlloc(tmpm->seg_cnt*sizeof(Seg *));
    if (tmpm->sector_cnt>32767) goto vn_fail;
    tmpv->width=w; tmpv->height=h;
    tmpv->fx=w/2.0; tmpv->fy=w/2.0;
    tmpv->cx=w/2.0; tmpv->cy=h/2.0;
    tmpv->top=MAlloc(w*sizeof(I16));
    tmpv->bottom=MAlloc(w*sizeof(I16));
    tmpv->plane=MAlloc(w*h*sizeof(U16));
    tmpv->depth=MAlloc(w*h*sizeof(I32));
    tmpv->pix=MAlloc(w*h);
    tmpv->stack=MAlloc((tmpm->node_cnt+2)*sizeof(I64));
    tmpv->floor=MAlloc(tmpm->sector_cnt*sizeof(FlatRef));
    tmpv->ceil=MAlloc(tmpm->sector_cnt*sizeof(FlatRef));
    tmpv->flat=CAlloc(tmpg->wad->cnt*sizeof(U8 *));
    for (i=0;i<tmpm->sector_cnt;i++) {
      tmpv->floor[i].name=tmpm->sector[i].floor_name(I64);
      tmpv->ceil[i].name=tmpm->sector[i].ceil_name(I64);
      n=ViewFlatFind(tmpg,tmpv->floor[i].name);
      if (n< -1) goto vn_fail;
      tmpv->floor[i].lump=n;
      n=ViewFlatFind(tmpg,tmpv->ceil[i].name);
      if (n< -1) goto vn_fail;
      tmpv->ceil[i].lump=n;
    }
    MemSet(name,0,sizeof(name));
    StrCpy(name,"SKY1");
    n=tmpg->wad->dir[tmpm->lump].name[1];
    if ('1'<=n<='4') name[3]=n;
    tmpv->sky=TextureFind(tmpg,name);
    if (tmpv->sky<0) goto vn_fail;
    valid=TRUE;
vn_fail:;
  } catch {
    ViewDel(tmpv);
  }
  if (valid) return tmpv;
  ViewDel(tmpv);
  return NULL;
}

U8 *ViewFlat(View *tmpv,I64 n)
{
  if (tmpv->surfaces) n=FlatFrame(tmpv->surfaces,n);
  if (!(0<=n<tmpv->gr->wad->cnt)) return NULL;
  if (tmpv->gr->wad->dir[n].size!=4096) return NULL;
  if (!tmpv->flat[n]) tmpv->flat[n]=LumpRead(tmpv->gr->wad,n);
  return tmpv->flat[n];
}

I64 SampleFixed(F64 value)
{//Nearest Q16 sample value, with even ties, before integer selection.
  return Round(value*65536.0);
}

I64 ViewLight(I64 base_light,F64 scale)
{//Lighting buckets use the same fixed precision as texture sampling.
  return ClampI64(base_light-MinI64(SampleFixed(scale)>>16,47)/2,0,31);
}

U0 ViewSky(View *tmpv)
{
  I64 x,y,u,v,c,row[TM_VIEW_HEIGHT];
  F64 a;
  Image *tmpi=TextureGet(tmpv->gr,tmpv->sky);
  MemSet(tmpv->pix,0,tmpv->width*tmpv->height);
  if (!tmpi) return;
  for (y=0;y<tmpv->height;y++) {
    v=SampleFixed(tmpi->height/2+
	  (y+0.5-tmpv->cy)*tmpi->height/tmpv->fy)>>16;
    row[y]=ClampI64(v,0,tmpi->height-1)*tmpi->width;
  }
  for (x=0;x<tmpv->width;x++) {
    a=tmpv->angle-ATan((x+0.5-tmpv->cx)/tmpv->fx);
    u=SampleFixed(a*tmpi->width/6.283185307179586)>>16;
    u%=tmpi->width; if (u<0) u+=tmpi->width;
    for (y=0;y<tmpv->height;y++) {
      c=tmpi->pix[u+row[y]];
      if (c!=TM_TRANSPARENT) tmpv->pix[x+y*tmpv->width]=c;
    }
  }
}

U0 PlaneMark(View *tmpv,I64 x,I64 ya,I64 yb,I64 n)
{
  I64 y;
  ya=MaxI64(ya,tmpv->top[x]); yb=MinI64(yb,tmpv->bottom[x]);
  for (y=ya;y<=yb;y++) tmpv->plane[x+y*tmpv->width]=n;
}

U0 SkyColumn(View *tmpv,I64 x,I64 ya,I64 yb,F64 iz)
{//A negative depth hides distant objects while keeping the sky color.
  I64 y,z=-Min(100000000.0*iz,I32_MAX);
  ya=MaxI64(ya,tmpv->top[x]); yb=MinI64(yb,tmpv->bottom[x]);
  for (y=ya;y<=yb;y++) tmpv->depth[x+y*tmpv->width]=z;
}

U0 ViewPlanes(View *tmpv)
{//Equal-height plane runs are perspective-correct horizontal texture spans.
  I64 x,y,x1,n,s,flat,light,z,xx,yy,dx,dy,j,u,v;
  F64 height,d,t,wx,wy;
  U8 *src,*color=tmpv->gr->colormap;
  Sector *tmps;
  for (y=0;y<tmpv->height;y++) {
    x=0;
    while (x<tmpv->width) {
      n=tmpv->plane[x+y*tmpv->width];
      x1=x++;
      while (x<tmpv->width && tmpv->plane[x+y*tmpv->width]==n) x++;
      if (n) {
	s=(n-1)/2;
	tmps=tmpv->map->sector+s;
	if ((n-1)&1) {
	  flat=tmpv->ceil[s].lump; height=tmps->ceil/65536.0;
	} else {
	  flat=tmpv->floor[s].lump; height=tmps->floor/65536.0;
	}
	if (src=ViewFlat(tmpv,flat)) {
	  d=(tmpv->z-height)*tmpv->fy/(y+0.5-tmpv->cy);
	  if (d>0) {
	    t=(x1+0.5-tmpv->cx)/tmpv->fx;
	    wx=tmpv->x+d*(tmpv->cs+tmpv->sn*t);
	    wy=tmpv->y+d*(tmpv->sn-tmpv->cs*t);
	    xx=SampleFixed(wx); yy=SampleFixed(wy);
	    dx=SampleFixed(d*tmpv->sn/tmpv->fx);
	    dy=SampleFixed(-d*tmpv->cs/tmpv->fx);
	    z=Min(100000000.0/d,I32_MAX);
	    light=4*(15-ClampI64(tmps->light>>4,0,15));
	    light=ClampI64(light-80/
		  (MinI64(SampleFixed(d/16)>>16,127)+1),0,31)*256;
	    for (j=x1;j<x;j++) {
	      u=xx>>16&63; v=-(yy>>16)&63;
	      tmpv->pix[j+y*tmpv->width]=color[light+src[u+v*64]];
	      tmpv->depth[j+y*tmpv->width]=z;
	      xx+=dx; yy+=dy;
	    }
	  }
	}
      }
    }
  }
}

U0 WallColumn(View *tmpv,Image *tmpi,I64 x,I64 ya,I64 yb,
	F64 u,F64 d,F64 origin,I64 light)
{
  I64 y,tx,ty,c,v,step,z;
  U8 *color=tmpv->gr->colormap+light*256;
  ya=MaxI64(ya,tmpv->top[x]); yb=MinI64(yb,tmpv->bottom[x]);
  if (ya>yb) return;
  z=Min(100000000.0/d,I32_MAX);
  if (tmpi) {
    tx=SampleFixed(u)>>16; tx%=tmpi->width;
    if (tx<0) tx+=tmpi->width;
    v=SampleFixed(origin-tmpv->z+(ya+0.5-tmpv->cy)*d/tmpv->fy);
    step=SampleFixed(d/tmpv->fy);
  }
  for (y=ya;y<=yb;y++) {
    c=0;
    if (tmpi) {
      ty=v>>16; ty%=tmpi->height;
      if (ty<0) ty+=tmpi->height;
      c=tmpi->pix[tx+ty*tmpi->width];
      if (c==TM_TRANSPARENT) c=0;
      v+=step;
    }
    tmpv->pix[x+y*tmpv->width]=color[c];
    tmpv->depth[x+y*tmpv->width]=z;
  }
}

I64 ViewRow(View *tmpv,F64 height,F64 iz)
{//Height is (z-view_z)*fy, invariant across this wall.
//An exact pixel-center tie belongs to the lower row, despite roundoff.
  return Ceil(tmpv->cy-height*iz-0.500000001);
}

class WallView
{
  F64 iz,iu,dz,du;
  I64 x1,x2;
};

Bool WallProject(View *tmpv,Seg *tmps,WallView *_out)
{//Near-clipped wall endpoints share one perspective setup for both passes.
  I64 x1,x2;
  F64 ax,ay,bx,by,az,bz,ar,br,u1,u2,t,len,sx1,sx2,dz,du;
  Map *tmpm=tmpv->map;
  Line *tmpl=tmpm->line+tmps->line;
  Side *side=tmpm->side+tmpl->side[tmps->side];
  ax=tmpm->vertex[tmps->v1].x-tmpv->x;
  ay=tmpm->vertex[tmps->v1].y-tmpv->y;
  bx=tmpm->vertex[tmps->v2].x-tmpv->x;
  by=tmpm->vertex[tmps->v2].y-tmpv->y;
  az=ax*tmpv->cs+ay*tmpv->sn;
  bz=bx*tmpv->cs+by*tmpv->sn;
  if (az<TM_VIEW_NEAR && bz<TM_VIEW_NEAR) return FALSE;
  ar=ax*tmpv->sn-ay*tmpv->cs;
  br=bx*tmpv->sn-by*tmpv->cs;
  len=Sqrt((bx-ax)*(bx-ax)+(by-ay)*(by-ay));
  u1=side->x+tmps->offset; u2=u1+len;
  if (az<TM_VIEW_NEAR) {
    t=(TM_VIEW_NEAR-az)/(bz-az);
    ar+=t*(br-ar); u1+=t*(u2-u1); az=TM_VIEW_NEAR;
  } else if (bz<TM_VIEW_NEAR) {
    t=(TM_VIEW_NEAR-bz)/(az-bz);
    br+=t*(ar-br); u2+=t*(u1-u2); bz=TM_VIEW_NEAR;
  }
  sx1=tmpv->cx+ar*tmpv->fx/az;
  sx2=tmpv->cx+br*tmpv->fx/bz;
  if (sx1>=sx2) return FALSE;
  x1=MaxI64(Ceil(sx1-0.5),0);
  x2=MinI64(Ceil(sx2-0.5)-1,tmpv->width-1);
  if (x1>x2) return FALSE;
  dz=(1.0/bz-1.0/az)/(sx2-sx1);
  du=(u2/bz-u1/az)/(sx2-sx1);
  t=x1+0.5-sx1;
  _out->iz=1.0/az+dz*t; _out->iu=u1/az+du*t;
  _out->dz=dz; _out->du=du;
  _out->x1=x1; _out->x2=x2;
  return TRUE;
}

U0 ViewSeg(View *tmpv,Seg *tmps)
{//Front-to-back opaque walls clip portals and mark visible plane spans.
  I64 i,x,x1,x2,front,back,top,bottom,up,down,light,base_light,
	mid_n=-1,upper_n=-1,lower_n=-1;
  F64 iz,iu,dz,du,d,u,origin,front_floor,front_ceil,back_floor,back_ceil,
	front_yfloor,front_yceil,back_yfloor,back_yceil;
  Bool seen=FALSE;
  WallView wall;
  Map *tmpm=tmpv->map;
  Line *tmpl=tmpm->line+tmps->line;
  Side *side=tmpm->side+tmpl->side[tmps->side];
  Sector *sf,*sb=NULL;
  Image *mid=NULL,*upper=NULL,*lower=NULL;
  if (!WallProject(tmpv,tmps,&wall)) return;
  iz=wall.iz; iu=wall.iu; dz=wall.dz; du=wall.du;
  x1=wall.x1; x2=wall.x2;
  front=side->sector;
  sf=tmpm->sector+front;
  front_floor=sf->floor/65536.0; front_ceil=sf->ceil/65536.0;
  front_yfloor=(front_floor-tmpv->z)*tmpv->fy;
  front_yceil=(front_ceil-tmpv->z)*tmpv->fy;
  back=-1;
  i=tmpl->side[1-tmps->side];
  if (i!=0xFFFF && tmpl->flags&4) {
    back=tmpm->side[i].sector;
    sb=tmpm->sector+back;
    back_floor=sb->floor/65536.0; back_ceil=sb->ceil/65536.0;
    back_yfloor=(back_floor-tmpv->z)*tmpv->fy;
    back_yceil=(back_ceil-tmpv->z)*tmpv->fy;
  }
  if (!sb) {
    mid_n=TextureFind(tmpv->gr,side->middle);
    if (tmpv->surfaces) mid_n=TextureFrame(tmpv->surfaces,mid_n);
    mid=TextureHold(tmpv->gr,mid_n);
  } else {
    if (sb->ceil<sf->ceil &&
	  !(tmpv->ceil[front].lump<0 && tmpv->ceil[back].lump<0)) {
      upper_n=TextureFind(tmpv->gr,side->upper);
      if (tmpv->surfaces) upper_n=TextureFrame(tmpv->surfaces,upper_n);
      upper=TextureHold(tmpv->gr,upper_n);
    }
    if (sb->floor>sf->floor) {
      lower_n=TextureFind(tmpv->gr,side->lower);
      if (tmpv->surfaces) lower_n=TextureFrame(tmpv->surfaces,lower_n);
      lower=TextureHold(tmpv->gr,lower_n);
    }
  }
  base_light=sf->light>>4;
  if (tmpm->vertex[tmps->v1].y==tmpm->vertex[tmps->v2].y) base_light--;
  else if (tmpm->vertex[tmps->v1].x==tmpm->vertex[tmps->v2].x) base_light++;
  base_light=4*(15-ClampI64(base_light,0,15));
  for (x=x1;x<=x2;x++,iz+=dz,iu+=du)
    if (tmpv->top[x]<=tmpv->bottom[x]) {
      seen=TRUE;
      d=1.0/iz; u=iu*d;
      light=ViewLight(base_light,tmpv->fx*16*iz);
      top=ViewRow(tmpv,front_yceil,iz);
      bottom=ViewRow(tmpv,front_yfloor,iz)-1;
      if (sb) {
	up=ViewRow(tmpv,back_yceil,iz);
	down=ViewRow(tmpv,back_yfloor,iz)-1;
	if (tmpv->ceil[front].lump<0 && tmpv->ceil[back].lump<0) top=up;
      }
      if (tmpv->ceil[front].lump>=0)
	PlaneMark(tmpv,x,tmpv->top[x],top-1,front*2+2);
      else
	SkyColumn(tmpv,x,tmpv->top[x],top-1,iz);
      if (tmpv->floor[front].lump>=0)
	PlaneMark(tmpv,x,bottom+1,tmpv->bottom[x],front*2+1);
      else
	SkyColumn(tmpv,x,bottom+1,tmpv->bottom[x],iz);
      if (!sb) {
	origin=front_ceil+side->y;
	if (mid && tmpl->flags&16) origin=front_floor+mid->height+side->y;
	WallColumn(tmpv,mid,x,top,bottom,u,d,origin,light);
	tmpv->top[x]=tmpv->height;
	tmpv->bottom[x]=-1;
      } else {
	if (up>top) {
	  origin=front_ceil+side->y;
	  if (upper && !(tmpl->flags&8)) origin=back_ceil+upper->height+side->y;
	  WallColumn(tmpv,upper,x,top,up-1,u,d,origin,light);
	}
	if (down<bottom) {
	  origin=back_floor+side->y;
	  if (tmpl->flags&16) origin=front_ceil+side->y;
	  WallColumn(tmpv,lower,x,down+1,bottom,u,d,origin,light);
	}
	tmpv->top[x]=ClampI64(MaxI64(tmpv->top[x],MaxI64(top,up)),
	      0,tmpv->height);
	tmpv->bottom[x]=ClampI64(MinI64(tmpv->bottom[x],MinI64(bottom,down)),
	      -1,tmpv->height-1);
      }
    }
  if (seen && sb && side->middle[0] && side->middle[0]!='-') {
    if (tmpv->masked_cnt>=tmpm->seg_cnt) throw('Masked');
    tmpv->masked[tmpv->masked_cnt++]=tmps;
  }
  TextureDrop(tmpv->gr,mid_n);
  TextureDrop(tmpv->gr,upper_n);
  TextureDrop(tmpv->gr,lower_n);
}

Bool ViewBox(View *tmpv,I16 *box)
{//A conservative screen bound also rejects completely closed columns.
  I64 i,x,x1,x2,behind=0;
  F64 wx,wy,z,r,left=I32_MAX,right=I32_MIN;
  for (i=0;i<4;i++) {
    if (i&1) wx=box[2]-tmpv->x; else wx=box[3]-tmpv->x;
    if (i&2) wy=box[0]-tmpv->y; else wy=box[1]-tmpv->y;
    z=wx*tmpv->cs+wy*tmpv->sn;
    if (z<TM_VIEW_NEAR) behind++;
    else {
      r=tmpv->cx+(wx*tmpv->sn-wy*tmpv->cs)*tmpv->fx/z;
      left=Min(left,r); right=Max(right,r);
    }
  }
  if (behind==4) return FALSE;
  if (behind) {left=0; right=tmpv->width-1;}
  x1=MaxI64(Floor(left),0); x2=MinI64(Ceil(right),tmpv->width-1);
  for (x=x1;x<=x2;x++)
    if (tmpv->top[x]<=tmpv->bottom[x]) return TRUE;
  return FALSE;
}

U0 ViewDraw(View *tmpv)
{//Front-to-back BSP traversal clips walls and marks visible plane spans.
  I64 i,n,s,sp=0;
  Node *tmpn;
  Subsector *tmps;
  if (!ViewFlatsSync(tmpv)) throw('Flat');
  tmpv->cs=Cos(tmpv->angle); tmpv->sn=Sin(tmpv->angle);
  tmpv->masked_cnt=0;
  MemSet(tmpv->top,0,tmpv->width*sizeof(I16));
  MemSetU16(tmpv->bottom,tmpv->height-1,tmpv->width);
  MemSet(tmpv->plane,0,tmpv->width*tmpv->height*sizeof(U16));
  MemSet(tmpv->depth,0,tmpv->width*tmpv->height*sizeof(I32));
  ViewSky(tmpv);
  n=tmpv->map->node_cnt-1;
  if (n<0) n=TM_NF_SUBSECTOR;
  tmpv->stack[sp++]=n;
  while (sp) {
    n=tmpv->stack[--sp];
    if (n&TM_NF_SUBSECTOR) {
      tmps=tmpv->map->subsector+n&~TM_NF_SUBSECTOR;
      for (i=0;i<tmps->cnt;i++)
	ViewSeg(tmpv,tmpv->map->seg+tmps->first+i);
    } else {
      tmpn=tmpv->map->node+n;
      s=NodeSide(tmpn,tmpv->x,tmpv->y);
      if (ViewBox(tmpv,tmpn->box[1-s])) tmpv->stack[sp++]=tmpn->child[1-s];
      if (ViewBox(tmpv,tmpn->box[s])) tmpv->stack[sp++]=tmpn->child[s];
    }
  }
  ViewPlanes(tmpv);
}

U0 ViewBlot(View *tmpv,CDC *dc,I64 x0=0,I64 y0=0)
{//A private DC gets 2x2 palette patterns; GrBlot handles window clipping.
  I64 x,y,color,wi=dc->width_internal;
  U8 *dst;
  if (x0<0 || y0<0 || x0+tmpv->width*2>dc->width ||
	y0+tmpv->height*2>dc->height) throw('View');
  for (y=0;y<tmpv->height;y++) {
    dst=dc->body+(y0+y*2)*wi+x0;
    for (x=0;x<tmpv->width;x++) {
      color=tm_palette[tmpv->pix[x+y*tmpv->width]];
      *dst(U16 *)=color;
      *(dst+wi)(U16 *)=color>>16;
      dst+=2;
    }
  }
}
