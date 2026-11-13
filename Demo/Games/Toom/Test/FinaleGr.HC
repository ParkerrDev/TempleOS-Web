I64 tm_final_gr_cases=0,tm_final_gr_pixels=0,tm_final_gr_sounds=0,
      tm_final_gr_done=0;

U0 TmFinaleGrSnd(I64 n,U8 *context)
{
  if (n!=TM_SFX_PISTOL || context!=&tm_final_gr_sounds) throw('Sound');
  tm_final_gr_sounds++;
}

U0 TmFinaleGrDC(FinaleGr *tmpg,U8 *expected)
{//The original indexed frame also supplies the native palette expectation.
  CDC *dc=DCNew(648,408);
  I64 x,y,color,actual;
  MemSet(dc->body,0xA5,dc->width_internal*dc->height);
  FinaleGrBlot(tmpg,dc);
  for (y=0;y<dc->height;y++)
    for (x=0;x<dc->width_internal;x++) {
      actual=dc->body[y*dc->width_internal+x];
      if (x<640 && y<400) {
	color=tm_palette[expected[y/2*320+x/2]];
	color=color>>(y%2*16+x%2*8)&255;
	if (actual!=color) throw('Palette');
      } else if (actual!=0xA5) throw('Guard');
    }
  DCDel(dc);
}

U0 TmFinaleGrTest()
{
  I64 *data=FileRead("C:/ORACLE/ENDGR.BIN"),*ptr,i,phase=-1,story=-1,n;
  U8 *expected;
  Wad *wad=NULL;
  Story *meta=NULL;
  Finale finale;
  FinaleGr *graphics=NULL;
  Intermission result;
  if (!data || *data!=154) throw('Fixture');
  ptr=data+1;
  for (i=0;i<*data;i++) {
    MemSet(&result,0,sizeof(Intermission));
    result.episode=ptr[1]; result.map_num=ptr[2];
    result.commercial=ptr[0];
    n=FinaleStory(result.episode,result.map_num,result.commercial);
    if (phase!=ptr[0]) {
      FinaleGrDel(graphics); graphics=NULL; story=-1;
      StoryDel(meta); WadDel(wad);
      if (ptr[0]) wad=WadNew("C:/ORACLE/PHASE2.WAD");
      else wad=WadNew("C:/ORACLE/PHASE1.WAD");
      if (!wad) throw('Wad');
      meta=StoryNew(wad); phase=ptr[0];
    }
    if (story!=n) {
      FinaleGrDel(graphics);
      FinaleStart(&finale,meta,&result);
      graphics=FinaleGrNew(wad,&finale);
      graphics->sound=&TmFinaleGrSnd;
      graphics->context=&tm_final_gr_sounds; story=n;
    }
    finale.stage=ptr[3]; finale.tic=ptr[4];
    expected=ptr+6;
    tm_final_gr_sounds=0;
    FinaleGrDraw(graphics,&finale);
    if (MemCmp(graphics->pix,expected,320*200)) throw('Pixels');
    if (tm_final_gr_sounds!=ptr[5]) throw('Sound');
    if (!i || i==12 || finale.stage==TM_FINAL_ART &&
	  finale.episode==3 && finale.tic==1210 || i==*data-1)
      TmFinaleGrDC(graphics,expected);
    ptr=(expected+320*200)(I64 *);
    tm_final_gr_cases++; tm_final_gr_pixels+=320*200;
  }
  FinaleGrDel(graphics); StoryDel(meta); WadDel(wad); Free(data);
}

U0 TmFinaleGrHeap()
{
  I64 used=Fs->data_heap->used_u8s;
  TmFinaleGrTest;
  if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
  tm_final_gr_done=1;
  "FINALE GR %d CASES %d PIXELS BAD 0\n",
	tm_final_gr_cases,tm_final_gr_pixels;
}

TmFinaleGrHeap;
