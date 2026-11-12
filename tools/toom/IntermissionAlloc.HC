Wad *tm_im_alloc_wad;
I64 tm_im_alloc_cases=0,tm_im_alloc_faults=0,tm_im_alloc_done=0;

U0 TmIntermissionAllocStart(Intermission *tmpi,I64 mode)
{
  MemSet(tmpi,0,sizeof(Intermission));
  tmpi->episode=1; tmpi->map_num=1; tmpi->next=2;
  tmpi->shown_kills=123; tmpi->shown_items=456; tmpi->shown_secrets=789;
  tmpi->shown_time=3599; tmpi->shown_par=3600;
  if (mode==2) {
    tmpi->episode=2; tmpi->map_num=9; tmpi->next=6;
    tmpi->phase=TM_IM_WAIT; tmpi->did_secret=TRUE;
  }
  if (mode==3) tmpi->episode=4;
}

U0 TmIntermissionAllocBuild(I64 mode)
{
  Intermission result;
  IntermissionGr *graphics=NULL;
  TmIntermissionAllocStart(&result,mode);
  try {
    graphics=IntermissionGrNew(tm_im_alloc_wad,&result);
    if (mode) IntermissionGrDraw(graphics,&result);
  } catch {
    IntermissionGrDel(graphics);
  }
  IntermissionGrDel(graphics);
}

U0 TmIntermissionAllocTest()
{
  I64 i,j,n,heap,used=Fs->data_heap->used_u8s;
  Bool caught;
  Intermission result;
  IntermissionGr *graphics;
  tm_im_alloc_wad=WadNew("C:/ORACLE/FREEDOOM.WAD");
  for (i=0;i<4;i++) {
    TmIntermissionAllocBuild(i); heap=Fs->data_heap->used_u8s;
    tm_load_count=tm_load_fail=0; tm_load_armed=TRUE;
    TmIntermissionAllocBuild(i); tm_load_armed=FALSE;
    n=tm_load_count; tm_im_alloc_cases++;
    if (Fs->data_heap->used_u8s!=heap) throw('Normal');
    for (j=1;j<=n;j++) {
      tm_load_count=0; tm_load_fail=j; tm_load_armed=TRUE; caught=FALSE;
      try {TmIntermissionAllocBuild(i);} catch {
	if (Fs->except_ch=='LoadFail') caught=Fs->catch_except=TRUE;
      }
      tm_load_armed=FALSE;
      if (!caught || Fs->data_heap->used_u8s!=heap || tm_load_open!=1 ||
	    tm_im_alloc_wad->file->dv->owning_task==Fs) throw('Unwind');
      tm_im_alloc_cases++; tm_im_alloc_faults++;
    }
  }
  TmIntermissionAllocStart(&result,0);
  graphics=IntermissionGrNew(tm_im_alloc_wad,&result);
  tm_load_count=tm_load_fail=0; tm_load_armed=TRUE;
  IntermissionGrDigit(graphics,0); tm_load_armed=FALSE;
  n=tm_load_count; IntermissionGrDel(graphics); tm_im_alloc_cases++;
  for (j=1;j<=n;j++) {
    graphics=IntermissionGrNew(tm_im_alloc_wad,&result);
    heap=Fs->data_heap->used_u8s;
    tm_load_count=0; tm_load_fail=j; tm_load_armed=TRUE; caught=FALSE;
    try {IntermissionGrDigit(graphics,0);} catch {
      if (Fs->except_ch=='LoadFail') caught=Fs->catch_except=TRUE;
    }
    tm_load_armed=FALSE;
    if (!caught || graphics->num[0] || Fs->data_heap->used_u8s!=heap ||
	  tm_load_open!=1 || tm_im_alloc_wad->file->dv->owning_task==Fs)
      throw('PatchOwn');
    IntermissionGrDigit(graphics,0);
    if (!graphics->num[0]) throw('Retry');
    IntermissionGrDel(graphics); tm_im_alloc_cases++; tm_im_alloc_faults++;
  }
  graphics=IntermissionGrNew(tm_im_alloc_wad,&result);
  result.next=3; caught=FALSE;
  try {IntermissionGrDraw(graphics,&result);} catch {
    if (Fs->except_ch=='Owner') caught=Fs->catch_except=TRUE;
  }
  if (!caught) throw('Owner');
  IntermissionGrDel(graphics); tm_im_alloc_cases++;
  WadDel(tm_im_alloc_wad);
  if (Fs->data_heap->used_u8s!=used || tm_load_open) throw('Cleanup');
  tm_im_alloc_done=1;
  "INTERMISSION ALLOC %d CASES %d FAULTS BAD 0\n",
	tm_im_alloc_cases,tm_im_alloc_faults;
}

TmIntermissionAllocTest;
