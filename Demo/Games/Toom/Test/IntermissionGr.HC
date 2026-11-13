I64 tm_im_gr_cases=0,tm_im_gr_done=0;

U0 TmIntermissionGrDC(IntermissionGr *tmpg,U8 *expected)
{
  CDC *dc=DCNew(648,408);
  I64 x,y,color,actual;
  MemSet(dc->body,0xA5,dc->width_internal*dc->height);
  IntermissionGrBlot(tmpg,dc);
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

U0 TmIntermissionGrTest()
{
  I64 *data=FileRead("C:/ORACLE/IMGR.BIN"),*ptr,i,phase=-1,res;
  U8 *expected;
  Wad *wad=NULL;
  IntermissionGr *graphics=NULL;
  Intermission result;
  if (!data || *data<=0) throw('Fixture');
  ptr=data+1;
  for (i=0;i<*data;i++) {
    MemSet(&result,0,sizeof(Intermission));
    result.commercial=ptr[0]; result.episode=ptr[1];
    result.map_num=ptr[2]; result.next=ptr[3]; result.phase=ptr[4];
    result.did_secret=ptr[6];
    result.shown_kills=ptr[7]; result.shown_items=ptr[8];
    result.shown_secrets=ptr[9]; result.shown_time=ptr[10];
    result.shown_par=ptr[11];
    if (phase!=ptr[0]) {
      WadDel(wad);
      if (ptr[0]) wad=WadNew("C:/ORACLE/PHASE2.WAD");
      else wad=WadNew("C:/ORACLE/PHASE1.WAD");
      if (!wad) throw('Wad');
      phase=ptr[0];
    }
    graphics=IntermissionGrNew(wad,&result);
    graphics->pointer_on=ptr[5]; expected=ptr+16; res=0;
    switch (ptr[12]) {
      case 1:
	res=IntermissionGrNum(graphics,300,80,ptr[13],ptr[14]);
	break;
      case 2:
	IntermissionGrTime(graphics,300,80,ptr[13]);
	break;
      default:
	IntermissionGrDraw(graphics,&result);
    }
    if (res!=ptr[15]) throw('Result');
    if (MemCmp(graphics->pix,expected,320*200)) throw('Pixels');
    if (!(i%64) || i==*data-1) TmIntermissionGrDC(graphics,expected);
    IntermissionGrDel(graphics); graphics=NULL;
    ptr=(expected+320*200)(I64 *); tm_im_gr_cases++;
  }
  WadDel(wad); Free(data);
}

U0 TmIntermissionGrHeap()
{
  I64 used=Fs->data_heap->used_u8s;
  TmIntermissionGrTest;
  if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
  tm_im_gr_done=1;
  "INTERMISSION GR %d CASES %d PIXELS BAD 0\n",
	tm_im_gr_cases,tm_im_gr_cases*64000;
}

TmIntermissionGrHeap;
