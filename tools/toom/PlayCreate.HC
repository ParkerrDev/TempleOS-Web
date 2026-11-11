I64 tm_play_create_cases=0,tm_play_create_faults=0,tm_play_create_done=0;

U0 TmPlayCreateTest()
{
  I64 i,n,used=Fs->data_heap->used_u8s;
  Bool caught;
  Play *play;
  tm_load_count=tm_load_fail=0; tm_load_armed=TRUE;
  play=PlayNew("C:/ORACLE/FREEDOOM.WAD","C:/ORACLE/TMDATA.BIN");
  tm_load_armed=FALSE; n=tm_load_count;
  PlayDel(play);
  if (!n || Fs->data_heap->used_u8s!=used || tm_load_open)
    throw('Baseline');
  tm_play_create_cases++;
  for (i=1;i<=n;i++) {
    caught=FALSE; tm_load_count=0; tm_load_fail=i; tm_load_armed=TRUE;
    try {
      play=PlayNew("C:/ORACLE/FREEDOOM.WAD","C:/ORACLE/TMDATA.BIN");
      PlayDel(play);
    } catch {
      if (Fs->except_ch=='LoadFail') caught=Fs->catch_except=TRUE;
    }
    tm_load_armed=FALSE;
    if (!caught || tm_load_count!=i) throw('Fault');
    if (Fs->data_heap->used_u8s!=used || tm_load_open) {
      "PLAY CREATE FAULT %d LEAK %d FILES %d\n",i,
	    Fs->data_heap->used_u8s-used,tm_load_open;
      throw('Cleanup');
    }
    tm_play_create_cases++; tm_play_create_faults++;
  }
  tm_play_create_done=1;
  "PLAY CREATE %d CASES %d FAULTS BAD 0\n",tm_play_create_cases,
	tm_play_create_faults;
}

TmPlayCreateTest;
