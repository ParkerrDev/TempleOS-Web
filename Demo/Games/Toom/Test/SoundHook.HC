I64 tm_sound_calls=0,tm_sound_fail=0;
Bool tm_sound_read_fail=FALSE;

Bool TmSoundRead(Wad *tmpw,U8 *dst,I64 offset,I64 size)
{
  if (++tm_sound_calls==tm_sound_fail) {
    if (tm_sound_read_fail) return FALSE;
    throw('SndTest');
  }
  return WadRead(tmpw,dst,offset,size);
}

U8 *TmSoundAlloc(I64 size)
{
  if (++tm_sound_calls==tm_sound_fail) throw('SndTest');
  return MAlloc(size);
}

U8 *TmSoundCAlloc(I64 size)
{
  if (++tm_sound_calls==tm_sound_fail) throw('SndTest');
  return CAlloc(size);
}
