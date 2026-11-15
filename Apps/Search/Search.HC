#include "Query"

#define SEARCH_HASH_NUM 131072
#define SEARCH_HIT_NUM 60

class CSearchWord
{
  CSearchWord *hash_next,*len_next;
  I64 cnt,len;
  U8 text[25];
};

class CSearchVideo
{
  U8 *date,*title;
  I64 rank,hits[3];
  Bool match;
  F64 scores[3];
};

class CSearchChunk
{
  U8 *text;
  I64 video,index;
};

class CSearchMatch
{
  CSearchMatch *next;
  U8 *text;
  F64 score;
};

class CSearchHit
{
  I64 id;
  F64 score;
};

CSearchVideo *search_videos=NULL;
CSearchChunk *search_chunks=NULL;
CSearchWord **search_hash=NULL,*search_words[25],*search_tails[25];
I64 search_video_cnt=0,search_chunk_cnt=0,search_word_cnt=0;
I64 *search_order=NULL,search_sort=0;
CSearchQuery *search_query=NULL;
CSearchMatch **search_matches=NULL;
MemSet(search_words,0,sizeof(search_words));
MemSet(search_tails,0,sizeof(search_tails));

U8 *SearchCopy(U8 *text)
{
  I64 size=StrLen(text)+1;
  U8 *res=MAlloc(size+7);
  MemCpy(res,text,size);MemSet(res+size,0,7);
  return res;
}

U0 SearchMatchesDel()
{
  I64 i;
  CSearchMatch *m,*next;
  if (search_matches)
    for (i=0;i<search_query->groups;i++) {
      m=search_matches[i];
      while (m) {next=m->next;Free(m);m=next;}
    }
  Free(search_matches);search_matches=NULL;
  if (search_query) {
    Free(search_query->src);SearchQueryDel(search_query);
  }
  search_query=NULL;
}

public U0 SearchCorpusDel()
{//Release a partial load as well as a complete corpus before retrying.
  I64 i;
  CSearchWord *w,*next;
  SearchMatchesDel;
  if (search_videos)
    for (i=0;i<search_video_cnt;i++) {
      Free(search_videos[i].date);Free(search_videos[i].title);
    }
  if (search_chunks)
    for (i=0;i<search_chunk_cnt;i++) Free(search_chunks[i].text);
  for (i=0;i<25;i++) {
    w=search_words[i];
    while (w) {next=w->len_next;Free(w);w=next;}
    search_words[i]=search_tails[i]=NULL;
  }
  Free(search_videos);Free(search_chunks);Free(search_hash);Free(search_order);
  search_videos=NULL;search_chunks=NULL;search_hash=NULL;search_order=NULL;
  search_video_cnt=search_chunk_cnt=search_word_cnt=0;
}

public U0 SearchCorpusNew(I64 videos,I64 chunks)
{//The manifest bounds both arrays; text and vocabulary are owned here.
  SearchCorpusDel;
  if (videos<0 || chunks<0 || videos>1000000 || chunks>10000000)
    throw('Corpus');
  search_video_cnt=videos;search_chunk_cnt=chunks;
  search_videos=CAlloc(videos*sizeof(CSearchVideo));
  search_chunks=CAlloc(chunks*sizeof(CSearchChunk));
  search_order=CAlloc(videos*sizeof(I64));
  search_hash=CAlloc(SEARCH_HASH_NUM*sizeof(CSearchWord *));
}

public U0 SearchVideoSet(I64 id,U8 *date,U8 *title,I64 rank)
{//The browser supplies Unicode lowercase and its locale collation rank.
  CSearchVideo *v;
  if (!(0<=id<search_video_cnt) || !(0<=rank<search_video_cnt))
    throw('Video');
  v=&search_videos[id];
  Free(v->date);v->date=NULL;Free(v->title);v->title=NULL;
  v->date=SearchCopy(date);v->title=SearchCopy(title);v->rank=rank;
  search_order[rank]=id;
}

U0 SearchWordAdd(U8 *text,I64 len)
{
  I64 i,hash=0;
  CSearchWord *w;
  for (i=0;i<len;i++) hash=(hash*31+text[i])&(SEARCH_HASH_NUM-1);
  for (w=search_hash[hash];w;w=w->hash_next)
    if (w->len==len && !MemCmp(w->text,text,len)) {w->cnt++;return;}
  w=CAlloc(sizeof(CSearchWord));w->cnt=1;w->len=len;
  MemCpy(w->text,text,len);
  w->hash_next=search_hash[hash];search_hash[hash]=w;
  if (search_tails[len]) search_tails[len]->len_next=w;
  else search_words[len]=w;
  search_tails[len]=w;search_word_cnt++;
}

public U0 SearchChunkSet(I64 id,I64 video,I64 index,U8 *text)
{
  I64 at=0,start,len;
  CSearchChunk *c;
  if (!(0<=id<search_chunk_cnt) || !(0<=video<search_video_cnt))
    throw('Chunk');
  c=&search_chunks[id];c->video=video;c->index=index;
  c->text=SearchCopy(text);
  while (text[at]) {
    start=at;
    while (SearchWord(text[at])) at++;
    len=at-start;
    if (3<=len<=24) SearchWordAdd(text+start,len);
    if (text[at]) at++;
  }
}

public I64 SearchWordCnt()
{
  return search_word_cnt;
}

I64 SearchDistance(U8 *a,CSearchWord *w,I64 max_ed)
{//Banded Damerau-Levenshtein, including adjacent transpositions.
  I64 len=StrLen(a),i,j,cost,value,row_min,lo,hi,
    rows[3][26],*prev2=NULL,*prev=rows[0],*cur=rows[1],*next;
  if (AbsI64(len-w->len)>max_ed) return max_ed+1;
  for (j=0;j<=w->len;j++) prev[j]=j;
  for (i=1;i<=len;i++) {
    cur[0]=row_min=i;lo=MaxI64(1,i-max_ed);hi=MinI64(w->len,i+max_ed);
    for (j=1;j<=w->len;j++) {
      value=max_ed+1;
      if (lo<=j<=hi) {
	cost=a[i-1]!=w->text[j-1];
	value=MinI64(MinI64(prev[j]+1,cur[j-1]+1),prev[j-1]+cost);
	if (prev2 && i>1 && j>1 && a[i-1]==w->text[j-2] &&
	    a[i-2]==w->text[j-1]) value=MinI64(value,prev2[j-2]+cost);
      }
      cur[j]=value;row_min=MinI64(row_min,value);
    }
    if (row_min>max_ed) return max_ed+1;
    next=prev2;
    if (!next) next=rows[2];
    prev2=prev;prev=cur;cur=next;
  }
  return MinI64(prev[w->len],max_ed+1);
}

U0 SearchMatchAdd(I64 group,U8 *text,F64 score)
{
  CSearchMatch *m=CAlloc(sizeof(CSearchMatch)),**at=&search_matches[group];
  while (*at) at=&(*at)->next;
  m->text=text;m->score=score;*at=m;
}

U0 SearchAlternates(CSearchTok *tok)
{
  I64 len=StrLen(tok->text),max_ed=1,l,d,i,j,cnt=0,dist[6];
  CSearchWord *w,*best[6];
  if (len<4 || len>26) return;
  if (len>=8) max_ed=2;
  for (l=MaxI64(3,len-max_ed);l<=MinI64(24,len+max_ed);l++)
    for (w=search_words[l];w;w=w->len_next)
      if (StrCmp(w->text,tok->text)) {
	d=SearchDistance(tok->text,w,max_ed);
	if (d<=max_ed) {
	  i=0;
	  while (i<cnt && (dist[i]<d ||
		dist[i]==d && best[i]->cnt>=w->cnt)) i++;
	  if (i<6) {
	    cnt=MinI64(cnt+1,6);
	    for (j=cnt-1;j>i;j--) {best[j]=best[j-1];dist[j]=dist[j-1];}
	    best[i]=w;dist[i]=d;
	  }
	}
      }
  for (i=0;i<cnt;i++)
    SearchMatchAdd(tok->group,best[i]->text,2.0-(dist[i]-1)*0.6);
}

public U8 *SearchBegin(U8 *src)
{//Keep this parsed query for matching; returned JSON belongs to the caller.
  I64 i;
  CSearchQuery *q;
  U8 *res;
  if (search_query && !StrCmp(search_query->src,src))
    return SearchCopy(search_query->out);
  SearchMatchesDel;
  search_query=q=SearchQueryNew(src);q->src=NULL;
  try {
    q->src=SearchCopy(src);SearchResult(q);
    search_matches=CAlloc(q->groups*sizeof(CSearchMatch *));
    for (i=0;i<q->cnt;i++)
      if (q->toks[i].kind==SQ_WORD)
	SearchMatchAdd(q->toks[i].group,q->toks[i].text,3.0);
    for (i=0;i<q->cnt;i++)
      if (q->toks[i].kind==SQ_WORD) SearchAlternates(&q->toks[i]);
    res=SearchCopy(q->out);
  } catch
    SearchMatchesDel;
  return res;
}

public U0 SearchPhraseSet(I64 kind,I64 index,U8 *text)
{//Unicode case conversion stays at the browser's string boundary.
  I64 i;
  CSearchTok *t;
  for (i=0;i<search_query->cnt;i++) {
    t=&search_query->toks[i];
    if (t->kind==kind && !index--) {
      Free(t->text);t->text=NULL;t->text=SearchCopy(text);return;
    }
  }
  throw('Phrase');
}

Bool SearchBoundary(I64 ch)
{
  return !('a'<=ch<='z' || '0'<=ch<='9');
}

I64 SearchCmp(U8 *a,U8 *b,I64 len)
{
  I64 i;
  for (i=0;i<len;i++) {
    if (a[i]!=b[i]) return a[i]-b[i];
    if (!a[i]) break;
  }
  return 0;
}

U8 *SearchFind(U8 *word,U8 *text)
{//Eight-byte candidate scan; SearchCopy pads every searchable string.
  I64 i;
  U64 block,same,ones=0x0101010101010101,high=0x8080808080808080,
    target=word[0]*ones;
  while (TRUE) {
    block=*text(U64 *);same=block^target;
    if (!(((block-ones)&~block|(same-ones)&~same)&high)) text+=8;
    else {
      if (!*text) return NULL;
      i=0;
      while (word[i] && word[i]==text[i]) i++;
      if (!word[i]) return text;
      text++;
    }
  }
}

Bool SearchHasWord(U8 *text,U8 *word)
{
  U8 *at=text;
  I64 len=StrLen(word);
  while (at=SearchFind(word,at)) {
    if ((at==text || SearchBoundary(at[-1])) && SearchBoundary(at[len]))
      return TRUE;
    at++;
  }
  return FALSE;
}

Bool SearchDateOk(U8 *date)
{
  CSearchQuery *q=search_query;
  CSearchTok *t;
  I64 i,start,end,year=SearchYear(date),any=0,len=StrLen(date);
  Bool found=FALSE;
  for (i=0;i<200;i++)
    if (q->date_years[i]) {
      any++;
      if (year==1900+i) found=TRUE;
    }
  for (i=0;i<q->cnt;i++) {
    t=&q->toks[i];
    if (t->kind==SQ_DATE) {
      start=end=0;
      while (TRUE) {
	while (t->value[end] && t->value[end]!=',') end++;
	if (end-start==7 || end-start==10) {
	  any++;
	  if (len>=end-start && !MemCmp(date,t->value+start,end-start))
	    found=TRUE;
	}
	if (!t->value[end]) break;
	start=++end;
      }
    }
  }
  if (any && !found) return FALSE;
  if (*q->from && SearchCmp(date,q->from,StrLen(q->from))<0) return FALSE;
  if (*q->to && SearchCmp(date,q->to,StrLen(q->to))>0) return FALSE;
  return TRUE;
}

F64 SearchScore(U8 *text,Bool title)
{
  CSearchQuery *q=search_query;
  CSearchTok *t;
  CSearchMatch *m;
  U8 *at;
  I64 i,matched=0,phrases=0,need=q->groups,len;
  F64 score=0,s;
  for (i=0;i<q->cnt;i++) {
    t=&q->toks[i];
    if (t->kind==SQ_PHRASE) {
      if (!SearchFind(t->text,text)) return -1;
      phrases++;
    } else if (t->kind==SQ_NOT_WORD && SearchHasWord(text,t->text) ||
	       t->kind==SQ_NOT_PHRASE && SearchFind(t->text,text)) return -1;
  }
  for (i=0;i<q->groups;i++)
    for (m=search_matches[i];m;m=m->next)
      if (at=SearchFind(m->text,text)) {
	s=m->score;len=StrLen(m->text);
	if ((at==text || SearchBoundary(at[-1])) && SearchBoundary(at[len]))
	  s++;
	score+=s;matched++;break;
      }
  if (title) {
    if (need>=3) need--;
  } else if (need>2) need=(need*3+4)/5;
  if (matched<need) return -1;
  score+=phrases*8;
  if (q->groups && matched==q->groups) score+=2;
  return score;
}

Bool SearchHitBefore(CSearchHit *a,CSearchHit *b,Bool title)
{
  I64 va=a->id,vb=b->id,c;
  if (!title) {va=search_chunks[va].video;vb=search_chunks[vb].video;}
  c=StrCmp(search_videos[va].date,search_videos[vb].date);
  if (search_sort && c) {
    if (search_sort==1) return c>0;
    return c<0;
  }
  if (a->score!=b->score) return a->score>b->score;
  if (title && !search_sort && c) return c>0;
  return a->id<b->id;
}

U0 SearchHitIns(CSearchHit *hits,I64 *cnt,I64 id,F64 score,Bool title)
{
  CSearchHit next;
  I64 i=0,j;
  next.id=id;next.score=score;
  while (i<*cnt && !SearchHitBefore(&next,&hits[i],title)) i++;
  if (i>=SEARCH_HIT_NUM) return;
  *cnt=MinI64(*cnt+1,SEARCH_HIT_NUM);
  for (j=*cnt-1;j>i;j--)
    MemCpy(&hits[j],&hits[j-1],sizeof(CSearchHit));
  MemCpy(&hits[i],&next,sizeof(CSearchHit));
}

U0 SearchNum(CSearchQuery *out,I64 num)
{
  U8 buf[32];
  StrPrint(buf,"%d",num);SearchText(out,buf);
}

public U8 *SearchRun(I64 sort)
{//Return only identities; the browser retains original text and archive data.
  I64 i,j,k,title_cnt=0,hit_cnt=0,total=0,vtotal=0,phrases=0,dates=0;
  CSearchQuery out;
  CSearchHit titles[SEARCH_HIT_NUM],hits[SEARCH_HIT_NUM];
  CSearchVideo *v;
  CSearchChunk *c;
  CSearchMatch *m;
  F64 score;
  Bool terms=FALSE,date_only;
  U8 buf[64];
  MemSet(&out,0,sizeof(CSearchQuery));
  out.out_size=1048576;out.out=MAlloc(out.out_size);out.out[0]=0;
  search_sort=sort;
  for (i=0;i<search_query->cnt;i++) {
    if (search_query->toks[i].kind==SQ_PHRASE) phrases++;
    if (SQ_YEAR<=search_query->toks[i].kind<=SQ_TO) dates++;
  }
  date_only=!search_query->groups && !phrases;
  SearchText(&out,"{\"vids\":[");
  for (i=0;i<search_video_cnt;i++) {
    v=&search_videos[i];
    for (j=0;j<3;j++) {v->hits[j]=-1;v->scores[j]=-1;}
    v->match=SearchDateOk(v->date);
    if (v->match && search_query->scope!=2 && !date_only) {
      score=SearchScore(v->title,TRUE);
      if (score>=0) {vtotal++;SearchHitIns(titles,&title_cnt,i,score,TRUE);}
    }
  }
  if (date_only && dates) {
    for (i=0;i<search_video_cnt;i++) {
      j=i;
      if (sort==2) j=search_video_cnt-1-i;
      j=search_order[j];
      if (search_videos[j].match) {
	if (vtotal<SEARCH_HIT_NUM) {
	  if (vtotal) SearchOut(&out,',');
	  SearchNum(&out,j);
	}
	vtotal++;
      }
    }
  } else {
    if (!search_query->scope) title_cnt=MinI64(title_cnt,5);
    for (i=0;i<title_cnt;i++) {
      if (i) SearchOut(&out,',');
      SearchNum(&out,titles[i].id);
    }
  }
  SearchText(&out,"],\"hits\":[");
  if (!date_only && search_query->scope!=1) {
    for (i=0;i<search_chunk_cnt;i++) {
      c=&search_chunks[i];v=&search_videos[c->video];
      if (v->match) {
	score=SearchScore(c->text,FALSE);
	if (score>=0) {
	  total++;j=0;
	  while (j<3 && v->scores[j]>=score) j++;
	  if (j<3) {
	    for (k=2;k>j;k--) {
	      v->hits[k]=v->hits[k-1];v->scores[k]=v->scores[k-1];
	    }
	    v->hits[j]=i;v->scores[j]=score;
	  }
	}
      }
    }
    for (i=0;i<search_video_cnt;i++)
      for (j=0;j<3;j++)
	if (search_videos[i].hits[j]>=0)
	  SearchHitIns(hits,&hit_cnt,search_videos[i].hits[j],
	    search_videos[i].scores[j],FALSE);
    for (i=0;i<hit_cnt;i++) {
      if (i) SearchOut(&out,',');
      c=&search_chunks[hits[i].id];
      SearchOut(&out,'[');SearchNum(&out,c->video);SearchOut(&out,',');
      SearchNum(&out,c->index);SearchOut(&out,',');
      StrPrint(buf,"%.12f",hits[i].score);SearchText(&out,buf);
      SearchOut(&out,']');
    }
  }
  SearchText(&out,"],\"terms\":[");
  for (i=0;i<search_query->cnt;i++)
    if (search_query->toks[i].kind==SQ_PHRASE) {
      if (terms) SearchOut(&out,',');
      SearchString(&out,search_query->toks[i].text);terms=TRUE;
    }
  for (i=0;i<search_query->groups;i++)
    for (m=search_matches[i];m;m=m->next) {
      if (terms) SearchOut(&out,',');
      SearchString(&out,m->text);terms=TRUE;
    }
  SearchText(&out,"],\"total\":");SearchNum(&out,total);
  SearchText(&out,",\"vtotal\":");SearchNum(&out,vtotal);
  if (date_only && dates) SearchText(&out,",\"dateOnly\":true");
  SearchOut(&out,'}');
  return out.out;
}

public I64 SearchBrowse(I64 index,Bool oldest=FALSE)
{
  if (!(0<=index<search_video_cnt)) return -1;
  if (oldest) index=search_video_cnt-1-index;
  return search_order[index];
}
