I64 tm_anim_done=0,tm_anim_mappings=0,tm_anim_scroll=0,tm_anim_sides=0;

U0 TmScrollTest(Graphics *graphics)
{
  Map map;
  Line lines[80];
  Side sides[2];
  Surfaces *surfaces;
  I64 i;
  MemSet(&map,0,sizeof(Map)); MemSet(lines,0,sizeof(lines));
  MemSet(sides,0,sizeof(sides));
  map.line=lines; map.line_cnt=80; map.side=sides; map.side_cnt=2;
  for (i=0;i<70;i++) lines[i].special=48;
  sides[0].x=32767; sides[1].x=10;
  surfaces=SurfacesNew(&map,graphics);
  if (!surfaces || surfaces->scroll_cnt!=70) throw('Scroll');
  lines[71].special=48; lines[71].side[0]=1;
  SurfacesTick(surfaces,0);
  if (sides[0].x!= -32699 || sides[1].x!=10) throw('Wrap');
  lines[0].special=49; SurfacesTick(surfaces,8);
  if (sides[0].x!= -32630 || sides[1].x!=10) throw('Stopped');
  lines[0].special=48; SurfacesTick(surfaces,49);
  if (sides[0].x!= -32560 || sides[1].x!=10) throw('Resume');
  SurfacesDel(surfaces);
}

U0 TmAnimTest()
{
  I64 *body=FileRead("C:/ORACLE/FRAMES.BIN"),*row,
	*scroll=FileRead("C:/ORACLE/SCROLL.BIN"),i,j,k,n,used,allocated,reads;
  Wad *wad=WadNew("C:/ORACLE/FREEDOOM.WAD");
  Graphics *graphics;
  Map *map;
  Surfaces *surfaces;
  PicAnim *anim;
  U8 name[5],saved[8];
  if (!body || !scroll || !wad) throw('Files');
  graphics=GraphicsNew(wad); map=MapNew(wad,"E1M1");
  if (!graphics || !map) throw('Files');
  used=Fs->data_heap->used_u8s; reads=wad->read_bytes;
  surfaces=SurfacesNew(map,graphics);
  if (!surfaces || graphics->tex_cnt!=body[0] ||
	surfaces->flat_first!=body[1] || surfaces->flat_cnt!=body[2] ||
	surfaces->anim_cnt!=body[3]) throw('Metadata');
  for (i=0;i<graphics->tex_cnt;i++)
    if (TextureFrame(surfaces,i)!=i) throw('Identity');
  for (i=0;i<surfaces->flat_cnt;i++)
    if (FlatFrame(surfaces,i+surfaces->flat_first)!=i+surfaces->flat_first)
      throw('Identity');
  row=body+5;
  for (i=0;i<surfaces->anim_cnt;i++,row+=3) {
    anim=surfaces->anim+i;
    if (anim->first!=row[0] || anim->cnt!=row[1] || anim->kind!=row[2])
      throw('Cycle');
  }
  allocated=Fs->data_heap->used_u8s;
  for (i=0;i<body[4];i++) {
    SurfacesTick(surfaces,*row++);
    for (j=0;j<graphics->tex_cnt;j++) {
      if (TextureFrame(surfaces,j)!=*row++) throw('Texture');
      tm_anim_mappings++;
    }
    for (j=0;j<surfaces->flat_cnt;j++) {
      if (FlatFrame(surfaces,surfaces->flat_first+j)!=*row++) throw('Flat');
      tm_anim_mappings++;
    }
  }
  if (wad->read_bytes!=reads || graphics->cache_size ||
	Fs->data_heap->used_u8s!=allocated) throw('Eager');
  if (TextureFrame(NULL,7)!=7 || TextureFrame(surfaces,-1)!= -1 ||
	FlatFrame(NULL,7)!=7 || FlatFrame(surfaces,-1)!= -1) throw('Index');
  SurfacesDel(surfaces);
  if (Fs->data_heap->used_u8s!=used) throw('Leak');
  n=LumpFind(wad,"NUKAGE3"); MemCpy(saved,wad->dir[n].name,8);
  StrCpy(wad->dir[n].name,"INVALID");
  surfaces=SurfacesNew(map,graphics);
  if (surfaces || Fs->data_heap->used_u8s!=used) throw('BadCycle');
  MemCpy(wad->dir[n].name,saved,8);
  n=LumpFind(wad,"NUKAGE1"); MemCpy(saved,wad->dir[n].name,8);
  StrCpy(wad->dir[n].name,"INVALID");
  surfaces=SurfacesNew(map,graphics);
  if (!surfaces || surfaces->anim_cnt!=21) throw('Missing');
  SurfacesDel(surfaces); MemCpy(wad->dir[n].name,saved,8);
  MapDel(map); row=scroll;
  for (i=0;i<36;i++) {
    StrPrint(name,"E%dM%d",1+i/9,1+i%9); map=MapNew(wad,name);
    if (!map || map->side_cnt!=row[0]) throw('Map');
    n=row[1]; row+=2; surfaces=SurfacesNew(map,graphics);
    if (!surfaces || surfaces->scroll_cnt!=n) throw('Scroll');
    for (j=0;j<n;j++) if (surfaces->scroll[j]!=*row++) throw('Order');
    reads=wad->read_bytes;
    SurfacesTick(surfaces,0); SurfacesTick(surfaces,8);
    SurfacesTick(surfaces,49);
    for (k=0;k<map->side_cnt;k++)
      if (map->side[k].x!=*row++) throw('Offset');
    if (wad->read_bytes!=reads || graphics->cache_size) throw('Eager');
    tm_anim_scroll+=n; tm_anim_sides+=map->side_cnt;
    SurfacesDel(surfaces); MapDel(map);
  }
  TmScrollTest(graphics);
  GraphicsDel(graphics); WadDel(wad); Free(body); Free(scroll); tm_anim_done=1;
  "ANIM %d MAPPINGS %d SCROLL %d SIDES BAD 0\n",
	tm_anim_mappings,tm_anim_scroll,tm_anim_sides;
}

TmAnimTest;
