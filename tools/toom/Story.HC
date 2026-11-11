I64 tm_story_done=0,tm_story_cases=0,tm_story_strings=0,tm_story_faults=0;

I64 TmStoryWord(U8 **_ptr)
{
  U8 *ptr=*_ptr;
  I64 res=*ptr(I64 *);
  *_ptr+=8;
  return res;
}

U0 TmStoryTest()
{
  U8 *data,*ptr,*end,*st;
  I64 size,cases,n,i,len,except,heap,used=Fs->data_heap->used_u8s,fail;
  Wad *wad;
  Story *story;
  Bool caught;
  data=FileRead("C:/ORACLE/STORY.BIN",&size);
  if (!data || size<8) throw('Files');
  ptr=data; cases=TmStoryWord(&ptr);
  for (n=0;n<cases;n++) {
    len=TmStoryWord(&ptr); end=ptr+len;
    except=TmStoryWord(&ptr); len=TmStoryWord(&ptr);
    if (!FileWrite("C:/ORACLE/STORY.WAD",ptr,len)) throw('Write');
    ptr+=len;
    wad=WadNew("C:/ORACLE/STORY.WAD");
    if (!wad) throw('Wad');
    heap=Fs->data_heap->used_u8s;
    story=NULL; caught=FALSE;
    try {story=StoryNew(wad);} catch {
      if (except && Fs->except_ch==except) caught=Fs->catch_except=TRUE;
    }
    if (except) {
      if (!caught || story || ptr!=end) throw('Reject');
    } else {
      for (i=0;i<TM_STORY_MAPS;i++)
	if (story->par[i]!=TmStoryWord(&ptr)) throw('Par');
      for (i=0;i<TM_STORY_MAPS+TM_STORY_ENDS*2;i++) {
	if (i<TM_STORY_MAPS) st=story->name[i];
	else if (i<TM_STORY_MAPS+TM_STORY_ENDS)
	  st=story->end[i-TM_STORY_MAPS];
	else st=story->flat[i-TM_STORY_MAPS-TM_STORY_ENDS];
	len=TmStoryWord(&ptr);
	if (len<0) {
	  if (st) throw('Absent');
	} else {
	  if (!st || StrLen(st)!=len || MemCmp(st,ptr,len)) throw('String');
	  ptr+=len; tm_story_strings++;
	}
      }
      if (ptr!=end) throw('End');
      StoryDel(story);
    }
    if (Fs->data_heap->used_u8s!=heap) throw('Heap');
    if (!n)
      for (fail=1;fail<=4;fail++) {
	tm_story_calls=0; tm_story_fail=MinI64(fail,3);
	tm_story_read_fail=fail==4; caught=FALSE; story=NULL;
	try {story=StoryNew(wad);} catch {
	  if (Fs->except_ch=='StoryIO' || Fs->except_ch=='Read')
	    caught=Fs->catch_except=TRUE;
	}
	if (!caught || story || Fs->data_heap->used_u8s!=heap)
	  throw('Unwind');
	tm_story_faults++;
      }
    tm_story_fail=0;
    WadDel(wad); tm_story_cases++;
  }
  if (ptr!=data+size) throw('Tail');
  Free(data);
  if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
  tm_story_done=1;
  "STORY %d CASES %d STRINGS %d FAULTS BAD 0\n",
	tm_story_cases,tm_story_strings,tm_story_faults;
}

TmStoryTest;
