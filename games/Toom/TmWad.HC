Bool WadRead(Wad *tmpw,U8 *dst,I64 offset,I64 size)
{//Read a byte range without reading or rewriting the whole IWAD.
  I64 n,blk=offset>>BLK_SIZE_BITS,skip=offset&(BLK_SIZE-1);
  U8 buf[BLK_SIZE];
  if (offset<0 || size<0 || offset>tmpw->size-size)
    return FALSE;
  tmpw->read_bytes+=size;
  if (skip && size) {
    if (!FBlkRead(tmpw->file,buf,blk++)) return FALSE;
    n=MinI64(size,BLK_SIZE-skip);
    MemCpy(dst,buf+skip,n);
    dst+=n; size-=n;
  }
  n=size>>BLK_SIZE_BITS;
  if (n) {
    if (!FBlkRead(tmpw->file,dst,blk,n)) return FALSE;
    blk+=n;
    n<<=BLK_SIZE_BITS;
    dst+=n; size-=n;
  }
  if (size) {
    if (!FBlkRead(tmpw->file,buf,blk)) return FALSE;
    MemCpy(dst,buf,size);
  }
  return TRUE;
}

U0 WadDel(Wad *tmpw)
{
  if (tmpw) {
    FClose(tmpw->file);
    Free(tmpw->dir);
    Free(tmpw);
  }
}

Wad *WadNew(U8 *filename)
{//The directory is small; image and map data stay on disk until requested.
  I64 i,cnt,offset;
  U8 header[12],*ptr=header;
  Wad *tmpw=CAlloc(sizeof(Wad));
  if (!(tmpw->file=FOpen(filename,"r"))) goto wn_fail;
  tmpw->size=FSize(tmpw->file);
  if (!WadRead(tmpw,header,0,sizeof(header)) || *ptr(U32 *)!='IWAD')
    goto wn_fail;
  cnt=*(ptr+4)(U32 *);
  offset=*(ptr+8)(U32 *);
  if (!(0<cnt<=TM_LUMPS_NUM) || offset>tmpw->size-cnt*sizeof(Lump))
    goto wn_fail;
  tmpw->cnt=cnt;
  tmpw->dir=MAlloc(cnt*sizeof(Lump));
  if (!WadRead(tmpw,tmpw->dir,offset,cnt*sizeof(Lump))) goto wn_fail;
  for (i=0;i<cnt;i++)
    if (tmpw->dir[i].size>TM_LUMP_SIZE ||
	tmpw->dir[i].offset>tmpw->size-tmpw->dir[i].size)
      goto wn_fail;
  return tmpw;
wn_fail:
  WadDel(tmpw);
  return NULL;
}

Bool LumpName(U8 *name,U8 *st)
{//Eight-byte directory names need not end with a zero byte.
  I64 i;
  for (i=0;i<8;i++) {
    if (name[i]!=ToUpper(st[i])) return FALSE;
    if (!st[i]) return TRUE;
  }
  return !st[8];
}

I64 LumpFind(Wad *tmpw,U8 *name)
{//A later definition replaces an earlier lump with the same name.
  I64 i;
  for (i=tmpw->cnt-1;i>=0;i--)
    if (LumpName(tmpw->dir[i].name,name)) return i;
  return -1;
}

U8 *LumpRead(Wad *tmpw,I64 i)
{//The caller owns the allocation, including an empty marker lump.
  U8 *res;
  if (!(0<=i<tmpw->cnt)) return NULL;
  res=MAlloc(MaxI64(tmpw->dir[i].size,1));
  if (!WadRead(tmpw,res,tmpw->dir[i].offset,tmpw->dir[i].size)) {
    Free(res);
    return NULL;
  }
  return res;
}
