I64 tm_cast_gr_cases=0,tm_cast_gr_pixels=0,tm_cast_gr_done=0;

U0 TmCastGrTest()
{
  I64 *data=FileRead("C:/ORACLE/CASTGR.BIN"),*ptr,i,phase=-1,slot,code;
  U8 *expected;
  GameData *records=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Wad *wad=NULL;
  Story *story=NULL;
  Sprites *sprites=NULL;
  FinaleGr *graphics=NULL;
  Finale finale;
  Intermission result;
  Cast cast;
  State *state;
  if (!data || *data!=259 || !records) throw('Fixture');
  MemSet(&result,0,sizeof(Intermission));
  result.episode=1; result.map_num=30; result.commercial=TRUE;
  ptr=data+1;
  for (i=0;i<*data;i++) {
    if (phase!=ptr[0]) {
      FinaleGrDel(graphics); SpritesDel(sprites);
      StoryDel(story); WadDel(wad);
      if (ptr[0]) wad=WadNew("C:/ORACLE/PHASE2.WAD");
      else wad=WadNew("C:/ORACLE/PHASE1.WAD");
      if (!wad) throw('Wad');
      story=StoryNew(wad); sprites=SpritesNew(wad,records);
      if (!sprites) throw('Sprites');
      FinaleStart(&finale,story,&result);
      graphics=FinaleGrNew(wad,&finale); phase=ptr[0];
    }
    CastStart(&cast,records); cast.num=ptr[1]; cast.state=ptr[2];
    state=records->state+cast.state;
    code=SpriteFrame(sprites,state->sprite,state->frame,0);
    if (code!=ptr[3]) throw('Index');
    slot=(state->sprite*TM_SPRITE_FRAMES+state->frame&0x7FFF)*8;
    if (ptr[4]) sprites->frame[slot]=-code;
    expected=ptr+5;
    CastGrDraw(graphics,&cast,sprites,story);
    if (MemCmp(graphics->pix,expected,320*200)) {
      "CAST GR FAIL %d NUM %d STATE %d\n",i,cast.num,cast.state;
      throw('Pixels');
    }
    sprites->frame[slot]=code;
    ptr=(expected+320*200)(I64 *);
    tm_cast_gr_cases++; tm_cast_gr_pixels+=320*200;
  }
  FinaleGrDel(graphics); SpritesDel(sprites); StoryDel(story);
  WadDel(wad); GameDataDel(records); Free(data);
}

U0 TmCastGrHeap()
{
  I64 used=Fs->data_heap->used_u8s;
  TmCastGrTest;
  if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
  tm_cast_gr_done=1;
  "CAST GR %d CASES %d PIXELS BAD 0\n",tm_cast_gr_cases,tm_cast_gr_pixels;
}

TmCastGrHeap;
