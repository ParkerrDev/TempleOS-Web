I64 tm_load_cases=0,tm_load_faults=0,tm_load_done=0,tm_load_texture,
      tm_load_patch,tm_load_flat;
Wad *tm_load_wad;
Map *tm_load_map;
GameData *tm_load_data;
Graphics *tm_load_graphics;
Sprites *tm_load_sprites;
View *tm_load_view;

U0 TmLoadBuild(I64 mode)
{
  Wad *wad;
  Map *map;
  GameData *data;
  Graphics *graphics;
  Sprites *sprites;
  View *view;
  Image *image;
  U8 *bytes;
  switch (mode) {
    case 0:
      wad=WadNew("C:/ORACLE/FREEDOOM.WAD");
      if (!wad) throw('Wad');
      WadDel(wad);
      break;
    case 1:
      map=MapNew(tm_load_wad,"E1M1");
      if (!map) throw('Map');
      MapDel(map);
      break;
    case 2:
      data=GameDataNew("C:/ORACLE/TMDATA.BIN");
      if (!data) throw('Data');
      GameDataDel(data);
      break;
    case 3: image=ImageNew(64,128); ImageDel(image); break;
    case 4:
      image=PatchNew(tm_load_wad,tm_load_patch);
      if (!image) throw('Patch');
      ImageDel(image);
      break;
    case 5:
      graphics=GraphicsNew(tm_load_wad);
      if (!graphics) throw('Graphics');
      GraphicsDel(graphics);
      break;
    case 6:
      sprites=SpritesNew(tm_load_wad,tm_load_data);
      if (!sprites) throw('Sprites');
      SpritesDel(sprites);
      break;
    case 7:
      view=ViewNew(tm_load_map,tm_load_graphics);
      if (!view) throw('View');
      ViewDel(view);
      break;
    case 8:
      image=TextureGet(tm_load_graphics,tm_load_texture);
      if (!image) throw('Texture');
      ImageDel(image); tm_load_graphics->texture[tm_load_texture].image=NULL;
      tm_load_graphics->cache_size=0;
      break;
    case 9:
      image=SpriteGet(tm_load_sprites,tm_load_patch+1);
      if (!image) throw('Sprite');
      ImageDel(image); tm_load_sprites->image[tm_load_patch]=NULL;
      tm_load_sprites->cache_size=0;
      break;
    case 10:
      if (!ViewFlat(tm_load_view,tm_load_flat)) throw('Flat');
      Free(tm_load_view->flat[tm_load_flat]);
      tm_load_view->flat[tm_load_flat]=NULL;
      break;
    case 11:
      bytes=LumpRead(tm_load_wad,tm_load_patch);
      if (!bytes) throw('Lump');
      Free(bytes);
      break;
  }
}

U0 TmLoadReject(I64 mode)
{
  I64 n,size;
  U8 *ptr;
  Image *image;
  Graphics *graphics;
  Sprites *sprites;
  View *view;
  switch (mode) {
    case 0:
      if (WadNew("C:/ORACLE/BAD.WAD")) throw('BadWad');
      break;
    case 1:
      if (GameDataNew("C:/ORACLE/BAD.WAD")) throw('BadData');
      break;
    case 2:
      if (MapNew(tm_load_wad,"MISSING")) throw('BadMap');
      break;
    case 3:
      n=LumpFind(tm_load_wad,"PNAMES"); ptr=tm_load_wad->dir[n].name;
      *ptr^=128; graphics=GraphicsNew(tm_load_wad); *ptr^=128;
      if (graphics) throw('BadGr');
      break;
    case 4:
      n=LumpFind(tm_load_wad,"S_START"); ptr=tm_load_wad->dir[n].name;
      *ptr^=128; sprites=SpritesNew(tm_load_wad,tm_load_data); *ptr^=128;
      if (sprites) throw('BadSpr');
      break;
    case 5:
      ptr=tm_load_map->sector[0].floor_name;
      *ptr^=128; view=ViewNew(tm_load_map,tm_load_graphics); *ptr^=128;
      if (view) throw('BadView');
      break;
    case 6:
      n=tm_load_patch; size=tm_load_wad->dir[n].size;
      tm_load_wad->dir[n].size=1; image=PatchNew(tm_load_wad,n);
      tm_load_wad->dir[n].size=size;
      if (image) throw('BadPatch');
      break;
  }
}

U0 TmLoadAllocTest()
{
  I64 i,j,n,heap,used=Fs->data_heap->used_u8s;
  Bool caught;
  U8 name[9];
  tm_load_wad=WadNew("C:/ORACLE/FREEDOOM.WAD");
  tm_load_data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  if (!tm_load_wad || !tm_load_data) throw('Files');
  tm_load_map=MapNew(tm_load_wad,"E1M1");
  tm_load_graphics=GraphicsNew(tm_load_wad);
  if (!tm_load_map || !tm_load_graphics) throw('Load');
  tm_load_sprites=SpritesNew(tm_load_wad,tm_load_data);
  tm_load_view=ViewNew(tm_load_map,tm_load_graphics);
  if (!tm_load_sprites || !tm_load_view) throw('Load');
  tm_load_patch=LumpFind(tm_load_wad,"S_START")+1;
  tm_load_flat=LumpFind(tm_load_wad,"F_START")+1;
  while (tm_load_flat<tm_load_wad->cnt &&
	tm_load_wad->dir[tm_load_flat].size!=4096) tm_load_flat++;
  if (tm_load_flat==tm_load_wad->cnt) throw('Flats');
  MemSet(name,0,sizeof(name)); StrCpy(name,"SKY1");
  tm_load_texture=TextureFind(tm_load_graphics,name);
  if (tm_load_texture<0) throw('Texture');
  for (i=0;i<12;i++) {
    TmLoadBuild(i);
    heap=Fs->data_heap->used_u8s;
    tm_load_count=tm_load_fail=0; tm_load_armed=TRUE;
    TmLoadBuild(i); tm_load_armed=FALSE; n=tm_load_count;
    if (!n || Fs->data_heap->used_u8s!=heap || tm_load_open!=1)
      throw('Baseline');
    tm_load_cases++;
    for (j=1;j<=n;j++) {
      caught=FALSE; tm_load_count=0; tm_load_fail=j; tm_load_armed=TRUE;
      try {
	TmLoadBuild(i);
      } catch {
	if (Fs->except_ch=='LoadFail') caught=Fs->catch_except=TRUE;
      }
      tm_load_armed=FALSE;
      if (!caught || tm_load_count!=j) throw('Fault');
      if (Fs->data_heap->used_u8s!=heap || tm_load_open!=1) {
	"LOAD %d FAULT %d LEAK %d FILES %d\n",i,j,
	      Fs->data_heap->used_u8s-heap,tm_load_open;
	throw('Leak');
      }
      if (tm_load_graphics->texture[tm_load_texture].image ||
	    tm_load_graphics->cache_size ||
	    tm_load_sprites->image[tm_load_patch] ||
	    tm_load_sprites->cache_size ||
	    tm_load_view->flat[tm_load_flat]) throw('Publish');
      TmLoadBuild(i);
      if (Fs->data_heap->used_u8s!=heap || tm_load_open!=1) throw('Retry');
      tm_load_faults++; tm_load_cases++;
    }
  }
  for (i=0;i<7;i++) {
    heap=Fs->data_heap->used_u8s;
    TmLoadReject(i);
    if (Fs->data_heap->used_u8s!=heap || tm_load_open!=1) throw('Reject');
    tm_load_cases++;
  }
  ViewDel(tm_load_view); SpritesDel(tm_load_sprites);
  GraphicsDel(tm_load_graphics); MapDel(tm_load_map);
  GameDataDel(tm_load_data); WadDel(tm_load_wad);
  if (Fs->data_heap->used_u8s!=used || tm_load_open) throw('Cleanup');
  tm_load_done=1;
  "LOAD %d CASES %d FAULTS BAD 0\n",tm_load_cases,tm_load_faults;
}

TmLoadAllocTest;
