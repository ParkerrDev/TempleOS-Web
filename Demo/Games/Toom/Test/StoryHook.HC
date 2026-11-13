I64 tm_story_calls=0,tm_story_fail=0;
Bool tm_story_read_fail=FALSE;

U8 *TmStoryAlloc(I64 size)
{
  if (++tm_story_calls==tm_story_fail) throw('StoryIO');
  return MAlloc(size);
}

U8 *TmStoryCAlloc(I64 size)
{
  if (++tm_story_calls==tm_story_fail) throw('StoryIO');
  return CAlloc(size);
}

Bool TmStoryRead(Wad *wad,U8 *dst,I64 offset,I64 size)
{
  if (++tm_story_calls==tm_story_fail) {
    if (tm_story_read_fail) return FALSE;
    throw('StoryIO');
  }
  return WadRead(wad,dst,offset,size);
}
