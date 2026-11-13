I64 tm_wad_cases=0,tm_wad_faults=0,tm_wad_gaps=0,tm_wad_done=0;

U0 TmWadFragment()
{//Alternate allocations to exercise a real fragmented FAT chain.
  CFile *left=FOpen("C:/ORACLE/LEFT.BIN","w"),
	*right=FOpen("C:/ORACLE/RIGHT.BIN","w");
  I64 i,j,n=left->dv->spc*BLK_SIZE;
  U8 *buf=MAlloc(n);
  if (left->dv->fs_type!=FSt_FAT32) throw('Fixture');
  for (i=0;i<8;i++) {
    for (j=0;j<n;j++) buf[j]=(i*17+j*29)&255;
    if (!FBlkWrite(left,buf,i*left->dv->spc,left->dv->spc)) throw('Write');
    MemSet(buf,0xA5,n);
    if (!FBlkWrite(right,buf,i*right->dv->spc,right->dv->spc))
      throw('Write');
  }
  FClose(left); FClose(right); Free(buf);
}

U0 TmWadRange(Wad *wad,I64 offset,I64 size,Bool owned,I64 fail=0,
	I64 mode=0)
{
  I64 i,pos,n=wad->file->dv->spc*BLK_SIZE;
  U8 *mem=MAlloc(size+128),*buf=mem+64;
  Bool res=FALSE,caught=FALSE;
  MemSet(mem,0xA5,size+128);
  tm_wad_calls=0; tm_wad_fail=fail; tm_wad_mode=mode;
  if (owned && !DrvLock(wad->file->dv)) throw('Outer');
  tm_wad_armed=TRUE;
  try {
    res=WadRead(wad,buf,offset,size);
  } catch {
    if (Fs->except_ch=='WadIo') caught=Fs->catch_except=TRUE;
  }
  tm_wad_armed=FALSE;
  TmWadOwner(wad->file,owned);
  if (owned) DrvUnlock(wad->file->dv);
  if (fail) {
    if (res || caught!=ToBool(mode) || tm_wad_calls!=fail) throw('Fault');
    tm_wad_faults++;
  } else {
    if (!res || caught) throw('Read');
    for (i=0;i<size;i++) {
      pos=offset+i;
      if (buf[i]!=(pos/n*17+pos%n*29)&255) throw('Bytes');
    }
  }
  for (i=0;i<64;i++)
    if (mem[i]!=0xA5 || buf[size+i]!=0xA5) throw('Guard');
  Free(mem); tm_wad_cases++;
}

U0 TmWadLockTest()
{
  I64 i,j,k,c,next,calls,n;
  Wad wad;
  TmWadFragment;
  MemSet(&wad,0,sizeof(Wad));
  wad.file=FOpen("C:/ORACLE/LEFT.BIN","r");
  if (!wad.file) throw('File');
  wad.size=FSize(wad.file); n=wad.file->dv->spc*BLK_SIZE;
  if (wad.size!=8*n) throw('Size');
  c=wad.file->de.clus;
  for (i=1;i<8;i++) {
    next=ClusNumNext(wad.file->dv,c);
    if (next!=c+1) tm_wad_gaps++;
    c=next;
  }
  if (!tm_wad_gaps) throw('Fragment');
  for (i=0;i<2;i++) {
    TmWadRange(&wad,0,wad.size,i);
    TmWadRange(&wad,n,8,i);
    TmWadRange(&wad,n,n*3,i);
    TmWadRange(&wad,37,wad.size-91,i);
    calls=tm_wad_calls;
    for (j=1;j<=calls;j++)
      for (k=0;k<2;k++)
	TmWadRange(&wad,37,wad.size-91,i,j,k);
    tm_wad_calls=0; tm_wad_armed=TRUE;
    if (WadRead(&wad,NULL,-1,1) || WadRead(&wad,NULL,0,-1) ||
	  WadRead(&wad,NULL,wad.size,1) ||
	  !WadRead(&wad,NULL,wad.size,0) || tm_wad_calls) throw('Bounds');
    tm_wad_armed=FALSE;
    TmWadOwner(wad.file,FALSE); tm_wad_cases++;
  }
  FClose(wad.file);
}

U0 TmWadLockHeap()
{
  I64 used=Fs->data_heap->used_u8s;
  TmWadLockTest;
  if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
  tm_wad_done=1;
  "WAD LOCK %d CASES %d FAULTS %d GAPS BAD 0\n",
	tm_wad_cases,tm_wad_faults,tm_wad_gaps;
}

TmWadLockHeap;
