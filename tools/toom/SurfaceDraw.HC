I64 tm_surface_done=0,tm_surface_cnt=0,tm_surface_changed=0,
	tm_surface_cache=0,tm_surface_hash[432];

U0 TmSurfacePose(View *view)
{
  Map *map=view->map;
  Thing *player=NULL;
  I64 i,n;
  for (i=0;i<map->thing_cnt;i++)
    if (map->thing[i].type==1) player=map->thing+i;
  if (!player) throw('Player');
  n=FixedSector(map,player->x*65536,player->y*65536);
  view->x=player->x; view->y=player->y;
  view->z=map->sector[n].floor/65536.0+41;
  view->angle=player->angle/45*pi/4;
}

U0 TmSurfaceCompare(View *view,View *reference)
{
  I64 size=view->width*view->height;
  ViewDraw(view); ViewMasked(view);
  ViewDraw(reference); ViewMasked(reference);
  if (MemCmp(view->pix,reference->pix,size) ||
	MemCmp(view->depth,reference->depth,size*sizeof(I32))) throw('Pixels');
}

I64 TmSurfaceHash(View *view)
{
  I64 i,hash=2166136261;
  for (i=0;i<view->width*view->height;i++) {
    hash=(hash^view->pix[i])*16777619; hash=hash.u32[0];
  }
  return hash;
}

I64 *TmSurfaceNames(Map *map,Graphics *graphics)
{
  I64 i,j,*res=MAlloc((map->side_cnt*3+map->sector_cnt*2)*sizeof(I64)),
	*dst=res;
  U8 *src;
  for (i=0;i<map->side_cnt;i++)
    for (j=0,src=map->side[i].upper;j<3;j++,src+=8)
      *dst++=TextureFind(graphics,src);
  for (i=0;i<map->sector_cnt;i++)
    for (j=0,src=map->sector[i].floor_name;j<2;j++,src+=8)
      *dst++=ViewFlatFind(graphics,*src(I64 *));
  return res;
}

U0 TmSurfaceCopy(Map *map,Map *copy,Graphics *graphics,I64 *names,
	I64 *tex,I64 *flat,
	I64 first,I64 cnt)
{//The reference view receives explicit frame names and has no animation state.
  I64 i,j,n;
  U8 *src,*dst;
  for (i=0;i<map->side_cnt;i++) {
    copy->side[i].x=map->side[i].x; copy->side[i].y=map->side[i].y;
    src=map->side[i].upper; dst=copy->side[i].upper;
    for (j=0;j<3;j++,src+=8,dst+=8) {
      n=*names++;
      if (n>=0) MemCpy(dst,graphics->texture[tex[n]].def->name,8);
      else MemCpy(dst,src,8);
    }
  }
  for (i=0;i<map->sector_cnt;i++) {
    src=map->sector[i].floor_name; dst=copy->sector[i].floor_name;
    for (j=0;j<2;j++,src+=8,dst+=8) {
      n=*names++;
      if (first<=n<first+cnt)
	MemCpy(dst,graphics->wad->dir[flat[n-first]].name,8);
      else MemCpy(dst,src,8);
    }
  }
}

U0 TmSurfaceCache(Graphics *graphics)
{
  Map *map=MapNew(graphics->wad,"E1M1");
  View *view=ViewNew(map,graphics),*reference;
  I64 i,n;
  U8 saved[8];
  if (!view) throw('View');
  TmSurfacePose(view); n=MapSector(map,view->x,view->y);
  for (i=0;i<4;i++) {
    if (!i) StrCpy(map->sector[n].floor_name,"NUKAGE1");
    else if (i==1) StrCpy(map->sector[n].floor_name,"NUKAGE2");
    else if (i==2) StrCpy(map->sector[n].ceil_name,"F_SKY1");
    else StrCpy(map->sector[n].ceil_name,"NUKAGE3");
    reference=ViewNew(map,graphics);
    if (!reference) throw('View');
    TmSurfacePose(reference); TmSurfaceCompare(view,reference);
    if (view->floor[n].lump!=reference->floor[n].lump ||
	  view->ceil[n].lump!=reference->ceil[n].lump) throw('Cache');
    ViewDel(reference); tm_surface_cache++;
  }
  MemCpy(saved,map->sector[n].floor_name,8);
  StrCpy(map->sector[n].floor_name,"INVALID");
  if (ViewFlatsSync(view) || ViewFlatsSync(view)) throw('Invalid');
  MemCpy(map->sector[n].floor_name,saved,8);
  if (!ViewFlatsSync(view)) throw('Restore');
  tm_surface_cache++;
  ViewDel(view); MapDel(map);
}

U0 TmSurfaceTest()
{
  I64 *body=FileRead("C:/ORACLE/SURFACE.BIN"),*row,*tex,*flat,*names,
	i,j,k,cnt,first,flat_cnt,tex_cnt,hash,previous,used;
  Wad *wad=WadNew("C:/ORACLE/FREEDOOM.WAD");
  Graphics *graphics;
  Map *map,*copy;
  Surfaces *surfaces;
  View *view,*reference,*bad;
  U8 name[5];
  if (!body || !wad) throw('Files');
  graphics=GraphicsNew(wad);
  if (!graphics) throw('Graphics');
  cnt=body[0]; tex_cnt=body[1]; first=body[2]; flat_cnt=body[3];
  if (cnt!=12 || tex_cnt!=graphics->tex_cnt) throw('Metadata');
  for (i=0;i<36;i++) {
    StrPrint(name,"E%dM%d",1+i/9,1+i%9);
    map=MapNew(wad,name); copy=MapNew(wad,name);
    if (!map || !copy) throw('Map');
    names=TmSurfaceNames(map,graphics);
    surfaces=SurfacesNew(map,graphics);
    if (!surfaces) throw('Surfaces');
    view=ViewNew(map,graphics,surfaces); reference=ViewNew(copy,graphics);
    if (!view || !reference) throw('View');
    TmSurfacePose(view); TmSurfacePose(reference);
    if (!i) {
      used=Fs->data_heap->used_u8s; bad=ViewNew(copy,graphics,surfaces);
      if (bad || Fs->data_heap->used_u8s!=used) throw('Borrow');
      tm_surface_cache++;
    }
    previous=-1; row=body+4;
    for (j=0;j<cnt;j++) {
      k=*row++; tex=row; row+=tex_cnt; flat=row; row+=flat_cnt;
      SurfacesTick(surfaces,k);
      TmSurfaceCopy(map,copy,graphics,names,tex,flat,first,flat_cnt);
      TmSurfaceCompare(view,reference); hash=TmSurfaceHash(view);
      tm_surface_hash[tm_surface_cnt++]=hash;
      if (j && hash!=previous) tm_surface_changed++;
      previous=hash;
    }
    ViewDel(view); ViewDel(reference); SurfacesDel(surfaces);
    MapDel(map); MapDel(copy); Free(names);
  }
  if (!tm_surface_changed) throw('Static');
  TmSurfaceCache(graphics);
  GraphicsDel(graphics); WadDel(wad); Free(body); tm_surface_done=1;
  "SURFACES %d VIEWS %d CHANGED %d CACHE BAD 0\n",
	tm_surface_cnt,tm_surface_changed,tm_surface_cache;
  for (i=0;i<tm_surface_cnt;i++) "SURFACE %d %d\n",i,tm_surface_hash[i];
}

TmSurfaceTest;
