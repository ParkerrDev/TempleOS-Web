Wad *tm_cast_alloc_wad;
Story *tm_cast_alloc_story;
GameData *tm_cast_alloc_data;
I64 tm_cast_alloc_cases=0,tm_cast_alloc_faults=0,tm_cast_alloc_done=0;

U0 TmCastAllocBuild()
{
  Sprites *sprites=NULL;
  FinaleGr *graphics=NULL;
  Intermission result;
  Finale finale;
  Cast cast;
  MemSet(&result,0,sizeof(Intermission));
  result.episode=1; result.map_num=30; result.commercial=TRUE;
  FinaleStart(&finale,tm_cast_alloc_story,&result);
  CastStart(&cast,tm_cast_alloc_data);
  cast.num=14;
  cast.state=tm_cast_alloc_data->info[tm_cast_types[cast.num]].see;
  try {
    sprites=SpritesNew(tm_cast_alloc_wad,tm_cast_alloc_data);
    if (!sprites) throw('Sprites');
    graphics=FinaleGrNew(tm_cast_alloc_wad,&finale);
    CastGrDraw(graphics,&cast,sprites,tm_cast_alloc_story);
  } catch {
    FinaleGrDel(graphics); SpritesDel(sprites);
  }
  FinaleGrDel(graphics); SpritesDel(sprites);
}

U0 TmCastAllocTest()
{
  I64 i,n,heap,used=Fs->data_heap->used_u8s;
  Bool caught;
  tm_cast_alloc_wad=WadNew("C:/ORACLE/FREEDOOM.WAD");
  tm_cast_alloc_story=StoryNew(tm_cast_alloc_wad);
  tm_cast_alloc_data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  if (!tm_cast_alloc_data) throw('Data');
  TmCastAllocBuild;
  heap=Fs->data_heap->used_u8s;
  tm_load_count=tm_load_fail=0; tm_load_armed=TRUE;
  TmCastAllocBuild; tm_load_armed=FALSE;
  n=tm_load_count; tm_cast_alloc_cases++;
  if (Fs->data_heap->used_u8s!=heap || n<30) throw('Normal');
  for (i=1;i<=n;i++) {
    tm_load_count=0; tm_load_fail=i; tm_load_armed=TRUE; caught=FALSE;
    try {TmCastAllocBuild;} catch {
      if (Fs->except_ch=='LoadFail') caught=Fs->catch_except=TRUE;
    }
    tm_load_armed=FALSE;
    if (!caught || Fs->data_heap->used_u8s!=heap || tm_load_open!=1 ||
	  tm_cast_alloc_wad->file->dv->owning_task==Fs) throw('Unwind');
    tm_cast_alloc_cases++; tm_cast_alloc_faults++;
  }
  tm_load_fail=0;
  TmCastAllocBuild; tm_cast_alloc_cases++;
  GameDataDel(tm_cast_alloc_data); StoryDel(tm_cast_alloc_story);
  WadDel(tm_cast_alloc_wad);
  if (Fs->data_heap->used_u8s!=used || tm_load_open) throw('Cleanup');
  tm_cast_alloc_done=1;
  "CAST ALLOC %d CASES %d FAULTS BAD 0\n",
	tm_cast_alloc_cases,tm_cast_alloc_faults;
}

TmCastAllocTest;
