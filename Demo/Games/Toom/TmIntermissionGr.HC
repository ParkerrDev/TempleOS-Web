#define TM_IG_MINUS   0
#define TM_IG_PERCENT 1
#define TM_IG_FINISH  2
#define TM_IG_ENTER   3
#define TM_IG_KILLS   4
#define TM_IG_ITEMS   5
#define TM_IG_SECRET  6
#define TM_IG_TIME    7
#define TM_IG_PAR     8
#define TM_IG_COLON   9
#define TM_IG_SUCKS   10
#define TM_IG_LABEL_NUM 11

class IntermissionGr
{
  Wad *wad;
  U8 *pix;
  Image *background,*last,*next,*num[10],*label[TM_IG_LABEL_NUM],
	*splat,*pointer[2];
  I64 episode,map_num,next_num;
  Bool commercial,pointer_on;
};

U8 *tm_im_labels[TM_IG_LABEL_NUM]={
  "WIMINUS","WIPCNT","WIF","WIENTER","WIOSTK","WIOSTI","WISCRT2",
  "WITIME","WIPAR","WICOLON","WISUCKS"
};

I64 tm_im_nodes[3][9][2]={
  {{185,164},{148,143},{69,122},{209,102},{116,89},{166,55},
	{71,56},{135,29},{71,24}},
  {{254,25},{97,50},{188,64},{128,78},{214,92},{133,130},
	{208,136},{148,140},{235,158}},
  {{156,168},{48,154},{174,95},{265,75},{130,48},{279,23},
	{198,48},{140,25},{281,136}}
};

U0 IntermissionGrDel(IntermissionGr *tmpg)
{
  I64 i;
  if (tmpg) {
    ImageDel(tmpg->background); ImageDel(tmpg->last); ImageDel(tmpg->next);
    for (i=0;i<10;i++) ImageDel(tmpg->num[i]);
    for (i=0;i<TM_IG_LABEL_NUM;i++) ImageDel(tmpg->label[i]);
    ImageDel(tmpg->splat);
    for (i=0;i<2;i++) ImageDel(tmpg->pointer[i]);
    Free(tmpg->pix); Free(tmpg);
  }
}

Image *IntermissionGrPatch(IntermissionGr *tmpg,Image **_image,U8 *name)
{//A failed lazy decode leaves the cache slot empty for a later retry.
  Image *res=*_image;
  if (!res) {
    res=PatchNew(tmpg->wad,LumpFind(tmpg->wad,name));
    if (!res) throw('Patch');
    *_image=res;
  }
  return res;
}

IntermissionGr *IntermissionGrNew(Wad *wad,Intermission *tmpi)
{
  IntermissionGr *tmpg;
  U8 name[9];
  I64 last=9;
  if (tmpi->commercial) last=32;
  if (!(1<=tmpi->episode<=4) || !(1<=tmpi->map_num<=last) ||
	!(1<=tmpi->next<=last)) throw('Map');
  tmpg=CAlloc(sizeof(IntermissionGr)); tmpg->wad=wad;
  tmpg->episode=tmpi->episode; tmpg->map_num=tmpi->map_num;
  tmpg->next_num=tmpi->next; tmpg->commercial=tmpi->commercial;
  try {
    tmpg->pix=CAlloc(320*200);
    StrCpy(name,"INTERPIC");
    if (!tmpi->commercial && tmpi->episode<=3)
      StrPrint(name,"WIMAP%d",tmpi->episode-1);
    IntermissionGrPatch(tmpg,&tmpg->background,name);
  } catch {
    IntermissionGrDel(tmpg);
  }
  return tmpg;
}

Image *IntermissionGrLabel(IntermissionGr *tmpg,I64 n)
{
  if (!(0<=n<TM_IG_LABEL_NUM)) throw('Label');
  return IntermissionGrPatch(tmpg,tmpg->label+n,tm_im_labels[n]);
}

Image *IntermissionGrName(IntermissionGr *tmpg,Bool next)
{
  U8 name[9];
  I64 n=tmpg->map_num;
  Image **slot=&tmpg->last;
  if (next) {n=tmpg->next_num; slot=&tmpg->next;}
  if (tmpg->commercial) StrPrint(name,"CWILV%02d",n-1);
  else StrPrint(name,"WILV%d%d",tmpg->episode-1,n-1);
  return IntermissionGrPatch(tmpg,slot,name);
}

Image *IntermissionGrDigit(IntermissionGr *tmpg,I64 n)
{
  U8 name[9];
  if (!(0<=n<=9)) throw('Digit');
  StrPrint(name,"WINUM%d",n);
  return IntermissionGrPatch(tmpg,tmpg->num+n,name);
}

U0 IntermissionGrImage(IntermissionGr *tmpg,Image *tmpi,I64 x,I64 y)
{
  ImageDraw(tmpg->pix,320,200,tmpi,x,y);
}

I64 IntermissionGrNum(IntermissionGr *tmpg,I64 x,I64 y,I64 n,I64 digits=-1)
{
  I64 width=IntermissionGrDigit(tmpg,0)->width,temp;
  Bool negative=n<0;
  if (digits<0) {
    digits=1;
    if (n) {
      digits=0; temp=n;
      while (temp) {temp/=10; digits++;}
    }
  }
  if (negative) n=-n;
  if (n==1994) return 0;
  while (digits-->0) {
    x-=width;
    IntermissionGrImage(tmpg,IntermissionGrDigit(tmpg,n%10),x,y);
    n/=10;
  }
  if (negative) {
    x-=8;
    IntermissionGrImage(tmpg,IntermissionGrLabel(tmpg,TM_IG_MINUS),x,y);
  }
  return x;
}

U0 IntermissionGrPercent(IntermissionGr *tmpg,I64 x,I64 y,I64 n)
{
  if (n<0) return;
  IntermissionGrImage(tmpg,IntermissionGrLabel(tmpg,TM_IG_PERCENT),x,y);
  IntermissionGrNum(tmpg,x,y,n);
}

U0 IntermissionGrTime(IntermissionGr *tmpg,I64 x,I64 y,I64 n)
{
  I64 divisor=1;
  Image *tmpi;
  if (n<0) return;
  if (n<=61*59) {
    tmpi=IntermissionGrLabel(tmpg,TM_IG_COLON);
    do {
      x=IntermissionGrNum(tmpg,x,y,n/divisor%60,2)-tmpi->width;
      divisor*=60;
      if (divisor==60 || n/divisor) IntermissionGrImage(tmpg,tmpi,x,y);
    } while (n/divisor);
  } else {
    tmpi=IntermissionGrLabel(tmpg,TM_IG_SUCKS);
    IntermissionGrImage(tmpg,tmpi,x-tmpi->width,y);
  }
}

U0 IntermissionGrTitle(IntermissionGr *tmpg,Bool next)
{
  Image *name=IntermissionGrName(tmpg,next),*label;
  I64 n=TM_IG_FINISH;
  if (next) n=TM_IG_ENTER;
  label=IntermissionGrLabel(tmpg,n);
  if (next) {
    IntermissionGrImage(tmpg,label,(320-label->width)/2,2);
    IntermissionGrImage(tmpg,name,(320-name->width)/2,2+5*name->height/4);
  } else {
    IntermissionGrImage(tmpg,name,(320-name->width)/2,2);
    IntermissionGrImage(tmpg,label,(320-label->width)/2,2+5*name->height/4);
  }
}

U0 IntermissionGrNode(IntermissionGr *tmpg,I64 n,Bool pointer)
{//The alternate pointer is used only when the first patch would not fit.
  I64 i,x,y,left,top;
  Image *tmpi;
  U8 name[9];
  if (!(1<=tmpg->episode<=3) || !(1<=n<=9)) throw('Node');
  x=tm_im_nodes[tmpg->episode-1][n-1][0];
  y=tm_im_nodes[tmpg->episode-1][n-1][1];
  for (i=0;i<2;i++) {
    if (pointer) {
      StrPrint(name,"WIURH%d",i);
      tmpi=IntermissionGrPatch(tmpg,tmpg->pointer+i,name);
    } else tmpi=IntermissionGrPatch(tmpg,&tmpg->splat,"WISPLAT");
    left=x-tmpi->left; top=y-tmpi->top;
    if (left>=0 && left+tmpi->width<320 &&
	  top>=0 && top+tmpi->height<200) {
      IntermissionGrImage(tmpg,tmpi,x,y); return;
    }
    if (!pointer) return;
  }
}

U0 IntermissionGrDraw(IntermissionGr *tmpg,Intermission *tmpi)
{
  I64 lh,i,last=tmpi->map_num;
  if (tmpg->episode!=tmpi->episode || tmpg->map_num!=tmpi->map_num ||
	tmpg->next_num!=tmpi->next || tmpg->commercial!=tmpi->commercial)
    throw('Owner');
  IntermissionGrImage(tmpg,tmpg->background,0,0);
  if (tmpi->phase==TM_IM_STATS) {
    IntermissionGrTitle(tmpg,FALSE);
    lh=3*IntermissionGrDigit(tmpg,0)->height/2;
    IntermissionGrImage(tmpg,IntermissionGrLabel(tmpg,TM_IG_KILLS),50,50);
    IntermissionGrPercent(tmpg,270,50,tmpi->shown_kills);
    IntermissionGrImage(tmpg,IntermissionGrLabel(tmpg,TM_IG_ITEMS),50,50+lh);
    IntermissionGrPercent(tmpg,270,50+lh,tmpi->shown_items);
    IntermissionGrImage(tmpg,IntermissionGrLabel(tmpg,TM_IG_SECRET),
	  50,50+2*lh);
    IntermissionGrPercent(tmpg,270,50+2*lh,tmpi->shown_secrets);
    IntermissionGrImage(tmpg,IntermissionGrLabel(tmpg,TM_IG_TIME),16,168);
    IntermissionGrTime(tmpg,144,168,tmpi->shown_time);
    if (tmpi->episode<4) {
      IntermissionGrImage(tmpg,IntermissionGrLabel(tmpg,TM_IG_PAR),176,168);
      IntermissionGrTime(tmpg,304,168,tmpi->shown_par);
    }
  } else {
    if (!tmpi->commercial && tmpi->episode<=3) {
      if (last==9) last=tmpi->next-1;
      for (i=1;i<=last;i++) IntermissionGrNode(tmpg,i,FALSE);
      if (tmpi->did_secret) IntermissionGrNode(tmpg,9,FALSE);
      if (tmpg->pointer_on || tmpi->phase==TM_IM_WAIT)
	IntermissionGrNode(tmpg,tmpi->next,TRUE);
    }
    if (!tmpi->commercial || tmpi->next!=31) IntermissionGrTitle(tmpg,TRUE);
  }
}

U0 IntermissionGrBlot(IntermissionGr *tmpg,CDC *dc)
{
  PaletteBlot(tmpg->pix,320,200,dc);
}
