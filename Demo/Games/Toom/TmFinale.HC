#define TM_FINAL_TEXT 0
#define TM_FINAL_ART  1
#define TM_FINAL_CAST 2

#define TM_FINALF_ART  1
#define TM_FINALF_CAST 2
#define TM_FINALF_NEXT 4

class Finale
{
  U8 *text,*flat;
  I64 episode,map_num,stage,tic,len;
  Bool commercial,done;
};

I64 FinaleStory(I64 episode,I64 map_num,Bool commercial)
{
  if (!commercial) {
    if (!(1<=episode<=4) || map_num!=8) throw('Finale');
    return episode-1;
  }
  switch (map_num) {
    case 6: return 4;
    case 11: return 5;
    case 20: return 6;
    case 30: return 7;
    case 15: return 8;
    case 31: return 9;
  }
  throw('Finale');
  return -1;
}

U0 FinaleStart(Finale *tmpf,Story *story,Intermission *result)
{//The session owns the authored strings; the timeline borrows them.
  I64 n=FinaleStory(result->episode,result->map_num,result->commercial);
  U8 *text=story->end[n];
  if (!text) text="";
  MemSet(tmpf,0,sizeof(Finale));
  tmpf->text=text; tmpf->flat=story->flat[n]; tmpf->len=StrLen(text);
  tmpf->episode=result->episode; tmpf->map_num=result->map_num;
  tmpf->commercial=result->commercial;
}

I64 FinaleTick(Finale *tmpf,I64 buttons)
{//Original 35 Hz text/art timing; the owner handles reported transitions.
  I64 res=0;
  if (tmpf->done) return 0;
  if (tmpf->commercial && tmpf->tic>50 && buttons) {
    if (tmpf->map_num==30) {
      tmpf->stage=TM_FINAL_CAST; res=TM_FINALF_CAST;
    } else {tmpf->done=TRUE; res=TM_FINALF_NEXT;}
  }
  tmpf->tic++;
  if (tmpf->stage==TM_FINAL_CAST || tmpf->commercial) return res;
  if (tmpf->stage==TM_FINAL_TEXT && tmpf->tic>tmpf->len*3+250) {
    tmpf->tic=0; tmpf->stage=TM_FINAL_ART; res=TM_FINALF_ART;
  }
  return res;
}

I64 FinaleChars(Finale *tmpf)
{
  return ClampI64((tmpf->tic-10)/3,0,tmpf->len);
}
