#define TM_STORY_MAPS 68
#define TM_STORY_ENDS 10

class Story
{
  U8 *buf,*name[TM_STORY_MAPS],*end[TM_STORY_ENDS],*flat[TM_STORY_ENDS];
  I64 par[TM_STORY_MAPS];
};

U8 *tm_story_ends[TM_STORY_ENDS]={
  "E1TEXT","E2TEXT","E3TEXT","E4TEXT","C1TEXT","C2TEXT","C3TEXT",
  "C4TEXT","C5TEXT","C6TEXT"
},*tm_story_flats[TM_STORY_ENDS]={
  "BGFLATE1","BGFLATE2","BGFLATE3","BGFLATE4","BGFLAT06","BGFLAT11",
  "BGFLAT20","BGFLAT30","BGFLAT15","BGFLAT31"
};

Bool StorySpace(I64 ch)
{
  return ch==' ' || 9<=ch<=13;
}

U8 *StoryTrim(U8 *st)
{
  U8 *end;
  while (StorySpace(*st)) st++;
  end=st+StrLen(st);
  while (end>st && StorySpace(end[-1])) *--end=0;
  return st;
}

I64 StoryChar(U8 **_ptr)
{
  U8 *ptr=*_ptr;
  I64 ch;
  if (*ptr=='\r' && ptr[1]=='\n') ptr++;
  ch=*ptr;
  if (ch) ptr++;
  *_ptr=ptr;
  return ch;
}

U8 *StoryLine(U8 **_ptr,Bool extended)
{//Collapse continuations in place; all retained text borrows the same buffer.
  U8 *st=*_ptr,*dst=st;
  I64 ch;
  Bool escaped=FALSE;
  while (TRUE) {
    ch=StoryChar(_ptr);
    if (extended && ch=='\\') {
      ch=StoryChar(_ptr);
      if (ch=='n') {
	*dst++='\n'; goto sl_next;
      }
      if (ch=='\n') {
	escaped=TRUE; goto sl_next;
      }
    }
    if (escaped && StorySpace(ch) && ch!='\n') goto sl_next;
    escaped=FALSE;
    if (!ch || ch=='\n') break;
    *dst++=ch;
sl_next:;
  }
  *dst=0;
  return StoryTrim(st);
}

I64 StoryNum(U8 **_ptr)
{
  U8 *ptr=*_ptr;
  I64 res=0;
  while (StorySpace(*ptr)) ptr++;
  if (!('0'<=*ptr<='9')) throw('Number');
  while ('0'<=*ptr<='9') {
    res=res*10+*ptr++-'0';
    if (res>I32_MAX/TM_TICK_HZ) throw('Number');
  }
  *_ptr=ptr;
  return res;
}

I64 StoryMap(I64 episode,I64 map_num,Bool commercial)
{
  if (commercial) {
    if (!(1<=map_num<=32)) throw('Map');
    return 36+map_num-1;
  }
  if (!(1<=episode<=4) || !(1<=map_num<=9)) throw('Map');
  return (episode-1)*9+map_num-1;
}

U0 StoryParLine(Story *tmps,U8 *st)
{
  I64 a,b,c=-1,n;
  if (StrNCmp(st,"par",3) || !StorySpace(st[3])) return;
  st+=3; a=StoryNum(&st); b=StoryNum(&st);
  while (StorySpace(*st)) st++;
  if (*st && *st!='#') c=StoryNum(&st);
  while (StorySpace(*st)) st++;
  if (*st && *st!='#') throw('Par');
  if (c<0) {n=StoryMap(1,a,TRUE); c=b;}
  else n=StoryMap(a,b,FALSE);
  tmps->par[n]=c*TM_TICK_HZ;
}

U0 StoryStrLine(Story *tmps,U8 *st)
{
  U8 *value=StrFirstOcc(st,"="),*ptr;
  I64 i,n=-1;
  if (!value) return;
  *value++=0; st=StoryTrim(st); value=StoryTrim(value);
  if (StrLen(st)==10 && !StrNCmp(st,"HUSTR_E",7) &&
	'1'<=st[7]<='4' && st[8]=='M' && '1'<=st[9]<='9')
    n=StoryMap(st[7]-'0',st[9]-'0',FALSE);
  else if (!StrNCmp(st,"HUSTR_",6) && '0'<=st[6]<='9') {
    ptr=st+6; i=StoryNum(&ptr);
    if (!*ptr && 1<=i<=32) n=StoryMap(1,i,TRUE);
  }
  if (n>=0) tmps->name[n]=value;
  for (i=0;i<TM_STORY_ENDS;i++) {
    if (!StrCmp(st,tm_story_ends[i])) tmps->end[i]=value;
    if (!StrCmp(st,tm_story_flats[i])) {
      if (StrLen(value)>8) throw('Flat');
      tmps->flat[i]=value;
    }
  }
}

U0 StoryPrs(Story *tmps)
{//Only authored map names, par times and ending text are consumed here.
  U8 *ptr=tmps->buf,*st;
  I64 section=0;
  while (*ptr) {
    st=StoryLine(&ptr,section==2);
    if (!*st) section=0;
    else if (*st!='#') {
      if (!StrICmp(st,"[PARS]")) section=1;
      else if (!StrICmp(st,"[STRINGS]")) section=2;
      else if (section==1) StoryParLine(tmps,st);
      else if (section==2) StoryStrLine(tmps,st);
    }
  }
}

U0 StoryDel(Story *tmps)
{
  if (tmps) {Free(tmps->buf); Free(tmps);}
}

Story *StoryNew(Wad *tmpw)
{//A missing authored par has the explicit value zero, including episode four.
  Story *tmps=CAlloc(sizeof(Story));
  I64 lump=LumpFind(tmpw,"DEHACKED"),size;
  try {
    if (lump>=0) {
      size=tmpw->dir[lump].size;
      tmps->buf=MAlloc(size+1); tmps->buf[size]=0;
      if (!WadRead(tmpw,tmps->buf,tmpw->dir[lump].offset,size))
	throw('Read');
      if (StrLen(tmps->buf)!=size) throw('Text');
      StoryPrs(tmps);
    }
  } catch {
    StoryDel(tmps);
  }
  return tmps;
}
