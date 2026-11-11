U0 MaskSegDraw(View *tmpv,Seg *tmps)
{//Masked middle textures keep holes, pegging and wall/sprite depth.
  I64 i,n,x,y,ya,yb,tx,ty,v,step,z,c,light,base_light,high,low;
  F64 iz,iu,d,u,origin;
  WallView wall;
  Map *tmpm=tmpv->map;
  Line *tmpl=tmpm->line+tmps->line;
  Side *side=tmpm->side+tmpl->side[tmps->side];
  Sector *sf=tmpm->sector+side->sector,*sb;
  Image *tmpi;
  U8 *color;
  i=tmpl->side[1-tmps->side];
  if (i==0xFFFF || !(tmpl->flags&4) ||
	!WallProject(tmpv,tmps,&wall)) return;
  sb=tmpm->sector+tmpm->side[i].sector;
  high=MinI64(sf->ceil,sb->ceil); low=MaxI64(sf->floor,sb->floor);
  if (high<=low) return;
  n=TextureFind(tmpv->gr,side->middle);
  if (!(tmpi=TextureHold(tmpv->gr,n))) return;
  origin=high+side->y;
  if (tmpl->flags&16) origin=low+tmpi->height+side->y;
  base_light=sf->light>>4;
  if (tmpm->vertex[tmps->v1].y==tmpm->vertex[tmps->v2].y) base_light--;
  else if (tmpm->vertex[tmps->v1].x==tmpm->vertex[tmps->v2].x) base_light++;
  base_light=4*(15-ClampI64(base_light,0,15));
  iz=wall.iz; iu=wall.iu;
  for (x=wall.x1;x<=wall.x2;x++,iz+=wall.dz,iu+=wall.du) {
    d=1.0/iz; u=iu*d;
    ya=MaxI64(ViewY(tmpv,high,iz),0);
    yb=MinI64(ViewY(tmpv,low,iz)-1,tmpv->height-1);
    tx=Floor(u); tx%=tmpi->width;
    if (tx<0) tx+=tmpi->width;
    z=Min(100000000.0*iz,I32_MAX);
    light=ClampI64(base_light-MinI64(Floor(tmpv->fx*16*iz),47)/2,0,31);
    color=tmpv->gr->colormap+light*256;
    v=(origin-tmpv->z+(ya+0.5-tmpv->cy)*d/tmpv->fy)*65536.0;
    step=d/tmpv->fy*65536.0;
    for (y=ya;y<=yb;y++,v+=step) {
      ty=v>>16;
      if (0<=ty<tmpi->height) {
	i=x+y*tmpv->width;
	if (z>AbsI64(tmpv->depth[i])) {
	  c=tmpi->pix[tx+ty*tmpi->width];
	  if (c!=TM_TRANSPARENT) {
	    tmpv->pix[i]=color[c];
	    tmpv->depth[i]=z;
	  }
	}
      }
    }
  }
  TextureDrop(tmpv->gr,n);
}

U0 ViewMasked(View *tmpv)
{//Only segs reached through open opaque portals enter the masked pass.
  I64 i;
  for (i=0;i<tmpv->masked_cnt;i++) MaskSegDraw(tmpv,tmpv->masked[i]);
}
