#define DOC_CLIP_NUM 256
class CDocClip
{
  CDoc *doc;
  I64 up,updates,age;
};
CDocClip doc_clip_cache[DOC_CLIP_NUM];
I64 doc_clip_lock=0,doc_clip_age=0,doc_clip_revision=0;
U8 *doc_clip_old=NULL,*doc_clip_new=NULL;

I64 DocClipGet(CDoc *doc)
{//A bounded cache. An unknown or recycled document gets a full pass.
  I64 i,key=(doc(U64)>>6^doc(U64)>>16)&(DOC_CLIP_NUM-1),res=-1;
  CDocClip *tmpc;
  while (LBts(&doc_clip_lock,0)) Yield;
  for (i=0;i<DOC_CLIP_NUM;i++) {
    tmpc=&doc_clip_cache[(key+i)&(DOC_CLIP_NUM-1)];
    if (!tmpc->doc) break;
    if (tmpc->doc==doc) {
      if (tmpc->updates<=doc->updates_cnt) res=tmpc->up;
      tmpc->age=++doc_clip_age;
      break;
    }
  }
  LBtr(&doc_clip_lock,0);
  return res;
}

U0 DocClipPut(CDoc *doc,I64 up)
{
  I64 i,key=(doc(U64)>>6^doc(U64)>>16)&(DOC_CLIP_NUM-1);
  CDocClip *tmpc,*old=&doc_clip_cache[key];
  while (LBts(&doc_clip_lock,0)) Yield;
  for (i=0;i<DOC_CLIP_NUM;i++) {
    tmpc=&doc_clip_cache[(key+i)&(DOC_CLIP_NUM-1)];
    if (!tmpc->doc || tmpc->doc==doc) {
      old=tmpc;
      break;
    }
    if (tmpc->age<old->age) old=tmpc;
  }
  old->doc=doc;old->up=up;old->updates=doc->updates_cnt;
  old->age=++doc_clip_age;
  LBtr(&doc_clip_lock,0);
}

I64 DocClipExtent(U8 *sprite,I64 up)
{//Static 2D sprites may extend above their document anchor.
  I64 min_y;
  if (!(SpriteTypeMask(sprite)&(1<<SPT_MESH|1<<SPT_SHIFTABLE_MESH))) {
    SpriteExtents(sprite,,,&min_y);
    if (min_y<0) up=MaxI64(up,-min_y);
  }
  return up;
}

U8 *DocClipReplace(U8 *st,U8 *needle,U8 *replacement)
{//An exact source marker must occur once. Ownership moves to the result.
  U8 *ptr=StrMatch(needle,st),*res;
  I64 n=StrLen(needle),len;
  if (!ptr || StrMatch(needle,ptr+n)) throw('DocVer');
  len=ptr-st;
  res=MAlloc(StrLen(st)+StrLen(replacement)+1);
  MemCpy(res,st,len);
  StrCpy(res+len,replacement);
  StrCpy(res+len+StrLen(replacement),ptr+n);
  Free(st);
  return res;
}

U64 DocClipHash(U8 *src,I64 size)
{
  I64 i;
  U64 res=0xCBF29CE484222325;
  for (i=0;i<size;i++) {
    res^=src[i];
    res*=0x100000001B3;
  }
  return res;
}

U8 *DocClipRead(U8 *src,I64 size,I64 *_size)
{//The installed DocRecalc.HC.Z, or the host's copy of its text, checked alike.
  U8 *res;
  if (!src)
    return FileRead("::/Adam/DolDoc/DocRecalc.HC.Z",_size);
  res=MAlloc(size+1);
  MemCpy(res,src,size);
  res[size]=0;
  *_size=size;
  return res;
}

U0 DocClipBuild(U8 *src=NULL,I64 size=0)
{//Compile the installed native routine with only the visibility correction.
  U8 *file,*st,*start;
  CHashFun *tmpf;
  if (doc_clip_new) return;
  MemSet(doc_clip_cache,0,sizeof(doc_clip_cache));
  file=DocClipRead(src,size,&size);
  if (!file) throw('DocFile');
  if (size!=36007 || DocClipHash(file,size)!=0xBE5BF08F6899BF7B) {
    Free(file);
    throw('DocVer');
  }
  start=StrMatch("public Bool DocRecalc(CDoc *doc,",file);
  if (!start) {
    Free(file);
    throw('DocVer');
  }
  st=StrNew(start);
  Free(file);
  st=DocClipReplace(st,"public Bool DocRecalc(","public Bool DocClipRecalc(");
  st=DocClipReplace(st,"I64 i,ii,j,k,x,x0,y,y0,",
	"I64 doc_clip_y,i,ii,j,k,x,x0,y,y0,");
  st=DocClipReplace(st,"  unlock=DocLock(doc);",
	"  unlock=DocLock(doc);\n  doc_clip_y=DocClipGet(doc);");
  st=DocClipReplace(st,"\tfull_refresh=FALSE;\n      if (win_task)",
	"\tfull_refresh=FALSE;\n      if (doc_clip_y<0) full_refresh=TRUE;"
	"\n      if (win_task)");
  st=DocClipReplace(st,"    doc->min_x=I32_MAX; doc->min_y=I32_MAX;",
	"    doc_clip_y=0;\n    doc->min_x=I32_MAX; doc->min_y=I32_MAX;");
  st=DocClipReplace(st,"\tif (tmpb && dc) {",
	"\tif (tmpb && dc) {\n\t  if (full_refresh)\n"
	"\t    doc_clip_y=DocClipExtent(tmpb->data,doc_clip_y);");
  st=DocClipReplace(st,"!full_refresh && doc_e->y>y_plot_bottom)",
	"!full_refresh && doc_e->y>y_plot_bottom+"
	"(doc_clip_y+FONT_HEIGHT-1)/FONT_HEIGHT)");
  st=DocClipReplace(st,"  DCDel(dc);\n  Free(depth_buf);",
	"  if (full_refresh && recalc_flags&RECALCG_MASK==RECALCt_TO_SCRN)\n"
	"    DocClipPut(doc,doc_clip_y);\n  DCDel(dc);\n  Free(depth_buf);");
  ExePrint("%s",st);
  Free(st);
  tmpf=HashFind("DocClipRecalc",Fs->hash_table,HTT_FUN);
  if (!tmpf || !tmpf->exe_addr) throw('DocBuild');
  doc_clip_old=&DocRecalc;
  doc_clip_new=tmpf->exe_addr;
}

U0 DocClipInstall()
{//Native single-core installer. HEMU uses its all-core barrier instead.
  if (mp_cnt!=1) throw('DocCore');
  DocClipBuild;
  if (doc_clip_old(U32*)[0]!=0xEC8B4855 ||
	doc_clip_new(U32*)[0]!=0xEC8B4855 ||
	(doc_clip_old+4)(U32*)[0]&0xFFFFFF!=0xEC8148 ||
	(doc_clip_new+4)(U32*)[0]&0xFFFFFF!=0xEC8148)
    throw('DocEntry');
  PUSHFD
  CLI
  //Task contexts before or after SUB RSP remain valid.
  doc_clip_old[4]=0xE9;
  (doc_clip_old+5)(I32*)[0]=doc_clip_new-doc_clip_old-5;
  doc_clip_revision=1;
  POPFD
}
