I64 tm_wad_calls=0,tm_wad_fail=0,tm_wad_mode=0;
Bool tm_wad_armed=FALSE;

U0 TmWadOwner(CFile *file,Bool owned)
{
  CDrv *dv=file->dv;
  CBlkDev *bd=dv->bd;
  while (bd->lock_fwding) bd=bd->lock_fwding;
  if ((Bt(&dv->locked_flags,DVlf_LOCKED) && dv->owning_task==Fs)!=owned ||
	(Bt(&bd->locked_flags,BDlf_LOCKED) && bd->owning_task==Fs)!=owned)
    throw('Owner');
}

Bool TmWadBlocks(CFile *file,U8 *dst,I64 blk,I64 cnt=1)
{
  if (tm_wad_armed) {
    TmWadOwner(file,TRUE);
    if (++tm_wad_calls==tm_wad_fail) {
      if (tm_wad_mode) throw('WadIo');
      return FALSE;
    }
  }
  return FBlkRead(file,dst,blk,cnt);
}
