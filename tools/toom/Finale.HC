I64 tm_final_cases=0,tm_final_ticks=0,tm_final_faults=0,tm_final_done=0;

U0 TmFinaleTest()
{
  I64 *data=FileRead("C:/ORACLE/FINALE.BIN"),*ptr,*row,i,j,k,n,
	selected,events,bunny;
  U8 text[10][401];
  Finale finale,saved;
  Intermission result;
  Story story;
  Bool caught;
  if (!data || data[0]!=120 || data[1]!=1500 || data[2]!=7)
    throw('Fixture');
  MemSet(&story,0,sizeof(Story));
  for (i=0;i<10;i++) {
    story.end[i]=text[i]; story.flat[i]=text[i]+300;
  }
  ptr=data+3;
  for (i=0;i<data[0];i++) {
    row=ptr; ptr+=5; selected=*ptr++;
    MemSet(&result,0,sizeof(Intermission));
    result.episode=row[0]; result.map_num=row[1]; result.commercial=row[2];
    for (j=0;j<10;j++) {
      MemSet(text[j],'A',row[3]); text[j][row[3]]=0;
    }
    FinaleStart(&finale,&story,&result);
    if (finale.text!=story.end[selected] || finale.flat!=story.flat[selected] ||
	  finale.len!=row[3] || finale.stage || finale.tic || finale.done)
      throw('Start');
    bunny=0;
    for (j=0;j<data[1];j++) {
      events=FinaleTick(&finale,ptr[0]);
      if (events&TM_FINALF_ART && finale.episode==3) bunny++;
      if (finale.stage!=ptr[1] || finale.tic!=ptr[2] ||
	    finale.done!=ptr[3] || events!=ptr[4] || bunny!=ptr[5] ||
	    FinaleChars(&finale)!=ptr[6])
	throw('Timeline');
      ptr+=data[2]; tm_final_ticks++;
    }
    tm_final_cases++;
  }
  for (i=0;i<2;i++) {
    n=4; if (i) n=32;
    for (j=0;j<=n+1;j++)
      for (k=0;k<2;k++) {
	MemSet(&result,0,sizeof(Intermission));
	result.commercial=i; result.episode=j; result.map_num=8+k;
	if (i) {result.episode=1; result.map_num=j;}
	if (!i && 1<=j<=4 && !k ||
	      i && (j==6 || j==11 || j==20 || j==30 || j==15 || j==31))
	  goto tf_next;
	MemSet(&finale,0xA5,sizeof(Finale));
	MemCpy(&saved,&finale,sizeof(Finale)); caught=FALSE;
	try {FinaleStart(&finale,&story,&result);} catch {
	  if (Fs->except_ch=='Finale') caught=Fs->catch_except=TRUE;
	}
	if (!caught || MemCmp(&finale,&saved,sizeof(Finale))) throw('Reject');
	tm_final_faults++;
tf_next:;
      }
  }
  MemSet(&story,0,sizeof(Story));
  result.commercial=FALSE; result.episode=1; result.map_num=8;
  FinaleStart(&finale,&story,&result);
  if (*finale.text || finale.len || finale.flat || FinaleChars(&finale))
    throw('Missing');
  Free(data);
}

U0 TmFinaleHeap()
{
  I64 used=Fs->data_heap->used_u8s;
  TmFinaleTest;
  if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
  tm_final_done=1;
  "FINALE %d CASES %d TICS %d FAULTS BAD 0\n",
	tm_final_cases,tm_final_ticks,tm_final_faults;
}

TmFinaleHeap;
