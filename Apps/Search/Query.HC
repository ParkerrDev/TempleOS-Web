#define SQ_WORD		1
#define SQ_PHRASE	2
#define SQ_NOT_WORD	3
#define SQ_NOT_PHRASE	4
#define SQ_SCOPE		5
#define SQ_YEAR		6
#define SQ_DATE		7
#define SQ_FROM		8
#define SQ_TO		9

class CSearchTok
{
  I64 kind,start,end,group;
  U8 *text,*value;
};

class CSearchQuery
{
  I64 cnt,groups,scope,out_len,out_size;
  CSearchTok *toks;
  U8 *src,*out,*from,*to;
  Bool years[200],date_years[200];
};

I64 SearchSpace(U8 *s)
{
  if (*s==' ' || 9<=*s<=13) return 1;
  if (s[0]==0xC2 && s[1]==0xA0) return 2;
  if (s[0]==0xE1 && s[1]==0x9A && s[2]==0x80 ||
      s[0]==0xE2 && s[1]==0x80 && (0x80<=s[2]<=0x8A ||
	s[2]==0xA8 || s[2]==0xA9 || s[2]==0xAF) ||
      s[0]==0xE2 && s[1]==0x81 && s[2]==0x9F ||
      s[0]==0xE3 && s[1]==0x80 && s[2]==0x80 ||
      s[0]==0xEF && s[1]==0xBB && s[2]==0xBF) return 3;
  return 0;
}

Bool SearchWord(I64 ch)
{
  return 'a'<=ch<='z' || 'A'<=ch<='Z' || '0'<=ch<='9' || ch==39;
}

I64 SearchYear(U8 *s)
{
  I64 i,res=0;
  for (i=0;i<4;i++) {
    if (s[i]<'0' || s[i]>'9') return 0;
    res=res*10+s[i]-'0';
  }
  if (1900<=res<=2099) return res;
  return 0;
}

I64 SearchDateItem(U8 *s,I64 len)
{//A date prefix or a year range; calendar validation belongs to the archive.
  I64 i;
  if (len<4 || !SearchYear(s)) return 0;
  if (len==4) return 4;
  if (s[4]!='-') return 0;
  if (len==9) return 9*!!SearchYear(s+5);
  if (len!=7 && len!=10) return 0;
  for (i=5;i<len;i++)
    if (i==7) {
      if (s[i]!='-') return 0;
    } else if (s[i]<'0' || s[i]>'9') return 0;
  return len;
}

I64 SearchDates(CSearchQuery *q,U8 *s,Bool add=FALSE)
{//Returns 1 for year-only lists, 2 for mixed date prefixes, or zero.
  I64 start=0,end=0,kind,res=1,a,b,i;
  while (TRUE) {
    while (s[end] && s[end]!=',') end++;
    kind=SearchDateItem(s+start,end-start);
    if (!kind) return 0;
    if (kind!=4 && kind!=9) res=2;
    if (!s[end]) break;
    start=++end;
  }
  if (!add) return res;
  start=end=0;
  while (TRUE) {
    while (s[end] && s[end]!=',') end++;
    kind=SearchDateItem(s+start,end-start);
    if (kind==4 || kind==9) {
      a=b=SearchYear(s+start);
      if (kind==9) b=SearchYear(s+start+5);
      if (a>b) {i=a;a=b;b=i;}
      for (i=a;i<=b;i++) {
	q->date_years[i-1900]=TRUE;
	if (res==1) q->years[i-1900]=TRUE;
      }
    }
    if (!s[end]) break;
    start=++end;
  }
  return res;
}

U0 SearchClassify(CSearchQuery *q,CSearchTok *t)
{
  U8 *s=t->text,*v=s;
  I64 colon=0,kind,len=StrLen(s);
  while (s[colon] && s[colon]!=':') colon++;
  if (s[colon]) {
    s[colon]=0;
    v=s+colon+1;
    if (!StrCmp(s,"in") || !StrCmp(s,"scope")) {
      kind=-1;
      if (!StrCmp(v,"all")) kind=0;
      else if (!StrCmp(v,"title") || !StrCmp(v,"titles")) kind=1;
      else if (!StrCmp(v,"text") || !StrCmp(v,"transcript") ||
	    !StrCmp(v,"transcripts")) kind=2;
      if (kind>=0) {t->kind=SQ_SCOPE;q->scope=kind;}
    } else if (!StrCmp(s,"since") || !StrCmp(s,"from") ||
	       !StrCmp(s,"after")) {
      if (SearchDateItem(v,len-colon-1)) {
	t->kind=SQ_FROM;q->from=v;
      }
    } else if (!StrCmp(s,"until") || !StrCmp(s,"to") ||
	       !StrCmp(s,"before")) {
      if (SearchDateItem(v,len-colon-1)) {
	t->kind=SQ_TO;q->to=v;
      }
    } else if (!StrCmp(s,"date") || !StrCmp(s,"on") ||
	       !StrCmp(s,"year")) {
      kind=SearchDates(q,v);
      if (kind==1) t->kind=SQ_YEAR;
      else if (kind==2) t->kind=SQ_DATE;
    }
    s[colon]=':';
  } else {
    kind=SearchDates(q,s);
    if (kind==1) t->kind=SQ_YEAR;
    else if (kind==2) t->kind=SQ_DATE;
  }
  t->value=v;
  if (t->kind==SQ_YEAR || t->kind==SQ_DATE) SearchDates(q,v,TRUE);
  if (t->kind==SQ_FROM && StrLen(v)==9) v[4]=0;
  if (t->kind==SQ_TO && StrLen(v)==9) q->to=v+5;
}

U0 SearchScan(CSearchQuery *q)
{
  I64 at=0,start,end,len,i,n,ch,space;
  Bool neg,join_next=FALSE,phrase,boundary=TRUE;
  U8 *s=q->src;
  CSearchTok *t;
  while (s[at]) {
    while (space=SearchSpace(s+at)) {at+=space;boundary=TRUE;}
    if (!s[at]) break;
    start=at;
    neg=s[at]=='-';
    phrase=s[at+neg]=='"';
    if (phrase) {
      at+=neg+1;
      end=at;
      while (s[end] && s[end]!='"') end++;
      if (!s[end]) {phrase=FALSE;at=start;}
    }
    if (!phrase) {
      neg=neg && boundary;
      if (neg && SearchWord(s[at+1])) {
	end=at+1;
	while (SearchWord(s[end])) end++;
      } else {
	end=at;
	while (s[end] && !SearchSpace(s+end) && s[end]!='"') end++;
	if (end==at) end++;
      }
    }
    len=end-at;
    t=&q->toks[q->cnt++];
    t->start=start;t->end=end+phrase;
    t->text=MAlloc(len+1);
    MemCpy(t->text,s+at,len);t->text[len]=0;
    at=t->end;boundary=phrase;
    if (!phrase && !StrCmp(t->text,"OR")) {
      join_next=q->groups>0;
      goto scan_next;
    }
    for (i=0;i<len;i++)
      if ('A'<=t->text[i]<='Z') t->text[i]+='a'-'A';
    if (phrase) {
      n=0;
      for (i=0;i<len;i++) {
	ch=t->text[i];
	if (space=SearchSpace(t->text+i)) {
	  if (n && t->text[n-1]!=' ') t->text[n++]=' ';
	  i+=space-1;
	} else t->text[n++]=ch;
      }
      if (n && t->text[n-1]==' ') n--;
      t->text[n]=0;
      if (n) {
	if (neg) t->kind=SQ_NOT_PHRASE;
	else t->kind=SQ_PHRASE;
      }
    } else {
      SearchClassify(q,t);
      if (!t->kind) {
	n=0;
	for (i=neg;i<len;i++)
	  if (SearchWord(t->text[i])) t->text[n++]=t->text[i];
	t->text[n]=0;
	if (neg && n) t->kind=SQ_NOT_WORD;
	else if (n>=2) {
	  t->kind=SQ_WORD;
	  if (!join_next) q->groups++;
	  t->group=q->groups-1;
	  join_next=FALSE;
	} else join_next=FALSE;
      }
    }
scan_next:
  }
}

U0 SearchOut(CSearchQuery *q,I64 ch)
{
  if (q->out_len+1>=q->out_size) throw('Query');
  q->out[q->out_len++]=ch;
  q->out[q->out_len]=0;
}

U0 SearchText(CSearchQuery *q,U8 *s)
{
  while (*s) SearchOut(q,*s++);
}

U0 SearchEscape(CSearchQuery *q,I64 ch)
{
  U8 *hex="0123456789abcdef";
  if (ch=='"' || ch==92) SearchOut(q,92);
  if (ch<32) {
    SearchText(q,"\\u00");
    SearchOut(q,hex[ch>>4]);SearchOut(q,hex[ch&15]);
  } else SearchOut(q,ch);
}

U0 SearchString(CSearchQuery *q,U8 *s,I64 len=-1)
{
  if (len<0) len=StrLen(s);
  SearchOut(q,'"');
  while (len--) SearchEscape(q,*s++);
  SearchOut(q,'"');
}

U0 SearchList(CSearchQuery *q,U8 *name,I64 kind)
{
  I64 i;
  Bool comma=FALSE;
  SearchText(q,",");SearchString(q,name);SearchText(q,":[");
  for (i=0;i<q->cnt;i++)
    if (q->toks[i].kind==kind) {
      if (comma) SearchOut(q,',');
      SearchString(q,q->toks[i].text);comma=TRUE;
    }
  SearchOut(q,']');
}

U0 SearchYearString(CSearchQuery *q,I64 year)
{
  I64 div;
  SearchOut(q,'"');
  for (div=1000;div;div/=10) SearchOut(q,'0'+year/div%10);
  SearchOut(q,'"');
}

U0 SearchRetain(CSearchQuery *q,U8 *name,I64 kind)
{
  I64 i=0,at=0;
  CSearchTok *t;
  SearchOut(q,',');SearchString(q,name);SearchText(q,":\"");
  while (q->src[at]) {
    while (i<q->cnt && q->toks[i].end<=at) i++;
    if (i<q->cnt) {
      t=&q->toks[i];
      if (at==t->start && t->kind==kind) {
	at=t->end;
	goto retain_next;
      }
    }
    SearchEscape(q,q->src[at++]);
retain_next:
  }
  SearchOut(q,'"');
}

U0 SearchResult(CSearchQuery *q)
{
  I64 i,group=-1,start,end;
  Bool comma=FALSE;
  U8 *s;
  SearchText(q,"{\"scope\":");
  if (q->scope==1) SearchString(q,"title");
  else if (q->scope==2) SearchString(q,"text");
  else SearchString(q,"all");
  SearchText(q,",\"groups\":[");
  for (i=0;i<q->cnt;i++)
    if (q->toks[i].kind==SQ_WORD) {
      if (group!=q->toks[i].group) {
	if (group>=0) SearchText(q,"],");
	SearchOut(q,'[');group=q->toks[i].group;
      } else SearchOut(q,',');
      SearchString(q,q->toks[i].text);
    }
  if (group>=0) SearchOut(q,']');
  SearchOut(q,']');
  SearchList(q,"phrases",SQ_PHRASE);
  SearchList(q,"notPhrases",SQ_NOT_PHRASE);
  SearchList(q,"notWords",SQ_NOT_WORD);
  SearchText(q,",\"dateFrom\":");SearchString(q,q->from);
  SearchText(q,",\"dateTo\":");SearchString(q,q->to);
  SearchText(q,",\"years\":[");comma=FALSE;
  for (i=0;i<200;i++)
    if (q->years[i]) {
      if (comma) SearchOut(q,',');
      SearchYearString(q,1900+i);comma=TRUE;
    }
  SearchText(q,"],\"dateAny\":[");comma=FALSE;
  for (i=0;i<200;i++)
    if (q->date_years[i]) {
      if (comma) SearchOut(q,',');
      SearchYearString(q,1900+i);comma=TRUE;
    }
  for (i=0;i<q->cnt;i++)
    if (q->toks[i].kind==SQ_DATE) {
      s=q->toks[i].value;start=end=0;
      while (TRUE) {
	while (s[end] && s[end]!=',') end++;
	if (end-start==7 || end-start==10) {
	  if (comma) SearchOut(q,',');
	  SearchString(q,s+start,end-start);comma=TRUE;
	}
	if (!s[end]) break;
	start=++end;
      }
    }
  SearchOut(q,']');
  SearchRetain(q,"withoutScope",SQ_SCOPE);
  SearchRetain(q,"withoutYears",SQ_YEAR);
  SearchOut(q,'}');
}

U0 SearchQueryDel(CSearchQuery *q)
{
  I64 i;
  if (q->toks)
    for (i=0;i<q->cnt;i++) Free(q->toks[i].text);
  Free(q->toks);Free(q->out);Free(q);
}

public U8 *SearchQuery(U8 *src)
{//Returns owned JSON. Both the search and its filter controls read this parse.
  I64 len=StrLen(src);
  CSearchQuery *q;
  U8 *res;
  if (len>8192) throw('QueryLen');
  q=CAlloc(sizeof(CSearchQuery));
  q->src=src;q->from=q->to="";
  try {
    q->toks=CAlloc((len+1)*sizeof(CSearchTok));
    q->out_size=len*18+16384;
    q->out=MAlloc(q->out_size);q->out[0]=0;
    SearchScan(q);SearchResult(q);
    res=q->out;q->out=NULL;
  } catch
    SearchQueryDel(q);
  SearchQueryDel(q);
  return res;
}
