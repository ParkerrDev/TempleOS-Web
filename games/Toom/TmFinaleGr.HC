#define TM_FINAL_FONT_NUM 63

class FinaleGr
{
  Wad *wad;
  U8 *pix,*flat;
  Image *font[TM_FINAL_FONT_NUM],*art[2],*end;
  I64 story,end_num,last_stage;
  U0 (*sound)(I64 n,U8 *context);
  U8 *context;
};

U8 *tm_final_flats[TM_STORY_ENDS]={
  "FLOOR4_8","SFLR6_1","MFLR8_4","MFLR8_3","SLIME16","RROCK14",
  "RROCK07","RROCK17","RROCK13","RROCK19"
};

U0 FinaleGrDel(FinaleGr *tmpg)
{
  I64 i;
  if (tmpg) {
    for (i=0;i<TM_FINAL_FONT_NUM;i++) ImageDel(tmpg->font[i]);
    for (i=0;i<2;i++) ImageDel(tmpg->art[i]);
    ImageDel(tmpg->end); Free(tmpg->flat); Free(tmpg->pix); Free(tmpg);
  }
}

FinaleGr *FinaleGrNew(Wad *wad,Finale *finale)
{//Only the current background loads here; glyphs and art are lazy.
  I64 n=FinaleStory(finale->episode,finale->map_num,finale->commercial);
  U8 *name=finale->flat;
  FinaleGr *tmpg=CAlloc(sizeof(FinaleGr));
  tmpg->wad=wad; tmpg->story=n; tmpg->end_num=-1;
  try {
    if (!name) name=tm_final_flats[n];
    n=LumpFind(wad,name);
    if (n<0 || wad->dir[n].size!=4096) throw('Flat');
    if (!(tmpg->flat=LumpRead(wad,n))) throw('Read');
    tmpg->pix=CAlloc(320*200);
  } catch {
    FinaleGrDel(tmpg);
  }
  return tmpg;
}

Image *FinaleGrPatch(FinaleGr *tmpg,I64 slot,U8 *name)
{
  Image *res;
  if (!(0<=slot<2)) throw('Slot');
  if (!(res=tmpg->art[slot])) {
    res=PatchNew(tmpg->wad,LumpFind(tmpg->wad,name));
    if (!res) throw('Patch');
    tmpg->art[slot]=res;
  }
  return res;
}

Image *FinaleGrFont(FinaleGr *tmpg,I64 ch)
{
  I64 n=ch-33;
  U8 name[9];
  Image *res;
  if (!(0<=n<TM_FINAL_FONT_NUM)) throw('Font');
  if (!(res=tmpg->font[n])) {
    StrPrint(name,"STCFN%03d",ch);
    res=PatchNew(tmpg->wad,LumpFind(tmpg->wad,name));
    if (!res) throw('Font');
    tmpg->font[n]=res;
  }
  return res;
}

Image *FinaleGrEnd(FinaleGr *tmpg,I64 n)
{//Publish a replacement only after its decode succeeds.
  U8 name[9];
  Image *res;
  if (!(0<=n<=6)) throw('End');
  if (tmpg->end_num!=n) {
    StrPrint(name,"END%d",n);
    res=PatchNew(tmpg->wad,LumpFind(tmpg->wad,name));
    if (!res) throw('End');
    ImageDel(tmpg->end); tmpg->end=res; tmpg->end_num=n;
  }
  return tmpg->end;
}

U0 FinaleGrImage(FinaleGr *tmpg,Image *tmpi,I64 x0,I64 y0)
{//Patch origins and transparent posts retain their original screen placement.
  I64 x,y,x1,y1,x2,y2,c;
  U16 *src;
  U8 *dst;
  x0-=tmpi->left; y0-=tmpi->top;
  x1=MaxI64(x0,0); y1=MaxI64(y0,0);
  x2=MinI64(x0+tmpi->width,320); y2=MinI64(y0+tmpi->height,200);
  if (x1>=x2 || y1>=y2) return;
  for (y=y1;y<y2;y++) {
    src=tmpi->pix+(y-y0)*tmpi->width+x1-x0;
    dst=tmpg->pix+y*320+x1;
    for (x=x1;x<x2;x++) {
      c=*src++;
      if (c!=TM_TRANSPARENT) *dst=c;
      dst++;
    }
  }
}

U0 FinaleGrText(FinaleGr *tmpg,Finale *finale)
{
  I64 x,y,i,ch,count=FinaleChars(finale);
  Image *tmpi;
  for (y=0;y<200;y++)
    for (x=0;x<320;x++)
      tmpg->pix[y*320+x]=tmpg->flat[(y&63)*64+x&63];
  x=y=10;
  for (i=0;i<count;i++) {
    ch=finale->text[i];
    if (ch=='\n') {x=10; y+=11;}
    else {
      ch=ToUpper(ch);
      if (33<=ch<33+TM_FINAL_FONT_NUM) {
	tmpi=FinaleGrFont(tmpg,ch);
	if (x+tmpi->width>320) break;
	FinaleGrImage(tmpg,tmpi,x,y); x+=tmpi->width;
      } else x+=4;
    }
  }
}

U0 FinaleGrScroll(FinaleGr *tmpg,I64 tic)
{
  Image *left=FinaleGrPatch(tmpg,0,"PFUB2"),
	*right=FinaleGrPatch(tmpg,1,"PFUB1"),*tmpi;
  I64 x,y,u,c,n=ClampI64(320-(tic-230)/2,0,320);
  if (left->width!=320 || left->height!=200 ||
	right->width!=320 || right->height!=200) throw('Art');
  for (x=0;x<320;x++) {
    u=x+n; tmpi=left;
    if (u>=320) {u-=320; tmpi=right;}
    for (y=0;y<200;y++) {
      c=tmpi->pix[y*320+u];
      if (c!=TM_TRANSPARENT) tmpg->pix[y*320+x]=c;
    }
  }
  if (tic<1130) return;
  n=0;
  if (tic>=1180) n=MinI64((tic-1180)/5,6);
  FinaleGrImage(tmpg,FinaleGrEnd(tmpg,n),108,68);
  if (tic<1180) tmpg->last_stage=0;
  else if (n>tmpg->last_stage) {
    if (tmpg->sound) (*tmpg->sound)(TM_SFX_PISTOL,tmpg->context);
    tmpg->last_stage=n;
  }
}

U0 FinaleGrDraw(FinaleGr *tmpg,Finale *finale)
{
  U8 *name;
  if (FinaleStory(finale->episode,finale->map_num,finale->commercial)!=
	tmpg->story) throw('Owner');
  switch (finale->stage) {
    case TM_FINAL_TEXT:
      FinaleGrText(tmpg,finale);
      break;
    case TM_FINAL_ART:
      if (finale->commercial) throw('Stage');
      switch (finale->episode) {
	case 1: name="CREDIT"; break;
	case 2: name="VICTORY2"; break;
	case 3: FinaleGrScroll(tmpg,finale->tic); return;
	case 4: name="ENDPIC"; break;
      }
      FinaleGrImage(tmpg,FinaleGrPatch(tmpg,0,name),0,0);
      break;
    default:
      throw('Stage');
  }
}

U0 FinaleGrBlot(FinaleGr *tmpg,CDC *dc)
{//Use the same TempleOS 2x2 palette mapping as the world renderer.
  I64 x,y,color,wi=dc->width_internal;
  U8 *dst;
  if (dc->width<640 || dc->height<400) throw('DC');
  for (y=0;y<200;y++) {
    dst=dc->body+y*2*wi;
    for (x=0;x<320;x++) {
      color=tm_palette[tmpg->pix[y*320+x]];
      *dst(U16 *)=color;
      *(dst+wi)(U16 *)=color>>16;
      dst+=2;
    }
  }
}
