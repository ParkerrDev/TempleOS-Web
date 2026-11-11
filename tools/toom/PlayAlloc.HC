I64 tm_play_alloc_cases=0,tm_play_alloc_faults=0,tm_play_alloc_done=0;

U0 TmPlayAllocTest()
{
  I64 i,j,n,used=Fs->data_heap->used_u8s,heap,frames,counts[2];
  U8 *pixels=MAlloc(TM_VIEW_WIDTH*2*TM_PLAY_HEIGHT);
  Bool caught;
  Play *play;
  CDC *front;
  heap=Fs->data_heap->used_u8s;
  play=PlayNew("C:/ORACLE/FREEDOOM.WAD","C:/ORACLE/TMDATA.BIN");
  GameLoad(play->game,1,2);
  tm_load_count=tm_load_fail=0; tm_load_armed=TRUE;
  PlayFrame(play);
  tm_load_armed=FALSE; n=tm_load_count;
  PlayDel(play);
  if (!n || Fs->data_heap->used_u8s!=heap || tm_load_open)
    throw('Baseline');
  tm_play_alloc_cases++;
  for (j=1;j<=n;j++) {
    play=PlayNew("C:/ORACLE/FREEDOOM.WAD","C:/ORACLE/TMDATA.BIN");
    GameLoad(play->game,1,2);
    front=play->front; frames=play->frames;
    MemCpy(pixels,front->body,TM_VIEW_WIDTH*2*TM_PLAY_HEIGHT);
    caught=FALSE; tm_load_count=0; tm_load_fail=j; tm_load_armed=TRUE;
    try {
      PlayFrame(play);
    } catch {
      if (Fs->except_ch=='LoadFail') caught=Fs->catch_except=TRUE;
    }
    tm_load_armed=FALSE;
    if (!caught || tm_load_count!=j) throw('Fault');
    if (play->flags || play->game->flags || play->front!=front ||
	  play->frames!=frames ||
	  MemCmp(pixels,front->body,TM_VIEW_WIDTH*2*TM_PLAY_HEIGHT))
      throw('Publish');
    for (i=0;i<play->game->graphics->tex_cnt;i++)
      if (play->game->graphics->texture[i].pins) {
	"PLAY ALLOC FAULT %d TEXTURE %d PINS %d\n",j,i,
	      play->game->graphics->texture[i].pins;
	throw('Pins');
      }
    PlayFrame(play);
    if (play->flags || play->game->flags || play->frames!=frames+1)
      throw('Retry');
    PlayDel(play);
    if (Fs->data_heap->used_u8s!=heap || tm_load_open) throw('Cleanup');
    tm_play_alloc_cases++; tm_play_alloc_faults++;
  }
  Free(pixels);
  if (Fs->data_heap->used_u8s!=used) throw('Final');
  counts[0]=tm_play_alloc_cases; counts[1]=tm_play_alloc_faults;
  if (!FileWrite("C:/ORACLE/PLAYALL.BIN",counts,16)) throw('Write');
  tm_play_alloc_done=1;
  "PLAY ALLOC %d CASES %d FAULTS BAD 0\n",tm_play_alloc_cases,
	tm_play_alloc_faults;
}

TmPlayAllocTest;
