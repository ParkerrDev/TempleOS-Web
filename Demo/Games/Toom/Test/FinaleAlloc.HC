Wad *tm_final_alloc_wad;
Story *tm_final_alloc_story;
I64 tm_final_alloc_cases=0,tm_final_alloc_faults=0,tm_final_alloc_done=0,
      tm_final_alloc_sounds=0;
Bool tm_final_alloc_sound_fail=FALSE;

U0 TmFinaleAllocStart(Finale *finale,I64 episode)
{
  Intermission result;
  MemSet(&result,0,sizeof(Intermission));
  result.episode=episode; result.map_num=8;
  FinaleStart(finale,tm_final_alloc_story,&result);
}

U0 TmFinaleAllocBuild(I64 mode)
{
  Finale finale;
  FinaleGr *graphics=NULL;
  I64 episode=1;
  if (mode==3) episode=3;
  TmFinaleAllocStart(&finale,episode);
  try {
    graphics=FinaleGrNew(tm_final_alloc_wad,&finale);
    if (mode) {
      finale.tic=finale.len*3+10;
      if (mode>=2) {finale.stage=TM_FINAL_ART; finale.tic=1210;}
      FinaleGrDraw(graphics,&finale);
    }
  } catch {
    FinaleGrDel(graphics);
  }
  FinaleGrDel(graphics);
}

FinaleGr *TmFinaleAllocEnd(Finale *finale)
{
  FinaleGr *graphics;
  TmFinaleAllocStart(finale,3);
  graphics=FinaleGrNew(tm_final_alloc_wad,finale);
  finale->stage=TM_FINAL_ART; finale->tic=1130;
  FinaleGrDraw(graphics,finale);
  finale->tic=1210;
  return graphics;
}

U0 TmFinaleAllocSnd(I64 n,U8 *)
{
  if (n!=TM_SFX_PISTOL) throw('Sound');
  if (tm_final_alloc_sound_fail) throw('SndFail');
  tm_final_alloc_sounds++;
}

U0 TmFinaleAllocTest()
{
  I64 i,j,n,heap,used=Fs->data_heap->used_u8s;
  Bool caught;
  Finale finale;
  FinaleGr *graphics;
  Image *old;
  tm_final_alloc_wad=WadNew("C:/ORACLE/FREEDOOM.WAD");
  tm_final_alloc_story=StoryNew(tm_final_alloc_wad);
  for (i=0;i<4;i++) {
    TmFinaleAllocBuild(i); heap=Fs->data_heap->used_u8s;
    tm_load_count=tm_load_fail=0; tm_load_armed=TRUE;
    TmFinaleAllocBuild(i); tm_load_armed=FALSE;
    n=tm_load_count; tm_final_alloc_cases++;
    if (Fs->data_heap->used_u8s!=heap) throw('Normal');
    for (j=1;j<=n;j++) {
      tm_load_count=0; tm_load_fail=j; tm_load_armed=TRUE; caught=FALSE;
      try {TmFinaleAllocBuild(i);} catch {
	if (Fs->except_ch=='LoadFail') caught=Fs->catch_except=TRUE;
      }
      tm_load_armed=FALSE;
      if (!caught || Fs->data_heap->used_u8s!=heap || tm_load_open!=1 ||
	    tm_final_alloc_wad->file->dv->owning_task==Fs) throw('Unwind');
      tm_final_alloc_cases++; tm_final_alloc_faults++;
    }
  }
  graphics=TmFinaleAllocEnd(&finale);
  tm_load_count=tm_load_fail=0; tm_load_armed=TRUE;
  FinaleGrDraw(graphics,&finale); tm_load_armed=FALSE;
  n=tm_load_count; FinaleGrDel(graphics); tm_final_alloc_cases++;
  for (j=1;j<=n;j++) {
    graphics=TmFinaleAllocEnd(&finale);
    heap=Fs->data_heap->used_u8s; old=graphics->end;
    tm_load_count=0; tm_load_fail=j; tm_load_armed=TRUE; caught=FALSE;
    try {FinaleGrDraw(graphics,&finale);} catch {
      if (Fs->except_ch=='LoadFail') caught=Fs->catch_except=TRUE;
    }
    tm_load_armed=FALSE;
    if (!caught || graphics->end!=old || graphics->end_num ||
	  Fs->data_heap->used_u8s!=heap || tm_load_open!=1 ||
	  tm_final_alloc_wad->file->dv->owning_task==Fs) throw('EndOwner');
    FinaleGrDraw(graphics,&finale);
    if (graphics->end_num!=6) throw('Retry');
    FinaleGrDel(graphics); tm_final_alloc_cases++; tm_final_alloc_faults++;
  }
  graphics=TmFinaleAllocEnd(&finale); graphics->sound=&TmFinaleAllocSnd;
  tm_final_alloc_sound_fail=TRUE; caught=FALSE;
  try {FinaleGrDraw(graphics,&finale);} catch {
    if (Fs->except_ch=='SndFail') caught=Fs->catch_except=TRUE;
  }
  tm_final_alloc_sound_fail=FALSE;
  if (!caught || graphics->last_stage || graphics->end_num!=6)
    throw('Callback');
  FinaleGrDraw(graphics,&finale);
  if (graphics->last_stage!=6 || tm_final_alloc_sounds!=1) throw('Retry');
  FinaleGrDel(graphics); tm_final_alloc_cases++;
  StoryDel(tm_final_alloc_story); WadDel(tm_final_alloc_wad);
  if (Fs->data_heap->used_u8s!=used || tm_load_open) throw('Cleanup');
  tm_final_alloc_done=1;
  "FINALE ALLOC %d CASES %d FAULTS BAD 0\n",
	tm_final_alloc_cases,tm_final_alloc_faults;
}

TmFinaleAllocTest;
