I64 tm_load_count=0,tm_load_fail=0,tm_load_open=0;
Bool tm_load_armed=FALSE;

U0 TmLoadFault()
{
  if (tm_load_armed && ++tm_load_count==tm_load_fail)
    throw('LoadFail',TRUE);
}

U8 *TmLoadAlloc(I64 size)
{
  TmLoadFault;
  return MAlloc(size);
}

U8 *TmLoadCAlloc(I64 size)
{
  TmLoadFault;
  return CAlloc(size);
}

CFile *TmLoadOpen(U8 *name,U8 *flags)
{
  CFile *res;
  TmLoadFault;
  res=FOpen(name,flags);
  if (res) tm_load_open++;
  return res;
}

U0 TmLoadClose(CFile *file)
{
  if (file) tm_load_open--;
  FClose(file);
}

U8 *TmLoadRead(U8 *name,I64 *_size=NULL)
{
  TmLoadFault;
  return FileRead(name,_size);
}

Bool TmLoadBlocks(CFile *file,U8 *dst,I64 block,I64 cnt=1)
{
  TmLoadFault;
  return FBlkRead(file,dst,block,cnt);
}
