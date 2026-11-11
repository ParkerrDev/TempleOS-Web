I64 tm_alloc_count=0,tm_alloc_fail=0;
Bool tm_alloc_armed=FALSE;

U8 *TmAlloc(I64 size)
{
  if (tm_alloc_armed && ++tm_alloc_count==tm_alloc_fail) throw('Alloc',TRUE);
  return MAlloc(size);
}

U8 *TmCAlloc(I64 size)
{
  if (tm_alloc_armed && ++tm_alloc_count==tm_alloc_fail) throw('Alloc',TRUE);
  return CAlloc(size);
}
