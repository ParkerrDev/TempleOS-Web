I64 TextureDefsChk(U8 *src,I64 size,I64 patch_cnt)
{//Validate the texture directory and its patch references before indexing.
  I64 i,j,n,offset;
  U32 *idx=src+4;
  TexDef *tmpt;
  TexPatch *tmpp;
  if (size<4) return -1;
  n=*src(U32 *);
  if (n>4096 || size<4+n*4) return -1;
  for (i=0;i<n;i++) {
    offset=idx[i];
    if (offset<4+n*4 || offset>size-sizeof(TexDef)) return -1;
    tmpt=src+offset;
    if (!(0<tmpt->width<=2048) || !(0<tmpt->height<=2048) ||
	offset+sizeof(TexDef)+tmpt->cnt*sizeof(TexPatch)>size)
      return -1;
    tmpp=tmpt+1;
    for (j=0;j<tmpt->cnt;j++)
      if (tmpp[j].patch>=patch_cnt) return -1;
  }
  return n;
}

U0 GraphicsDel(Graphics *tmpg)
{
  I64 i;
  if (tmpg) {
    for (i=0;i<tmpg->tex_cnt;i++)
      ImageDel(tmpg->texture[i].image);
    Free(tmpg->texture);
    Free(tmpg->pnames);
    Free(tmpg->tex1);
    Free(tmpg->tex2);
    Free(tmpg->colormap);
    Free(tmpg);
  }
}

Graphics *GraphicsNew(Wad *tmpw)
{//Keep small directories, not expanded copies of every graphic.
  I64 i,n,n1,n2=0,size;
  U32 *idx;
  Graphics *tmpg=CAlloc(sizeof(Graphics));
  tmpg->wad=tmpw;
  n=LumpFind(tmpw,"PNAMES");
  if (n<0 || tmpw->dir[n].size<4) goto gn_fail;
  if (!(tmpg->pnames=LumpRead(tmpw,n))) goto gn_fail;
  tmpg->patch_cnt=*tmpg->pnames(U32 *);
  if (tmpg->patch_cnt>4096 || 4+tmpg->patch_cnt*8>tmpw->dir[n].size)
    goto gn_fail;
  n=LumpFind(tmpw,"TEXTURE1");
  if (!(tmpg->tex1=LumpRead(tmpw,n))) goto gn_fail;
  n1=TextureDefsChk(tmpg->tex1,tmpw->dir[n].size,tmpg->patch_cnt);
  if (n1<0) goto gn_fail;
  n=LumpFind(tmpw,"TEXTURE2");
  if (n>=0) {
    if (!(tmpg->tex2=LumpRead(tmpw,n))) goto gn_fail;
    n2=TextureDefsChk(tmpg->tex2,tmpw->dir[n].size,tmpg->patch_cnt);
    if (n2<0) goto gn_fail;
  }
  size=(n1+n2)*sizeof(Texture);
  tmpg->texture=CAlloc(size);
  tmpg->tex_cnt=n1+n2;
  idx=tmpg->tex1+4;
  for (i=0;i<n1;i++) tmpg->texture[i].def=tmpg->tex1+idx[i];
  idx=tmpg->tex2+4;
  for (i=0;i<n2;i++) tmpg->texture[n1+i].def=tmpg->tex2+idx[i];
  n=LumpFind(tmpw,"COLORMAP");
  if (n<0 || tmpw->dir[n].size<34*256) goto gn_fail;
  if (!(tmpg->colormap=LumpRead(tmpw,n))) goto gn_fail;
  return tmpg;
gn_fail:
  GraphicsDel(tmpg);
  return NULL;
}

I64 TextureFind(Graphics *tmpg,U8 *name)
{//Map texture names are eight bytes, not zero-terminated strings.
  I64 i;
  for (i=tmpg->tex_cnt-1;i>=0;i--)
    if (!MemCmp(tmpg->texture[i].def->name,name,8)) return i;
  return -1;
}

U0 TextureRoom(Graphics *tmpg,I64 size)
{//Evict least recently used images until one new texture will fit.
  I64 i,n,old;
  Image *tmpi;
  while (tmpg->cache_size+size>TM_CACHE_SIZE) {
    old=I64_MAX; n=-1;
    for (i=0;i<tmpg->tex_cnt;i++)
      if (tmpg->texture[i].image && tmpg->texture[i].stamp<old) {
	n=i; old=tmpg->texture[i].stamp;
      }
    if (n<0) break;
    tmpi=tmpg->texture[n].image;
    tmpg->cache_size-=tmpi->width*tmpi->height*sizeof(U16);
    ImageDel(tmpi);
    tmpg->texture[n].image=NULL;
  }
}

Image *TextureGet(Graphics *tmpg,I64 n)
{//Compose a requested texture once; callers retain its index, not its pointer.
  I64 i,lump;
  U8 name[9],*src;
  Texture *tmpt;
  TexPatch *tmpp;
  Image *tmpi;
  if (!(0<=n<tmpg->tex_cnt)) return NULL;
  tmpt=tmpg->texture+n;
  tmpt->stamp=++tmpg->stamp;
  if (tmpt->image) return tmpt->image;
  tmpi=ImageNew(tmpt->def->width,tmpt->def->height);
  tmpp=tmpt->def+1;
  name[8]=0;
  for (i=0;i<tmpt->def->cnt;i++) {
    MemCpy(name,tmpg->pnames+4+tmpp[i].patch*8,8);
    lump=LumpFind(tmpg->wad,name);
    if (!(src=LumpRead(tmpg->wad,lump))) goto tg_fail;
    if (!PatchChk(src,tmpg->wad->dir[lump].size)) {
      Free(src);
      goto tg_fail;
    }
    PatchBlot(tmpi,src,tmpp[i].x,tmpp[i].y);
    Free(src);
  }
  n=tmpi->width*tmpi->height*sizeof(U16);
  TextureRoom(tmpg,n);
  tmpg->cache_size+=n;
  tmpt->image=tmpi;
  return tmpi;
tg_fail:
  ImageDel(tmpi);
  return NULL;
}
